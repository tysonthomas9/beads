/**
 * Main App component.
 * Wires useIssues hook to KanbanBoard with loading states, error handling,
 * and optimistic drag-drop updates.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Status } from '@/types';
import { useIssues } from '@/hooks/useIssues';
import {
  AppLayout,
  KanbanBoard,
  LoadingSkeleton,
  ErrorDisplay,
  ConnectionStatus,
  ErrorToast,
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

  // Success state: show Kanban board
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
      <KanbanBoard issues={issues} onDragEnd={handleDragEnd} />
      {toastError && (
        <ErrorToast message={toastError} onDismiss={handleToastDismiss} />
      )}
    </AppLayout>
  );
}

export default App;
