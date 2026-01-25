/**
 * Main App component.
 * Wires useIssues hook to KanbanBoard with loading states, error handling,
 * and optimistic drag-drop updates.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Status } from '@/types';
import { useIssues } from '@/hooks/useIssues';
import { useFilterState, useIssueFilter, useDebounce } from '@/hooks';
import {
  AppLayout,
  KanbanBoard,
  LoadingSkeleton,
  ErrorDisplay,
  ConnectionStatus,
  ErrorToast,
  FilterBar,
  SearchInput,
} from '@/components';

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

  // Filter state with URL synchronization
  const [filters, filterActions] = useFilterState();

  // Local search state with debouncing
  const [searchValue, setSearchValue] = useState(filters.search ?? '');
  const debouncedSearch = useDebounce(searchValue, 300);

  // Sync debounced search to filter state
  useEffect(() => {
    filterActions.setSearch(debouncedSearch || undefined);
  }, [debouncedSearch, filterActions]);

  // Apply filters to issues
  // Build filter options conditionally to satisfy exactOptionalPropertyTypes
  const filterOptions: Parameters<typeof useIssueFilter>[1] = {};
  if (filters.search !== undefined) filterOptions.searchTerm = filters.search;
  if (filters.priority !== undefined) filterOptions.priority = filters.priority;
  if (filters.type !== undefined) filterOptions.issueType = filters.type;
  if (filters.labels !== undefined) filterOptions.labels = filters.labels;

  const { filteredIssues } = useIssueFilter(issues, filterOptions);

  const [toastError, setToastError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
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

  // Loading state: show skeleton columns
  if (isLoading) {
    return (
      <AppLayout actions={<ConnectionStatus state={connectionState} />}>
        <div style={{ display: 'flex', gap: '1rem', padding: '1rem' }}>
          <LoadingSkeleton.Column />
          <LoadingSkeleton.Column />
          <LoadingSkeleton.Column />
        </div>
      </AppLayout>
    );
  }

  // Error state: show error display with retry
  if (error && !isLoading) {
    return (
      <AppLayout
        actions={
          <ConnectionStatus
            state={connectionState}
            onRetry={retryConnection}
            reconnectAttempts={reconnectAttempts}
          />
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

  // Navigation element with search and filters
  const filterNavigation = (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
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

  // Success state: show Kanban board
  return (
    <AppLayout
      navigation={filterNavigation}
      actions={
        <ConnectionStatus
          state={connectionState}
          onRetry={retryConnection}
          reconnectAttempts={reconnectAttempts}
        />
      }
    >
      <KanbanBoard issues={filteredIssues} onDragEnd={handleDragEnd} />
      {toastError && (
        <ErrorToast message={toastError} onDismiss={handleToastDismiss} />
      )}
    </AppLayout>
  );
}

export default App;
