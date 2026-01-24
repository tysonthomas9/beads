package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"github.com/steveyegge/beads/examples/beads-web-ui/daemon"
	"github.com/steveyegge/beads/internal/rpc"
)

// mockClient implements issueGetter and issueUpdater for testing
type mockClient struct {
	showFunc   func(args *rpc.ShowArgs) (*rpc.Response, error)
	updateFunc func(args *rpc.UpdateArgs) (*rpc.Response, error)
}

func (m *mockClient) Show(args *rpc.ShowArgs) (*rpc.Response, error) {
	if m.showFunc != nil {
		return m.showFunc(args)
	}
	return nil, errors.New("showFunc not implemented")
}

func (m *mockClient) Update(args *rpc.UpdateArgs) (*rpc.Response, error) {
	if m.updateFunc != nil {
		return m.updateFunc(args)
	}
	return nil, errors.New("updateFunc not implemented")
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

// Tests for parseListParams and handleListIssues from feature/web-ui branch

func TestParseListParams(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		wantFunc func(t *testing.T, got interface{})
	}{
		{
			name: "empty query returns empty args",
			url:  "/api/issues",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.Status != "" {
					t.Errorf("expected empty status, got %q", args.Status)
				}
				if args.Priority != nil {
					t.Errorf("expected nil priority, got %v", *args.Priority)
				}
			},
		},
		{
			name: "status filter",
			url:  "/api/issues?status=open",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.Status != "open" {
					t.Errorf("expected status=open, got %q", args.Status)
				}
			},
		},
		{
			name: "priority filter",
			url:  "/api/issues?priority=1",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.Priority == nil || *args.Priority != 1 {
					t.Errorf("expected priority=1, got %v", args.Priority)
				}
			},
		},
		{
			name: "invalid priority is ignored",
			url:  "/api/issues?priority=invalid",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.Priority != nil {
					t.Errorf("expected nil priority for invalid value, got %v", *args.Priority)
				}
			},
		},
		{
			name: "type filter",
			url:  "/api/issues?type=task",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.IssueType != "task" {
					t.Errorf("expected type=task, got %q", args.IssueType)
				}
			},
		},
		{
			name: "assignee filter",
			url:  "/api/issues?assignee=tyson",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.Assignee != "tyson" {
					t.Errorf("expected assignee=tyson, got %q", args.Assignee)
				}
			},
		},
		{
			name: "labels filter",
			url:  "/api/issues?labels=phase-2,urgent",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if len(args.Labels) != 2 || args.Labels[0] != "phase-2" || args.Labels[1] != "urgent" {
					t.Errorf("expected labels=[phase-2,urgent], got %v", args.Labels)
				}
			},
		},
		{
			name: "labels with spaces are trimmed",
			url:  "/api/issues?labels=phase-2%2C%20urgent%20%2C%20important",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if len(args.Labels) != 3 {
					t.Errorf("expected 3 labels, got %d", len(args.Labels))
				}
				for _, l := range args.Labels {
					if l != "phase-2" && l != "urgent" && l != "important" {
						t.Errorf("unexpected label %q", l)
					}
				}
			},
		},
		{
			name: "limit filter",
			url:  "/api/issues?limit=50",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.Limit != 50 {
					t.Errorf("expected limit=50, got %d", args.Limit)
				}
			},
		},
		{
			name: "negative limit is ignored",
			url:  "/api/issues?limit=-1",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.Limit != 0 {
					t.Errorf("expected limit=0 for negative value, got %d", args.Limit)
				}
			},
		},
		{
			name: "excessive limit is capped at MaxListLimit",
			url:  "/api/issues?limit=999999999",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.Limit != MaxListLimit {
					t.Errorf("expected limit=%d for excessive value, got %d", MaxListLimit, args.Limit)
				}
			},
		},
		{
			name: "query filter",
			url:  "/api/issues?q=search+term",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.Query != "search term" {
					t.Errorf("expected q='search term', got %q", args.Query)
				}
			},
		},
		{
			name: "title_contains filter",
			url:  "/api/issues?title_contains=bug",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.TitleContains != "bug" {
					t.Errorf("expected title_contains=bug, got %q", args.TitleContains)
				}
			},
		},
		{
			name: "pinned filter true",
			url:  "/api/issues?pinned=true",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.Pinned == nil || !*args.Pinned {
					t.Errorf("expected pinned=true, got %v", args.Pinned)
				}
			},
		},
		{
			name: "pinned filter false",
			url:  "/api/issues?pinned=false",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.Pinned == nil || *args.Pinned {
					t.Errorf("expected pinned=false, got %v", args.Pinned)
				}
			},
		},
		{
			name: "empty_description filter",
			url:  "/api/issues?empty_description=true",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if !args.EmptyDescription {
					t.Errorf("expected empty_description=true")
				}
			},
		},
		{
			name: "no_assignee filter",
			url:  "/api/issues?no_assignee=true",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if !args.NoAssignee {
					t.Errorf("expected no_assignee=true")
				}
			},
		},
		{
			name: "multiple filters combined",
			url:  "/api/issues?status=open&priority=1&type=task&limit=10",
			wantFunc: func(t *testing.T, got interface{}) {
				args := got.(testListArgs)
				if args.Status != "open" {
					t.Errorf("expected status=open, got %q", args.Status)
				}
				if args.Priority == nil || *args.Priority != 1 {
					t.Errorf("expected priority=1, got %v", args.Priority)
				}
				if args.IssueType != "task" {
					t.Errorf("expected type=task, got %q", args.IssueType)
				}
				if args.Limit != 10 {
					t.Errorf("expected limit=10, got %d", args.Limit)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tt.url, nil)
			args := parseListParams(req)
			// Convert to testListArgs for comparison
			testArgs := testListArgs{
				Status:           args.Status,
				Priority:         args.Priority,
				IssueType:        args.IssueType,
				Assignee:         args.Assignee,
				Labels:           args.Labels,
				Limit:            args.Limit,
				Query:            args.Query,
				TitleContains:    args.TitleContains,
				EmptyDescription: args.EmptyDescription,
				NoAssignee:       args.NoAssignee,
				Pinned:           args.Pinned,
			}
			tt.wantFunc(t, testArgs)
		})
	}
}

// testListArgs is a simplified version of rpc.ListArgs for testing.
type testListArgs struct {
	Status           string
	Priority         *int
	IssueType        string
	Assignee         string
	Labels           []string
	Limit            int
	Query            string
	TitleContains    string
	EmptyDescription bool
	NoAssignee       bool
	Pinned           *bool
}

func TestHandleListIssues_NilPool(t *testing.T) {
	handler := handleListIssues(nil)

	req := httptest.NewRequest("GET", "/api/issues", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status %d, got %d", http.StatusServiceUnavailable, w.Code)
	}

	var resp IssuesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Code != "POOL_NOT_INITIALIZED" {
		t.Errorf("expected code=POOL_NOT_INITIALIZED, got %q", resp.Code)
	}
}

func TestSplitTrimmed(t *testing.T) {
	tests := []struct {
		input string
		want  []string
	}{
		{"a,b,c", []string{"a", "b", "c"}},
		{"a, b, c", []string{"a", "b", "c"}},
		{" a , b , c ", []string{"a", "b", "c"}},
		{"a,,b", []string{"a", "b"}},
		{"", []string{}},
		{",,,", []string{}},
		{"single", []string{"single"}},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := splitTrimmed(tt.input)
			if len(got) != len(tt.want) {
				t.Errorf("len mismatch: got %d, want %d", len(got), len(tt.want))
				return
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("index %d: got %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestIssuesResponseJSON(t *testing.T) {
	// Test success response structure
	t.Run("success response", func(t *testing.T) {
		resp := IssuesResponse{
			Success: true,
			Data:    json.RawMessage(`[{"id":"test-1","title":"Test Issue"}]`),
		}
		bytes, err := json.Marshal(resp)
		if err != nil {
			t.Fatalf("failed to marshal: %v", err)
		}

		var decoded map[string]interface{}
		if err := json.Unmarshal(bytes, &decoded); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}

		if decoded["success"] != true {
			t.Errorf("expected success=true")
		}
		if decoded["data"] == nil {
			t.Errorf("expected data to be present")
		}
		if _, hasError := decoded["error"]; hasError {
			// error should be omitted when empty
			if decoded["error"] != "" {
				t.Errorf("expected error to be omitted or empty")
			}
		}
	})

	// Test error response structure
	t.Run("error response", func(t *testing.T) {
		resp := IssuesResponse{
			Success: false,
			Error:   "connection failed",
			Code:    "DAEMON_UNAVAILABLE",
		}
		bytes, err := json.Marshal(resp)
		if err != nil {
			t.Fatalf("failed to marshal: %v", err)
		}

		var decoded map[string]interface{}
		if err := json.Unmarshal(bytes, &decoded); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}

		if decoded["success"] != false {
			t.Errorf("expected success=false")
		}
		if decoded["error"] != "connection failed" {
			t.Errorf("expected error='connection failed', got %v", decoded["error"])
		}
		if decoded["code"] != "DAEMON_UNAVAILABLE" {
			t.Errorf("expected code='DAEMON_UNAVAILABLE', got %v", decoded["code"])
		}
	})
}

// ===========================================================================
// splitAndTrim tests (from webui/nova branch)
// ===========================================================================

func TestSplitAndTrim(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name:     "empty string returns nil",
			input:    "",
			expected: nil,
		},
		{
			name:     "single value",
			input:    "bug",
			expected: []string{"bug"},
		},
		{
			name:     "multiple values with commas",
			input:    "bug,feature,enhancement",
			expected: []string{"bug", "feature", "enhancement"},
		},
		{
			name:     "values with whitespace",
			input:    "  bug , feature  ,  enhancement  ",
			expected: []string{"bug", "feature", "enhancement"},
		},
		{
			name:     "empty values are removed",
			input:    "bug,,feature,,,enhancement",
			expected: []string{"bug", "feature", "enhancement"},
		},
		{
			name:     "only whitespace values are removed",
			input:    "bug,  ,feature,   ,enhancement",
			expected: []string{"bug", "feature", "enhancement"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := splitAndTrim(tt.input)

			if tt.expected == nil {
				if result != nil {
					t.Errorf("splitAndTrim(%q) = %v, want nil", tt.input, result)
				}
				return
			}

			if len(result) != len(tt.expected) {
				t.Errorf("splitAndTrim(%q) len = %d, want %d", tt.input, len(result), len(tt.expected))
				return
			}

			for i, v := range result {
				if v != tt.expected[i] {
					t.Errorf("splitAndTrim(%q)[%d] = %q, want %q", tt.input, i, v, tt.expected[i])
				}
			}
		})
	}
}

// ===========================================================================
// parseReadyParams tests (from webui/nova branch)
// ===========================================================================

func TestParseReadyParams_EmptyQuery(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/ready", nil)

	args, err := parseReadyParams(req)
	if err != nil {
		t.Errorf("parseReadyParams() unexpected error: %v", err)
	}

	// Verify default values
	if args.Assignee != "" {
		t.Errorf("Assignee = %q, want empty", args.Assignee)
	}
	if args.Unassigned {
		t.Error("Unassigned = true, want false")
	}
	if args.Priority != nil {
		t.Errorf("Priority = %v, want nil", args.Priority)
	}
	if args.Type != "" {
		t.Errorf("Type = %q, want empty", args.Type)
	}
	if args.Limit != 0 {
		t.Errorf("Limit = %d, want 0", args.Limit)
	}
	if args.SortPolicy != "" {
		t.Errorf("SortPolicy = %q, want empty", args.SortPolicy)
	}
	if args.Labels != nil {
		t.Errorf("Labels = %v, want nil", args.Labels)
	}
	if args.LabelsAny != nil {
		t.Errorf("LabelsAny = %v, want nil", args.LabelsAny)
	}
	if args.ParentID != "" {
		t.Errorf("ParentID = %q, want empty", args.ParentID)
	}
	if args.MolType != "" {
		t.Errorf("MolType = %q, want empty", args.MolType)
	}
	if args.IncludeDeferred {
		t.Error("IncludeDeferred = true, want false")
	}
}

func TestParseReadyParams_Assignee(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/ready?assignee=alice", nil)

	args, err := parseReadyParams(req)
	if err != nil {
		t.Errorf("parseReadyParams() unexpected error: %v", err)
	}

	if args.Assignee != "alice" {
		t.Errorf("Assignee = %q, want %q", args.Assignee, "alice")
	}
}

func TestParseReadyParams_Priority(t *testing.T) {
	tests := []struct {
		name      string
		query     string
		wantVal   *int
		wantErr   bool
		errSubstr string
	}{
		{
			name:    "valid priority 0",
			query:   "priority=0",
			wantVal: intPtr(0),
			wantErr: false,
		},
		{
			name:    "valid priority 2",
			query:   "priority=2",
			wantVal: intPtr(2),
			wantErr: false,
		},
		{
			name:    "valid priority 4",
			query:   "priority=4",
			wantVal: intPtr(4),
			wantErr: false,
		},
		{
			name:      "invalid priority not a number",
			query:     "priority=high",
			wantErr:   true,
			errSubstr: "invalid priority value",
		},
		{
			name:      "invalid priority negative",
			query:     "priority=-1",
			wantErr:   true,
			errSubstr: "priority must be between 0 and 4",
		},
		{
			name:      "invalid priority too high",
			query:     "priority=5",
			wantErr:   true,
			errSubstr: "priority must be between 0 and 4",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/ready?"+tt.query, nil)

			args, err := parseReadyParams(req)

			if tt.wantErr {
				if err == nil {
					t.Error("parseReadyParams() expected error, got nil")
					return
				}
				if tt.errSubstr != "" && !containsSubstring(err.Error(), tt.errSubstr) {
					t.Errorf("error = %q, want to contain %q", err.Error(), tt.errSubstr)
				}
				return
			}

			if err != nil {
				t.Errorf("parseReadyParams() unexpected error: %v", err)
				return
			}

			if tt.wantVal == nil {
				if args.Priority != nil {
					t.Errorf("Priority = %v, want nil", args.Priority)
				}
			} else {
				if args.Priority == nil {
					t.Errorf("Priority = nil, want %d", *tt.wantVal)
				} else if *args.Priority != *tt.wantVal {
					t.Errorf("Priority = %d, want %d", *args.Priority, *tt.wantVal)
				}
			}
		})
	}
}

func TestParseReadyParams_Limit(t *testing.T) {
	tests := []struct {
		name      string
		query     string
		wantVal   int
		wantErr   bool
		errSubstr string
	}{
		{
			name:    "valid limit 0",
			query:   "limit=0",
			wantVal: 0,
			wantErr: false,
		},
		{
			name:    "valid limit 10",
			query:   "limit=10",
			wantVal: 10,
			wantErr: false,
		},
		{
			name:    "valid limit 100",
			query:   "limit=100",
			wantVal: 100,
			wantErr: false,
		},
		{
			name:      "invalid limit not a number",
			query:     "limit=ten",
			wantErr:   true,
			errSubstr: "invalid limit value",
		},
		{
			name:      "invalid limit negative",
			query:     "limit=-5",
			wantErr:   true,
			errSubstr: "limit must be non-negative",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/ready?"+tt.query, nil)

			args, err := parseReadyParams(req)

			if tt.wantErr {
				if err == nil {
					t.Error("parseReadyParams() expected error, got nil")
					return
				}
				if tt.errSubstr != "" && !containsSubstring(err.Error(), tt.errSubstr) {
					t.Errorf("error = %q, want to contain %q", err.Error(), tt.errSubstr)
				}
				return
			}

			if err != nil {
				t.Errorf("parseReadyParams() unexpected error: %v", err)
				return
			}

			if args.Limit != tt.wantVal {
				t.Errorf("Limit = %d, want %d", args.Limit, tt.wantVal)
			}
		})
	}
}

func TestParseReadyParams_SortPolicy(t *testing.T) {
	tests := []struct {
		name      string
		query     string
		wantVal   string
		wantErr   bool
		errSubstr string
	}{
		{
			name:    "valid sort policy hybrid",
			query:   "sort=hybrid",
			wantVal: "hybrid",
			wantErr: false,
		},
		{
			name:    "valid sort policy priority",
			query:   "sort=priority",
			wantVal: "priority",
			wantErr: false,
		},
		{
			name:    "valid sort policy oldest",
			query:   "sort=oldest",
			wantVal: "oldest",
			wantErr: false,
		},
		{
			name:      "invalid sort policy",
			query:     "sort=newest",
			wantErr:   true,
			errSubstr: "invalid sort policy",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/ready?"+tt.query, nil)

			args, err := parseReadyParams(req)

			if tt.wantErr {
				if err == nil {
					t.Error("parseReadyParams() expected error, got nil")
					return
				}
				if tt.errSubstr != "" && !containsSubstring(err.Error(), tt.errSubstr) {
					t.Errorf("error = %q, want to contain %q", err.Error(), tt.errSubstr)
				}
				return
			}

			if err != nil {
				t.Errorf("parseReadyParams() unexpected error: %v", err)
				return
			}

			if args.SortPolicy != tt.wantVal {
				t.Errorf("SortPolicy = %q, want %q", args.SortPolicy, tt.wantVal)
			}
		})
	}
}

func TestParseReadyParams_Labels(t *testing.T) {
	tests := []struct {
		name    string
		query   string
		wantVal []string
	}{
		{
			name:    "single label",
			query:   "labels=bug",
			wantVal: []string{"bug"},
		},
		{
			name:    "multiple labels comma-separated",
			query:   "labels=bug,feature,urgent",
			wantVal: []string{"bug", "feature", "urgent"},
		},
		{
			name:    "labels with whitespace",
			query:   "labels=" + url.QueryEscape("bug , feature , urgent"),
			wantVal: []string{"bug", "feature", "urgent"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/ready?"+tt.query, nil)

			args, err := parseReadyParams(req)
			if err != nil {
				t.Errorf("parseReadyParams() unexpected error: %v", err)
				return
			}

			if len(args.Labels) != len(tt.wantVal) {
				t.Errorf("Labels len = %d, want %d", len(args.Labels), len(tt.wantVal))
				return
			}

			for i, v := range args.Labels {
				if v != tt.wantVal[i] {
					t.Errorf("Labels[%d] = %q, want %q", i, v, tt.wantVal[i])
				}
			}
		})
	}
}

func TestParseReadyParams_LabelsAny(t *testing.T) {
	tests := []struct {
		name    string
		query   string
		wantVal []string
	}{
		{
			name:    "single label_any",
			query:   "labels_any=bug",
			wantVal: []string{"bug"},
		},
		{
			name:    "multiple labels_any comma-separated",
			query:   "labels_any=bug,feature,urgent",
			wantVal: []string{"bug", "feature", "urgent"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/ready?"+tt.query, nil)

			args, err := parseReadyParams(req)
			if err != nil {
				t.Errorf("parseReadyParams() unexpected error: %v", err)
				return
			}

			if len(args.LabelsAny) != len(tt.wantVal) {
				t.Errorf("LabelsAny len = %d, want %d", len(args.LabelsAny), len(tt.wantVal))
				return
			}

			for i, v := range args.LabelsAny {
				if v != tt.wantVal[i] {
					t.Errorf("LabelsAny[%d] = %q, want %q", i, v, tt.wantVal[i])
				}
			}
		})
	}
}

func TestParseReadyParams_BooleanParams(t *testing.T) {
	tests := []struct {
		name             string
		query            string
		wantUnassigned   bool
		wantIncludeDefer bool
		wantErr          bool
		errSubstr        string
	}{
		{
			name:           "unassigned true",
			query:          "unassigned=true",
			wantUnassigned: true,
		},
		{
			name:           "unassigned false",
			query:          "unassigned=false",
			wantUnassigned: false,
		},
		{
			name:           "unassigned 1 (truthy)",
			query:          "unassigned=1",
			wantUnassigned: true,
		},
		{
			name:      "unassigned invalid",
			query:     "unassigned=yes",
			wantErr:   true,
			errSubstr: "invalid unassigned value",
		},
		{
			name:             "include_deferred true",
			query:            "include_deferred=true",
			wantIncludeDefer: true,
		},
		{
			name:             "include_deferred false",
			query:            "include_deferred=false",
			wantIncludeDefer: false,
		},
		{
			name:      "include_deferred invalid",
			query:     "include_deferred=maybe",
			wantErr:   true,
			errSubstr: "invalid include_deferred value",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/ready?"+tt.query, nil)

			args, err := parseReadyParams(req)

			if tt.wantErr {
				if err == nil {
					t.Error("parseReadyParams() expected error, got nil")
					return
				}
				if tt.errSubstr != "" && !containsSubstring(err.Error(), tt.errSubstr) {
					t.Errorf("error = %q, want to contain %q", err.Error(), tt.errSubstr)
				}
				return
			}

			if err != nil {
				t.Errorf("parseReadyParams() unexpected error: %v", err)
				return
			}

			if args.Unassigned != tt.wantUnassigned {
				t.Errorf("Unassigned = %v, want %v", args.Unassigned, tt.wantUnassigned)
			}
			if args.IncludeDeferred != tt.wantIncludeDefer {
				t.Errorf("IncludeDeferred = %v, want %v", args.IncludeDeferred, tt.wantIncludeDefer)
			}
		})
	}
}

func TestParseReadyParams_Type(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/ready?type=bug", nil)

	args, err := parseReadyParams(req)
	if err != nil {
		t.Errorf("parseReadyParams() unexpected error: %v", err)
	}

	if args.Type != "bug" {
		t.Errorf("Type = %q, want %q", args.Type, "bug")
	}
}

func TestParseReadyParams_ParentID(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/ready?parent_id=epic-123", nil)

	args, err := parseReadyParams(req)
	if err != nil {
		t.Errorf("parseReadyParams() unexpected error: %v", err)
	}

	if args.ParentID != "epic-123" {
		t.Errorf("ParentID = %q, want %q", args.ParentID, "epic-123")
	}
}

func TestParseReadyParams_MolType(t *testing.T) {
	tests := []struct {
		name      string
		query     string
		wantVal   string
		wantErr   bool
		errSubstr string
	}{
		{
			name:    "valid mol_type swarm",
			query:   "mol_type=swarm",
			wantVal: "swarm",
			wantErr: false,
		},
		{
			name:    "valid mol_type patrol",
			query:   "mol_type=patrol",
			wantVal: "patrol",
			wantErr: false,
		},
		{
			name:    "valid mol_type work",
			query:   "mol_type=work",
			wantVal: "work",
			wantErr: false,
		},
		{
			name:      "invalid mol_type",
			query:     "mol_type=invalid",
			wantErr:   true,
			errSubstr: "invalid mol_type",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/ready?"+tt.query, nil)

			args, err := parseReadyParams(req)

			if tt.wantErr {
				if err == nil {
					t.Error("parseReadyParams() expected error, got nil")
					return
				}
				if tt.errSubstr != "" && !containsSubstring(err.Error(), tt.errSubstr) {
					t.Errorf("error = %q, want to contain %q", err.Error(), tt.errSubstr)
				}
				return
			}

			if err != nil {
				t.Errorf("parseReadyParams() unexpected error: %v", err)
				return
			}

			if args.MolType != tt.wantVal {
				t.Errorf("MolType = %q, want %q", args.MolType, tt.wantVal)
			}
		})
	}
}

func TestParseReadyParams_MultipleParams(t *testing.T) {
	query := "assignee=alice&priority=2&limit=10&sort=priority&labels=bug,urgent&unassigned=false&type=task&mol_type=work"
	req := httptest.NewRequest(http.MethodGet, "/api/ready?"+query, nil)

	args, err := parseReadyParams(req)
	if err != nil {
		t.Errorf("parseReadyParams() unexpected error: %v", err)
		return
	}

	if args.Assignee != "alice" {
		t.Errorf("Assignee = %q, want %q", args.Assignee, "alice")
	}
	if args.Priority == nil || *args.Priority != 2 {
		t.Errorf("Priority = %v, want 2", args.Priority)
	}
	if args.Limit != 10 {
		t.Errorf("Limit = %d, want 10", args.Limit)
	}
	if args.SortPolicy != "priority" {
		t.Errorf("SortPolicy = %q, want %q", args.SortPolicy, "priority")
	}
	if len(args.Labels) != 2 || args.Labels[0] != "bug" || args.Labels[1] != "urgent" {
		t.Errorf("Labels = %v, want [bug, urgent]", args.Labels)
	}
	if args.Unassigned {
		t.Error("Unassigned = true, want false")
	}
	if args.Type != "task" {
		t.Errorf("Type = %q, want %q", args.Type, "task")
	}
	if args.MolType != "work" {
		t.Errorf("MolType = %q, want %q", args.MolType, "work")
	}
}

// ===========================================================================
// handleReady tests (from webui/nova branch)
// ===========================================================================

func TestHandleReady_NilPool(t *testing.T) {
	handler := handleReady(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/ready", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("status code = %d, want %d", rr.Code, http.StatusServiceUnavailable)
	}

	var resp ReadyResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Errorf("failed to decode response: %v", err)
		return
	}

	if resp.Success {
		t.Error("Success = true, want false")
	}
	if resp.Error != "connection pool not initialized" {
		t.Errorf("Error = %q, want %q", resp.Error, "connection pool not initialized")
	}
}

func TestHandleReady_InvalidParams(t *testing.T) {
	// Create a pool (we won't actually use it because parsing fails first)
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleReady(pool)

	// Invalid priority parameter
	req := httptest.NewRequest(http.MethodGet, "/api/ready?priority=invalid", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("status code = %d, want %d", rr.Code, http.StatusBadRequest)
	}

	var resp ReadyResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Errorf("failed to decode response: %v", err)
		return
	}

	if resp.Success {
		t.Error("Success = true, want false")
	}
	if !containsSubstring(resp.Error, "invalid priority value") {
		t.Errorf("Error = %q, expected to contain 'invalid priority value'", resp.Error)
	}
}

func TestHandleReady_PoolClosed(t *testing.T) {
	// Create and immediately close the pool
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	pool.Close()

	handler := handleReady(pool)

	req := httptest.NewRequest(http.MethodGet, "/api/ready", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	// Should return ServiceUnavailable when pool is closed
	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("status code = %d, want %d", rr.Code, http.StatusServiceUnavailable)
	}

	var resp ReadyResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Errorf("failed to decode response: %v", err)
		return
	}

	if resp.Success {
		t.Error("Success = true, want false")
	}
}

func TestHandleReady_ContentType(t *testing.T) {
	handler := handleReady(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/ready", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}
}

// ===========================================================================
// Helper functions
// ===========================================================================

func intPtr(i int) *int {
	return &i
}

func containsSubstring(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstringHelper(s, substr))
}

func containsSubstringHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// Verify that rpc.ReadyArgs fields match what we expect (compile-time check)
var _ = func() bool {
	args := &rpc.ReadyArgs{
		Assignee:        "",
		Unassigned:      false,
		Priority:        nil,
		Type:            "",
		Limit:           0,
		SortPolicy:      "",
		Labels:          nil,
		LabelsAny:       nil,
		ParentID:        "",
		MolType:         "",
		IncludeDeferred: false,
	}
	_ = args
	return true
}()

// ===========================================================================
// validateCreateRequest tests
// ===========================================================================

func TestValidateCreateRequest(t *testing.T) {
	tests := []struct {
		name      string
		req       *IssueCreateRequest
		wantErr   bool
		errSubstr string
	}{
		{
			name: "valid full request",
			req: &IssueCreateRequest{
				Title:       "Test Issue",
				IssueType:   "bug",
				Priority:    2,
				Description: "A test issue",
				Assignee:    "alice",
			},
			wantErr: false,
		},
		{
			name: "valid minimal request",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "task",
				Priority:  1,
			},
			wantErr: false,
		},
		{
			name: "missing title",
			req: &IssueCreateRequest{
				IssueType: "bug",
				Priority:  1,
			},
			wantErr:   true,
			errSubstr: "title is required",
		},
		{
			name: "empty title",
			req: &IssueCreateRequest{
				Title:     "",
				IssueType: "bug",
				Priority:  1,
			},
			wantErr:   true,
			errSubstr: "title is required",
		},
		{
			name: "whitespace-only title",
			req: &IssueCreateRequest{
				Title:     "   ",
				IssueType: "bug",
				Priority:  1,
			},
			wantErr:   true,
			errSubstr: "title is required",
		},
		{
			name: "missing issue_type",
			req: &IssueCreateRequest{
				Title:    "Test Issue",
				Priority: 1,
			},
			wantErr:   true,
			errSubstr: "issue_type is required",
		},
		{
			name: "empty issue_type",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "",
				Priority:  1,
			},
			wantErr:   true,
			errSubstr: "issue_type is required",
		},
		{
			name: "invalid issue_type",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "invalid_type",
				Priority:  1,
			},
			wantErr:   true,
			errSubstr: "invalid issue_type",
		},
		{
			name: "valid issue_type bug",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "bug",
				Priority:  1,
			},
			wantErr: false,
		},
		{
			name: "valid issue_type feature",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "feature",
				Priority:  1,
			},
			wantErr: false,
		},
		{
			name: "valid issue_type task",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "task",
				Priority:  1,
			},
			wantErr: false,
		},
		{
			name: "valid issue_type epic",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "epic",
				Priority:  1,
			},
			wantErr: false,
		},
		{
			name: "valid issue_type chore",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "chore",
				Priority:  1,
			},
			wantErr: false,
		},
		{
			name: "priority -1 invalid",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "bug",
				Priority:  -1,
			},
			wantErr:   true,
			errSubstr: "priority must be between 0 and 4",
		},
		{
			name: "priority 5 invalid",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "bug",
				Priority:  5,
			},
			wantErr:   true,
			errSubstr: "priority must be between 0 and 4",
		},
		{
			name: "priority 0 (P0) is valid",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "bug",
				Priority:  0,
			},
			wantErr: false,
		},
		{
			name: "priority 4 is valid",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "bug",
				Priority:  4,
			},
			wantErr: false,
		},
		{
			name: "too many labels",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "bug",
				Priority:  2,
				Labels:    make([]string, 51), // 51 exceeds max of 50
			},
			wantErr:   true,
			errSubstr: "too many labels",
		},
		{
			name: "max labels is valid",
			req: &IssueCreateRequest{
				Title:     "Test Issue",
				IssueType: "bug",
				Priority:  2,
				Labels:    make([]string, 50), // exactly 50 is valid
			},
			wantErr: false,
		},
		{
			name: "too many dependencies",
			req: &IssueCreateRequest{
				Title:        "Test Issue",
				IssueType:    "bug",
				Priority:     2,
				Dependencies: make([]string, 101), // 101 exceeds max of 100
			},
			wantErr:   true,
			errSubstr: "too many dependencies",
		},
		{
			name: "max dependencies is valid",
			req: &IssueCreateRequest{
				Title:        "Test Issue",
				IssueType:    "bug",
				Priority:     2,
				Dependencies: make([]string, 100), // exactly 100 is valid
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateCreateRequest(tt.req)

			if tt.wantErr {
				if err == nil {
					t.Error("validateCreateRequest() expected error, got nil")
					return
				}
				if tt.errSubstr != "" && !containsSubstring(err.Error(), tt.errSubstr) {
					t.Errorf("error = %q, want to contain %q", err.Error(), tt.errSubstr)
				}
				return
			}

			if err != nil {
				t.Errorf("validateCreateRequest() unexpected error: %v", err)
			}
		})
	}
}

// ===========================================================================
// toCreateArgs tests
// ===========================================================================

func TestToCreateArgs(t *testing.T) {
	estMinutes := 120

	t.Run("full payload conversion", func(t *testing.T) {
		req := &IssueCreateRequest{
			Title:              "Test Issue",
			IssueType:          "bug",
			Priority:           2,
			ID:                 "custom-id",
			Parent:             "parent-123",
			Description:        "A test description",
			Design:             "Design notes",
			AcceptanceCriteria: "Must pass all tests",
			Notes:              "Some notes",
			Assignee:           "alice",
			Owner:              "bob",
			CreatedBy:          "charlie",
			ExternalRef:        "JIRA-123",
			EstimatedMinutes:   &estMinutes,
			Labels:             []string{"bug", "urgent"},
			Dependencies:       []string{"dep-1", "dep-2"},
			DueAt:              "2024-12-31T23:59:59Z",
			DeferUntil:         "2024-06-01T00:00:00Z",
		}

		args := toCreateArgs(req)

		if args.Title != req.Title {
			t.Errorf("Title = %q, want %q", args.Title, req.Title)
		}
		if args.IssueType != req.IssueType {
			t.Errorf("IssueType = %q, want %q", args.IssueType, req.IssueType)
		}
		if args.Priority != req.Priority {
			t.Errorf("Priority = %d, want %d", args.Priority, req.Priority)
		}
		if args.ID != req.ID {
			t.Errorf("ID = %q, want %q", args.ID, req.ID)
		}
		if args.Parent != req.Parent {
			t.Errorf("Parent = %q, want %q", args.Parent, req.Parent)
		}
		if args.Description != req.Description {
			t.Errorf("Description = %q, want %q", args.Description, req.Description)
		}
		if args.Design != req.Design {
			t.Errorf("Design = %q, want %q", args.Design, req.Design)
		}
		if args.AcceptanceCriteria != req.AcceptanceCriteria {
			t.Errorf("AcceptanceCriteria = %q, want %q", args.AcceptanceCriteria, req.AcceptanceCriteria)
		}
		if args.Notes != req.Notes {
			t.Errorf("Notes = %q, want %q", args.Notes, req.Notes)
		}
		if args.Assignee != req.Assignee {
			t.Errorf("Assignee = %q, want %q", args.Assignee, req.Assignee)
		}
		if args.Owner != req.Owner {
			t.Errorf("Owner = %q, want %q", args.Owner, req.Owner)
		}
		if args.CreatedBy != req.CreatedBy {
			t.Errorf("CreatedBy = %q, want %q", args.CreatedBy, req.CreatedBy)
		}
		if args.ExternalRef != req.ExternalRef {
			t.Errorf("ExternalRef = %q, want %q", args.ExternalRef, req.ExternalRef)
		}
		if args.EstimatedMinutes == nil || *args.EstimatedMinutes != estMinutes {
			t.Errorf("EstimatedMinutes = %v, want %d", args.EstimatedMinutes, estMinutes)
		}
		if len(args.Labels) != len(req.Labels) {
			t.Errorf("Labels len = %d, want %d", len(args.Labels), len(req.Labels))
		}
		for i, v := range args.Labels {
			if v != req.Labels[i] {
				t.Errorf("Labels[%d] = %q, want %q", i, v, req.Labels[i])
			}
		}
		if len(args.Dependencies) != len(req.Dependencies) {
			t.Errorf("Dependencies len = %d, want %d", len(args.Dependencies), len(req.Dependencies))
		}
		for i, v := range args.Dependencies {
			if v != req.Dependencies[i] {
				t.Errorf("Dependencies[%d] = %q, want %q", i, v, req.Dependencies[i])
			}
		}
		if args.DueAt != req.DueAt {
			t.Errorf("DueAt = %q, want %q", args.DueAt, req.DueAt)
		}
		if args.DeferUntil != req.DeferUntil {
			t.Errorf("DeferUntil = %q, want %q", args.DeferUntil, req.DeferUntil)
		}
	})

	t.Run("minimal payload conversion", func(t *testing.T) {
		req := &IssueCreateRequest{
			Title:     "Minimal Issue",
			IssueType: "task",
			Priority:  1,
		}

		args := toCreateArgs(req)

		if args.Title != req.Title {
			t.Errorf("Title = %q, want %q", args.Title, req.Title)
		}
		if args.IssueType != req.IssueType {
			t.Errorf("IssueType = %q, want %q", args.IssueType, req.IssueType)
		}
		if args.Priority != req.Priority {
			t.Errorf("Priority = %d, want %d", args.Priority, req.Priority)
		}
		if args.ID != "" {
			t.Errorf("ID = %q, want empty", args.ID)
		}
		if args.Description != "" {
			t.Errorf("Description = %q, want empty", args.Description)
		}
		if args.Assignee != "" {
			t.Errorf("Assignee = %q, want empty", args.Assignee)
		}
		if args.Labels != nil {
			t.Errorf("Labels = %v, want nil", args.Labels)
		}
		if args.EstimatedMinutes != nil {
			t.Errorf("EstimatedMinutes = %v, want nil", args.EstimatedMinutes)
		}
	})
}

// ===========================================================================
// handleCreateIssue tests
// ===========================================================================

// mockCreateClient implements issueCreator for testing
type mockCreateClient struct {
	createFunc func(args *rpc.CreateArgs) (*rpc.Response, error)
}

func (m *mockCreateClient) Create(args *rpc.CreateArgs) (*rpc.Response, error) {
	if m.createFunc != nil {
		return m.createFunc(args)
	}
	return nil, errors.New("createFunc not implemented")
}

// mockCreatePool implements createConnectionGetter for testing
type mockCreatePool struct {
	getFunc func(ctx context.Context) (issueCreator, error)
	putFunc func(client issueCreator)
}

func (m *mockCreatePool) Get(ctx context.Context) (issueCreator, error) {
	if m.getFunc != nil {
		return m.getFunc(ctx)
	}
	return nil, errors.New("getFunc not implemented")
}

func (m *mockCreatePool) Put(client issueCreator) {
	if m.putFunc != nil {
		m.putFunc(client)
	}
}

func TestHandleCreateIssue_NilPool(t *testing.T) {
	handler := handleCreateIssue(nil)

	body := `{"title": "Test", "issue_type": "bug", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}

	var resp IssuesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Code != "POOL_NOT_INITIALIZED" {
		t.Errorf("code = %q, want %q", resp.Code, "POOL_NOT_INITIALIZED")
	}
}

func TestHandleCreateIssue_MalformedJSON(t *testing.T) {
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleCreateIssue(pool)

	// Malformed JSON
	body := `{"title": "Test", "issue_type": bug}` // missing quotes around bug
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	var resp IssuesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Code != "INVALID_JSON" {
		t.Errorf("code = %q, want %q", resp.Code, "INVALID_JSON")
	}
	if !containsSubstring(resp.Error, "invalid JSON body") {
		t.Errorf("error = %q, expected to contain 'invalid JSON body'", resp.Error)
	}
}

func TestHandleCreateIssue_EmptyBody(t *testing.T) {
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleCreateIssue(pool)

	// Empty body
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(""))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	var resp IssuesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Code != "INVALID_JSON" {
		t.Errorf("code = %q, want %q", resp.Code, "INVALID_JSON")
	}
}

func TestHandleCreateIssue_MissingTitle(t *testing.T) {
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleCreateIssue(pool)

	body := `{"issue_type": "bug", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	var resp IssuesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Code != "VALIDATION_ERROR" {
		t.Errorf("code = %q, want %q", resp.Code, "VALIDATION_ERROR")
	}
	if !containsSubstring(resp.Error, "title is required") {
		t.Errorf("error = %q, expected to contain 'title is required'", resp.Error)
	}
}

func TestHandleCreateIssue_WhitespaceTitle(t *testing.T) {
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleCreateIssue(pool)

	body := `{"title": "   ", "issue_type": "bug", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	var resp IssuesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Code != "VALIDATION_ERROR" {
		t.Errorf("code = %q, want %q", resp.Code, "VALIDATION_ERROR")
	}
	if !containsSubstring(resp.Error, "title is required") {
		t.Errorf("error = %q, expected to contain 'title is required'", resp.Error)
	}
}

func TestHandleCreateIssue_MissingIssueType(t *testing.T) {
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleCreateIssue(pool)

	body := `{"title": "Test Issue", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	var resp IssuesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Code != "VALIDATION_ERROR" {
		t.Errorf("code = %q, want %q", resp.Code, "VALIDATION_ERROR")
	}
	if !containsSubstring(resp.Error, "issue_type is required") {
		t.Errorf("error = %q, expected to contain 'issue_type is required'", resp.Error)
	}
}

func TestHandleCreateIssue_InvalidIssueType(t *testing.T) {
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleCreateIssue(pool)

	body := `{"title": "Test Issue", "issue_type": "invalid_type", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	var resp IssuesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Code != "VALIDATION_ERROR" {
		t.Errorf("code = %q, want %q", resp.Code, "VALIDATION_ERROR")
	}
	if !containsSubstring(resp.Error, "invalid issue_type") {
		t.Errorf("error = %q, expected to contain 'invalid issue_type'", resp.Error)
	}
}

func TestHandleCreateIssue_InvalidPriority(t *testing.T) {
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleCreateIssue(pool)

	tests := []struct {
		name     string
		priority int
	}{
		{"priority -1", -1},
		{"priority 5", 5},
		{"priority 10", 10},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := `{"title": "Test Issue", "issue_type": "bug", "priority": ` + strconv.Itoa(tt.priority) + `}`
			req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
			}

			var resp IssuesResponse
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to unmarshal response: %v", err)
			}

			if resp.Success {
				t.Error("expected success=false")
			}
			if resp.Code != "VALIDATION_ERROR" {
				t.Errorf("code = %q, want %q", resp.Code, "VALIDATION_ERROR")
			}
			if !containsSubstring(resp.Error, "priority must be between 0 and 4") {
				t.Errorf("error = %q, expected to contain 'priority must be between 0 and 4'", resp.Error)
			}
		})
	}
}

func TestHandleCreateIssue_P0Priority(t *testing.T) {
	// P0 priority (0) should be valid - this test verifies it passes validation
	// and reaches the pool.Get stage (which will fail due to no daemon)
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleCreateIssue(pool)

	body := `{"title": "Critical Bug", "issue_type": "bug", "priority": 0}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Should fail at pool.Get (503) since there's no daemon, not at validation (400)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d (P0 should be valid and reach pool.Get)", w.Code, http.StatusServiceUnavailable)
	}
}

func TestHandleCreateIssue_MinimalValidRequest(t *testing.T) {
	// Minimal valid request should pass validation and reach pool.Get
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handleCreateIssue(pool)

	body := `{"title": "Test Issue", "issue_type": "task", "priority": 2}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Should fail at pool.Get (503) since there's no daemon
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestHandleCreateIssue_PoolClosed(t *testing.T) {
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	pool.Close() // Close immediately to simulate closed pool

	handler := handleCreateIssue(pool)

	body := `{"title": "Test Issue", "issue_type": "bug", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}

	var resp IssuesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Code != "DAEMON_UNAVAILABLE" {
		t.Errorf("code = %q, want %q", resp.Code, "DAEMON_UNAVAILABLE")
	}
}

func TestHandleCreateIssue_ContentType(t *testing.T) {
	handler := handleCreateIssue(nil)

	body := `{"title": "Test", "issue_type": "bug", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}
}

func TestHandleCreateIssue_Success(t *testing.T) {
	// Create expected issue data that the daemon would return
	expectedIssue := map[string]interface{}{
		"id":         "new-issue-123",
		"title":      "Test Issue",
		"issue_type": "bug",
		"priority":   1,
		"status":     "open",
	}
	issueJSON, err := json.Marshal(expectedIssue)
	if err != nil {
		t.Fatalf("failed to marshal expected issue: %v", err)
	}

	// Create mock client that returns success
	client := &mockCreateClient{
		createFunc: func(args *rpc.CreateArgs) (*rpc.Response, error) {
			// Verify the args were converted correctly
			if args.Title != "Test Issue" {
				t.Errorf("Create() called with Title = %q, want %q", args.Title, "Test Issue")
			}
			if args.IssueType != "bug" {
				t.Errorf("Create() called with IssueType = %q, want %q", args.IssueType, "bug")
			}
			if args.Priority != 1 {
				t.Errorf("Create() called with Priority = %d, want %d", args.Priority, 1)
			}
			return &rpc.Response{
				Success: true,
				Data:    issueJSON,
			}, nil
		},
	}

	// Create mock pool that returns the mock client
	pool := &mockCreatePool{
		getFunc: func(ctx context.Context) (issueCreator, error) {
			return client, nil
		},
		putFunc: func(c issueCreator) {
			// Verify the client is returned to the pool
			if c != client {
				t.Error("Put() called with different client than Get() returned")
			}
		},
	}

	handler := handleCreateIssueWithPool(pool)

	body := `{"title": "Test Issue", "issue_type": "bug", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Check status code - should be 201 Created
	if w.Code != http.StatusCreated {
		t.Errorf("status = %d, want %d", w.Code, http.StatusCreated)
	}

	// Check Content-Type
	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	// Check response body
	var resp IssuesResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !resp.Success {
		t.Errorf("Success = false, want true")
	}

	// Verify the returned data contains the issue
	var returnedIssue map[string]interface{}
	if err := json.Unmarshal(resp.Data, &returnedIssue); err != nil {
		t.Fatalf("failed to unmarshal issue data: %v", err)
	}
	if returnedIssue["id"] != "new-issue-123" {
		t.Errorf("returned issue id = %v, want %v", returnedIssue["id"], "new-issue-123")
	}
}

func TestHandleCreateIssue_FullPayload(t *testing.T) {
	// Create expected issue data
	expectedIssue := map[string]interface{}{
		"id":          "full-issue-456",
		"title":       "Full Feature Request",
		"issue_type":  "feature",
		"priority":    2,
		"status":      "open",
		"description": "A detailed description",
		"assignee":    "alice",
	}
	issueJSON, err := json.Marshal(expectedIssue)
	if err != nil {
		t.Fatalf("failed to marshal expected issue: %v", err)
	}

	// Create mock client that verifies all fields
	client := &mockCreateClient{
		createFunc: func(args *rpc.CreateArgs) (*rpc.Response, error) {
			// Verify all fields were mapped correctly
			if args.Title != "Full Feature Request" {
				t.Errorf("Title = %q, want %q", args.Title, "Full Feature Request")
			}
			if args.IssueType != "feature" {
				t.Errorf("IssueType = %q, want %q", args.IssueType, "feature")
			}
			if args.Priority != 2 {
				t.Errorf("Priority = %d, want %d", args.Priority, 2)
			}
			if args.Description != "A detailed description" {
				t.Errorf("Description = %q, want %q", args.Description, "A detailed description")
			}
			if args.Assignee != "alice" {
				t.Errorf("Assignee = %q, want %q", args.Assignee, "alice")
			}
			if args.Parent != "parent-epic" {
				t.Errorf("Parent = %q, want %q", args.Parent, "parent-epic")
			}
			if len(args.Labels) != 2 || args.Labels[0] != "urgent" || args.Labels[1] != "frontend" {
				t.Errorf("Labels = %v, want [urgent, frontend]", args.Labels)
			}
			return &rpc.Response{
				Success: true,
				Data:    issueJSON,
			}, nil
		},
	}

	pool := &mockCreatePool{
		getFunc: func(ctx context.Context) (issueCreator, error) {
			return client, nil
		},
		putFunc: func(c issueCreator) {},
	}

	handler := handleCreateIssueWithPool(pool)

	body := `{
		"title": "Full Feature Request",
		"issue_type": "feature",
		"priority": 2,
		"description": "A detailed description",
		"assignee": "alice",
		"parent": "parent-epic",
		"labels": ["urgent", "frontend"]
	}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("status = %d, want %d", w.Code, http.StatusCreated)
	}

	var resp IssuesResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !resp.Success {
		t.Errorf("Success = false, want true")
	}
}

func TestHandleCreateIssue_RPCError(t *testing.T) {
	// Create mock client that returns an RPC error
	client := &mockCreateClient{
		createFunc: func(args *rpc.CreateArgs) (*rpc.Response, error) {
			return nil, errors.New("connection reset by peer")
		},
	}

	pool := &mockCreatePool{
		getFunc: func(ctx context.Context) (issueCreator, error) {
			return client, nil
		},
		putFunc: func(c issueCreator) {},
	}

	handler := handleCreateIssueWithPool(pool)

	body := `{"title": "Test Issue", "issue_type": "bug", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}

	var resp IssuesResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Code != "RPC_ERROR" {
		t.Errorf("code = %q, want %q", resp.Code, "RPC_ERROR")
	}
	if !containsSubstring(resp.Error, "failed to create issue") {
		t.Errorf("error = %q, expected to contain 'failed to create issue'", resp.Error)
	}
}

func TestHandleCreateIssue_DaemonError(t *testing.T) {
	// Create mock client that returns success=false (daemon-level error)
	client := &mockCreateClient{
		createFunc: func(args *rpc.CreateArgs) (*rpc.Response, error) {
			return &rpc.Response{
				Success: false,
				Error:   "duplicate issue ID",
			}, nil
		},
	}

	pool := &mockCreatePool{
		getFunc: func(ctx context.Context) (issueCreator, error) {
			return client, nil
		},
		putFunc: func(c issueCreator) {},
	}

	handler := handleCreateIssueWithPool(pool)

	body := `{"title": "Test Issue", "issue_type": "bug", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}

	var resp IssuesResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Code != "DAEMON_ERROR" {
		t.Errorf("code = %q, want %q", resp.Code, "DAEMON_ERROR")
	}
	if resp.Error != "duplicate issue ID" {
		t.Errorf("error = %q, want %q", resp.Error, "duplicate issue ID")
	}
}

func TestHandleCreateIssue_PoolGetError(t *testing.T) {
	// Create mock pool that returns an error on Get
	pool := &mockCreatePool{
		getFunc: func(ctx context.Context) (issueCreator, error) {
			return nil, errors.New("pool exhausted")
		},
	}

	handler := handleCreateIssueWithPool(pool)

	body := `{"title": "Test Issue", "issue_type": "bug", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}

	var resp IssuesResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Code != "DAEMON_UNAVAILABLE" {
		t.Errorf("code = %q, want %q", resp.Code, "DAEMON_UNAVAILABLE")
	}
}

func TestHandleCreateIssue_ClientReturnedToPool(t *testing.T) {
	putCalled := false

	client := &mockCreateClient{
		createFunc: func(args *rpc.CreateArgs) (*rpc.Response, error) {
			return &rpc.Response{
				Success: true,
				Data:    []byte(`{"id":"test-123"}`),
			}, nil
		},
	}

	pool := &mockCreatePool{
		getFunc: func(ctx context.Context) (issueCreator, error) {
			return client, nil
		},
		putFunc: func(c issueCreator) {
			putCalled = true
		},
	}

	handler := handleCreateIssueWithPool(pool)

	body := `{"title": "Test Issue", "issue_type": "bug", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if !putCalled {
		t.Error("Put() was not called - client not returned to pool")
	}
}

func TestHandleCreateIssue_ClientReturnedToPoolOnError(t *testing.T) {
	putCalled := false

	client := &mockCreateClient{
		createFunc: func(args *rpc.CreateArgs) (*rpc.Response, error) {
			return nil, errors.New("some error")
		},
	}

	pool := &mockCreatePool{
		getFunc: func(ctx context.Context) (issueCreator, error) {
			return client, nil
		},
		putFunc: func(c issueCreator) {
			putCalled = true
		},
	}

	handler := handleCreateIssueWithPool(pool)

	body := `{"title": "Test Issue", "issue_type": "bug", "priority": 1}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if !putCalled {
		t.Error("Put() was not called on error - client not returned to pool")
	}
}
// handlePatchIssue tests
// ===========================================================================

// mockPatchPool implements patchConnectionGetter for testing
type mockPatchPool struct {
	getFunc func(ctx context.Context) (issueUpdater, error)
	putFunc func(client issueUpdater)
}

func (m *mockPatchPool) Get(ctx context.Context) (issueUpdater, error) {
	if m.getFunc != nil {
		return m.getFunc(ctx)
	}
	return nil, errors.New("getFunc not implemented")
}

func (m *mockPatchPool) Put(client issueUpdater) {
	if m.putFunc != nil {
		m.putFunc(client)
	}
}

// TestHandlePatchIssue_EmptyID tests that an empty issue ID returns 400 Bad Request
func TestHandlePatchIssue_EmptyID(t *testing.T) {
	pool, err := daemon.NewConnectionPool("/tmp/test.sock", 1)
	if err != nil {
		t.Fatalf("NewConnectionPool() error = %v", err)
	}
	defer pool.Close()

	handler := handlePatchIssue(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/", strings.NewReader(`{}`))
	req.SetPathValue("id", "")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var resp PatchIssueResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Error != "missing issue ID in path" {
		t.Errorf("error = %q, want %q", resp.Error, "missing issue ID in path")
	}
}

// TestHandlePatchIssue_NilPool tests that nil pool returns 503 Service Unavailable
func TestHandlePatchIssue_NilPool(t *testing.T) {
	handler := handlePatchIssue(nil)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}

	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var resp PatchIssueResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Error != "connection pool not initialized" {
		t.Errorf("error = %q, want %q", resp.Error, "connection pool not initialized")
	}
}

// TestHandlePatchIssue_InvalidJSON tests that invalid JSON body returns 400 Bad Request
func TestHandlePatchIssue_InvalidJSON(t *testing.T) {
	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return &mockClient{}, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	// Send invalid JSON
	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{invalid json`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	var resp PatchIssueResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if !strings.Contains(resp.Error, "invalid request body") {
		t.Errorf("error = %q, expected to contain %q", resp.Error, "invalid request body")
	}
}

// TestHandlePatchIssue_PoolGetTimeout tests that pool.Get timeout returns 504 Gateway Timeout
func TestHandlePatchIssue_PoolGetTimeout(t *testing.T) {
	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return nil, context.DeadlineExceeded
		},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusGatewayTimeout {
		t.Errorf("status = %d, want %d", w.Code, http.StatusGatewayTimeout)
	}

	var resp PatchIssueResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
}

// TestHandlePatchIssue_NotFound tests that "not found" error from Update returns 404
func TestHandlePatchIssue_NotFound(t *testing.T) {
	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			return nil, errors.New("issue not found: nonexistent-id")
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/nonexistent-id", strings.NewReader(`{"title":"New Title"}`))
	req.SetPathValue("id", "nonexistent-id")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}

	var resp PatchIssueResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if !strings.Contains(resp.Error, "not found") {
		t.Errorf("error = %q, expected to contain %q", resp.Error, "not found")
	}
}

// TestHandlePatchIssue_CannotUpdateTemplate tests that "cannot update template" error returns 409 Conflict
func TestHandlePatchIssue_CannotUpdateTemplate(t *testing.T) {
	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			return &rpc.Response{
				Success: false,
				Error:   "cannot update template issue",
			}, nil
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/template-1", strings.NewReader(`{"title":"New Title"}`))
	req.SetPathValue("id", "template-1")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("status = %d, want %d", w.Code, http.StatusConflict)
	}

	var resp PatchIssueResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if !strings.Contains(resp.Error, "cannot update template") {
		t.Errorf("error = %q, expected to contain %q", resp.Error, "cannot update template")
	}
}

// TestHandlePatchIssue_InternalError tests that other Update errors return 500
func TestHandlePatchIssue_InternalError(t *testing.T) {
	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			return nil, errors.New("database connection failed")
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{"title":"New Title"}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}

	var resp PatchIssueResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if !strings.Contains(resp.Error, "database connection failed") {
		t.Errorf("error = %q, expected to contain %q", resp.Error, "database connection failed")
	}
}

// TestHandlePatchIssue_Success tests that a successful update returns 200 with success response
func TestHandlePatchIssue_Success(t *testing.T) {
	var capturedArgs *rpc.UpdateArgs

	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			capturedArgs = args
			return &rpc.Response{
				Success: true,
				Data:    []byte(`{"id":"test-123"}`),
			}, nil
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	newTitle := "Updated Title"
	newDesc := "Updated Description"
	reqBody := PatchIssueRequest{
		Title:       &newTitle,
		Description: &newDesc,
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(string(bodyBytes)))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var resp PatchIssueResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !resp.Success {
		t.Error("expected success=true")
	}

	// Verify the args were passed correctly
	if capturedArgs == nil {
		t.Fatal("Update was not called")
	}
	if capturedArgs.ID != "test-123" {
		t.Errorf("ID = %q, want %q", capturedArgs.ID, "test-123")
	}
	if capturedArgs.Title == nil || *capturedArgs.Title != newTitle {
		t.Errorf("Title = %v, want %q", capturedArgs.Title, newTitle)
	}
	if capturedArgs.Description == nil || *capturedArgs.Description != newDesc {
		t.Errorf("Description = %v, want %q", capturedArgs.Description, newDesc)
	}
}

// TestHandlePatchIssue_EmptyBody tests that empty body {} is valid (no-op update)
func TestHandlePatchIssue_EmptyBody(t *testing.T) {
	var capturedArgs *rpc.UpdateArgs

	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			capturedArgs = args
			return &rpc.Response{
				Success: true,
				Data:    []byte(`{"id":"test-123"}`),
			}, nil
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp PatchIssueResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !resp.Success {
		t.Error("expected success=true")
	}

	// Verify all optional fields are nil
	if capturedArgs == nil {
		t.Fatal("Update was not called")
	}
	if capturedArgs.ID != "test-123" {
		t.Errorf("ID = %q, want %q", capturedArgs.ID, "test-123")
	}
	if capturedArgs.Title != nil {
		t.Errorf("Title = %v, want nil", capturedArgs.Title)
	}
	if capturedArgs.Description != nil {
		t.Errorf("Description = %v, want nil", capturedArgs.Description)
	}
	if capturedArgs.Status != nil {
		t.Errorf("Status = %v, want nil", capturedArgs.Status)
	}
}

// TestHandlePatchIssue_PartialUpdateTitle tests partial update with only title
func TestHandlePatchIssue_PartialUpdateTitle(t *testing.T) {
	var capturedArgs *rpc.UpdateArgs

	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			capturedArgs = args
			return &rpc.Response{
				Success: true,
				Data:    []byte(`{"id":"test-123"}`),
			}, nil
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{"title":"Only Title Changed"}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	if capturedArgs == nil {
		t.Fatal("Update was not called")
	}
	if capturedArgs.Title == nil || *capturedArgs.Title != "Only Title Changed" {
		t.Errorf("Title = %v, want %q", capturedArgs.Title, "Only Title Changed")
	}
	// Other fields should be nil
	if capturedArgs.Description != nil {
		t.Errorf("Description = %v, want nil", capturedArgs.Description)
	}
	if capturedArgs.Status != nil {
		t.Errorf("Status = %v, want nil", capturedArgs.Status)
	}
	if capturedArgs.Priority != nil {
		t.Errorf("Priority = %v, want nil", capturedArgs.Priority)
	}
}

// TestHandlePatchIssue_LabelsAddLabels tests add_labels operation
func TestHandlePatchIssue_LabelsAddLabels(t *testing.T) {
	var capturedArgs *rpc.UpdateArgs

	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			capturedArgs = args
			return &rpc.Response{
				Success: true,
				Data:    []byte(`{"id":"test-123"}`),
			}, nil
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{"add_labels":["bug","urgent"]}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	if capturedArgs == nil {
		t.Fatal("Update was not called")
	}
	if len(capturedArgs.AddLabels) != 2 {
		t.Errorf("AddLabels len = %d, want 2", len(capturedArgs.AddLabels))
	}
	if capturedArgs.AddLabels[0] != "bug" || capturedArgs.AddLabels[1] != "urgent" {
		t.Errorf("AddLabels = %v, want [bug, urgent]", capturedArgs.AddLabels)
	}
}

// TestHandlePatchIssue_LabelsRemoveLabels tests remove_labels operation
func TestHandlePatchIssue_LabelsRemoveLabels(t *testing.T) {
	var capturedArgs *rpc.UpdateArgs

	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			capturedArgs = args
			return &rpc.Response{
				Success: true,
				Data:    []byte(`{"id":"test-123"}`),
			}, nil
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{"remove_labels":["wontfix","duplicate"]}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	if capturedArgs == nil {
		t.Fatal("Update was not called")
	}
	if len(capturedArgs.RemoveLabels) != 2 {
		t.Errorf("RemoveLabels len = %d, want 2", len(capturedArgs.RemoveLabels))
	}
	if capturedArgs.RemoveLabels[0] != "wontfix" || capturedArgs.RemoveLabels[1] != "duplicate" {
		t.Errorf("RemoveLabels = %v, want [wontfix, duplicate]", capturedArgs.RemoveLabels)
	}
}

// TestHandlePatchIssue_LabelsSetLabels tests set_labels operation (replaces all labels)
func TestHandlePatchIssue_LabelsSetLabels(t *testing.T) {
	var capturedArgs *rpc.UpdateArgs

	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			capturedArgs = args
			return &rpc.Response{
				Success: true,
				Data:    []byte(`{"id":"test-123"}`),
			}, nil
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{"set_labels":["feature","enhancement","phase-2"]}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	if capturedArgs == nil {
		t.Fatal("Update was not called")
	}
	if len(capturedArgs.SetLabels) != 3 {
		t.Errorf("SetLabels len = %d, want 3", len(capturedArgs.SetLabels))
	}
	expected := []string{"feature", "enhancement", "phase-2"}
	for i, label := range expected {
		if capturedArgs.SetLabels[i] != label {
			t.Errorf("SetLabels[%d] = %q, want %q", i, capturedArgs.SetLabels[i], label)
		}
	}
}

// TestHandlePatchIssue_ClientReturnedToPool verifies that the client is always returned to the pool
func TestHandlePatchIssue_ClientReturnedToPool(t *testing.T) {
	putCalled := false

	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			return &rpc.Response{
				Success: true,
				Data:    []byte(`{"id":"test-123"}`),
			}, nil
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {
			putCalled = true
		},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if !putCalled {
		t.Error("Put() was not called - client not returned to pool")
	}
}

// TestHandlePatchIssue_ClientReturnedToPoolOnError verifies client is returned even on RPC error
func TestHandlePatchIssue_ClientReturnedToPoolOnError(t *testing.T) {
	putCalled := false

	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			return nil, errors.New("some error")
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {
			putCalled = true
		},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if !putCalled {
		t.Error("Put() was not called on error - client not returned to pool")
	}
}

// TestHandlePatchIssue_ResponseNotFoundFromResponse tests "not found" in Response.Error returns 404
func TestHandlePatchIssue_ResponseNotFoundFromResponse(t *testing.T) {
	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			return &rpc.Response{
				Success: false,
				Error:   "issue not found: test-123",
			}, nil
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{"title":"New"}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}
}

// TestHandlePatchIssue_AllFields tests updating all supported fields
func TestHandlePatchIssue_AllFields(t *testing.T) {
	var capturedArgs *rpc.UpdateArgs

	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			capturedArgs = args
			return &rpc.Response{
				Success: true,
				Data:    []byte(`{"id":"test-123"}`),
			}, nil
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	title := "Full Update"
	desc := "Full Description"
	status := "in_progress"
	priority := 2
	assignee := "alice"
	design := "Design doc"
	ac := "Acceptance criteria"
	notes := "Some notes"
	extRef := "GH-123"
	minutes := 60
	issueType := "task"
	pinned := true
	parent := "epic-1"
	dueAt := "2025-12-31"
	deferUntil := "2025-06-01"

	reqBody := PatchIssueRequest{
		Title:              &title,
		Description:        &desc,
		Status:             &status,
		Priority:           &priority,
		Assignee:           &assignee,
		Design:             &design,
		AcceptanceCriteria: &ac,
		Notes:              &notes,
		ExternalRef:        &extRef,
		EstimatedMinutes:   &minutes,
		IssueType:          &issueType,
		AddLabels:          []string{"label1"},
		RemoveLabels:       []string{"label2"},
		SetLabels:          []string{"label3"},
		Pinned:             &pinned,
		Parent:             &parent,
		DueAt:              &dueAt,
		DeferUntil:         &deferUntil,
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(string(bodyBytes)))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	if capturedArgs == nil {
		t.Fatal("Update was not called")
	}

	// Verify all fields were passed
	if capturedArgs.ID != "test-123" {
		t.Errorf("ID = %q, want %q", capturedArgs.ID, "test-123")
	}
	if capturedArgs.Title == nil || *capturedArgs.Title != title {
		t.Errorf("Title = %v, want %q", capturedArgs.Title, title)
	}
	if capturedArgs.Description == nil || *capturedArgs.Description != desc {
		t.Errorf("Description = %v, want %q", capturedArgs.Description, desc)
	}
	if capturedArgs.Status == nil || *capturedArgs.Status != status {
		t.Errorf("Status = %v, want %q", capturedArgs.Status, status)
	}
	if capturedArgs.Priority == nil || *capturedArgs.Priority != priority {
		t.Errorf("Priority = %v, want %d", capturedArgs.Priority, priority)
	}
	if capturedArgs.Assignee == nil || *capturedArgs.Assignee != assignee {
		t.Errorf("Assignee = %v, want %q", capturedArgs.Assignee, assignee)
	}
	if capturedArgs.Design == nil || *capturedArgs.Design != design {
		t.Errorf("Design = %v, want %q", capturedArgs.Design, design)
	}
	if capturedArgs.AcceptanceCriteria == nil || *capturedArgs.AcceptanceCriteria != ac {
		t.Errorf("AcceptanceCriteria = %v, want %q", capturedArgs.AcceptanceCriteria, ac)
	}
	if capturedArgs.Notes == nil || *capturedArgs.Notes != notes {
		t.Errorf("Notes = %v, want %q", capturedArgs.Notes, notes)
	}
	if capturedArgs.ExternalRef == nil || *capturedArgs.ExternalRef != extRef {
		t.Errorf("ExternalRef = %v, want %q", capturedArgs.ExternalRef, extRef)
	}
	if capturedArgs.EstimatedMinutes == nil || *capturedArgs.EstimatedMinutes != minutes {
		t.Errorf("EstimatedMinutes = %v, want %d", capturedArgs.EstimatedMinutes, minutes)
	}
	if capturedArgs.IssueType == nil || *capturedArgs.IssueType != issueType {
		t.Errorf("IssueType = %v, want %q", capturedArgs.IssueType, issueType)
	}
	if capturedArgs.Pinned == nil || *capturedArgs.Pinned != pinned {
		t.Errorf("Pinned = %v, want %v", capturedArgs.Pinned, pinned)
	}
	if capturedArgs.Parent == nil || *capturedArgs.Parent != parent {
		t.Errorf("Parent = %v, want %q", capturedArgs.Parent, parent)
	}
	if capturedArgs.DueAt == nil || *capturedArgs.DueAt != dueAt {
		t.Errorf("DueAt = %v, want %q", capturedArgs.DueAt, dueAt)
	}
	if capturedArgs.DeferUntil == nil || *capturedArgs.DeferUntil != deferUntil {
		t.Errorf("DeferUntil = %v, want %q", capturedArgs.DeferUntil, deferUntil)
	}
	if len(capturedArgs.AddLabels) != 1 || capturedArgs.AddLabels[0] != "label1" {
		t.Errorf("AddLabels = %v, want [label1]", capturedArgs.AddLabels)
	}
	if len(capturedArgs.RemoveLabels) != 1 || capturedArgs.RemoveLabels[0] != "label2" {
		t.Errorf("RemoveLabels = %v, want [label2]", capturedArgs.RemoveLabels)
	}
	if len(capturedArgs.SetLabels) != 1 || capturedArgs.SetLabels[0] != "label3" {
		t.Errorf("SetLabels = %v, want [label3]", capturedArgs.SetLabels)
	}
}

// TestHandlePatchIssue_PoolGetServiceUnavailable tests that non-timeout pool.Get error returns 503
func TestHandlePatchIssue_PoolGetServiceUnavailable(t *testing.T) {
	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return nil, errors.New("pool exhausted")
		},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}

	var resp PatchIssueResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Error != "pool exhausted" {
		t.Errorf("error = %q, want %q", resp.Error, "pool exhausted")
	}
}

// TestHandlePatchIssue_ResponseWithInternalError tests generic internal error from Response
func TestHandlePatchIssue_ResponseWithInternalError(t *testing.T) {
	client := &mockClient{
		updateFunc: func(args *rpc.UpdateArgs) (*rpc.Response, error) {
			return &rpc.Response{
				Success: false,
				Error:   "internal database error",
			}, nil
		},
	}

	pool := &mockPatchPool{
		getFunc: func(ctx context.Context) (issueUpdater, error) {
			return client, nil
		},
		putFunc: func(c issueUpdater) {},
	}

	handler := handlePatchIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPatch, "/api/issues/test-123", strings.NewReader(`{"title":"New"}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}

	var resp PatchIssueResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Error != "internal database error" {
		t.Errorf("error = %q, want %q", resp.Error, "internal database error")
	}
}

// ============================================================================
// handleCloseIssue tests
// ============================================================================

// mockCloseClient implements issueCloser for testing
type mockCloseClient struct {
	closeFunc func(args *rpc.CloseArgs) (*rpc.Response, error)
}

func (m *mockCloseClient) CloseIssue(args *rpc.CloseArgs) (*rpc.Response, error) {
	if m.closeFunc != nil {
		return m.closeFunc(args)
	}
	return nil, errors.New("closeFunc not implemented")
}

// mockClosePool implements closeConnectionGetter for testing
type mockClosePool struct {
	getFunc func(ctx context.Context) (issueCloser, error)
	putFunc func(client issueCloser)
}

func (m *mockClosePool) Get(ctx context.Context) (issueCloser, error) {
	if m.getFunc != nil {
		return m.getFunc(ctx)
	}
	return nil, errors.New("getFunc not implemented")
}

func (m *mockClosePool) Put(client issueCloser) {
	if m.putFunc != nil {
		m.putFunc(client)
	}
}

// TestHandleCloseIssue_NilPool tests that nil pool returns 503 Service Unavailable
func TestHandleCloseIssue_NilPool(t *testing.T) {
	handler := handleCloseIssueWithPool(nil)

	req := httptest.NewRequest(http.MethodPost, "/api/issues/test-123/close", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp["error"] != "connection pool not initialized" {
		t.Errorf("error = %q, want %q", resp["error"], "connection pool not initialized")
	}
}

// TestHandleCloseIssue_EmptyID tests that an empty issue ID returns 400 Bad Request
func TestHandleCloseIssue_EmptyID(t *testing.T) {
	pool := &mockClosePool{}

	handler := handleCloseIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPost, "/api/issues//close", nil)
	req.SetPathValue("id", "")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp["error"] != "missing issue ID" {
		t.Errorf("error = %q, want %q", resp["error"], "missing issue ID")
	}
}

// TestHandleCloseIssue_InvalidBody tests that malformed JSON returns 400 Bad Request
func TestHandleCloseIssue_InvalidBody(t *testing.T) {
	pool := &mockClosePool{}

	handler := handleCloseIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPost, "/api/issues/test-123/close", strings.NewReader(`{invalid json}`))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !strings.HasPrefix(resp["error"], "invalid request body:") {
		t.Errorf("error = %q, want prefix %q", resp["error"], "invalid request body:")
	}
}

// TestHandleCloseIssue_DaemonUnavailable tests that pool error returns 503 Service Unavailable
func TestHandleCloseIssue_DaemonUnavailable(t *testing.T) {
	pool := &mockClosePool{
		getFunc: func(ctx context.Context) (issueCloser, error) {
			return nil, errors.New("pool exhausted")
		},
	}

	handler := handleCloseIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPost, "/api/issues/test-123/close", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp["error"] != "daemon not available" {
		t.Errorf("error = %q, want %q", resp["error"], "daemon not available")
	}
}

// TestHandleCloseIssue_Timeout tests that connection timeout returns 504 Gateway Timeout
func TestHandleCloseIssue_Timeout(t *testing.T) {
	pool := &mockClosePool{
		getFunc: func(ctx context.Context) (issueCloser, error) {
			return nil, context.DeadlineExceeded
		},
	}

	handler := handleCloseIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPost, "/api/issues/test-123/close", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusGatewayTimeout {
		t.Errorf("status = %d, want %d", w.Code, http.StatusGatewayTimeout)
	}
}

// TestHandleCloseIssue_NotFound tests that issue not found returns 404 Not Found
func TestHandleCloseIssue_NotFound(t *testing.T) {
	client := &mockCloseClient{
		closeFunc: func(args *rpc.CloseArgs) (*rpc.Response, error) {
			return nil, errors.New("issue not found: test-123")
		},
	}

	pool := &mockClosePool{
		getFunc: func(ctx context.Context) (issueCloser, error) {
			return client, nil
		},
		putFunc: func(c issueCloser) {},
	}

	handler := handleCloseIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPost, "/api/issues/test-123/close", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !strings.Contains(resp["error"], "not found") {
		t.Errorf("error = %q, want to contain %q", resp["error"], "not found")
	}
}

// TestHandleCloseIssue_HasBlockers tests that issue with open blockers returns 409 Conflict
func TestHandleCloseIssue_HasBlockers(t *testing.T) {
	client := &mockCloseClient{
		closeFunc: func(args *rpc.CloseArgs) (*rpc.Response, error) {
			return nil, errors.New("issue has open blockers: bd-abc, bd-def")
		},
	}

	pool := &mockClosePool{
		getFunc: func(ctx context.Context) (issueCloser, error) {
			return client, nil
		},
		putFunc: func(c issueCloser) {},
	}

	handler := handleCloseIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPost, "/api/issues/test-123/close", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("status = %d, want %d", w.Code, http.StatusConflict)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !strings.Contains(resp["error"], "blocker") {
		t.Errorf("error = %q, want to contain %q", resp["error"], "blocker")
	}
}

// TestHandleCloseIssue_Success tests successful close returns 200 OK with closed issue
func TestHandleCloseIssue_Success(t *testing.T) {
	closedIssueData := `{"id":"test-123","title":"Test Issue","status":"closed"}`
	client := &mockCloseClient{
		closeFunc: func(args *rpc.CloseArgs) (*rpc.Response, error) {
			return &rpc.Response{
				Success: true,
				Data:    json.RawMessage(closedIssueData),
			}, nil
		},
	}

	pool := &mockClosePool{
		getFunc: func(ctx context.Context) (issueCloser, error) {
			return client, nil
		},
		putFunc: func(c issueCloser) {},
	}

	handler := handleCloseIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPost, "/api/issues/test-123/close", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp CloseResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !resp.Success {
		t.Error("expected success=true")
	}
	if string(resp.Data) != closedIssueData {
		t.Errorf("data = %s, want %s", string(resp.Data), closedIssueData)
	}
}

// TestHandleCloseIssue_SuccessWithReason tests close with reason passes args correctly
func TestHandleCloseIssue_SuccessWithReason(t *testing.T) {
	var capturedArgs *rpc.CloseArgs
	client := &mockCloseClient{
		closeFunc: func(args *rpc.CloseArgs) (*rpc.Response, error) {
			capturedArgs = args
			return &rpc.Response{
				Success: true,
				Data:    json.RawMessage(`{}`),
			}, nil
		},
	}

	pool := &mockClosePool{
		getFunc: func(ctx context.Context) (issueCloser, error) {
			return client, nil
		},
		putFunc: func(c issueCloser) {},
	}

	handler := handleCloseIssueWithPool(pool)

	body := `{"reason":"Test complete","session":"session-123","suggest_next":true,"force":false}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues/test-123/close", strings.NewReader(body))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	if capturedArgs == nil {
		t.Fatal("expected args to be captured")
	}
	if capturedArgs.ID != "test-123" {
		t.Errorf("ID = %q, want %q", capturedArgs.ID, "test-123")
	}
	if capturedArgs.Reason != "Test complete" {
		t.Errorf("Reason = %q, want %q", capturedArgs.Reason, "Test complete")
	}
	if capturedArgs.Session != "session-123" {
		t.Errorf("Session = %q, want %q", capturedArgs.Session, "session-123")
	}
	if !capturedArgs.SuggestNext {
		t.Error("SuggestNext = false, want true")
	}
	if capturedArgs.Force {
		t.Error("Force = true, want false")
	}
}

// TestHandleCloseIssue_SuccessWithForce tests force close passes args correctly
func TestHandleCloseIssue_SuccessWithForce(t *testing.T) {
	var capturedArgs *rpc.CloseArgs
	client := &mockCloseClient{
		closeFunc: func(args *rpc.CloseArgs) (*rpc.Response, error) {
			capturedArgs = args
			return &rpc.Response{
				Success: true,
				Data:    json.RawMessage(`{}`),
			}, nil
		},
	}

	pool := &mockClosePool{
		getFunc: func(ctx context.Context) (issueCloser, error) {
			return client, nil
		},
		putFunc: func(c issueCloser) {},
	}

	handler := handleCloseIssueWithPool(pool)

	body := `{"force":true}`
	req := httptest.NewRequest(http.MethodPost, "/api/issues/test-123/close", strings.NewReader(body))
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	if capturedArgs == nil {
		t.Fatal("expected args to be captured")
	}
	if !capturedArgs.Force {
		t.Error("Force = false, want true")
	}
}

// TestHandleCloseIssue_ClientReturnedToPool tests that client is always returned to pool
func TestHandleCloseIssue_ClientReturnedToPool(t *testing.T) {
	client := &mockCloseClient{
		closeFunc: func(args *rpc.CloseArgs) (*rpc.Response, error) {
			return nil, errors.New("some error")
		},
	}

	putCalled := false
	pool := &mockClosePool{
		getFunc: func(ctx context.Context) (issueCloser, error) {
			return client, nil
		},
		putFunc: func(c issueCloser) {
			putCalled = true
		},
	}

	handler := handleCloseIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPost, "/api/issues/test-123/close", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if !putCalled {
		t.Error("expected Put to be called")
	}
}

// TestHandleCloseIssue_EmptyBody tests that empty body works (all fields are optional)
func TestHandleCloseIssue_EmptyBody(t *testing.T) {
	var capturedArgs *rpc.CloseArgs
	client := &mockCloseClient{
		closeFunc: func(args *rpc.CloseArgs) (*rpc.Response, error) {
			capturedArgs = args
			return &rpc.Response{
				Success: true,
				Data:    json.RawMessage(`{}`),
			}, nil
		},
	}

	pool := &mockClosePool{
		getFunc: func(ctx context.Context) (issueCloser, error) {
			return client, nil
		},
		putFunc: func(c issueCloser) {},
	}

	handler := handleCloseIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPost, "/api/issues/test-123/close", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	if capturedArgs == nil {
		t.Fatal("expected args to be captured")
	}
	if capturedArgs.ID != "test-123" {
		t.Errorf("ID = %q, want %q", capturedArgs.ID, "test-123")
	}
	// All optional fields should be zero values
	if capturedArgs.Reason != "" {
		t.Errorf("Reason = %q, want empty", capturedArgs.Reason)
	}
	if capturedArgs.Session != "" {
		t.Errorf("Session = %q, want empty", capturedArgs.Session)
	}
	if capturedArgs.SuggestNext {
		t.Error("SuggestNext = true, want false")
	}
	if capturedArgs.Force {
		t.Error("Force = true, want false")
	}
}

// TestHandleCloseIssue_ResponseError tests that Response.Success=false returns error
func TestHandleCloseIssue_ResponseError(t *testing.T) {
	client := &mockCloseClient{
		closeFunc: func(args *rpc.CloseArgs) (*rpc.Response, error) {
			return &rpc.Response{
				Success: false,
				Error:   "internal daemon error",
			}, nil
		},
	}

	pool := &mockClosePool{
		getFunc: func(ctx context.Context) (issueCloser, error) {
			return client, nil
		},
		putFunc: func(c issueCloser) {},
	}

	handler := handleCloseIssueWithPool(pool)

	req := httptest.NewRequest(http.MethodPost, "/api/issues/test-123/close", nil)
	req.SetPathValue("id", "test-123")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp["error"] != "internal daemon error" {
		t.Errorf("error = %q, want %q", resp["error"], "internal daemon error")
	}
}
