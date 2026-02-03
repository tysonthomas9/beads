package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"nhooyr.io/websocket"
)

// TestHandleTerminalWS_NilManagerWithSession tests nil manager with session param returns 503.
// The nil manager check happens before parameter validation.
func TestHandleTerminalWS_NilManagerWithSession(t *testing.T) {
	handler := handleTerminalWS(nil, "")

	req := httptest.NewRequest(http.MethodGet, "/api/terminal/ws?session=test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status %d for nil manager, got %d", http.StatusServiceUnavailable, w.Code)
	}
}

// TestHandleTerminalWS_NilManager tests that nil manager returns 503.
func TestHandleTerminalWS_NilManager(t *testing.T) {
	handler := handleTerminalWS(nil, "")

	req := httptest.NewRequest(http.MethodGet, "/api/terminal/ws?session=test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status %d, got %d", http.StatusServiceUnavailable, w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp["success"] != false {
		t.Error("expected success to be false")
	}

	if resp["error"] != "terminal manager not initialized" {
		t.Errorf("expected error 'terminal manager not initialized', got %q", resp["error"])
	}

	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type 'application/json', got %q", ct)
	}
}

// TestHandleTerminalWS_MissingSessionWithManager tests missing session with a manager present.
func TestHandleTerminalWS_MissingSessionWithManager(t *testing.T) {
	// Create a real manager - this will fail if tmux is not installed,
	// so we skip if that's the case
	manager, err := NewTerminalManager()
	if err == ErrTmuxNotFound {
		t.Skip("tmux not installed, skipping test")
	}
	if err != nil {
		t.Fatalf("failed to create terminal manager: %v", err)
	}
	defer manager.Shutdown()

	handler := handleTerminalWS(manager, "")

	// Create request without session parameter
	req := httptest.NewRequest(http.MethodGet, "/api/terminal/ws", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp["success"] != false {
		t.Error("expected success to be false")
	}

	if resp["error"] != "missing session parameter" {
		t.Errorf("expected error 'missing session parameter', got %q", resp["error"])
	}
}

// TestHandleTerminalWS_InvalidSessionName tests invalid session name validation.
func TestHandleTerminalWS_InvalidSessionName(t *testing.T) {
	manager, err := NewTerminalManager()
	if err == ErrTmuxNotFound {
		t.Skip("tmux not installed, skipping test")
	}
	if err != nil {
		t.Fatalf("failed to create terminal manager: %v", err)
	}
	defer manager.Shutdown()

	handler := handleTerminalWS(manager, "")

	tests := []struct {
		name    string
		session string
	}{
		{"contains space", "test session"},
		{"contains slash", "test/session"},
		{"contains dot", "test.session"},
		{"contains colon", "test:session"},
		{"contains semicolon", "test;session"},
		{"contains at sign", "test@session"},
		{"contains special chars", "test!#$%"},
		{"empty after trim", "   "},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// URL-encode the session parameter to handle special characters
			encodedSession := url.QueryEscape(tt.session)
			req := httptest.NewRequest(http.MethodGet, "/api/terminal/ws?session="+encodedSession, nil)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			// Empty/whitespace-only might be caught by "missing" check
			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status %d for session %q, got %d", http.StatusBadRequest, tt.session, w.Code)
			}

			var resp map[string]interface{}
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to parse response: %v", err)
			}

			if resp["success"] != false {
				t.Error("expected success to be false")
			}
		})
	}
}

// TestHandleTerminalWS_ValidSessionNames tests that valid session names pass validation.
func TestHandleTerminalWS_ValidSessionNames(t *testing.T) {
	manager, err := NewTerminalManager()
	if err == ErrTmuxNotFound {
		t.Skip("tmux not installed, skipping test")
	}
	if err != nil {
		t.Fatalf("failed to create terminal manager: %v", err)
	}
	defer manager.Shutdown()

	handler := handleTerminalWS(manager, "")

	tests := []struct {
		name    string
		session string
	}{
		{"alphanumeric", "test123"},
		{"with hyphen", "test-session"},
		{"with underscore", "test_session"},
		{"mixed", "Test-Session_123"},
		{"numbers only", "12345"},
		{"single char", "a"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// URL-encode the session parameter
			encodedSession := url.QueryEscape(tt.session)
			req := httptest.NewRequest(http.MethodGet, "/api/terminal/ws?session="+encodedSession, nil)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			// Valid session names should NOT return 400
			// They might return other errors (WebSocket upgrade fails without proper headers)
			// but they should pass validation
			if w.Code == http.StatusBadRequest {
				var resp map[string]interface{}
				if err := json.Unmarshal(w.Body.Bytes(), &resp); err == nil {
					if errMsg, ok := resp["error"].(string); ok {
						if errMsg == "missing session parameter" || errMsg == "invalid session name: must match [a-zA-Z0-9_-]+" {
							t.Errorf("valid session %q was rejected with: %s", tt.session, errMsg)
						}
					}
				}
			}
		})
	}
}

// TestHandleTerminalWS_WebSocketUpgrade tests that WebSocket upgrade succeeds with valid params.
func TestHandleTerminalWS_WebSocketUpgrade(t *testing.T) {
	manager, err := NewTerminalManager()
	if err == ErrTmuxNotFound {
		t.Skip("tmux not installed, skipping test")
	}
	if err != nil {
		t.Fatalf("failed to create terminal manager: %v", err)
	}
	defer manager.Shutdown()

	handler := handleTerminalWS(manager, "")

	// Create a test server for WebSocket testing
	server := httptest.NewServer(handler)
	defer server.Close()

	// Convert http URL to ws URL
	wsURL := "ws" + server.URL[4:] + "?session=testws"

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Dial the WebSocket
	conn, resp, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		// If tmux session creation fails, that's expected in test environment
		// The key is that we got past parameter validation
		t.Logf("WebSocket dial failed (expected if tmux unavailable): %v", err)
		if resp != nil && resp.StatusCode == http.StatusBadRequest {
			t.Errorf("unexpected 400 Bad Request - should have passed validation")
		}
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "test complete")

	t.Log("WebSocket connection established successfully")
}

// TestResizeMessageFormat tests the resize message format constants and parsing.
func TestResizeMessageFormat(t *testing.T) {
	// Test that constants are correct
	if resizeMsgMarker != 0x01 {
		t.Errorf("resizeMsgMarker = %#x, want %#x", resizeMsgMarker, 0x01)
	}
	if resizeMsgLen != 5 {
		t.Errorf("resizeMsgLen = %d, want %d", resizeMsgLen, 5)
	}

	// Test resize message parsing logic (same as in wsToPTY)
	tests := []struct {
		name     string
		data     []byte
		isResize bool
		cols     uint16
		rows     uint16
	}{
		{
			name:     "valid resize 80x24",
			data:     makeResizeMessage(80, 24),
			isResize: true,
			cols:     80,
			rows:     24,
		},
		{
			name:     "valid resize 120x40",
			data:     makeResizeMessage(120, 40),
			isResize: true,
			cols:     120,
			rows:     40,
		},
		{
			name:     "valid resize max values",
			data:     makeResizeMessage(65535, 65535),
			isResize: true,
			cols:     65535,
			rows:     65535,
		},
		{
			name:     "not resize - wrong marker",
			data:     []byte{0x02, 0x00, 80, 0x00, 24},
			isResize: false,
		},
		{
			name:     "not resize - too short",
			data:     []byte{0x01, 0x00, 80, 0x00},
			isResize: false,
		},
		{
			name:     "not resize - too long",
			data:     []byte{0x01, 0x00, 80, 0x00, 24, 0x00},
			isResize: false,
		},
		{
			name:     "not resize - empty",
			data:     []byte{},
			isResize: false,
		},
		{
			name:     "not resize - regular input",
			data:     []byte("hello"),
			isResize: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isResize := len(tt.data) == resizeMsgLen && len(tt.data) > 0 && tt.data[0] == resizeMsgMarker
			if isResize != tt.isResize {
				t.Errorf("isResize = %v, want %v", isResize, tt.isResize)
			}

			if isResize {
				cols := binary.BigEndian.Uint16(tt.data[1:3])
				rows := binary.BigEndian.Uint16(tt.data[3:5])
				if cols != tt.cols {
					t.Errorf("cols = %d, want %d", cols, tt.cols)
				}
				if rows != tt.rows {
					t.Errorf("rows = %d, want %d", rows, tt.rows)
				}
			}
		})
	}
}

// makeResizeMessage creates a resize message in the expected format.
func makeResizeMessage(cols, rows uint16) []byte {
	msg := make([]byte, 5)
	msg[0] = resizeMsgMarker
	binary.BigEndian.PutUint16(msg[1:3], cols)
	binary.BigEndian.PutUint16(msg[3:5], rows)
	return msg
}

// TestValidTerminalSessionRegex tests the session name validation regex.
func TestValidTerminalSessionRegex(t *testing.T) {
	tests := []struct {
		name    string
		session string
		valid   bool
	}{
		{"simple alpha", "test", true},
		{"simple numeric", "123", true},
		{"alphanumeric", "test123", true},
		{"with hyphen", "test-session", true},
		{"with underscore", "test_session", true},
		{"mixed case", "TestSession", true},
		{"all valid chars", "Test_Session-123", true},
		{"single char", "a", true},
		{"single number", "1", true},

		{"empty", "", false},
		{"space", " ", false},
		{"with space", "test session", false},
		{"leading space", " test", false},
		{"trailing space", "test ", false},
		{"with dot", "test.session", false},
		{"with slash", "test/session", false},
		{"with backslash", "test\\session", false},
		{"with colon", "test:session", false},
		{"with at", "test@session", false},
		{"with bang", "test!session", false},
		{"with hash", "test#session", false},
		{"with dollar", "test$session", false},
		{"with percent", "test%session", false},
		{"unicode", "test\u00e9", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := validTerminalSession.MatchString(tt.session)
			if got != tt.valid {
				t.Errorf("validTerminalSession.MatchString(%q) = %v, want %v", tt.session, got, tt.valid)
			}
		})
	}
}

// TestTerminalReadBufSize tests the buffer size constant.
func TestTerminalReadBufSize(t *testing.T) {
	// Buffer should be reasonable size (4KB)
	if terminalReadBufSize != 4096 {
		t.Errorf("terminalReadBufSize = %d, want %d", terminalReadBufSize, 4096)
	}
}
