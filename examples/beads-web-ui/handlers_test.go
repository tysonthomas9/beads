package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

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
