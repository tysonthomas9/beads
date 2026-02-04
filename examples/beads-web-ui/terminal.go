package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"regexp"
	"sync"

	"github.com/creack/pty"
)

// ErrTmuxNotFound is returned when tmux binary is not in PATH.
var ErrTmuxNotFound = errors.New("tmux binary not found in PATH")

// validSessionName matches alphanumeric characters, hyphens, and underscores.
var validSessionName = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// TerminalSession represents a single active PTY connection to a tmux session.
type TerminalSession struct {
	Name    string   // tmux session name (e.g., "lead")
	Command string   // command running in the session
	PTY     *os.File // PTY master fd from creack/pty
	cmd     *exec.Cmd
	mu      sync.Mutex
	closed  bool
}

// Close closes the PTY and waits for the tmux attach process to exit.
// It is safe to call multiple times.
func (s *TerminalSession) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true

	var firstErr error
	if s.PTY != nil {
		if err := s.PTY.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if s.cmd != nil && s.cmd.Process != nil {
		// Wait for process to exit after PTY close.
		// Ignore error — process may have already exited.
		_ = s.cmd.Wait()
	}
	return firstErr
}

// TerminalManager manages tmux session lifecycles.
type TerminalManager struct {
	sessions       map[string]*TerminalSession
	mu             sync.RWMutex
	tmuxPath       string
	defaultCommand string // default command when client doesn't specify one
	defaultCols    uint16
	defaultRows    uint16
}

// NewTerminalManager creates a manager. Returns ErrTmuxNotFound if tmux is not installed.
// The defaultCommand parameter specifies what command to run when a client doesn't specify one.
func NewTerminalManager(defaultCommand string) (*TerminalManager, error) {
	tmuxPath, err := exec.LookPath("tmux")
	if err != nil {
		return nil, ErrTmuxNotFound
	}
	return &TerminalManager{
		sessions:       make(map[string]*TerminalSession),
		tmuxPath:       tmuxPath,
		defaultCommand: defaultCommand,
		defaultCols:    80,
		defaultRows:    24,
	}, nil
}

// tmuxHasSession checks whether a tmux session with the given name exists.
func (m *TerminalManager) tmuxHasSession(name string) bool {
	cmd := exec.Command(m.tmuxPath, "has-session", "-t", name)
	return cmd.Run() == nil
}

// tmuxNewSession creates a new detached tmux session with the given name, size, and command.
// Enables mouse mode so wheel events are forwarded to the application inside tmux.
func (m *TerminalManager) tmuxNewSession(name, command string, cols, rows uint16) error {
	args := []string{
		"new-session", "-d",
		"-s", name,
		"-x", fmt.Sprintf("%d", cols),
		"-y", fmt.Sprintf("%d", rows),
	}
	if command != "" {
		args = append(args, command)
	}
	cmd := exec.Command(m.tmuxPath, args...)
	if err := cmd.Run(); err != nil {
		return err
	}

	// Enable mouse mode so wheel events reach the application inside tmux
	mouseCmd := exec.Command(m.tmuxPath, "set-option", "-t", name, "mouse", "on")
	if err := mouseCmd.Run(); err != nil {
		log.Printf("Warning: failed to enable mouse mode for session %q: %v", name, err)
	}

	return nil
}

// tmuxAttach spawns a tmux attach-session process with a PTY.
func (m *TerminalManager) tmuxAttach(name string) (*exec.Cmd, *os.File, error) {
	cmd := exec.Command(m.tmuxPath, "attach-session", "-t", name)
	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, nil, fmt.Errorf("pty.Start tmux attach: %w", err)
	}
	return cmd, ptmx, nil
}

// GetOrCreate returns a TerminalSession for the named tmux session.
// If the tmux session doesn't exist, it creates one with the given command.
// If command is empty, uses the manager's default command.
// If an active connection exists, it displaces it (closes old PTY, spawns new attach).
func (m *TerminalManager) GetOrCreate(name, command string, cols, rows uint16) (*TerminalSession, error) {
	if !validSessionName.MatchString(name) {
		return nil, fmt.Errorf("invalid session name %q: must match [a-zA-Z0-9_-]+", name)
	}
	if cols == 0 {
		cols = m.defaultCols
	}
	if rows == 0 {
		rows = m.defaultRows
	}
	if command == "" {
		command = m.defaultCommand
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Displace existing connection if any.
	if old, ok := m.sessions[name]; ok {
		old.Close()
		delete(m.sessions, name)
	}

	// Create tmux session if it doesn't exist.
	if !m.tmuxHasSession(name) {
		if err := m.tmuxNewSession(name, command, cols, rows); err != nil {
			return nil, fmt.Errorf("tmux new-session: %w", err)
		}
	}

	// Attach with a fresh PTY.
	cmd, ptmx, err := m.tmuxAttach(name)
	if err != nil {
		return nil, err
	}

	// Set initial size.
	if err := pty.Setsize(ptmx, &pty.Winsize{Cols: cols, Rows: rows}); err != nil {
		ptmx.Close()
		_ = cmd.Wait()
		return nil, fmt.Errorf("pty.Setsize: %w", err)
	}

	session := &TerminalSession{
		Name:    name,
		Command: command,
		PTY:     ptmx,
		cmd:     cmd,
	}
	m.sessions[name] = session
	return session, nil
}

// Resize changes the PTY and tmux window dimensions for a session.
func (m *TerminalManager) Resize(name string, cols, rows uint16) error {
	m.mu.RLock()
	session, ok := m.sessions[name]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("session %q not found", name)
	}

	session.mu.Lock()
	defer session.mu.Unlock()

	if session.closed {
		return fmt.Errorf("session %q is closed", name)
	}

	if err := pty.Setsize(session.PTY, &pty.Winsize{Cols: cols, Rows: rows}); err != nil {
		return fmt.Errorf("pty.Setsize: %w", err)
	}

	// Also tell tmux to resize the window so content reflows properly.
	cmd := exec.Command(m.tmuxPath, "resize-window", "-t", name, "-x", fmt.Sprintf("%d", cols), "-y", fmt.Sprintf("%d", rows))
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("tmux resize-window: %w", err)
	}

	return nil
}

// Detach closes the PTY connection to a session without killing the tmux session.
func (m *TerminalManager) Detach(name string) error {
	m.mu.Lock()
	session, ok := m.sessions[name]
	if ok {
		delete(m.sessions, name)
	}
	m.mu.Unlock()

	if !ok {
		return fmt.Errorf("session %q not found", name)
	}

	return session.Close()
}

// Shutdown kills all tmux sessions and cleans up all PTYs.
func (m *TerminalManager) Shutdown() error {
	m.mu.Lock()
	sessions := make(map[string]*TerminalSession, len(m.sessions))
	for k, v := range m.sessions {
		sessions[k] = v
	}
	m.sessions = make(map[string]*TerminalSession)
	m.mu.Unlock()

	// Close all PTYs first.
	for name, session := range sessions {
		if err := session.Close(); err != nil {
			log.Printf("Warning: error closing session %q: %v", name, err)
		}
	}

	// Kill tmux sessions.
	for name := range sessions {
		cmd := exec.Command(m.tmuxPath, "kill-session", "-t", name)
		if err := cmd.Run(); err != nil {
			log.Printf("Warning: error killing tmux session %q: %v", name, err)
		}
	}

	return nil
}
