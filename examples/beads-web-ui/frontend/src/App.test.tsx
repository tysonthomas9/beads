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

// Create a hoisted mock for useIssues that can be shared across mock definitions
const { mockUseIssues, mockUseIssueDetail } = vi.hoisted(() => ({
  mockUseIssues: vi.fn(),
  mockUseIssueDetail: vi.fn(),
}));

// Mock the hooks barrel file - includes useIssues, useViewState, and filter hooks
vi.mock('@/hooks', () => ({
  useIssues: mockUseIssues,
  useViewState: vi.fn(() => ['kanban', vi.fn()]),
  useFilterState: vi.fn(() => [
    {}, // FilterState
    {
      setPriority: vi.fn(),
      setType: vi.fn(),
      setLabels: vi.fn(),
      setSearch: vi.fn(),
      setShowBlocked: vi.fn(),
      clearFilter: vi.fn(),
      clearAll: vi.fn(),
    }, // FilterActions
  ]),
  useIssueFilter: vi.fn((issues: unknown[]) => ({
    filteredIssues: issues,
    count: Array.isArray(issues) ? issues.length : 0,
    totalCount: Array.isArray(issues) ? issues.length : 0,
    hasActiveFilters: false,
    activeFilters: [],
  })),
  useDebounce: vi.fn((value: unknown) => value),
  useBlockedIssues: vi.fn(() => ({
    data: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
  useIssueDetail: mockUseIssueDetail,
}));

// Also mock the direct useIssues import path
vi.mock('@/hooks/useIssues', () => ({
  useIssues: mockUseIssues,
}));

// Import the mocked module for type-safe access
import { useIssues, useIssueDetail } from '@/hooks';

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

/**
 * Create default mock return value for useIssueDetail.
 */
function createMockUseIssueDetailReturn(overrides: Partial<{
  issueDetails: unknown;
  isLoading: boolean;
  error: string | null;
  fetchIssue: ReturnType<typeof vi.fn>;
  clearIssue: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    issueDetails: null,
    isLoading: false,
    error: null,
    fetchIssue: vi.fn(),
    clearIssue: vi.fn(),
    ...overrides,
  };
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default useIssueDetail mock
    mockUseIssueDetail.mockReturnValue(createMockUseIssueDetailReturn());
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

    it('renders ViewSwitcher in navigation slot', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      expect(screen.getByTestId('view-switcher')).toBeInTheDocument();
    });

    it('renders KanbanBoard in main content by default', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      // KanbanBoard renders with status columns
      expect(screen.getByRole('heading', { name: 'Open' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'In Progress' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Closed' })).toBeInTheDocument();
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
    /**
     * Helper to get ConnectionStatus element specifically.
     * ConnectionStatus has data-variant="inline" while DndContext's live region doesn't.
     */
    const getConnectionStatus = (container: HTMLElement) =>
      container.querySelector('[data-variant="inline"]');

    it('renders ConnectionStatus in the actions slot', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      const { container } = render(<App />);

      // ConnectionStatus renders with data-variant="inline"
      expect(getConnectionStatus(container)).toBeInTheDocument();
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

      const statusElement = getConnectionStatus(container);
      expect(statusElement).toBeInTheDocument();
    });
  });

  describe('connection states', () => {
    /**
     * Helper to get ConnectionStatus element via aria-label.
     * This distinguishes it from DndContext's live region which doesn't have an aria-label.
     */
    const getConnectionStatus = () =>
      screen.getByLabelText(/Connection status:/);

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

      const status = getConnectionStatus();
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

      const status = getConnectionStatus();
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

      const status = getConnectionStatus();
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

      const status = getConnectionStatus();
      expect(status).toHaveAttribute('data-state', 'connecting');
      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('ConnectionStatus has correct aria attributes', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      const status = screen.getByLabelText('Connection status: Connected');
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

      const retryButton = screen.getByRole('button', { name: /retry/i });
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

      // Note: ViewSwitcher has buttons (tabs), so we specifically check for retry button
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    it('does not show retry button when connected', () => {
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({
          connectionState: 'connected',
          reconnectAttempts: 2, // Even with attempts, no button when connected
        })
      );

      render(<App />);

      // Note: ViewSwitcher has buttons (tabs), so we specifically check for retry button
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });
  });

  describe('navigation layout behavior', () => {
    it('renders all navigation components together', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      // Verify all navigation components are present
      expect(screen.getByTestId('view-switcher')).toBeInTheDocument();
      expect(screen.getByTestId('search-input')).toBeInTheDocument();
      expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    });

    it('navigation contains ViewSwitcher, SearchInput, and FilterBar in correct order', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      const { container } = render(<App />);

      // Find the navigation bar container
      const navElement = container.querySelector('[data-testid="navigation-bar"]');
      expect(navElement).toBeInTheDocument();

      // Check that it contains all three components
      const viewSwitcher = navElement?.querySelector('[data-testid="view-switcher"]');
      const searchInput = navElement?.querySelector('[data-testid="search-input"]');
      const filterBar = navElement?.querySelector('[data-testid="filter-bar"]');

      expect(viewSwitcher).toBeInTheDocument();
      expect(searchInput).toBeInTheDocument();
      expect(filterBar).toBeInTheDocument();
    });

    it('navigation maintains component presence with filters', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      // All components should render even when filters are applied
      expect(screen.getByTestId('view-switcher')).toBeInTheDocument();
      expect(screen.getByTestId('search-input')).toBeInTheDocument();
      expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
      expect(screen.getByTestId('priority-filter')).toBeInTheDocument();
      expect(screen.getByTestId('type-filter')).toBeInTheDocument();
    });

    it('SearchInput has max-width constraint class', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      const searchInput = screen.getByTestId('search-input');

      // SearchInput should have its CSS module class applied (which includes max-width: 200px)
      expect(searchInput.className).toMatch(/searchInput/);
    });

    it('FilterBar has layout control class', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      const filterBar = screen.getByTestId('filter-bar');

      // FilterBar should have its CSS module class applied (which controls flex layout)
      expect(filterBar.className).toMatch(/filterBar/);
    });
  });

  describe('IssueDetailPanel integration', () => {
    it('renders IssueDetailPanel in closed state by default', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      const { container } = render(<App />);

      // Panel should be rendered but closed (isOpen=false)
      const panel = container.querySelector('[data-testid="issue-detail-panel"]');
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveAttribute('data-state', 'closed');
    });

    it('opens panel when issue is clicked in SwimLaneBoard', () => {
      const fetchIssue = vi.fn();
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn({
        issues: [
          {
            id: 'issue-1',
            title: 'Test Issue',
            priority: 2,
            status: 'open',
            issue_type: 'task',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      }));
      vi.mocked(useIssueDetail).mockReturnValue(createMockUseIssueDetailReturn({
        fetchIssue,
      }));

      const { container } = render(<App />);

      // Click on the issue card
      const issueCard = screen.getByText('Test Issue');
      fireEvent.click(issueCard);

      // Panel should now be open
      const panel = container.querySelector('[data-testid="issue-detail-panel"]');
      expect(panel).toHaveAttribute('data-state', 'open');
    });

    it('calls fetchIssue with correct ID when issue is clicked', () => {
      const fetchIssue = vi.fn();
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn({
        issues: [
          {
            id: 'issue-123',
            title: 'Clickable Issue',
            priority: 2,
            status: 'open',
            issue_type: 'task',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      }));
      vi.mocked(useIssueDetail).mockReturnValue(createMockUseIssueDetailReturn({
        fetchIssue,
      }));

      render(<App />);

      // Click on the issue card
      const issueCard = screen.getByText('Clickable Issue');
      fireEvent.click(issueCard);

      // fetchIssue should be called with the correct ID
      expect(fetchIssue).toHaveBeenCalledTimes(1);
      expect(fetchIssue).toHaveBeenCalledWith('issue-123');
    });

    it('closes panel when onClose is called', async () => {
      const clearIssue = vi.fn();
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn({
        issues: [
          {
            id: 'issue-1',
            title: 'Closeable Issue',
            priority: 2,
            status: 'open',
            issue_type: 'task',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      }));
      // Provide issueDetails so that IssueHeader renders with the close button
      vi.mocked(useIssueDetail).mockReturnValue(createMockUseIssueDetailReturn({
        issueDetails: {
          id: 'issue-1',
          title: 'Closeable Issue Details',
          priority: 2,
          status: 'open',
          issue_type: 'task',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        clearIssue,
      }));

      const { container } = render(<App />);

      // Click on the issue card (uses aria-label "Issue: {title}")
      const issueCard = screen.getByRole('button', { name: /Issue: Closeable Issue/ });
      fireEvent.click(issueCard);

      // Panel should be open
      const panel = container.querySelector('[data-testid="issue-detail-panel"]');
      expect(panel).toHaveAttribute('data-state', 'open');

      // Click the close button (rendered by IssueHeader inside DefaultContent)
      const closeButton = screen.getByTestId('header-close-button');
      fireEvent.click(closeButton);

      // Panel should close immediately
      expect(panel).toHaveAttribute('data-state', 'closed');
    });

    it('does not re-fetch when clicking the same issue that is already selected and open', () => {
      const fetchIssue = vi.fn();
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn({
        issues: [
          {
            id: 'issue-1',
            title: 'Same Issue',
            priority: 2,
            status: 'open',
            issue_type: 'task',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      }));
      vi.mocked(useIssueDetail).mockReturnValue(createMockUseIssueDetailReturn({
        fetchIssue,
      }));

      render(<App />);

      // Click on the issue card twice
      const issueCard = screen.getByText('Same Issue');
      fireEvent.click(issueCard);

      expect(fetchIssue).toHaveBeenCalledTimes(1);

      // Click again on the same issue
      fireEvent.click(issueCard);

      // fetchIssue should NOT be called again
      expect(fetchIssue).toHaveBeenCalledTimes(1);
    });

    it('passes loading state to IssueDetailPanel during fetch', () => {
      const fetchIssue = vi.fn();
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn({
        issues: [
          {
            id: 'issue-1',
            title: 'Loading Issue',
            priority: 2,
            status: 'open',
            issue_type: 'task',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      }));
      vi.mocked(useIssueDetail).mockReturnValue(createMockUseIssueDetailReturn({
        isLoading: true,
        fetchIssue,
      }));

      const { container } = render(<App />);

      // Click on the issue to open the panel
      const issueCard = screen.getByText('Loading Issue');
      fireEvent.click(issueCard);

      // Panel should show loading state
      const panel = container.querySelector('[data-testid="issue-detail-panel"]');
      expect(panel).toHaveAttribute('data-loading', 'true');
    });

    it('passes issue details to IssueDetailPanel when loaded', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn({
        issues: [
          {
            id: 'issue-1',
            title: 'Detail Issue',
            priority: 2,
            status: 'open',
            issue_type: 'task',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      }));
      vi.mocked(useIssueDetail).mockReturnValue(createMockUseIssueDetailReturn({
        issueDetails: {
          id: 'issue-1',
          title: 'Detail Issue Title',
          description: 'Issue description',
          priority: 2,
          status: 'open',
          issue_type: 'task',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        isLoading: false,
      }));

      render(<App />);

      // Click on the issue to open the panel
      const issueCard = screen.getByText('Detail Issue');
      fireEvent.click(issueCard);

      // Panel should show the issue title
      expect(screen.getByText('Detail Issue Title')).toBeInTheDocument();
    });

    it('passes error state to IssueDetailPanel when fetch fails', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn({
        issues: [
          {
            id: 'issue-1',
            title: 'Error Issue',
            priority: 2,
            status: 'open',
            issue_type: 'task',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      }));
      vi.mocked(useIssueDetail).mockReturnValue(createMockUseIssueDetailReturn({
        error: 'Failed to fetch issue details',
        isLoading: false,
      }));

      const { container } = render(<App />);

      // Click on the issue to open the panel
      const issueCard = screen.getByText('Error Issue');
      fireEvent.click(issueCard);

      // Panel should show the error
      const panel = container.querySelector('[data-testid="issue-detail-panel"]');
      expect(panel).toHaveAttribute('data-error', 'true');
    });
  });
});
