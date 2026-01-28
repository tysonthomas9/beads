/**
 * IssueDetailPanel component.
 * Slide-out side panel that displays detailed information about a selected issue.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Issue, IssueDetails, IssueWithDependencyMetadata, Priority, IssueType } from '@/types';
import type { Status } from '@/types/status';
import { updateIssue } from '@/api';
import { IssueHeader } from './IssueHeader';
import { EditableDescription } from './EditableDescription';
import { PriorityDropdown } from './PriorityDropdown';
import { TypeDropdown } from './TypeDropdown';
import { ErrorToast } from '../ErrorToast';
import styles from './IssueDetailPanel.module.css';

/**
 * Props for the IssueDetailPanel component.
 */
export interface IssueDetailPanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** The issue to display (null when closed or loading) */
  issue: Issue | IssueDetails | null;
  /** Callback when panel should close */
  onClose: () => void;
  /** Whether the issue details are loading */
  isLoading?: boolean;
  /** Error message if loading failed */
  error?: string | null;
  /** Additional CSS class name */
  className?: string;
  /** Children to render in the panel content area (overrides default content) */
  children?: React.ReactNode;
}

/**
 * Type guard to check if issue has IssueDetails fields.
 */
function isIssueDetails(issue: Issue | IssueDetails): issue is IssueDetails {
  return 'dependents' in issue;
}

/**
 * Render a dependency/dependent issue link.
 */
function renderDependencyItem(dep: IssueWithDependencyMetadata): JSX.Element {
  const statusClass = dep.status === 'closed' ? styles.dependencyClosed : '';
  return (
    <li key={dep.id} className={`${styles.dependencyItem} ${statusClass}`}>
      <span className={styles.dependencyId}>{dep.id}</span>
      <span className={styles.dependencyTitle}>{dep.title}</span>
      {dep.dependency_type && (
        <span className={styles.dependencyType}>{dep.dependency_type}</span>
      )}
    </li>
  );
}

/**
 * Props for the DefaultContent component.
 */
interface DefaultContentProps {
  issue: Issue | IssueDetails | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry?: () => void;
  /** Callback when issue is updated (e.g., title changed) */
  onIssueUpdate?: (issue: Issue) => void;
}

/**
 * Default content renderer for issue details.
 */
function DefaultContent({
  issue,
  isLoading,
  error,
  onClose,
  onRetry,
  onIssueUpdate,
}: DefaultContentProps): JSX.Element {
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isSavingPriority, setIsSavingPriority] = useState(false);
  const [isSavingType, setIsSavingType] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const handleTitleSave = useCallback(async (newTitle: string) => {
    if (!issue) return;

    setIsSavingTitle(true);
    try {
      const updatedIssue = await updateIssue(issue.id, { title: newTitle });
      onIssueUpdate?.(updatedIssue);
    } finally {
      setIsSavingTitle(false);
    }
  }, [issue, onIssueUpdate]);

  const handleStatusChange = useCallback(async (newStatus: Status) => {
    if (!issue) return;

    setIsSavingStatus(true);
    setStatusError(null);
    try {
      const updatedIssue = await updateIssue(issue.id, { status: newStatus });
      onIssueUpdate?.(updatedIssue);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      setStatusError(message);
    } finally {
      setIsSavingStatus(false);
    }
  }, [issue, onIssueUpdate]);

  const handlePrioritySave = useCallback(async (newPriority: Priority) => {
    if (!issue) return;

    setIsSavingPriority(true);
    try {
      const updatedIssue = await updateIssue(issue.id, { priority: newPriority });
      onIssueUpdate?.(updatedIssue);
    } catch (err) {
      // Re-throw to let PriorityDropdown handle error display and rollback
      throw err;
    } finally {
      setIsSavingPriority(false);
    }
  }, [issue, onIssueUpdate]);

  const handleTypeSave = useCallback(async (newType: IssueType) => {
    if (!issue) return;

    setIsSavingType(true);
    try {
      const updatedIssue = await updateIssue(issue.id, { issue_type: newType });
      onIssueUpdate?.(updatedIssue);
    } catch (err) {
      // Re-throw to let TypeDropdown handle error display and rollback
      throw err;
    } finally {
      setIsSavingType(false);
    }
  }, [issue, onIssueUpdate]);

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.loadingContainer} data-testid="panel-loading">
        <div className={styles.spinner} />
        <p>Loading issue details...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={styles.errorContainer} data-testid="panel-error">
        <p className={styles.errorMessage}>{error}</p>
        {onRetry && (
          <button className={styles.retryButton} onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }

  // No issue
  if (!issue) {
    return (
      <div className={styles.emptyContainer}>
        <p>No issue selected</p>
      </div>
    );
  }

  const hasDetails = isIssueDetails(issue);
  const dependencies = hasDetails ? issue.dependencies : undefined;
  const dependents = hasDetails ? issue.dependents : undefined;

  return (
    <>
      {/* Header with ID, status dropdown, close button, and title */}
      <IssueHeader
        issue={issue}
        onClose={onClose}
        onTitleSave={handleTitleSave}
        isSavingTitle={isSavingTitle}
        onStatusChange={handleStatusChange}
        isSavingStatus={isSavingStatus}
      />

      <div className={styles.detailContent}>
        {/* Status Row (priority and type dropdowns, status moved to header) */}
        <div className={styles.statusRow}>
          <PriorityDropdown
            priority={issue.priority as Priority}
            onSave={handlePrioritySave}
            isSaving={isSavingPriority}
          />
          <TypeDropdown
            type={issue.issue_type}
            onSave={handleTypeSave}
            isSaving={isSavingType}
          />
        </div>

        {/* Description */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Description</h3>
          <EditableDescription
            description={issue.description}
            isEditable={true}
            onSave={async (newDescription) => {
              const updatedIssue = await updateIssue(issue.id, { description: newDescription });
              onIssueUpdate?.(updatedIssue);
            }}
          />
        </section>

        {/* Assignment */}
        {(issue.assignee || issue.owner) && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Assignment</h3>
            <dl className={styles.metadata}>
              {issue.assignee && (
                <>
                  <dt>Assignee</dt>
                  <dd>{issue.assignee}</dd>
                </>
              )}
              {issue.owner && (
                <>
                  <dt>Owner</dt>
                  <dd>{issue.owner}</dd>
                </>
              )}
            </dl>
          </section>
        )}

        {/* Labels */}
        {issue.labels && issue.labels.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Labels</h3>
            <div className={styles.labels}>
              {issue.labels.map((label) => (
                <span key={label} className={styles.label}>
                  {label}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Dependencies (blocking this issue) */}
        {dependencies && dependencies.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              Blocked By ({dependencies.length})
            </h3>
            <ul className={styles.dependencyList}>
              {dependencies.map(renderDependencyItem)}
            </ul>
          </section>
        )}

        {/* Dependents (this issue blocks) */}
        {dependents && dependents.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              Blocks ({dependents.length})
            </h3>
            <ul className={styles.dependencyList}>
              {dependents.map(renderDependencyItem)}
            </ul>
          </section>
        )}

        {/* Design (if present) */}
        {issue.design && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Design</h3>
            <pre className={styles.design}>{issue.design}</pre>
          </section>
        )}

        {/* Notes (if present) */}
        {issue.notes && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Notes</h3>
            <p className={styles.notes}>{issue.notes}</p>
          </section>
        )}
      </div>

      {/* Error toast for status change failures */}
      {statusError && (
        <ErrorToast
          message={statusError}
          onDismiss={() => setStatusError(null)}
          testId="status-error-toast"
        />
      )}
    </>
  );
}

/**
 * IssueDetailPanel displays issue details in a slide-out panel from the right edge.
 * Features:
 * - Smooth slide-in/out animation with CSS transforms
 * - Backdrop overlay that dims the background
 * - Closes on backdrop click or Escape key
 * - Locks body scroll when open
 * - Accessible with proper ARIA attributes
 * - Default content rendering with loading/error states
 */
export function IssueDetailPanel({
  isOpen,
  issue,
  onClose,
  isLoading,
  error,
  className,
  children,
}: IssueDetailPanelProps): JSX.Element {
  const panelRef = useRef<HTMLElement>(null);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open, restoring previous value on close.
  // Note: Only ONE panel should be open at a time. Multiple concurrent panels
  // would require a scroll lock manager to handle overflow restoration properly.
  useEffect(() => {
    if (isOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [isOpen]);

  // Focus management: focus the panel when opened, restore focus on close
  useEffect(() => {
    if (isOpen && panelRef.current) {
      const previouslyFocused = document.activeElement as HTMLElement | null;
      panelRef.current.focus();
      return () => {
        // Check element is still in DOM before restoring focus (could be unmounted)
        if (
          previouslyFocused &&
          document.contains(previouslyFocused) &&
          previouslyFocused.focus
        ) {
          previouslyFocused.focus();
        }
      };
    }
  }, [isOpen]);

  // Build root class name
  const rootClassName = [styles.overlay, isOpen && styles.open, className]
    .filter(Boolean)
    .join(' ');

  // Determine content: children override default, otherwise render default content
  const content = children ?? (
    <DefaultContent issue={issue} isLoading={isLoading ?? false} error={error ?? null} onClose={onClose} />
  );

  return (
    <div
      className={rootClassName}
      onClick={onClose}
      data-testid="issue-detail-overlay"
      aria-hidden={!isOpen}
    >
      <aside
        ref={panelRef}
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={issue ? `Details for ${issue.title}` : 'Issue details'}
        tabIndex={-1}
        data-testid="issue-detail-panel"
        data-state={isOpen ? 'open' : 'closed'}
        data-loading={isLoading ? 'true' : 'false'}
        data-error={error ? 'true' : 'false'}
      >
        <div className={styles.content}>{content}</div>
      </aside>
    </div>
  );
}
