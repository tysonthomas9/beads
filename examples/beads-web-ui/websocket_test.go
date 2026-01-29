package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// TestHandleWebSocket_Upgrade tests that the handler upgrades HTTP to WebSocket correctly.
func TestHandleWebSocket_Upgrade(t *testing.T) {
	handler := handleWebSocket(nil)

	// Create a test server
	server := httptest.NewServer(handler)
	defer server.Close()

	// Convert http:// to ws://
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// Connect as WebSocket client
	dialer := websocket.Dialer{}
	conn, resp, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer conn.Close()

	// Verify upgrade was successful
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Errorf("expected status %d, got %d", http.StatusSwitchingProtocols, resp.StatusCode)
	}
}

// TestHandleWebSocket_UpgradeWithOrigin tests origin validation for WebSocket connections.
func TestHandleWebSocket_UpgradeWithOrigin(t *testing.T) {
	tests := []struct {
		name        string
		origin      string
		shouldAllow bool
	}{
		{
			name:        "localhost http allowed",
			origin:      "http://localhost:3000",
			shouldAllow: true,
		},
		{
			name:        "localhost https allowed",
			origin:      "https://localhost:3000",
			shouldAllow: true,
		},
		{
			name:        "127.0.0.1 http allowed",
			origin:      "http://127.0.0.1:8080",
			shouldAllow: true,
		},
		{
			name:        "127.0.0.1 https allowed",
			origin:      "https://127.0.0.1:8080",
			shouldAllow: true,
		},
		{
			name:        "empty origin allowed",
			origin:      "",
			shouldAllow: true,
		},
		{
			name:        "external origin rejected",
			origin:      "http://evil.com",
			shouldAllow: false,
		},
		{
			name:        "external https origin rejected",
			origin:      "https://attacker.example.com",
			shouldAllow: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := handleWebSocket(nil)
			server := httptest.NewServer(handler)
			defer server.Close()

			wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

			dialer := websocket.Dialer{}
			header := http.Header{}
			if tt.origin != "" {
				header.Set("Origin", tt.origin)
			}

			conn, _, err := dialer.Dial(wsURL, header)
			if tt.shouldAllow {
				if err != nil {
					t.Errorf("expected connection to be allowed for origin %q, got error: %v", tt.origin, err)
				} else {
					conn.Close()
				}
			} else {
				if err == nil {
					conn.Close()
					t.Errorf("expected connection to be rejected for origin %q", tt.origin)
				}
			}
		})
	}
}

// TestHandleWebSocket_PingMessage tests that ping messages receive pong responses.
func TestHandleWebSocket_PingMessage(t *testing.T) {
	handler := handleWebSocket(nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer conn.Close()

	// Send ping message
	pingMsg := ClientMessage{Type: MsgTypePing}
	if err := conn.WriteJSON(pingMsg); err != nil {
		t.Fatalf("failed to send ping: %v", err)
	}

	// Set read deadline
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	// Read pong response
	var resp ServerMessage
	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("failed to read pong response: %v", err)
	}

	if resp.Type != MsgTypePong {
		t.Errorf("expected type=%q, got %q", MsgTypePong, resp.Type)
	}
	if resp.Timestamp == "" {
		t.Error("expected timestamp in pong response")
	}

	// Verify timestamp is valid RFC3339
	_, err = time.Parse(time.RFC3339, resp.Timestamp)
	if err != nil {
		t.Errorf("invalid timestamp format: %v", err)
	}
}

// TestHandleWebSocket_SubscribeMessage tests subscribe message handling.
func TestHandleWebSocket_SubscribeMessage(t *testing.T) {
	handler := handleWebSocket(nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer conn.Close()

	// Send subscribe message
	subscribeMsg := ClientMessage{
		Type:  MsgTypeSubscribe,
		Since: time.Now().Add(-1 * time.Hour).UnixMilli(),
	}
	if err := conn.WriteJSON(subscribeMsg); err != nil {
		t.Fatalf("failed to send subscribe: %v", err)
	}

	// Set read deadline
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	// Read error response (daemon unavailable since pool is nil)
	var resp ServerMessage
	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("failed to read response: %v", err)
	}

	// WebSocket subscription is deprecated, should get a deprecation warning
	if resp.Type != MsgTypeError {
		t.Errorf("expected type=%q, got %q", MsgTypeError, resp.Type)
	}
	if resp.Error != "deprecated" {
		t.Errorf("expected error=deprecated, got %q", resp.Error)
	}
}

// TestHandleWebSocket_UnsubscribeMessage tests unsubscribe message handling.
func TestHandleWebSocket_UnsubscribeMessage(t *testing.T) {
	handler := handleWebSocket(nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer conn.Close()

	// Send unsubscribe message (should succeed silently)
	unsubscribeMsg := ClientMessage{Type: MsgTypeUnsubscribe}
	if err := conn.WriteJSON(unsubscribeMsg); err != nil {
		t.Fatalf("failed to send unsubscribe: %v", err)
	}

	// Unsubscribe doesn't send a response, so we send a ping to verify connection still works
	pingMsg := ClientMessage{Type: MsgTypePing}
	if err := conn.WriteJSON(pingMsg); err != nil {
		t.Fatalf("failed to send ping after unsubscribe: %v", err)
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	var resp ServerMessage
	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("failed to read pong after unsubscribe: %v", err)
	}

	if resp.Type != MsgTypePong {
		t.Errorf("expected type=%q after unsubscribe, got %q", MsgTypePong, resp.Type)
	}
}

// TestHandleWebSocket_InvalidJSON tests that invalid JSON messages return an error.
func TestHandleWebSocket_InvalidJSON(t *testing.T) {
	handler := handleWebSocket(nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer conn.Close()

	// Send invalid JSON
	invalidJSON := []byte("this is not valid json")
	if err := conn.WriteMessage(websocket.TextMessage, invalidJSON); err != nil {
		t.Fatalf("failed to send invalid JSON: %v", err)
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	// Read error response
	var resp ServerMessage
	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("failed to read error response: %v", err)
	}

	if resp.Type != MsgTypeError {
		t.Errorf("expected type=%q, got %q", MsgTypeError, resp.Type)
	}
	if resp.Error != "invalid_json" {
		t.Errorf("expected error=invalid_json, got %q", resp.Error)
	}
	if resp.Message == "" {
		t.Error("expected error message to be set")
	}
}

// TestHandleWebSocket_UnknownMessageType tests that unknown message types are handled gracefully.
func TestHandleWebSocket_UnknownMessageType(t *testing.T) {
	handler := handleWebSocket(nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer conn.Close()

	// Send message with unknown type
	unknownMsg := ClientMessage{Type: "unknown_type"}
	if err := conn.WriteJSON(unknownMsg); err != nil {
		t.Fatalf("failed to send unknown type message: %v", err)
	}

	// Unknown types are logged but don't send a response, so verify connection still works
	pingMsg := ClientMessage{Type: MsgTypePing}
	if err := conn.WriteJSON(pingMsg); err != nil {
		t.Fatalf("failed to send ping after unknown type: %v", err)
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	var resp ServerMessage
	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("failed to read pong after unknown type: %v", err)
	}

	if resp.Type != MsgTypePong {
		t.Errorf("expected type=%q, got %q", MsgTypePong, resp.Type)
	}
}

// TestHandleWebSocket_ConnectionClose tests that client-initiated close is handled properly.
func TestHandleWebSocket_ConnectionClose(t *testing.T) {
	handler := handleWebSocket(nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}

	// Send close message
	err = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	if err != nil {
		t.Fatalf("failed to send close message: %v", err)
	}

	// Close the connection
	conn.Close()

	// Verify server handled the close gracefully by creating a new connection
	conn2, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to create new connection after close: %v", err)
	}
	defer conn2.Close()

	// Verify new connection works
	pingMsg := ClientMessage{Type: MsgTypePing}
	if err := conn2.WriteJSON(pingMsg); err != nil {
		t.Fatalf("failed to send ping on new connection: %v", err)
	}

	conn2.SetReadDeadline(time.Now().Add(5 * time.Second))

	var resp ServerMessage
	if err := conn2.ReadJSON(&resp); err != nil {
		t.Fatalf("failed to read pong on new connection: %v", err)
	}

	if resp.Type != MsgTypePong {
		t.Errorf("expected type=%q on new connection, got %q", MsgTypePong, resp.Type)
	}
}

// TestHandleWebSocket_MultipleMessages tests sending multiple messages in sequence.
func TestHandleWebSocket_MultipleMessages(t *testing.T) {
	handler := handleWebSocket(nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer conn.Close()

	// Send multiple ping messages
	for i := 0; i < 5; i++ {
		pingMsg := ClientMessage{Type: MsgTypePing}
		if err := conn.WriteJSON(pingMsg); err != nil {
			t.Fatalf("failed to send ping %d: %v", i, err)
		}
	}

	// Read all pong responses
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	for i := 0; i < 5; i++ {
		var resp ServerMessage
		if err := conn.ReadJSON(&resp); err != nil {
			t.Fatalf("failed to read pong %d: %v", i, err)
		}
		if resp.Type != MsgTypePong {
			t.Errorf("message %d: expected type=%q, got %q", i, MsgTypePong, resp.Type)
		}
	}
}

// TestClientMessage_JSON tests ClientMessage JSON marshaling/unmarshaling.
func TestClientMessage_JSON(t *testing.T) {
	tests := []struct {
		name    string
		json    string
		want    ClientMessage
		wantErr bool
	}{
		{
			name: "subscribe message",
			json: `{"type":"subscribe","since":1234567890}`,
			want: ClientMessage{Type: MsgTypeSubscribe, Since: 1234567890},
		},
		{
			name: "unsubscribe message",
			json: `{"type":"unsubscribe"}`,
			want: ClientMessage{Type: MsgTypeUnsubscribe},
		},
		{
			name: "ping message",
			json: `{"type":"ping"}`,
			want: ClientMessage{Type: MsgTypePing},
		},
		{
			name: "subscribe without since",
			json: `{"type":"subscribe"}`,
			want: ClientMessage{Type: MsgTypeSubscribe, Since: 0},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got ClientMessage
			err := json.Unmarshal([]byte(tt.json), &got)
			if (err != nil) != tt.wantErr {
				t.Errorf("Unmarshal() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if err == nil {
				if got.Type != tt.want.Type {
					t.Errorf("Type = %q, want %q", got.Type, tt.want.Type)
				}
				if got.Since != tt.want.Since {
					t.Errorf("Since = %d, want %d", got.Since, tt.want.Since)
				}
			}
		})
	}
}

// TestServerMessage_JSON tests ServerMessage JSON marshaling.
func TestServerMessage_JSON(t *testing.T) {
	tests := []struct {
		name string
		msg  ServerMessage
		want map[string]interface{}
	}{
		{
			name: "pong message",
			msg: ServerMessage{
				Type:      MsgTypePong,
				Timestamp: "2025-01-23T12:00:00Z",
			},
			want: map[string]interface{}{
				"type":      "pong",
				"timestamp": "2025-01-23T12:00:00Z",
			},
		},
		{
			name: "error message",
			msg: ServerMessage{
				Type:    MsgTypeError,
				Error:   "invalid_json",
				Message: "Failed to parse message",
			},
			want: map[string]interface{}{
				"type":    "error",
				"error":   "invalid_json",
				"message": "Failed to parse message",
			},
		},
		{
			name: "mutation message",
			msg: ServerMessage{
				Type: MsgTypeMutation,
				Mutation: &MutationPayload{
					Type:      "create",
					IssueID:   "test-123",
					Title:     "Test Issue",
					Timestamp: "2025-01-23T12:00:00Z",
				},
			},
			want: map[string]interface{}{
				"type": "mutation",
				"mutation": map[string]interface{}{
					"type":      "create",
					"issue_id":  "test-123",
					"title":     "Test Issue",
					"timestamp": "2025-01-23T12:00:00Z",
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.msg)
			if err != nil {
				t.Fatalf("Marshal() error = %v", err)
			}

			var got map[string]interface{}
			if err := json.Unmarshal(data, &got); err != nil {
				t.Fatalf("Unmarshal() error = %v", err)
			}

			// Check type field (always present)
			if got["type"] != tt.want["type"] {
				t.Errorf("type = %v, want %v", got["type"], tt.want["type"])
			}

			// Check other expected fields
			for key, wantVal := range tt.want {
				if key == "type" || key == "mutation" {
					continue // mutation is checked separately
				}
				if got[key] != wantVal {
					t.Errorf("%s = %v, want %v", key, got[key], wantVal)
				}
			}
		})
	}
}

// TestMutationPayload_JSON tests MutationPayload JSON marshaling.
func TestMutationPayload_JSON(t *testing.T) {
	tests := []struct {
		name    string
		payload MutationPayload
		check   func(t *testing.T, data map[string]interface{})
	}{
		{
			name: "create mutation",
			payload: MutationPayload{
				Type:      "create",
				IssueID:   "issue-1",
				Title:     "New Issue",
				Assignee:  "user1",
				Actor:     "actor1",
				Timestamp: "2025-01-23T12:00:00Z",
			},
			check: func(t *testing.T, data map[string]interface{}) {
				if data["type"] != "create" {
					t.Errorf("type = %v, want create", data["type"])
				}
				if data["issue_id"] != "issue-1" {
					t.Errorf("issue_id = %v, want issue-1", data["issue_id"])
				}
				if data["title"] != "New Issue" {
					t.Errorf("title = %v, want 'New Issue'", data["title"])
				}
			},
		},
		{
			name: "status mutation",
			payload: MutationPayload{
				Type:      "status",
				IssueID:   "issue-2",
				Timestamp: "2025-01-23T12:00:00Z",
				OldStatus: "open",
				NewStatus: "closed",
			},
			check: func(t *testing.T, data map[string]interface{}) {
				if data["type"] != "status" {
					t.Errorf("type = %v, want status", data["type"])
				}
				if data["old_status"] != "open" {
					t.Errorf("old_status = %v, want open", data["old_status"])
				}
				if data["new_status"] != "closed" {
					t.Errorf("new_status = %v, want closed", data["new_status"])
				}
			},
		},
		{
			name: "bonded mutation",
			payload: MutationPayload{
				Type:      "bonded",
				IssueID:   "child-issue",
				Timestamp: "2025-01-23T12:00:00Z",
				ParentID:  "parent-issue",
				StepCount: 3,
			},
			check: func(t *testing.T, data map[string]interface{}) {
				if data["type"] != "bonded" {
					t.Errorf("type = %v, want bonded", data["type"])
				}
				if data["parent_id"] != "parent-issue" {
					t.Errorf("parent_id = %v, want parent-issue", data["parent_id"])
				}
				if data["step_count"] != float64(3) { // JSON numbers are float64
					t.Errorf("step_count = %v, want 3", data["step_count"])
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.payload)
			if err != nil {
				t.Fatalf("Marshal() error = %v", err)
			}

			var got map[string]interface{}
			if err := json.Unmarshal(data, &got); err != nil {
				t.Fatalf("Unmarshal() error = %v", err)
			}

			tt.check(t, got)
		})
	}
}

// TestMessageTypeConstants verifies message type constants.
func TestMessageTypeConstants(t *testing.T) {
	// Client message types
	if MsgTypeSubscribe != "subscribe" {
		t.Errorf("MsgTypeSubscribe = %q, want 'subscribe'", MsgTypeSubscribe)
	}
	if MsgTypeUnsubscribe != "unsubscribe" {
		t.Errorf("MsgTypeUnsubscribe = %q, want 'unsubscribe'", MsgTypeUnsubscribe)
	}
	if MsgTypePing != "ping" {
		t.Errorf("MsgTypePing = %q, want 'ping'", MsgTypePing)
	}

	// Server message types
	if MsgTypeMutation != "mutation" {
		t.Errorf("MsgTypeMutation = %q, want 'mutation'", MsgTypeMutation)
	}
	if MsgTypePong != "pong" {
		t.Errorf("MsgTypePong = %q, want 'pong'", MsgTypePong)
	}
	if MsgTypeError != "error" {
		t.Errorf("MsgTypeError = %q, want 'error'", MsgTypeError)
	}
}

// TestWebSocketConstants verifies WebSocket configuration constants.
func TestWebSocketConstants(t *testing.T) {
	if writeWait <= 0 {
		t.Errorf("writeWait = %v, want positive duration", writeWait)
	}
	if pongWait <= 0 {
		t.Errorf("pongWait = %v, want positive duration", pongWait)
	}
	if pingPeriod <= 0 {
		t.Errorf("pingPeriod = %v, want positive duration", pingPeriod)
	}
	if pingPeriod >= pongWait {
		t.Errorf("pingPeriod (%v) should be less than pongWait (%v)", pingPeriod, pongWait)
	}
	if maxMessageSize <= 0 {
		t.Errorf("maxMessageSize = %v, want positive value", maxMessageSize)
	}
	// Note: polling-related constants removed when WebSocket polling was deprecated
	// in favor of SSE endpoint /api/events
}

// TestUpgrader_CheckOrigin tests the upgrader's CheckOrigin function directly.
func TestUpgrader_CheckOrigin(t *testing.T) {
	tests := []struct {
		name   string
		origin string
		want   bool
	}{
		{"empty origin", "", true},
		{"http localhost", "http://localhost", true},
		{"http localhost with port", "http://localhost:8080", true},
		{"https localhost", "https://localhost", true},
		{"https localhost with port", "https://localhost:3000", true},
		{"http 127.0.0.1", "http://127.0.0.1", true},
		{"http 127.0.0.1 with port", "http://127.0.0.1:8080", true},
		{"https 127.0.0.1", "https://127.0.0.1", true},
		{"https 127.0.0.1 with port", "https://127.0.0.1:443", true},
		{"external http", "http://example.com", false},
		{"external https", "https://example.com", false},
		{"localhost subdomain", "http://sub.localhost", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/ws", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			got := upgrader.CheckOrigin(req)
			if got != tt.want {
				t.Errorf("CheckOrigin(%q) = %v, want %v", tt.origin, got, tt.want)
			}
		})
	}
}

// TestWsConnection_LastSince tests that the lastSince timestamp is tracked correctly.
func TestWsConnection_LastSince(t *testing.T) {
	wsc := &wsConnection{
		subscribed: true,
		lastSince:  1000,
	}

	// Verify initial state
	wsc.mu.RLock()
	if wsc.lastSince != 1000 {
		t.Errorf("initial lastSince = %d, want 1000", wsc.lastSince)
	}
	wsc.mu.RUnlock()

	// Test that updating lastSince works
	wsc.mu.Lock()
	wsc.lastSince = 2000
	wsc.mu.Unlock()

	wsc.mu.RLock()
	if wsc.lastSince != 2000 {
		t.Errorf("updated lastSince = %d, want 2000", wsc.lastSince)
	}
	wsc.mu.RUnlock()
}

// TestWsConnection_SubscriptionState tests subscribe/unsubscribe state changes.
func TestWsConnection_SubscriptionState(t *testing.T) {
	wsc := &wsConnection{}

	// Initial state should be unsubscribed
	wsc.mu.RLock()
	if wsc.subscribed {
		t.Error("initial state should be unsubscribed")
	}
	wsc.mu.RUnlock()

	// Subscribe
	wsc.mu.Lock()
	wsc.subscribed = true
	wsc.lastSince = 12345
	wsc.mu.Unlock()

	wsc.mu.RLock()
	if !wsc.subscribed {
		t.Error("after subscribe, should be subscribed")
	}
	if wsc.lastSince != 12345 {
		t.Errorf("lastSince = %d, want 12345", wsc.lastSince)
	}
	wsc.mu.RUnlock()

	// Unsubscribe
	wsc.mu.Lock()
	wsc.subscribed = false
	wsc.mu.Unlock()

	wsc.mu.RLock()
	if wsc.subscribed {
		t.Error("after unsubscribe, should be unsubscribed")
	}
	// lastSince should be preserved even after unsubscribe (for reconnection)
	if wsc.lastSince != 12345 {
		t.Errorf("lastSince should be preserved after unsubscribe, got %d", wsc.lastSince)
	}
	wsc.mu.RUnlock()
}

// TestWsConnection_SubscribeWithSince tests subscribing with a since timestamp.
func TestWsConnection_SubscribeWithSince(t *testing.T) {
	handler := handleWebSocket(nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer conn.Close()

	// Subscribe with a specific since timestamp
	since := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC).UnixMilli()
	subscribeMsg := ClientMessage{
		Type:  MsgTypeSubscribe,
		Since: since,
	}
	if err := conn.WriteJSON(subscribeMsg); err != nil {
		t.Fatalf("failed to send subscribe: %v", err)
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	// Should get daemon_unavailable since pool is nil
	var resp ServerMessage
	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("failed to read response: %v", err)
	}

	if resp.Type != MsgTypeError {
		t.Errorf("expected type=%q, got %q", MsgTypeError, resp.Type)
	}
}

// TestWsConnection_SubscribeWithZeroSince tests subscribing without specifying since.
// Note: WebSocket subscription is deprecated - this test verifies the deprecation flow.
func TestWsConnection_SubscribeWithZeroSince(t *testing.T) {
	handler := handleWebSocket(nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer conn.Close()

	// Subscribe without since (defaults to 0)
	subscribeMsg := ClientMessage{
		Type: MsgTypeSubscribe,
		// Since is omitted, defaults to 0
	}
	if err := conn.WriteJSON(subscribeMsg); err != nil {
		t.Fatalf("failed to send subscribe: %v", err)
	}

	// Send ping to verify connection works after subscribe
	pingMsg := ClientMessage{Type: MsgTypePing}
	if err := conn.WriteJSON(pingMsg); err != nil {
		t.Fatalf("failed to send ping: %v", err)
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	// First message is the deprecation warning from subscribe
	var deprecationResp ServerMessage
	if err := conn.ReadJSON(&deprecationResp); err != nil {
		t.Fatalf("failed to read deprecation response: %v", err)
	}
	if deprecationResp.Type != MsgTypeError || deprecationResp.Error != "deprecated" {
		t.Errorf("expected deprecation error, got type=%q error=%q", deprecationResp.Type, deprecationResp.Error)
	}

	// Second message is the pong response
	var pongResp ServerMessage
	if err := conn.ReadJSON(&pongResp); err != nil {
		t.Fatalf("failed to read pong response: %v", err)
	}
	if pongResp.Type != MsgTypePong {
		t.Errorf("expected type=%q, got %q", MsgTypePong, pongResp.Type)
	}
}

// Note: TestMutationPollInterval, TestDefaultMutationPollInterval, and
// TestDaemonAcquireTimeout were removed when WebSocket polling was deprecated
// in favor of SSE endpoint /api/events
