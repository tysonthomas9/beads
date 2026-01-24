package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/steveyegge/beads/examples/beads-web-ui/daemon"
)

// setupRoutes configures all HTTP routes for the server.
func setupRoutes(mux *http.ServeMux, pool *daemon.ConnectionPool) {
	// Health check endpoint for load balancers and monitoring
	mux.HandleFunc("GET /health", handleHealth(pool))

	// API health endpoint that reports daemon connection status
	mux.HandleFunc("GET /api/health", handleAPIHealth(pool))

	// Phase 2 API routes
	mux.HandleFunc("GET /api/issues", handleListIssues(pool))
	// mux.Handle("/api/ready", readyHandler(pool))

	// WebSocket endpoint for real-time mutation events
	mux.HandleFunc("/ws", handleWebSocket(pool))

	// Static file serving with SPA routing (must be last - catches all paths)
	mux.Handle("/", frontendHandler())
}

// handleHealth returns a simple health check response.
// This is for load balancers and basic monitoring - it doesn't check daemon connectivity.
func handleHealth(pool *daemon.ConnectionPool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(map[string]string{"status": "ok"}); err != nil {
			log.Printf("Failed to encode health response: %v", err)
		}
	}
}

// HealthStatus represents the detailed health status of the API.
type HealthStatus struct {
	Status       string            `json:"status"`                  // "ok", "degraded", "unhealthy"
	Daemon       DaemonStatus      `json:"daemon"`                  // Daemon connection status
	Pool         *daemon.PoolStats `json:"pool,omitempty"`          // Connection pool stats
}

// DaemonStatus represents the daemon connection status.
type DaemonStatus struct {
	Connected bool    `json:"connected"`           // Whether we can connect to daemon
	Status    string  `json:"status,omitempty"`    // Daemon health status if connected
	Uptime    float64 `json:"uptime,omitempty"`    // Daemon uptime in seconds if connected
	Version   string  `json:"version,omitempty"`   // Daemon version if connected
	Error     string  `json:"error,omitempty"`     // Error message if not connected
}

// handleAPIHealth returns a detailed health check including daemon connectivity.
func handleAPIHealth(pool *daemon.ConnectionPool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := HealthStatus{
			Status: "ok",
			Daemon: DaemonStatus{
				Connected: false,
			},
		}

		// Check daemon connection if pool is available
		if pool != nil {
			poolStats := pool.Stats()
			status.Pool = &poolStats

			// Try to get a connection and check daemon health
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()

			client, err := pool.Get(ctx)
			if err != nil {
				status.Status = "degraded"
				status.Daemon.Error = err.Error()
			} else {
				defer pool.Put(client)

				// Get daemon health
				health, err := client.Health()
				if err != nil {
					status.Status = "degraded"
					status.Daemon.Error = err.Error()
				} else {
					status.Daemon.Connected = true
					status.Daemon.Status = health.Status
					status.Daemon.Uptime = health.Uptime
					status.Daemon.Version = health.Version

					if health.Status == "unhealthy" {
						status.Status = "degraded"
						status.Daemon.Error = health.Error
					}
				}
			}
		} else {
			status.Status = "degraded"
			status.Daemon.Error = "connection pool not initialized"
		}

		w.Header().Set("Content-Type", "application/json")
		if status.Status == "ok" {
			w.WriteHeader(http.StatusOK)
		} else {
			w.WriteHeader(http.StatusServiceUnavailable)
		}

		if err := json.NewEncoder(w).Encode(status); err != nil {
			log.Printf("Failed to encode API health response: %v", err)
		}
	}
}
