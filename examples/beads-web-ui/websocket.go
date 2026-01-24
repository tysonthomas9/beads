package main

import (
	"context"
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/steveyegge/beads/examples/beads-web-ui/daemon"
	"github.com/steveyegge/beads/internal/rpc"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = 30 * time.Second

	// Maximum message size allowed from peer.
	maxMessageSize = 1024

	// Mutation polling interval when subscribed.
	mutationPollInterval = 2 * time.Second

	// Timeout for acquiring daemon connection.
	daemonAcquireTimeout = 2 * time.Second
)

// WebSocket message types (client -> server).
const (
	MsgTypeSubscribe   = "subscribe"
	MsgTypeUnsubscribe = "unsubscribe"
	MsgTypePing        = "ping"
)

// WebSocket message types (server -> client).
const (
	MsgTypeMutation = "mutation"
	MsgTypePong     = "pong"
	MsgTypeError    = "error"
)

// upgrader configures WebSocket connection upgrade parameters.
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow same-origin and localhost for development.
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		return strings.HasPrefix(origin, "http://localhost") ||
			strings.HasPrefix(origin, "http://127.0.0.1") ||
			strings.HasPrefix(origin, "https://localhost") ||
			strings.HasPrefix(origin, "https://127.0.0.1")
	},
}

// ClientMessage represents a message from the WebSocket client.
type ClientMessage struct {
	Type  string `json:"type"`            // subscribe, unsubscribe, ping
	Since int64  `json:"since,omitempty"` // Unix timestamp (ms) for getting missed events
}

// ServerMessage represents a message from the WebSocket server.
type ServerMessage struct {
	Type      string           `json:"type"`                // mutation, pong, error
	Mutation  *MutationPayload `json:"mutation,omitempty"`  // For mutation events
	Timestamp string           `json:"timestamp,omitempty"` // For pong messages
	Error     string           `json:"error,omitempty"`     // Error code
	Message   string           `json:"message,omitempty"`   // Error message
}

// MutationPayload represents mutation data sent to clients.
type MutationPayload struct {
	Type      string `json:"type"`                 // create, update, delete, comment, status, bonded, squashed, burned
	IssueID   string `json:"issue_id"`
	Title     string `json:"title,omitempty"`
	Assignee  string `json:"assignee,omitempty"`
	Actor     string `json:"actor,omitempty"`
	Timestamp string `json:"timestamp"`
	OldStatus string `json:"old_status,omitempty"` // For status events
	NewStatus string `json:"new_status,omitempty"` // For status events
	ParentID  string `json:"parent_id,omitempty"`  // For bonded events
	StepCount int    `json:"step_count,omitempty"` // For bonded events
}

// wsConnection represents a single WebSocket connection.
type wsConnection struct {
	conn       *websocket.Conn
	pool       *daemon.ConnectionPool
	send       chan []byte
	subscribed bool
	lastSince  int64
	mu         sync.RWMutex
	done       chan struct{}
	closeOnce  sync.Once // Ensures send channel is closed only once
	closed     bool      // Tracks if connection is closed (protected by mu)
}

// handleWebSocket upgrades HTTP to WebSocket and manages the connection.
func handleWebSocket(pool *daemon.ConnectionPool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}

		wsc := &wsConnection{
			conn: conn,
			pool: pool,
			send: make(chan []byte, 256),
			done: make(chan struct{}),
		}

		// Start reader and writer goroutines.
		go wsc.writePump()
		go wsc.readPump()

		log.Printf("WebSocket connection established from %s", r.RemoteAddr)
	}
}

// readPump reads messages from the WebSocket connection.
func (wsc *wsConnection) readPump() {
	defer func() {
		close(wsc.done)
		wsc.conn.Close()
		log.Printf("WebSocket connection closed (read pump exit)")
	}()

	wsc.conn.SetReadLimit(maxMessageSize)
	wsc.conn.SetReadDeadline(time.Now().Add(pongWait))
	wsc.conn.SetPongHandler(func(string) error {
		wsc.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := wsc.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket unexpected close: %v", err)
			}
			return
		}

		wsc.handleMessage(message)
	}
}

// writePump writes messages to the WebSocket connection.
func (wsc *wsConnection) writePump() {
	ticker := time.NewTicker(pingPeriod)
	// Add jitter to polling interval to prevent thundering herd when many clients connect
	jitter := time.Duration(rand.Int63n(int64(mutationPollInterval / 2)))
	pollTicker := time.NewTicker(mutationPollInterval + jitter)
	defer func() {
		ticker.Stop()
		pollTicker.Stop()
		wsc.conn.Close()
		log.Printf("WebSocket connection closed (write pump exit)")
	}()

	for {
		select {
		case message, ok := <-wsc.send:
			wsc.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Channel closed, send close message.
				wsc.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := wsc.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}

		case <-ticker.C:
			wsc.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := wsc.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("WebSocket ping error: %v", err)
				return
			}

		case <-pollTicker.C:
			wsc.pollMutations()

		case <-wsc.done:
			return
		}
	}
}

// handleMessage processes incoming client messages.
func (wsc *wsConnection) handleMessage(data []byte) {
	var msg ClientMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Printf("WebSocket invalid JSON: %v", err)
		wsc.sendError("invalid_json", "Failed to parse message")
		return
	}

	switch msg.Type {
	case MsgTypeSubscribe:
		wsc.handleSubscribe(msg.Since)
	case MsgTypeUnsubscribe:
		wsc.handleUnsubscribe()
	case MsgTypePing:
		wsc.handlePing()
	default:
		log.Printf("WebSocket unknown message type: %s", msg.Type)
	}
}

// handleSubscribe starts subscription to mutation events.
func (wsc *wsConnection) handleSubscribe(since int64) {
	wsc.mu.Lock()
	wsc.subscribed = true
	wsc.lastSince = since
	wsc.mu.Unlock()

	log.Printf("WebSocket subscribed (since=%d)", since)

	// Immediately poll for any events since the requested timestamp.
	if since > 0 {
		wsc.pollMutations()
	}
}

// handleUnsubscribe stops subscription to mutation events.
func (wsc *wsConnection) handleUnsubscribe() {
	wsc.mu.Lock()
	wsc.subscribed = false
	wsc.mu.Unlock()

	log.Printf("WebSocket unsubscribed")
}

// handlePing responds to client ping with pong.
func (wsc *wsConnection) handlePing() {
	msg := ServerMessage{
		Type:      MsgTypePong,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	wsc.sendJSON(msg)
}

// pollMutations fetches mutations from the daemon and sends them to the client.
func (wsc *wsConnection) pollMutations() {
	wsc.mu.RLock()
	subscribed := wsc.subscribed
	since := wsc.lastSince
	wsc.mu.RUnlock()

	if !subscribed {
		return
	}

	if wsc.pool == nil {
		wsc.sendError("daemon_unavailable", "Connection pool not initialized")
		return
	}

	// Acquire connection from pool.
	ctx, cancel := context.WithTimeout(context.Background(), daemonAcquireTimeout)
	defer cancel()

	client, err := wsc.pool.Get(ctx)
	if err != nil {
		// Only log occasionally to avoid spam.
		log.Printf("WebSocket daemon connection error: %v", err)
		wsc.sendError("daemon_unavailable", "Cannot connect to beads daemon")
		return
	}
	defer wsc.pool.Put(client)

	// Call GetMutations RPC.
	args := &rpc.GetMutationsArgs{Since: since}
	resp, err := client.GetMutations(args)
	if err != nil {
		log.Printf("WebSocket GetMutations error: %v", err)
		wsc.sendError("rpc_error", "Failed to get mutations")
		return
	}

	if !resp.Success {
		log.Printf("WebSocket GetMutations failed: %s", resp.Error)
		return
	}

	// Parse mutations from response.
	var mutations []rpc.MutationEvent
	if err := json.Unmarshal(resp.Data, &mutations); err != nil {
		log.Printf("WebSocket mutation parse error: %v", err)
		return
	}

	// Send each mutation to the client.
	var maxTimestamp int64
	for _, m := range mutations {
		ts := m.Timestamp.UnixMilli()
		if ts > maxTimestamp {
			maxTimestamp = ts
		}

		payload := MutationPayload{
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

		msg := ServerMessage{
			Type:     MsgTypeMutation,
			Mutation: &payload,
		}
		wsc.sendJSON(msg)
	}

	// Update lastSince to avoid re-sending the same mutations.
	// Add 1ms to move past the boundary and prevent re-fetching mutations at the exact timestamp.
	if maxTimestamp > 0 {
		wsc.mu.Lock()
		if maxTimestamp >= wsc.lastSince {
			wsc.lastSince = maxTimestamp + 1
		}
		wsc.mu.Unlock()
	}
}

// sendJSON marshals and sends a message to the client.
func (wsc *wsConnection) sendJSON(msg interface{}) {
	// Check if connection is already closed to avoid sending to closed channel.
	wsc.mu.RLock()
	if wsc.closed {
		wsc.mu.RUnlock()
		return
	}
	wsc.mu.RUnlock()

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("WebSocket JSON marshal error: %v", err)
		return
	}

	select {
	case wsc.send <- data:
	default:
		// Buffer full, client is slow. Close connection using sync.Once to prevent panic.
		log.Printf("WebSocket send buffer full, closing connection")
		wsc.closeOnce.Do(func() {
			wsc.mu.Lock()
			wsc.closed = true
			wsc.mu.Unlock()
			close(wsc.send)
		})
	}
}

// sendError sends an error message to the client.
func (wsc *wsConnection) sendError(code, message string) {
	msg := ServerMessage{
		Type:    MsgTypeError,
		Error:   code,
		Message: message,
	}
	wsc.sendJSON(msg)
}
