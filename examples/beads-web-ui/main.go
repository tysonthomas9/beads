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

	"github.com/steveyegge/beads/examples/beads-web-ui/daemon"
)

const (
	defaultPort            = 8080
	defaultPoolSize        = 5
	defaultShutdownTimeout = 5 * time.Second
)

func main() {
	// Parse command-line flags
	port := flag.Int("port", defaultPort, "HTTP server port")
	socket := flag.String("socket", "", "Path to beads daemon socket (default: auto-detect)")
	poolSize := flag.Int("pool-size", defaultPoolSize, "Connection pool size")
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
	log.Printf("Connection pool size: %d", *poolSize)
	if *socket != "" {
		log.Printf("Daemon socket: %s", *socket)
	} else {
		log.Printf("Daemon socket: auto-detect")
	}

	// Initialize daemon connection pool
	var pool *daemon.ConnectionPool
	var poolErr error

	if *socket != "" {
		// Use explicit socket path
		pool, poolErr = daemon.NewConnectionPool(*socket, *poolSize)
	} else {
		// Auto-discover daemon from current directory
		cwd, err := os.Getwd()
		if err != nil {
			log.Printf("Warning: failed to get current directory: %v", err)
		} else {
			pool, poolErr = daemon.NewConnectionPoolAutoDiscover(cwd, *poolSize)
		}
	}

	if poolErr != nil {
		log.Printf("Warning: failed to initialize daemon connection pool: %v", poolErr)
		log.Printf("The web UI will start but API endpoints may not work until a daemon is available")
	} else {
		log.Printf("Daemon connection pool initialized")
		// Test the connection
		func() {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			client, err := pool.Get(ctx)
			if err != nil {
				log.Printf("Warning: daemon not available at startup: %v", err)
				log.Printf("API endpoints will attempt to connect when called")
			} else {
				pool.Put(client)
				log.Printf("Daemon connection verified")
			}
		}()
	}

	// Create HTTP server
	mux := http.NewServeMux()
	setupRoutes(mux, pool)

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

	// Close daemon connection pool
	if pool != nil {
		if err := pool.Close(); err != nil {
			log.Printf("Warning: error closing connection pool: %v", err)
		} else {
			log.Printf("Daemon connection pool closed")
		}
	}

	// Create a deadline for shutdown
	ctx, cancel := context.WithTimeout(context.Background(), defaultShutdownTimeout)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server stopped")
}
