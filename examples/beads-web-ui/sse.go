package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/steveyegge/beads/internal/rpc"
)

// SSEHub manages connected SSE clients and broadcasts mutations to them.
type SSEHub struct {
	clients    map[*SSEClient]bool
	register   chan *SSEClient
	unregister chan *SSEClient
	broadcast  chan *MutationPayload
	mu         sync.RWMutex
	done       chan struct{}
}

// SSEClient represents a single SSE connection.
type SSEClient struct {
	id        int64
	send      chan *MutationPayload
	done      chan struct{}
	lastSince int64
}

// NewSSEHub creates a new SSE hub.
func NewSSEHub() *SSEHub {
	return &SSEHub{
		clients:    make(map[*SSEClient]bool),
		register:   make(chan *SSEClient, 16),
		unregister: make(chan *SSEClient, 16),
		broadcast:  make(chan *MutationPayload, 256),
		done:       make(chan struct{}),
	}
}

// Run starts the hub's main loop for managing clients and broadcasts.
func (h *SSEHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("SSE client %d registered (total: %d)", client.id, len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("SSE client %d unregistered (total: %d)", client.id, len(h.clients))

		case mutation := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- mutation:
				default:
					// Client buffer full, skip this mutation
					log.Printf("SSE client %d buffer full, skipping mutation", client.id)
				}
			}
			h.mu.RUnlock()

		case <-h.done:
			h.mu.Lock()
			for client := range h.clients {
				close(client.send)
				delete(h.clients, client)
			}
			h.mu.Unlock()
			return
		}
	}
}

// Stop gracefully stops the hub.
func (h *SSEHub) Stop() {
	close(h.done)
}

// RegisterClient adds a new client to the hub.
func (h *SSEHub) RegisterClient(client *SSEClient) {
	h.register <- client
}

// UnregisterClient removes a client from the hub.
func (h *SSEHub) UnregisterClient(client *SSEClient) {
	h.unregister <- client
}

// Broadcast sends a mutation to all connected clients.
func (h *SSEHub) Broadcast(mutation *MutationPayload) {
	select {
	case h.broadcast <- mutation:
	default:
		log.Printf("SSE broadcast channel full, dropping mutation")
	}
}

// ClientCount returns the number of connected clients.
func (h *SSEHub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// handleSSE creates an HTTP handler for the SSE endpoint.
func handleSSE(hub *SSEHub, getMutationsSince func(since int64) []rpc.MutationEvent) http.HandlerFunc {
	var clientIDCounter int64

	return func(w http.ResponseWriter, r *http.Request) {
		// Thread-safe client ID generation
		clientID := atomic.AddInt64(&clientIDCounter, 1)
		// Set SSE headers
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering

		// Get flusher for streaming
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
			return
		}

		// Parse Last-Event-ID header for reconnection catch-up
		var lastSince int64
		if lastEventID := r.Header.Get("Last-Event-ID"); lastEventID != "" {
			if ts, err := strconv.ParseInt(lastEventID, 10, 64); err == nil {
				lastSince = ts
			}
		}

		// Also accept ?since query parameter
		if since := r.URL.Query().Get("since"); since != "" {
			if ts, err := strconv.ParseInt(since, 10, 64); err == nil && ts > lastSince {
				lastSince = ts
			}
		}

		// Create client
		client := &SSEClient{
			id:        clientID,
			send:      make(chan *MutationPayload, 64),
			done:      make(chan struct{}),
			lastSince: lastSince,
		}

		// Register with hub
		hub.RegisterClient(client)

		// Ensure cleanup on disconnect
		defer func() {
			hub.UnregisterClient(client)
			close(client.done)
		}()

		log.Printf("SSE client %d connected from %s (since=%d)", client.id, r.RemoteAddr, lastSince)

		// Send catch-up events if reconnecting
		if lastSince > 0 && getMutationsSince != nil {
			catchUpMutations := getMutationsSince(lastSince)
			for _, m := range catchUpMutations {
				payload := rpcMutationToPayload(m)
				writeSSEEvent(w, payload)
				flusher.Flush()
			}
		}

		// Send initial connection event
		fmt.Fprintf(w, "event: connected\ndata: {\"clientId\":%d}\n\n", client.id)
		flusher.Flush()

		// Stream events
		for {
			select {
			case mutation, ok := <-client.send:
				if !ok {
					// Channel closed
					return
				}
				writeSSEEvent(w, mutation)
				flusher.Flush()

			case <-r.Context().Done():
				// Client disconnected
				log.Printf("SSE client %d disconnected", client.id)
				return
			}
		}
	}
}

// writeSSEEvent writes a mutation as an SSE event.
func writeSSEEvent(w http.ResponseWriter, mutation *MutationPayload) {
	// Parse timestamp to get Unix ms for event ID
	var eventID int64
	if t, err := time.Parse(time.RFC3339, mutation.Timestamp); err == nil {
		eventID = t.UnixMilli()
	} else {
		eventID = time.Now().UnixMilli()
	}

	data, err := json.Marshal(mutation)
	if err != nil {
		log.Printf("SSE marshal error: %v", err)
		return
	}

	fmt.Fprintf(w, "id: %d\nevent: mutation\ndata: %s\n\n", eventID, string(data))
}

// rpcMutationToPayload converts an RPC mutation event to a payload.
func rpcMutationToPayload(m rpc.MutationEvent) *MutationPayload {
	return &MutationPayload{
		Type:      m.Type,
		IssueID:   m.IssueID,
		Title:     m.Title,
		Assignee:  m.Assignee,
		Actor:     m.Actor,
		Timestamp: m.Timestamp.UTC().Format(time.RFC3339),
		OldStatus: m.OldStatus,
		NewStatus: m.NewStatus,
		ParentID:  m.ParentID,
		StepCount: m.StepCount,
	}
}
