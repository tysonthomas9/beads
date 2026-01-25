/**
 * IssueDetailPanel component.
 * Slide-out side panel that displays detailed information about a selected issue.
 */

import { useEffect, useRef } from 'react';
import type { Issue, IssueDetails, IssueWithDependencyMetadata } from '@/types';
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
 * Format a priority number to human-readable string.
 */
function formatPriority(priority: number): string {
  const labels: Record<number, string> = {
    0: 'P0 - Critical',
    1: 'P1 - High',
    2: 'P2 - Medium',
    3: 'P3 - Low',
    4: 'P4 - Backlog',
  };
  return labels[priority] ?? `P${priority}`;
}

/**
 * Format status to human-readable string.
 */
function formatStatus(status?: string): string {
  if (!status) return 'Open';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format issue type to human-readable string.
 */
function formatIssueType(type?: string): string {
  if (!type) return 'Task';
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
  onRetry?: () => void;
}

/**
 * Default content renderer for issue details.
 */
function DefaultContent({
  issue,
  isLoading,
  error,
  onRetry,
}: DefaultContentProps): JSX.Element {
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
    <div className={styles.detailContent}>
      {/* Header */}
      <header className={styles.header}>
        <h2 className={styles.title}>{issue.title}</h2>
        <span className={styles.issueId}>{issue.id}</span>
      </header>

      {/* Status Row */}
      <div className={styles.statusRow}>
        <span className={`${styles.badge} ${styles.statusBadge}`} data-status={issue.status ?? 'open'}>
          {formatStatus(issue.status)}
        </span>
        <span className={`${styles.badge} ${styles.priorityBadge}`} data-priority={issue.priority}>
          {formatPriority(issue.priority)}
        </span>
        <span className={`${styles.badge} ${styles.typeBadge}`}>
          {formatIssueType(issue.issue_type)}
        </span>
      </div>

      {/* Description */}
      {issue.description && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Description</h3>
          <p className={styles.description}>{issue.description}</p>
        </section>
      )}

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
    <DefaultContent issue={issue} isLoading={isLoading ?? false} error={error ?? null} />
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
      >
        {/* Close button */}
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close panel"
          data-testid="panel-close-button"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M15 5L5 15M5 5l10 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className={styles.content}>{content}</div>
      </aside>
    </div>
  );
}
