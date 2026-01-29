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

// Create hoisted mocks that can be shared across mock definitions
const { mockUseIssues, mockUseIssueDetail, mockUseViewState, mockUseToast } = vi.hoisted(() => ({
  mockUseIssues: vi.fn(),
  mockUseIssueDetail: vi.fn(),
  mockUseViewState: vi.fn(),
  mockUseToast: vi.fn(() => ({
    toasts: [],
    showToast: vi.fn(),
    dismissToast: vi.fn(),
    dismissAll: vi.fn(),
  })),
}));

// Mock the hooks barrel file - includes useIssues, useViewState, useIssueDetail, and filter hooks
vi.mock('@/hooks', () => ({
  useIssues: mockUseIssues,
  useViewState: mockUseViewState,
  useIssueDetail: mockUseIssueDetail,
  useToast: mockUseToast,
  useFilterState: vi.fn(() => [
    {}, // FilterState
    {
      setPriority: vi.fn(),
      setType: vi.fn(),
      setLabels: vi.fn(),
      setSearch: vi.fn(),
      setShowBlocked: vi.fn(),
      setGroupBy: vi.fn(),
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
  useSort: vi.fn((options: { data: unknown[] }) => ({
    sortedData: options.data,
    sortState: { key: null, direction: 'asc' },
    handleSort: vi.fn(),
    clearSort: vi.fn(),
  })),
  useAgents: vi.fn(() => ({
    agents: [],
    tasks: { needs_planning: 0, ready_to_implement: 0, in_progress: 0, need_review: 0, blocked: 0 },
    taskLists: { needsPlanning: [], readyToImplement: [], needsReview: [], inProgress: [], blocked: [] },
    agentTasks: {},
    sync: { db_synced: true, db_last_sync: '', git_needs_push: 0, git_needs_pull: 0 },
    stats: { open: 0, closed: 0, total: 0, completion: 0 },
    isLoading: false,
    isConnected: true,
    connectionState: 'connected',
    wasEverConnected: true,
    retryCountdown: 0,
    error: null,
    lastUpdated: null,
    refetch: vi.fn(),
    retryNow: vi.fn(),
  })),
}));

// Also mock the direct useIssues import path
vi.mock('@/hooks/useIssues', () => ({
  useIssues: mockUseIssues,
}));

// Import the mocked modules for type-safe access
import { useIssues, useIssueDetail, useViewState } from '@/hooks';
import type { UseIssueDetailReturn } from '@/hooks/useIssueDetail';
import type { Issue } from '@/types';

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
 * Helper to create a mock useIssueDetail return value.
 */
function createMockUseIssueDetailReturn(
  overrides: Partial<UseIssueDetailReturn> = {}
): UseIssueDetailReturn {
  return {
    issueDetails: null,
    isLoading: false,
    error: null,
    fetchIssue: vi.fn(),
    clearIssue: vi.fn(),
    ...overrides,
  };
}

/**
 * Helper to create a mock Issue for testing.
 */
function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: `issue-${Math.random().toString(36).slice(2, 9)}`,
    title: 'Test Issue',
    priority: 2,
    status: 'open',
    issue_type: 'task',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mock returns
    vi.mocked(useViewState).mockReturnValue(['kanban', vi.fn()]);
    vi.mocked(useIssueDetail).mockReturnValue(createMockUseIssueDetailReturn());
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
    it('renders IssueDetailPanel component', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      // IssueDetailPanel renders even when closed (for animation)
      expect(screen.getByTestId('issue-detail-panel')).toBeInTheDocument();
    });

    it('calls useIssueDetail hook on render', () => {
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      expect(useIssueDetail).toHaveBeenCalled();
    });

    it('opens panel and fetches details when issue card is clicked in kanban view', () => {
      const mockFetchIssue = vi.fn();
      vi.mocked(useIssueDetail).mockReturnValue(
        createMockUseIssueDetailReturn({ fetchIssue: mockFetchIssue })
      );
      const testIssue = createMockIssue({ id: 'test-issue-1', title: 'Clickable Issue' });
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({ issues: [testIssue] })
      );

      render(<App />);

      // Click the issue card
      const card = screen.getByRole('button', { name: /Issue: Clickable Issue/i });
      fireEvent.click(card);

      // Verify fetchIssue was called with the issue ID
      expect(mockFetchIssue).toHaveBeenCalledTimes(1);
      expect(mockFetchIssue).toHaveBeenCalledWith('test-issue-1');
    });

    it('opens panel and fetches details when row is clicked in table view', () => {
      const mockFetchIssue = vi.fn();
      vi.mocked(useIssueDetail).mockReturnValue(
        createMockUseIssueDetailReturn({ fetchIssue: mockFetchIssue })
      );
      vi.mocked(useViewState).mockReturnValue(['table', vi.fn()]);
      const testIssue = createMockIssue({ id: 'table-issue-1', title: 'Table Row Issue' });
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({ issues: [testIssue] })
      );

      render(<App />);

      // Click the table row
      const row = screen.getByRole('row', { name: /Table Row Issue/i });
      fireEvent.click(row);

      // Verify fetchIssue was called with the issue ID
      expect(mockFetchIssue).toHaveBeenCalledTimes(1);
      expect(mockFetchIssue).toHaveBeenCalledWith('table-issue-1');
    });

    it('does not re-fetch when clicking same issue that is already open', () => {
      const mockFetchIssue = vi.fn();
      vi.mocked(useIssueDetail).mockReturnValue(
        createMockUseIssueDetailReturn({ fetchIssue: mockFetchIssue })
      );
      const testIssue = createMockIssue({ id: 'repeat-issue', title: 'Repeat Click Issue' });
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({ issues: [testIssue] })
      );

      render(<App />);

      // Click the issue card first time
      const card = screen.getByRole('button', { name: /Issue: Repeat Click Issue/i });
      fireEvent.click(card);

      expect(mockFetchIssue).toHaveBeenCalledTimes(1);

      // Click the same issue card again
      fireEvent.click(card);

      // Should not call fetchIssue again
      expect(mockFetchIssue).toHaveBeenCalledTimes(1);
    });

    it('closes panel when onClose is triggered', async () => {
      const mockClearIssue = vi.fn();
      vi.mocked(useIssueDetail).mockReturnValue(
        createMockUseIssueDetailReturn({ clearIssue: mockClearIssue })
      );
      const testIssue = createMockIssue({ id: 'close-test', title: 'Close Test Issue' });
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({ issues: [testIssue] })
      );

      render(<App />);

      // Open the panel by clicking an issue
      const card = screen.getByRole('button', { name: /Issue: Close Test Issue/i });
      fireEvent.click(card);

      // Find the overlay and click it to close
      const overlay = screen.getByTestId('issue-detail-overlay');
      fireEvent.click(overlay);

      // clearIssue should be called after the animation timeout (300ms)
      // For unit tests, we verify the close callback was triggered
      // The panel should no longer have the 'open' class
      expect(overlay.className).not.toMatch(/_open_/);
    });

    it('passes loading state to IssueDetailPanel', () => {
      vi.mocked(useIssueDetail).mockReturnValue(
        createMockUseIssueDetailReturn({ isLoading: true })
      );
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      // Panel should show loading skeleton when isLoading is true
      const panel = screen.getByTestId('issue-detail-panel');
      expect(panel).toBeInTheDocument();
    });

    it('passes error state to IssueDetailPanel', () => {
      vi.mocked(useIssueDetail).mockReturnValue(
        createMockUseIssueDetailReturn({ error: 'Failed to fetch issue' })
      );
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      // Panel should be present with error state
      const panel = screen.getByTestId('issue-detail-panel');
      expect(panel).toBeInTheDocument();
    });

    it('passes fetched issue details to IssueDetailPanel', () => {
      const mockIssueDetails = {
        id: 'details-issue',
        title: 'Issue With Details',
        priority: 1 as const,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        description: 'Detailed description',
        dependents: [],
        dependencies: [],
      };
      vi.mocked(useIssueDetail).mockReturnValue(
        createMockUseIssueDetailReturn({ issueDetails: mockIssueDetails })
      );
      vi.mocked(useIssues).mockReturnValue(createMockUseIssuesReturn());

      render(<App />);

      // Panel should be rendered with the issue details
      const panel = screen.getByTestId('issue-detail-panel');
      expect(panel).toBeInTheDocument();
    });

    it('fetches different issue when clicking a new issue after one is already open', () => {
      const mockFetchIssue = vi.fn();
      vi.mocked(useIssueDetail).mockReturnValue(
        createMockUseIssueDetailReturn({ fetchIssue: mockFetchIssue })
      );
      const issue1 = createMockIssue({ id: 'issue-1', title: 'First Issue' });
      const issue2 = createMockIssue({ id: 'issue-2', title: 'Second Issue' });
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({ issues: [issue1, issue2] })
      );

      render(<App />);

      // Click the first issue
      const card1 = screen.getByRole('button', { name: /Issue: First Issue/i });
      fireEvent.click(card1);

      expect(mockFetchIssue).toHaveBeenCalledWith('issue-1');
      expect(mockFetchIssue).toHaveBeenCalledTimes(1);

      // Click the second issue
      const card2 = screen.getByRole('button', { name: /Issue: Second Issue/i });
      fireEvent.click(card2);

      expect(mockFetchIssue).toHaveBeenCalledWith('issue-2');
      expect(mockFetchIssue).toHaveBeenCalledTimes(2);
    });
  });

  describe('SwimLaneBoard and IssueTable prop passing', () => {
    it('passes onIssueClick to SwimLaneBoard in kanban view', () => {
      const mockFetchIssue = vi.fn();
      vi.mocked(useIssueDetail).mockReturnValue(
        createMockUseIssueDetailReturn({ fetchIssue: mockFetchIssue })
      );
      vi.mocked(useViewState).mockReturnValue(['kanban', vi.fn()]);
      const testIssue = createMockIssue({ id: 'swimlane-test', title: 'SwimLane Test' });
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({ issues: [testIssue] })
      );

      render(<App />);

      // SwimLaneBoard receives onIssueClick - clicking a card proves the prop was passed
      const card = screen.getByRole('button', { name: /Issue: SwimLane Test/i });
      fireEvent.click(card);

      expect(mockFetchIssue).toHaveBeenCalledWith('swimlane-test');
    });

    it('passes onRowClick to IssueTable in table view', () => {
      const mockFetchIssue = vi.fn();
      vi.mocked(useIssueDetail).mockReturnValue(
        createMockUseIssueDetailReturn({ fetchIssue: mockFetchIssue })
      );
      vi.mocked(useViewState).mockReturnValue(['table', vi.fn()]);
      const testIssue = createMockIssue({ id: 'table-test', title: 'Table Test' });
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({ issues: [testIssue] })
      );

      render(<App />);

      // IssueTable receives onRowClick - clicking a row proves the prop was passed
      const row = screen.getByRole('row', { name: /Table Test/i });
      fireEvent.click(row);

      expect(mockFetchIssue).toHaveBeenCalledWith('table-test');
    });

    it('passes selectedId to IssueTable when issue is selected', () => {
      const mockFetchIssue = vi.fn();
      vi.mocked(useIssueDetail).mockReturnValue(
        createMockUseIssueDetailReturn({ fetchIssue: mockFetchIssue })
      );
      vi.mocked(useViewState).mockReturnValue(['table', vi.fn()]);
      const testIssue = createMockIssue({ id: 'selected-test', title: 'Selected Test' });
      vi.mocked(useIssues).mockReturnValue(
        createMockUseIssuesReturn({ issues: [testIssue] })
      );

      render(<App />);

      // Click to select the issue
      const row = screen.getByRole('row', { name: /Selected Test/i });
      fireEvent.click(row);

      // The row should have the selected state (aria-selected or CSS class)
      expect(row).toHaveAttribute('aria-selected', 'true');
    });
  });
});
