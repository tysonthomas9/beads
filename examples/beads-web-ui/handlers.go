package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/steveyegge/beads/examples/beads-web-ui/daemon"
	"github.com/steveyegge/beads/internal/rpc"
)

const (
	// MaxListLimit is the maximum number of issues that can be requested in a single call.
	MaxListLimit = 1000
)

// IssuesResponse represents the response structure for the issues endpoint.
type IssuesResponse struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data,omitempty"`
	Error   string          `json:"error,omitempty"`
	Code    string          `json:"code,omitempty"`
}

// issueGetter is an internal interface for testing issue retrieval.
// The production code uses *rpc.Client which implements this interface.
type issueGetter interface {
	Show(args *rpc.ShowArgs) (*rpc.Response, error)
}

// connectionGetter is an internal interface for testing connection pool operations.
type connectionGetter interface {
	Get(ctx context.Context) (issueGetter, error)
	Put(client issueGetter)
}

// poolAdapter wraps *daemon.ConnectionPool to implement connectionGetter.
type poolAdapter struct {
	pool *daemon.ConnectionPool
}

func (p *poolAdapter) Get(ctx context.Context) (issueGetter, error) {
	return p.pool.Get(ctx)
}

func (p *poolAdapter) Put(client issueGetter) {
	if c, ok := client.(*rpc.Client); ok {
		p.pool.Put(c)
	}
}

// writeErrorResponse writes a JSON error response with the given status code and message.
func writeErrorResponse(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(map[string]string{"error": message}); err != nil {
		log.Printf("Failed to encode error response: %v", err)
	}
}

// handleGetIssue returns a handler that retrieves a single issue by ID.
func handleGetIssue(pool *daemon.ConnectionPool) http.HandlerFunc {
	return handleGetIssueWithPool(&poolAdapter{pool: pool})
}

// handleGetIssueWithPool is the internal implementation that accepts an interface for testing.
func handleGetIssueWithPool(pool connectionGetter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract issue ID from path parameter
		issueID := r.PathValue("id")
		if issueID == "" {
			writeErrorResponse(w, http.StatusBadRequest, "missing issue ID")
			return
		}

		// Get connection from pool
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		client, err := pool.Get(ctx)
		if err != nil {
			writeErrorResponse(w, http.StatusServiceUnavailable, "daemon not available")
			return
		}
		defer pool.Put(client)

		// Call Show RPC
		resp, err := client.Show(&rpc.ShowArgs{ID: issueID})
		if err != nil {
			// Check if it's a "not found" error
			if strings.Contains(err.Error(), "not found") {
				writeErrorResponse(w, http.StatusNotFound, fmt.Sprintf("issue not found: %s", issueID))
				return
			}
			writeErrorResponse(w, http.StatusInternalServerError, err.Error())
			return
		}

		// Return the issue details (resp.Data already contains JSON-serialized IssueDetails)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if _, err := w.Write(resp.Data); err != nil {
			log.Printf("Failed to write response: %v", err)
		}
	}
}

// handleListIssues returns a handler that lists issues from the daemon.
func handleListIssues(pool *daemon.ConnectionPool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if pool == nil {
			writeIssuesError(w, http.StatusServiceUnavailable, "connection pool not initialized", "POOL_NOT_INITIALIZED")
			return
		}

		// Parse query parameters into ListArgs
		args := parseListParams(r)

		// Acquire connection with timeout
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		client, err := pool.Get(ctx)
		if err != nil {
			status := http.StatusServiceUnavailable
			code := "DAEMON_UNAVAILABLE"
			message := "daemon unavailable"
			if errors.Is(err, context.DeadlineExceeded) {
				status = http.StatusGatewayTimeout
				code = "CONNECTION_TIMEOUT"
				message = "timeout connecting to daemon"
			}
			log.Printf("Connection pool error: %v", err)
			writeIssuesError(w, status, message, code)
			return
		}
		defer pool.Put(client)

		// Execute List RPC call
		resp, err := client.List(args)
		if err != nil {
			log.Printf("RPC error: %v", err)
			writeIssuesError(w, http.StatusInternalServerError, "failed to list issues", "RPC_ERROR")
			return
		}

		if !resp.Success {
			writeIssuesError(w, http.StatusInternalServerError, resp.Error, "DAEMON_ERROR")
			return
		}

		// Return the issues data (resp.Data contains JSON-serialized []Issue)
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(IssuesResponse{
			Success: true,
			Data:    resp.Data,
		}); err != nil {
			log.Printf("Failed to encode issues response: %v", err)
		}
	}
}

// parseListParams extracts ListArgs from HTTP query parameters.
func parseListParams(r *http.Request) *rpc.ListArgs {
	query := r.URL.Query()
	args := &rpc.ListArgs{}

	// Basic filters
	if v := query.Get("status"); v != "" {
		args.Status = v
	}
	if v := query.Get("type"); v != "" {
		args.IssueType = v
	}
	if v := query.Get("assignee"); v != "" {
		args.Assignee = v
	}
	if v := query.Get("q"); v != "" {
		args.Query = v
	}

	// Priority (integer)
	if v := query.Get("priority"); v != "" {
		if priority, err := strconv.Atoi(v); err == nil {
			args.Priority = &priority
		}
	}

	// Labels (comma-separated)
	if v := query.Get("labels"); v != "" {
		args.Labels = splitTrimmed(v)
	}

	// Limit (capped at MaxListLimit to prevent DoS)
	if v := query.Get("limit"); v != "" {
		if limit, err := strconv.Atoi(v); err == nil && limit > 0 {
			if limit > MaxListLimit {
				limit = MaxListLimit
			}
			args.Limit = limit
		}
	}

	// Pattern matching
	if v := query.Get("title_contains"); v != "" {
		args.TitleContains = v
	}
	if v := query.Get("description_contains"); v != "" {
		args.DescriptionContains = v
	}
	if v := query.Get("notes_contains"); v != "" {
		args.NotesContains = v
	}

	// Date ranges
	if v := query.Get("created_after"); v != "" {
		args.CreatedAfter = v
	}
	if v := query.Get("created_before"); v != "" {
		args.CreatedBefore = v
	}
	if v := query.Get("updated_after"); v != "" {
		args.UpdatedAfter = v
	}
	if v := query.Get("updated_before"); v != "" {
		args.UpdatedBefore = v
	}

	// Empty/null checks
	if v := query.Get("empty_description"); v == "true" {
		args.EmptyDescription = true
	}
	if v := query.Get("no_assignee"); v == "true" {
		args.NoAssignee = true
	}
	if v := query.Get("no_labels"); v == "true" {
		args.NoLabels = true
	}

	// Pinned filtering
	if v := query.Get("pinned"); v != "" {
		pinned := v == "true"
		args.Pinned = &pinned
	}

	return args
}

// splitTrimmed splits a comma-separated string and trims whitespace.
func splitTrimmed(s string) []string {
	parts := strings.Split(s, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

// writeIssuesError writes a JSON error response for the issues endpoint.
func writeIssuesError(w http.ResponseWriter, status int, message, code string) {
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(IssuesResponse{
		Success: false,
		Error:   message,
		Code:    code,
	}); err != nil {
		log.Printf("Failed to encode error response: %v", err)
	}
}
