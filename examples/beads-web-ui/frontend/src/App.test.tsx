/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for App component.
 * Tests the integration between App, useIssues hook, and ConnectionStatus component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import App from './App';
import type { ConnectionState } from '@/api/websocket';
import type { UseIssuesReturn } from '@/hooks/useIssues';

// Mock useIssues hook
vi.mock('@/hooks', () => ({
  useIssues: vi.fn(),
}));

// Import the mocked module for type-safe access
import { useIssues } from '@/hooks';

/**
 * Helper to create a mock useIssues return value.
 */
function createMockUseIssuesReturn(
  overrides: Partial<UseIssuesReturn> = {}
): UseIssuesReturn {
  return {
    issues: [],
    issuesMap: new Map(),
    isLoading: false,
    error: null,
    connectionState: 'connected' as ConnectionState,
    isConnected: true,
    reconnectAttempts: 0,
    refetch: vi.fn(),
    updateIssueStatus: vi.fn(),
    getIssue: vi.fn(),
    mutationCount: 0,
    retryConnection: vi.fn(),
    ...overrides,
  };
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders without crashing', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('renders AppLayout with default title "Beads"', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      expect(screen.getByRole('heading', { name: 'Beads' })).toBeInTheDocument();
    });

    it('renders main content text', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      expect(
        screen.getByText('Task management interface for beads.')
      ).toBeInTheDocument();
    });
  });

  describe('useIssues integration', () => {
    it('calls useIssues hook on render', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      expect(useIssues).toHaveBeenCalled();
    });
  });

  describe('ConnectionStatus integration', () => {
    it('renders ConnectionStatus in the actions slot', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      // ConnectionStatus renders with role="status"
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('passes connectionState to ConnectionStatus', () => {
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'connected',
        })
      );

      render(<App />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
      expect(
        screen.getByLabelText('Connection status: Connected')
      ).toBeInTheDocument();
    });

    it('passes reconnectAttempts to ConnectionStatus', () => {
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'reconnecting',
          reconnectAttempts: 3,
        })
      );

      render(<App />);

      expect(
        screen.getByText('Reconnecting (attempt 3)...')
      ).toBeInTheDocument();
    });

    it('passes retryConnection to ConnectionStatus onRetry', () => {
      const retryConnection = vi.fn();
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'reconnecting',
          reconnectAttempts: 2,
          retryConnection,
        })
      );

      render(<App />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      expect(retryConnection).toHaveBeenCalledTimes(1);
    });

    it('renders ConnectionStatus with variant="inline"', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      const { container } = render(<App />);

      const statusElement = container.querySelector('[data-variant="inline"]');
      expect(statusElement).toBeInTheDocument();
    });
  });

  describe('connection states', () => {
    it.each<[ConnectionState, string]>([
      ['connected', 'Connected'],
      ['connecting', 'Connecting...'],
      ['disconnected', 'Disconnected'],
      ['reconnecting', 'Reconnecting...'],
    ])('displays correct text for "%s" state', (state, expectedText) => {
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: state,
          reconnectAttempts: 0,
        })
      );

      render(<App />);

      expect(screen.getByText(expectedText)).toBeInTheDocument();
    });

    it('shows connected state correctly', () => {
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'connected',
          isConnected: true,
          reconnectAttempts: 0,
        })
      );

      render(<App />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('data-state', 'connected');
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('shows disconnected state correctly', () => {
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'disconnected',
          isConnected: false,
          reconnectAttempts: 0,
        })
      );

      render(<App />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('data-state', 'disconnected');
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    it('shows reconnecting state with retry button when attempts > 0', () => {
      const retryConnection = vi.fn();
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'reconnecting',
          isConnected: false,
          reconnectAttempts: 5,
          retryConnection,
        })
      );

      render(<App />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('data-state', 'reconnecting');
      expect(
        screen.getByText('Reconnecting (attempt 5)...')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('shows connecting state correctly', () => {
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'connecting',
          isConnected: false,
          reconnectAttempts: 0,
        })
      );

      render(<App />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('data-state', 'connecting');
      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('ConnectionStatus has correct aria attributes', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status).toHaveAttribute(
        'aria-label',
        'Connection status: Connected'
      );
    });

    it('retry button has accessible label', () => {
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'reconnecting',
          reconnectAttempts: 1,
        })
      );

      render(<App />);

      const retryButton = screen.getByRole('button');
      expect(retryButton).toHaveAttribute('aria-label', 'Retry connection now');
    });
  });

  describe('edge cases', () => {
    it('handles state changes correctly', () => {
      const { rerender } = render(<App />);
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'connected',
        })
      );

      rerender(<App />);
      expect(screen.getByText('Connected')).toBeInTheDocument();

      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'reconnecting',
          reconnectAttempts: 1,
        })
      );

      rerender(<App />);
      expect(
        screen.getByText('Reconnecting (attempt 1)...')
      ).toBeInTheDocument();

      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'connected',
        })
      );

      rerender(<App />);
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('does not show retry button when reconnectAttempts is 0', () => {
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'reconnecting',
          reconnectAttempts: 0,
        })
      );

      render(<App />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('does not show retry button when connected', () => {
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'connected',
          reconnectAttempts: 2, // Even with attempts, no button when connected
        })
      );

      render(<App />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
