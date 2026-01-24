package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/steveyegge/beads/examples/beads-web-ui/daemon"
	"github.com/steveyegge/beads/internal/rpc"
)

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
