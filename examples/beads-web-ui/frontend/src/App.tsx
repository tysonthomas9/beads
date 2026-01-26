/**
 * Main App component.
 * Wires useIssues hook to KanbanBoard with loading states, error handling,
 * and optimistic drag-drop updates. Manages view switching between Kanban,
 * Table, and Graph views with URL synchronization. Supports filtering and
 * search across all views.
 */

import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import type { Status } from '@/types';
import { useIssues, useViewState, useFilterState, useIssueFilter, useDebounce, useBlockedIssues } from '@/hooks';
import type { BlockedInfo } from '@/components/KanbanBoard';
import {
  AppLayout,
  KanbanBoard,
  IssueTable,
  ViewSwitcher,
  LoadingSkeleton,
  ErrorDisplay,
  ConnectionStatus,
  BlockedSummary,
  ErrorToast,
  FilterBar,
  SearchInput,
} from '@/components';

// Lazy load GraphView (React Flow ~100KB)
const GraphView = lazy(() =>
  import('@/components/GraphView').then(m => ({ default: m.GraphView }))
);

function App() {
  const {
    issues,
    isLoading,
    error,
    connectionState,
    reconnectAttempts,
    refetch,
    updateIssueStatus,
    retryConnection,
  } = useIssues();

  const [activeView, setActiveView] = useViewState();

  // Filter state with URL synchronization
  const [filters, filterActions] = useFilterState();

  // Local search state with debouncing
  const [searchValue, setSearchValue] = useState(filters.search ?? '');
  const debouncedSearch = useDebounce(searchValue, 300);

  // Sync debounced search to filter state
  useEffect(() => {
    filterActions.setSearch(debouncedSearch || undefined);
  }, [debouncedSearch, filterActions]);

  // Sync search value from filter state (e.g., when Clear filters is clicked)
  useEffect(() => {
    const filterSearch = filters.search ?? '';
    // Only sync if it's an external change (differs from both local states)
    if (filterSearch !== searchValue && filterSearch !== debouncedSearch) {
      setSearchValue(filterSearch);
    }
  }, [filters.search, searchValue, debouncedSearch]);

  // Apply filters to issues
  // Build filter options conditionally to satisfy exactOptionalPropertyTypes
  const filterOptions: Parameters<typeof useIssueFilter>[1] = {};
  if (filters.search !== undefined) filterOptions.searchTerm = filters.search;
  if (filters.priority !== undefined) filterOptions.priority = filters.priority;
  if (filters.type !== undefined) filterOptions.issueType = filters.type;
  if (filters.labels !== undefined) filterOptions.labels = filters.labels;

  const { filteredIssues } = useIssueFilter(issues, filterOptions);

  // Fetch blocked issues for display
  const { data: blockedIssuesData } = useBlockedIssues();

  // Convert BlockedIssue[] to Map<string, BlockedInfo> for efficient lookup
  const blockedIssuesMap = useMemo(() => {
    if (!blockedIssuesData) return undefined;
    const map = new Map<string, BlockedInfo>();
    for (const issue of blockedIssuesData) {
      map.set(issue.id, {
        blockedByCount: issue.blocked_by_count,
        blockedBy: issue.blocked_by,
      });
    }
    return map;
  }, [blockedIssuesData]);

  const [toastError, setToastError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Track mount state for async operations (must set true in setup for StrictMode compatibility)
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleDragEnd = useCallback(
    async (issueId: string, newStatus: Status, _oldStatus: Status) => {
      try {
        await updateIssueStatus(issueId, newStatus);
      } catch (err) {
        if (!mountedRef.current) return;
        const message =
          err instanceof Error ? err.message : 'Failed to update status';
        setToastError(message);
      }
    },
    [updateIssueStatus]
  );

  // Stable callback for ErrorToast to avoid timer resets
  const handleToastDismiss = useCallback(() => setToastError(null), []);

  // Handle search clear to sync both local and filter state
  const handleSearchClear = useCallback(() => {
    setSearchValue('');
    filterActions.setSearch(undefined);
  }, [filterActions]);

  // Handle blocked issue click from BlockedSummary dropdown
  const handleBlockedIssueClick = useCallback(
    (issueId: string) => {
      if (issueId === '__show_all_blocked__') {
        // Toggle showBlocked filter to true
        filterActions.setShowBlocked(true);
      }
      // Individual issue clicks could navigate to issue detail in the future
      // For now, just show all blocked issues
    },
    [filterActions]
  );

  // Loading state: show skeleton columns (ViewSwitcher disabled, no filters)
  if (isLoading) {
    return (
      <AppLayout
        navigation={
          <ViewSwitcher
            activeView={activeView}
            onChange={setActiveView}
            disabled
          />
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BlockedSummary onIssueClick={handleBlockedIssueClick} />
            <ConnectionStatus state={connectionState} />
          </div>
        }
      >
        <div style={{ display: 'flex', gap: '1rem', padding: '1rem' }}>
          <LoadingSkeleton.Column />
          <LoadingSkeleton.Column />
          <LoadingSkeleton.Column />
        </div>
      </AppLayout>
    );
  }

  // Error state: show error display with retry (ViewSwitcher disabled, no filters)
  if (error && !isLoading) {
    return (
      <AppLayout
        navigation={
          <ViewSwitcher
            activeView={activeView}
            onChange={setActiveView}
            disabled
          />
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BlockedSummary onIssueClick={handleBlockedIssueClick} />
            <ConnectionStatus
              state={connectionState}
              onRetry={retryConnection}
              reconnectAttempts={reconnectAttempts}
            />
          </div>
        }
      >
        <ErrorDisplay
          variant="fetch-error"
          error={new Error(error)}
          showDetails
          onRetry={refetch}
        />
      </AppLayout>
    );
  }

  // Navigation element with view switcher, search, and filters (success state only)
  const navigation = (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'nowrap' }}>
      <ViewSwitcher
        activeView={activeView}
        onChange={setActiveView}
      />
      <SearchInput
        value={searchValue}
        onChange={setSearchValue}
        onClear={handleSearchClear}
        placeholder="Search issues..."
        size="sm"
      />
      <FilterBar filters={filters} actions={filterActions} />
    </div>
  );

  // Success state: show view based on activeView with filtered issues
  return (
    <AppLayout
      navigation={navigation}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BlockedSummary onIssueClick={handleBlockedIssueClick} />
          <ConnectionStatus
            state={connectionState}
            onRetry={retryConnection}
            reconnectAttempts={reconnectAttempts}
          />
        </div>
      }
    >
      {activeView === 'kanban' && (
        <KanbanBoard
          issues={filteredIssues}
          onDragEnd={handleDragEnd}
          {...(blockedIssuesMap !== undefined && { blockedIssues: blockedIssuesMap })}
          {...(filters.showBlocked !== undefined && { showBlocked: filters.showBlocked })}
        />
      )}
      {activeView === 'table' && (
        <IssueTable
          issues={filteredIssues}
          sortable
          {...(blockedIssuesMap !== undefined && { blockedIssues: blockedIssuesMap })}
          {...(filters.showBlocked !== undefined && { showBlocked: filters.showBlocked })}
        />
      )}
      {activeView === 'graph' && (
        <Suspense fallback={<LoadingSkeleton.Graph />}>
          <GraphView issues={filteredIssues} />
        </Suspense>
      )}
      {toastError && (
        <ErrorToast message={toastError} onDismiss={handleToastDismiss} />
      )}
    </AppLayout>
  );
}

export default App;
