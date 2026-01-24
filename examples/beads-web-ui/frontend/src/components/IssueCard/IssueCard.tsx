/**
 * IssueCard component for Kanban board.
 * Displays a single issue as a card with title, ID, and priority badge.
 */

import type { Issue } from '@/types';
import styles from './IssueCard.module.css';

/**
 * Props for the IssueCard component.
 */
export interface IssueCardProps {
  /** The issue to display */
  issue: Issue;
  /** Callback when card is clicked */
  onClick?: (issue: Issue) => void;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Format issue ID for display.
 * Shows last 7 characters of the ID for readability.
 */
function formatIssueId(id: string): string {
  if (!id) return 'unknown';
  // If ID is short enough, return as-is
  if (id.length <= 10) return id;
  // Otherwise show last 7 characters
  return id.slice(-7);
}

/**
 * Get priority level, defaulting to 4 (backlog) if undefined or out of range.
 */
function getPriorityLevel(priority: number | undefined): 0 | 1 | 2 | 3 | 4 {
  if (priority === undefined || priority === null) return 4;
  if (priority < 0) return 4;
  if (priority > 4) return 4;
  return priority as 0 | 1 | 2 | 3 | 4;
}

/**
 * IssueCard displays a single issue in the Kanban board.
 * Shows title, ID, and priority badge.
 */
export function IssueCard({
  issue,
  onClick,
  className,
}: IssueCardProps): JSX.Element {
  const priority = getPriorityLevel(issue.priority);
  const displayId = formatIssueId(issue.id);
  const displayTitle = issue.title || 'Untitled';

  const rootClassName = className
    ? `${styles.issueCard} ${className}`
    : styles.issueCard;

  const handleClick = () => {
    if (onClick) {
      onClick(issue);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (onClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onClick(issue);
    }
  };

  return (
    <article
      className={rootClassName}
      data-priority={priority}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      aria-label={`Issue: ${displayTitle}`}
    >
      <header className={styles.header}>
        <span className={styles.id}>{displayId}</span>
        <span
          className={styles.priorityBadge}
          data-priority={priority}
          aria-label={`Priority ${priority}`}
        >
          P{priority}
        </span>
      </header>
      <h3 className={styles.title}>{displayTitle}</h3>
    </article>
  );
}
