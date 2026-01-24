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
	"github.com/steveyegge/beads/internal/types"
)

// ReadyResponse wraps the ready issues data for JSON response.
type ReadyResponse struct {
	Success bool           `json:"success"`
	Data    []*types.Issue `json:"data,omitempty"`
	Error   string         `json:"error,omitempty"`
}

// handleReady returns issues ready to work on (open/in_progress with no blockers).
func handleReady(pool *daemon.ConnectionPool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if pool == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			if err := json.NewEncoder(w).Encode(ReadyResponse{
				Success: false,
				Error:   "connection pool not initialized",
			}); err != nil {
				log.Printf("Failed to encode ready response: %v", err)
			}
			return
		}

		// Parse query parameters into ReadyArgs
		args, err := parseReadyParams(r)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			if err := json.NewEncoder(w).Encode(ReadyResponse{
				Success: false,
				Error:   err.Error(),
			}); err != nil {
				log.Printf("Failed to encode ready response: %v", err)
			}
			return
		}

		// Acquire connection with 5-second timeout
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		client, err := pool.Get(ctx)
		if err != nil {
			status := http.StatusServiceUnavailable
			if errors.Is(err, context.DeadlineExceeded) {
				status = http.StatusGatewayTimeout
			}
			w.WriteHeader(status)
			if err := json.NewEncoder(w).Encode(ReadyResponse{
				Success: false,
				Error:   err.Error(),
			}); err != nil {
				log.Printf("Failed to encode ready response: %v", err)
			}
			return
		}
		defer pool.Put(client)

		// Execute Ready RPC call
		resp, err := client.Ready(args)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			if err := json.NewEncoder(w).Encode(ReadyResponse{
				Success: false,
				Error:   fmt.Sprintf("rpc error: %v", err),
			}); err != nil {
				log.Printf("Failed to encode ready response: %v", err)
			}
			return
		}

		if !resp.Success {
			w.WriteHeader(http.StatusInternalServerError)
			if err := json.NewEncoder(w).Encode(ReadyResponse{
				Success: false,
				Error:   resp.Error,
			}); err != nil {
				log.Printf("Failed to encode ready response: %v", err)
			}
			return
		}

		// Parse the issues from RPC response
		var issues []*types.Issue
		if err := json.Unmarshal(resp.Data, &issues); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			if err := json.NewEncoder(w).Encode(ReadyResponse{
				Success: false,
				Error:   fmt.Sprintf("failed to parse ready issues: %v", err),
			}); err != nil {
				log.Printf("Failed to encode ready response: %v", err)
			}
			return
		}

		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(ReadyResponse{
			Success: true,
			Data:    issues,
		}); err != nil {
			log.Printf("Failed to encode ready response: %v", err)
		}
	}
}

// parseReadyParams parses query parameters into rpc.ReadyArgs.
func parseReadyParams(r *http.Request) (*rpc.ReadyArgs, error) {
	args := &rpc.ReadyArgs{}
	q := r.URL.Query()

	// String parameters
	if v := q.Get("assignee"); v != "" {
		args.Assignee = v
	}
	if v := q.Get("type"); v != "" {
		args.Type = v
	}
	if v := q.Get("parent_id"); v != "" {
		args.ParentID = v
	}
	if v := q.Get("mol_type"); v != "" {
		// Validate mol_type
		molType := types.MolType(v)
		if !molType.IsValid() {
			return nil, fmt.Errorf("invalid mol_type: %s (must be swarm, patrol, or work)", v)
		}
		args.MolType = v
	}

	// Sort policy
	if v := q.Get("sort"); v != "" {
		sortPolicy := types.SortPolicy(v)
		if !sortPolicy.IsValid() {
			return nil, fmt.Errorf("invalid sort policy: %s (must be hybrid, priority, or oldest)", v)
		}
		args.SortPolicy = v
	}

	// Boolean parameters
	if v := q.Get("unassigned"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("invalid unassigned value: %s (must be true or false)", v)
		}
		args.Unassigned = b
	}
	if v := q.Get("include_deferred"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("invalid include_deferred value: %s (must be true or false)", v)
		}
		args.IncludeDeferred = b
	}

	// Integer parameters
	if v := q.Get("priority"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("invalid priority value: %s (must be an integer 0-4)", v)
		}
		if p < 0 || p > 4 {
			return nil, fmt.Errorf("priority must be between 0 and 4 (got %d)", p)
		}
		args.Priority = &p
	}
	if v := q.Get("limit"); v != "" {
		l, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("invalid limit value: %s (must be a non-negative integer)", v)
		}
		if l < 0 {
			return nil, fmt.Errorf("limit must be non-negative (got %d)", l)
		}
		args.Limit = l
	}

	// Array parameters (comma-separated)
	if v := q.Get("labels"); v != "" {
		args.Labels = splitAndTrim(v)
	}
	if v := q.Get("labels_any"); v != "" {
		args.LabelsAny = splitAndTrim(v)
	}

	return args, nil
}

// splitAndTrim splits a comma-separated string and trims whitespace from each element.
func splitAndTrim(s string) []string {
	if s == "" {
		return nil
	}
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
