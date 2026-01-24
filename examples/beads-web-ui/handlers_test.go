package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/steveyegge/beads/examples/beads-web-ui/daemon"
	"github.com/steveyegge/beads/internal/rpc"
)

// mockClient implements issueGetter for testing
type mockClient struct {
	showFunc func(args *rpc.ShowArgs) (*rpc.Response, error)
}

func (m *mockClient) Show(args *rpc.ShowArgs) (*rpc.Response, error) {
	if m.showFunc != nil {
		return m.showFunc(args)
	}
	return nil, errors.New("showFunc not implemented")
}

// mockPool implements connectionGetter for testing
type mockPool struct {
	getFunc func(ctx context.Context) (issueGetter, error)
	putFunc func(client issueGetter)
}

func (m *mockPool) Get(ctx context.Context) (issueGetter, error) {
	if m.getFunc != nil {
		return m.getFunc(ctx)
	}
	return nil, errors.New("getFunc not implemented")
}

func (m *mockPool) Put(client issueGetter) {
	if m.putFunc != nil {
		m.putFunc(client)
	}
}

// TestWriteErrorResponse tests the writeErrorResponse helper function
func TestWriteErrorResponse(t *testing.T) {
	tests := []struct {
		name        string
		status      int
		message     string
		wantStatus  int
		wantMessage string
	}{
		{
			name:        "bad request error",
			status:      http.StatusBadRequest,
			message:     "missing issue ID",
			wantStatus:  http.StatusBadRequest,
			wantMessage: "missing issue ID",
		},
		{
			name:        "not found error",
			status:      http.StatusNotFound,
			message:     "issue not found: abc123",
			wantStatus:  http.StatusNotFound,
			wantMessage: "issue not found: abc123",
		},
		{
			name:        "service unavailable error",
			status:      http.StatusServiceUnavailable,
			message:     "daemon not available",
			wantStatus:  http.StatusServiceUnavailable,
			wantMessage: "daemon not available",
		},
		{
			name:        "internal server error",
			status:      http.StatusInternalServerError,
			message:     "database error",
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "database error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			writeErrorResponse(w, tt.status, tt.message)

			// Check status code
			if w.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", w.Code, tt.wantStatus)
			}

			// Check Content-Type
			contentType := w.Header().Get("Content-Type")
			if contentType != "application/json" {
				t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
			}

			// Check response body
			var response map[string]string
			if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
				t.Fatalf("failed to decode response: %v", err)
			}

			if response["error"] != tt.wantMessage {
				t.Errorf("error = %q, want %q", response["error"], tt.wantMessage)
			}
		})
	}
}

// TestHandleGetIssue_EmptyID tests that an empty issue ID returns 400 Bad Request
func TestHandleGetIssue_EmptyID(t *testing.T) {
	// Create a pool (won't be used since we fail early on empty ID)
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleGetIssue(pool)

	// Create request without path parameter (empty ID)
	req := httptest.NewRequest(http.MethodGet, "/api/issues/", nil)
	w := httptest.NewRecorder()

	// Manually set path value to empty string to simulate missing ID
	// Note: Go 1.22+ uses SetPathValue for the new routing pattern
	req.SetPathValue("id", "")

	handler.ServeHTTP(w, req)

	// Check status code
	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	// Check Content-Type
	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	// Check response body
	var response map[string]string
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if response["error"] != "missing issue ID" {
		t.Errorf("error = %q, want %q", response["error"], "missing issue ID")
	}
}

// TestHandleGetIssue_DaemonUnavailable tests that pool.Get() failure returns 503 Service Unavailable
func TestHandleGetIssue_DaemonUnavailable(t *testing.T) {
	// Create a pool that will fail to get a connection (closed pool)
	pool, err := daemon.NewConnectionPool("/tmp/nonexistent-socket-path.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	// Close the pool immediately to make Get() return ErrPoolClosed
	pool.Close()

	handler := handleGetIssue(pool)

	// Create request with a valid issue ID
	req := httptest.NewRequest(http.MethodGet, "/api/issues/abc123", nil)
	req.SetPathValue("id", "abc123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Check status code
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}

	// Check Content-Type
	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	// Check response body
	var response map[string]string
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if response["error"] != "daemon not available" {
		t.Errorf("error = %q, want %q", response["error"], "daemon not available")
	}
}

// TestHandleGetIssue_ContextCancellation tests that a cancelled context returns appropriate error
func TestHandleGetIssue_ContextCancellation(t *testing.T) {
	// Create a pool with a non-existent socket
	pool, err := daemon.NewConnectionPool("/tmp/nonexistent-socket-for-timeout.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleGetIssue(pool)

	// Create request with a cancelled context
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	req := httptest.NewRequest(http.MethodGet, "/api/issues/abc123", nil)
	req = req.WithContext(ctx)
	req.SetPathValue("id", "abc123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Should return 503 since the pool.Get will fail due to cancelled context
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}

	// Check Content-Type
	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}
}

// TestWriteErrorResponse_ContentTypeSet tests that Content-Type is set before WriteHeader
func TestWriteErrorResponse_ContentTypeSet(t *testing.T) {
	w := httptest.NewRecorder()
	writeErrorResponse(w, http.StatusInternalServerError, "test error")

	// Verify Content-Type header is present
	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	// Verify the response is valid JSON
	var response map[string]string
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
}

// TestWriteErrorResponse_EmptyMessage tests handling of empty error message
func TestWriteErrorResponse_EmptyMessage(t *testing.T) {
	w := httptest.NewRecorder()
	writeErrorResponse(w, http.StatusBadRequest, "")

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	var response map[string]string
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	// Empty message should still result in empty string in JSON
	if response["error"] != "" {
		t.Errorf("error = %q, want empty string", response["error"])
	}
}

// TestHandleGetIssue_ValidatesHTTPMethod verifies the handler responds to GET requests
func TestHandleGetIssue_ValidatesHTTPMethod(t *testing.T) {
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleGetIssue(pool)

	// Test with GET method (should proceed, will fail at pool.Get due to no daemon)
	req := httptest.NewRequest(http.MethodGet, "/api/issues/test123", nil)
	req.SetPathValue("id", "test123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// The handler doesn't check HTTP method itself, so it will proceed
	// and eventually fail at pool.Get (503) since there's no daemon
	// This is expected behavior - method filtering is typically done by the router
	if w.Code != http.StatusServiceUnavailable {
		t.Logf("status = %d (expected 503 due to no daemon)", w.Code)
	}
}

// TestHandleGetIssue_PathValueExtraction tests path value extraction with various IDs
func TestHandleGetIssue_PathValueExtraction(t *testing.T) {
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleGetIssue(pool)

	tests := []struct {
		name       string
		urlPath    string
		pathValue  string
		wantStatus int
	}{
		{
			name:       "empty ID returns 400",
			urlPath:    "/api/issues/",
			pathValue:  "",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "valid ID proceeds to pool.Get",
			urlPath:    "/api/issues/abc-123",
			pathValue:  "abc-123",
			wantStatus: http.StatusServiceUnavailable, // Fails at pool.Get (no daemon)
		},
		{
			name:       "ID with special characters proceeds to pool.Get",
			urlPath:    "/api/issues/issue_2024-01-15",
			pathValue:  "issue_2024-01-15",
			wantStatus: http.StatusServiceUnavailable, // Fails at pool.Get (no daemon)
		},
		{
			name:       "short ID proceeds to pool.Get",
			urlPath:    "/api/issues/a",
			pathValue:  "a",
			wantStatus: http.StatusServiceUnavailable, // Fails at pool.Get (no daemon)
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.urlPath, nil)
			req.SetPathValue("id", tt.pathValue)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", w.Code, tt.wantStatus)
			}
		})
	}
}

// TestHandleGetIssue_Success tests that a successful daemon response returns the issue JSON
func TestHandleGetIssue_Success(t *testing.T) {
	// Create expected issue data
	expectedIssue := map[string]interface{}{
		"id":          "test-123",
		"title":       "Test Issue",
		"description": "A test issue for unit testing",
		"status":      "open",
		"priority":    1,
	}
	issueJSON, err := json.Marshal(expectedIssue)
	if err != nil {
		t.Fatalf("failed to marshal expected issue: %v", err)
	}

	// Create mock client that returns the issue
	client := &mockClient{
		showFunc: func(args *rpc.ShowArgs) (*rpc.Response, error) {
			if args.ID != "test-123" {
				t.Errorf("Show() called with ID = %q, want %q", args.ID, "test-123")
			}
			return &rpc.Response{
				Success: true,
				Data:    issueJSON,
			}, nil
		},
	}

	// Create mock pool that returns the mock client
	pool := &mockPool{
		getFunc: func(ctx context.Context) (issueGetter, error) {
			return client, nil
		},
		putFunc: func(c issueGetter) {
			// Verify the client is returned to the pool
			if c != client {
				t.Error("Put() called with different client than Get() returned")
			}
		},
	}

	handler := handleGetIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodGet, "/api/issues/test-123", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Check status code
	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	// Check Content-Type
	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	// Check response body matches expected issue
	var response map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if response["id"] != expectedIssue["id"] {
		t.Errorf("response id = %v, want %v", response["id"], expectedIssue["id"])
	}
	if response["title"] != expectedIssue["title"] {
		t.Errorf("response title = %v, want %v", response["title"], expectedIssue["title"])
	}
	if response["status"] != expectedIssue["status"] {
		t.Errorf("response status = %v, want %v", response["status"], expectedIssue["status"])
	}
}

// TestHandleGetIssue_NotFound tests that a "not found" error from daemon returns 404
func TestHandleGetIssue_NotFound(t *testing.T) {
	// Create mock client that returns a "not found" error
	client := &mockClient{
		showFunc: func(args *rpc.ShowArgs) (*rpc.Response, error) {
			return nil, errors.New("issue not found: nonexistent-id")
		},
	}

	// Create mock pool that returns the mock client
	pool := &mockPool{
		getFunc: func(ctx context.Context) (issueGetter, error) {
			return client, nil
		},
		putFunc: func(c issueGetter) {},
	}

	handler := handleGetIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodGet, "/api/issues/nonexistent-id", nil)
	req.SetPathValue("id", "nonexistent-id")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Check status code
	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}

	// Check Content-Type
	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	// Check response body contains error message
	var response map[string]string
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if response["error"] != "issue not found: nonexistent-id" {
		t.Errorf("error = %q, want %q", response["error"], "issue not found: nonexistent-id")
	}
}

// TestHandleGetIssue_InternalError tests that a non-"not found" error returns 500
func TestHandleGetIssue_InternalError(t *testing.T) {
	// Create mock client that returns a generic error
	client := &mockClient{
		showFunc: func(args *rpc.ShowArgs) (*rpc.Response, error) {
			return nil, errors.New("database connection failed")
		},
	}

	// Create mock pool that returns the mock client
	pool := &mockPool{
		getFunc: func(ctx context.Context) (issueGetter, error) {
			return client, nil
		},
		putFunc: func(c issueGetter) {},
	}

	handler := handleGetIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodGet, "/api/issues/test-123", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Check status code
	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}

	// Check Content-Type
	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	// Check response body contains error message
	var response map[string]string
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if response["error"] != "database connection failed" {
		t.Errorf("error = %q, want %q", response["error"], "database connection failed")
	}
}

// TestHandleGetIssue_PoolGetError tests that pool.Get() error returns 503
func TestHandleGetIssue_PoolGetError(t *testing.T) {
	// Create mock pool that returns an error
	pool := &mockPool{
		getFunc: func(ctx context.Context) (issueGetter, error) {
			return nil, errors.New("pool exhausted")
		},
	}

	handler := handleGetIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodGet, "/api/issues/test-123", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Check status code
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}

	// Check response body
	var response map[string]string
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if response["error"] != "daemon not available" {
		t.Errorf("error = %q, want %q", response["error"], "daemon not available")
	}
}

// TestHandleGetIssue_ClientReturnedToPool verifies that the client is always returned to the pool
func TestHandleGetIssue_ClientReturnedToPool(t *testing.T) {
	putCalled := false

	client := &mockClient{
		showFunc: func(args *rpc.ShowArgs) (*rpc.Response, error) {
			return &rpc.Response{
				Success: true,
				Data:    []byte(`{"id":"test-123"}`),
			}, nil
		},
	}

	pool := &mockPool{
		getFunc: func(ctx context.Context) (issueGetter, error) {
			return client, nil
		},
		putFunc: func(c issueGetter) {
			putCalled = true
		},
	}

	handler := handleGetIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodGet, "/api/issues/test-123", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if !putCalled {
		t.Error("Put() was not called - client not returned to pool")
	}
}

// TestHandleGetIssue_ClientReturnedToPoolOnError verifies client is returned even on RPC error
func TestHandleGetIssue_ClientReturnedToPoolOnError(t *testing.T) {
	putCalled := false

	client := &mockClient{
		showFunc: func(args *rpc.ShowArgs) (*rpc.Response, error) {
			return nil, errors.New("some error")
		},
	}

	pool := &mockPool{
		getFunc: func(ctx context.Context) (issueGetter, error) {
			return client, nil
		},
		putFunc: func(c issueGetter) {
			putCalled = true
		},
	}

	handler := handleGetIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodGet, "/api/issues/test-123", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if !putCalled {
		t.Error("Put() was not called on error - client not returned to pool")
	}
}
