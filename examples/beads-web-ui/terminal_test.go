package main

import (
	"errors"
	"os/exec"
	"testing"
	"time"
)

// hasTmux reports whether tmux is available on the system.
func hasTmux() bool {
	_, err := exec.LookPath("tmux")
	return err == nil
}

// skipIfNoTmux skips the test if tmux is not installed.
func skipIfNoTmux(t *testing.T) {
	t.Helper()
	if !hasTmux() {
		t.Skip("tmux not available, skipping test")
	}
}

// killTmuxSession is a cleanup helper that kills a tmux session by name.
func killTmuxSession(t *testing.T, name string) {
	t.Helper()
	cmd := exec.Command("tmux", "kill-session", "-t", name)
	_ = cmd.Run() // ignore error if session doesn't exist
}

// tmuxSessionExists checks whether a tmux session with the given name exists.
func tmuxSessionExists(name string) bool {
	cmd := exec.Command("tmux", "has-session", "-t", name)
	return cmd.Run() == nil
}

// TestTerminalNewManagerTmuxNotFound verifies that NewTerminalManager returns
// ErrTmuxNotFound when tmux is not in PATH, or succeeds when it is.
func TestTerminalNewManagerTmuxNotFound(t *testing.T) {
	_, err := NewTerminalManager()
	if hasTmux() {
		if err != nil {
			t.Fatalf("expected NewTerminalManager to succeed when tmux is installed, got: %v", err)
		}
	} else {
		if !errors.Is(err, ErrTmuxNotFound) {
			t.Fatalf("expected ErrTmuxNotFound, got: %v", err)
		}
	}
}

// TestTerminalNewManagerSuccess verifies that NewTerminalManager succeeds when
// tmux is available and returns a properly initialized manager.
func TestTerminalNewManagerSuccess(t *testing.T) {
	skipIfNoTmux(t)

	mgr, err := NewTerminalManager()
	if err != nil {
		t.Fatalf("NewTerminalManager() error: %v", err)
	}
	if mgr == nil {
		t.Fatal("NewTerminalManager() returned nil manager")
	}
	if mgr.tmuxPath == "" {
		t.Error("expected tmuxPath to be set")
	}
	if mgr.sessions == nil {
		t.Error("expected sessions map to be initialized")
	}
	if mgr.defaultCols != 80 {
		t.Errorf("expected defaultCols=80, got %d", mgr.defaultCols)
	}
	if mgr.defaultRows != 24 {
		t.Errorf("expected defaultRows=24, got %d", mgr.defaultRows)
	}
}

// TestTerminalGetOrCreate verifies that GetOrCreate creates a new tmux session,
// returns a non-nil PTY, and the tmux session is visible via has-session.
func TestTerminalGetOrCreate(t *testing.T) {
	skipIfNoTmux(t)

	mgr, err := NewTerminalManager()
	if err != nil {
		t.Fatalf("NewTerminalManager() error: %v", err)
	}

	name := "test-" + t.Name()
	t.Cleanup(func() {
		mgr.Shutdown()
		killTmuxSession(t, name)
	})

	session, err := mgr.GetOrCreate(name, "", 80, 24)
	if err != nil {
		t.Fatalf("GetOrCreate() error: %v", err)
	}
	if session == nil {
		t.Fatal("GetOrCreate() returned nil session")
	}
	if session.PTY == nil {
		t.Error("expected PTY to be non-nil")
	}
	if session.Name != name {
		t.Errorf("expected session name %q, got %q", name, session.Name)
	}

	// Verify the tmux session exists.
	if !tmuxSessionExists(name) {
		t.Error("expected tmux session to exist after GetOrCreate")
	}
}

// TestTerminalGetOrCreateDisplacement verifies that calling GetOrCreate twice
// for the same session name closes the old PTY and returns a new one.
func TestTerminalGetOrCreateDisplacement(t *testing.T) {
	skipIfNoTmux(t)

	mgr, err := NewTerminalManager()
	if err != nil {
		t.Fatalf("NewTerminalManager() error: %v", err)
	}

	name := "test-" + t.Name()
	t.Cleanup(func() {
		mgr.Shutdown()
		killTmuxSession(t, name)
	})

	session1, err := mgr.GetOrCreate(name, "", 80, 24)
	if err != nil {
		t.Fatalf("first GetOrCreate() error: %v", err)
	}
	oldPTY := session1.PTY

	// Give tmux a moment to settle.
	time.Sleep(100 * time.Millisecond)

	session2, err := mgr.GetOrCreate(name, "", 80, 24)
	if err != nil {
		t.Fatalf("second GetOrCreate() error: %v", err)
	}

	// The new session should have a different PTY fd.
	if session2.PTY == oldPTY {
		t.Error("expected new PTY after displacement, got same pointer")
	}

	// The old PTY should be closed (writing to it should fail).
	_, writeErr := oldPTY.Write([]byte("test"))
	if writeErr == nil {
		t.Error("expected write to old PTY to fail after displacement")
	}

	// The tmux session should still exist (not killed, just re-attached).
	if !tmuxSessionExists(name) {
		t.Error("expected tmux session to still exist after displacement")
	}
}

// TestTerminalResize verifies that Resize succeeds on an active session.
func TestTerminalResize(t *testing.T) {
	skipIfNoTmux(t)

	mgr, err := NewTerminalManager()
	if err != nil {
		t.Fatalf("NewTerminalManager() error: %v", err)
	}

	name := "test-" + t.Name()
	t.Cleanup(func() {
		mgr.Shutdown()
		killTmuxSession(t, name)
	})

	_, err = mgr.GetOrCreate(name, "", 80, 24)
	if err != nil {
		t.Fatalf("GetOrCreate() error: %v", err)
	}

	// Give tmux a moment to settle before resizing.
	time.Sleep(100 * time.Millisecond)

	if err := mgr.Resize(name, 120, 40); err != nil {
		t.Fatalf("Resize() error: %v", err)
	}
}

// TestTerminalDetach verifies that Detach closes the Go-side session but leaves
// the tmux session alive.
func TestTerminalDetach(t *testing.T) {
	skipIfNoTmux(t)

	mgr, err := NewTerminalManager()
	if err != nil {
		t.Fatalf("NewTerminalManager() error: %v", err)
	}

	name := "test-" + t.Name()
	t.Cleanup(func() {
		killTmuxSession(t, name)
	})

	_, err = mgr.GetOrCreate(name, "", 80, 24)
	if err != nil {
		t.Fatalf("GetOrCreate() error: %v", err)
	}

	if err := mgr.Detach(name); err != nil {
		t.Fatalf("Detach() error: %v", err)
	}

	// The tmux session should still exist.
	if !tmuxSessionExists(name) {
		t.Error("expected tmux session to still exist after Detach")
	}

	// The Go session should be removed — Resize should fail.
	if err := mgr.Resize(name, 100, 30); err == nil {
		t.Error("expected Resize to fail after Detach, got nil error")
	}
}

// TestTerminalShutdown verifies that Shutdown kills all tmux sessions and
// cleans up all Go sessions.
func TestTerminalShutdown(t *testing.T) {
	skipIfNoTmux(t)

	mgr, err := NewTerminalManager()
	if err != nil {
		t.Fatalf("NewTerminalManager() error: %v", err)
	}

	name1 := "test-" + t.Name() + "-1"
	name2 := "test-" + t.Name() + "-2"
	t.Cleanup(func() {
		killTmuxSession(t, name1)
		killTmuxSession(t, name2)
	})

	_, err = mgr.GetOrCreate(name1, "", 80, 24)
	if err != nil {
		t.Fatalf("GetOrCreate(%q) error: %v", name1, err)
	}
	_, err = mgr.GetOrCreate(name2, "", 80, 24)
	if err != nil {
		t.Fatalf("GetOrCreate(%q) error: %v", name2, err)
	}

	if err := mgr.Shutdown(); err != nil {
		t.Fatalf("Shutdown() error: %v", err)
	}

	// Give tmux a moment to clean up.
	time.Sleep(200 * time.Millisecond)

	if tmuxSessionExists(name1) {
		t.Errorf("expected tmux session %q to be killed after Shutdown", name1)
	}
	if tmuxSessionExists(name2) {
		t.Errorf("expected tmux session %q to be killed after Shutdown", name2)
	}
}

// TestTerminalResizeNonexistent verifies that Resize returns an error for a
// session that does not exist in the manager.
func TestTerminalResizeNonexistent(t *testing.T) {
	skipIfNoTmux(t)

	mgr, err := NewTerminalManager()
	if err != nil {
		t.Fatalf("NewTerminalManager() error: %v", err)
	}

	err = mgr.Resize("nonexistent-session", 80, 24)
	if err == nil {
		t.Fatal("expected Resize on nonexistent session to return error")
	}
}

// TestTerminalDetachNonexistent verifies that Detach returns an error for a
// session that does not exist in the manager.
func TestTerminalDetachNonexistent(t *testing.T) {
	skipIfNoTmux(t)

	mgr, err := NewTerminalManager()
	if err != nil {
		t.Fatalf("NewTerminalManager() error: %v", err)
	}

	err = mgr.Detach("nonexistent-session")
	if err == nil {
		t.Fatal("expected Detach on nonexistent session to return error")
	}
}
