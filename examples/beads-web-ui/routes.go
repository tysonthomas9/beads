package main

import (
	"encoding/json"
	"log"
	"net/http"
)

// setupRoutes configures all HTTP routes for the server.
func setupRoutes(mux *http.ServeMux) {
	// Health check endpoint for load balancers and monitoring
	mux.HandleFunc("GET /health", handleHealth)

	// Phase 2 API routes (to be implemented):
	// mux.Handle("/api/issues", issuesHandler)
	// mux.Handle("/api/ready", readyHandler)
	// mux.Handle("/ws", websocketHandler)

	// Static file serving with SPA routing (must be last - catches all paths)
	mux.Handle("/", frontendHandler())
}

// handleHealth returns a simple health check response.
func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(map[string]string{"status": "ok"}); err != nil {
		log.Printf("Failed to encode health response: %v", err)
	}
}
