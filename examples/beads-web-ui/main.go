// Package main provides the web UI server for Beads.
//
// This server embeds the React frontend at compile time and serves it
// along with API endpoints for interacting with the beads daemon.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const (
	defaultPort            = 8080
	defaultShutdownTimeout = 5 * time.Second
)

func main() {
	// Parse command-line flags
	port := flag.Int("port", defaultPort, "HTTP server port")
	socket := flag.String("socket", "", "Path to beads daemon socket (default: auto-detect)")
	flag.Parse()

	// Check environment variables for port override
	if envPort := os.Getenv("BEADS_WEBUI_PORT"); envPort != "" {
		var envPortInt int
		if n, err := fmt.Sscanf(envPort, "%d", &envPortInt); err == nil && n == 1 && envPortInt > 0 {
			*port = envPortInt
		} else {
			log.Printf("Warning: invalid BEADS_WEBUI_PORT value %q, using default %d", envPort, *port)
		}
	}

	// Log configuration
	log.Printf("Starting beads-web-ui server")
	log.Printf("Port: %d", *port)
	if *socket != "" {
		log.Printf("Daemon socket: %s", *socket)
	} else {
		log.Printf("Daemon socket: auto-detect")
	}

	// Create HTTP server
	mux := http.NewServeMux()
	setupRoutes(mux)

	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", *port),
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		log.Printf("Listening on http://localhost:%d", *port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	signal.Stop(quit)

	log.Println("Shutting down server...")

	// Create a deadline for shutdown
	ctx, cancel := context.WithTimeout(context.Background(), defaultShutdownTimeout)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server stopped")
}
