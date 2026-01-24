package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/steveyegge/beads/examples/beads-web-ui/daemon"
	"github.com/steveyegge/beads/internal/rpc"
)

// ===========================================================================
// splitAndTrim tests
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
// parseReadyParams tests
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
		name     string
		query    string
		wantVal  []string
	}{
		{
			name:     "single label",
			query:    "labels=bug",
			wantVal:  []string{"bug"},
		},
		{
			name:     "multiple labels comma-separated",
			query:    "labels=bug,feature,urgent",
			wantVal:  []string{"bug", "feature", "urgent"},
		},
		{
			name:     "labels with whitespace",
			query:    "labels=" + url.QueryEscape("bug , feature , urgent"),
			wantVal:  []string{"bug", "feature", "urgent"},
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
		name     string
		query    string
		wantVal  []string
	}{
		{
			name:     "single label_any",
			query:    "labels_any=bug",
			wantVal:  []string{"bug"},
		},
		{
			name:     "multiple labels_any comma-separated",
			query:    "labels_any=bug,feature,urgent",
			wantVal:  []string{"bug", "feature", "urgent"},
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
		name              string
		query             string
		wantUnassigned    bool
		wantIncludeDefer  bool
		wantErr           bool
		errSubstr         string
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
// handleReady tests
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
