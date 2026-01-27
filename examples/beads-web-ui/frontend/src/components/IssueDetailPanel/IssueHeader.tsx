/**
 * IssueHeader component.
 * Header area with ID, status badge, and close button for IssueDetailPanel.
 */

import type { Issue, IssueDetails } from '@/types';
import type { Status } from '@/types/status';
import { EditableTitle } from '../EditableTitle';
import { StatusDropdown } from '../StatusDropdown';
import { formatStatusLabel } from '../StatusColumn/utils';
import styles from './IssueHeader.module.css';

/**
 * Props for the IssueHeader component.
 */
export interface IssueHeaderProps {
  /** The issue to display */
  issue: Issue | IssueDetails;
  /** Callback when close button is clicked */
  onClose: () => void;
  /** Callback when title is saved */
  onTitleSave?: (newTitle: string) => Promise<void>;
  /** Whether title is being saved */
  isSavingTitle?: boolean;
  /** Callback when status changes (enables interactive dropdown) */
  onStatusChange?: (status: Status) => Promise<void>;
  /** Whether status is being saved */
  isSavingStatus?: boolean;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Format status with fallback to 'Open'.
 */
function formatStatus(status?: string): string {
  if (!status) return 'Open';
  return formatStatusLabel(status);
}

/**
 * IssueHeader displays the issue identification elements in a cohesive header.
 * Contains:
 * - Issue ID
 * - Status badge with semantic colors
 * - Close button
 * - Title (editable when onTitleSave provided)
 */
export function IssueHeader({
  issue,
  onClose,
  onTitleSave,
  isSavingTitle,
  onStatusChange,
  isSavingStatus,
  className,
}: IssueHeaderProps): JSX.Element {
  const rootClassName = [styles.issueHeader, className].filter(Boolean).join(' ');

  return (
    <header className={rootClassName} data-testid="issue-header">
      <div className={styles.topRow}>
        <span className={styles.issueId} data-testid="issue-id">
          {issue.id}
        </span>
        {onStatusChange ? (
          <StatusDropdown
            status={issue.status ?? 'open'}
            onStatusChange={onStatusChange}
            isSaving={isSavingStatus ?? false}
          />
        ) : (
          <span
            className={styles.statusBadge}
            data-status={issue.status ?? 'open'}
            role="status"
            data-testid="issue-status-badge"
          >
            {formatStatus(issue.status)}
          </span>
        )}
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close panel"
          data-testid="header-close-button"
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
      </div>
      {onTitleSave ? (
        <EditableTitle
          title={issue.title}
          onSave={onTitleSave}
          isSaving={isSavingTitle ?? false}
        />
      ) : (
        <h2 className={styles.title} data-testid="issue-title">
          {issue.title}
        </h2>
      )}
    </header>
  );
}
