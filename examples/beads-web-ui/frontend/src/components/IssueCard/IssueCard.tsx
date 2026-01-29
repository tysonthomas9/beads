/**
 * IssueCard component for Kanban board.
 * Displays a single issue as a card with title, ID, priority badge, and optional blocked indicator.
 */

import type { Issue } from '@/types';
import { BlockedBadge } from '@/components/BlockedBadge';
import styles from './IssueCard.module.css';

/**
 * Review type for cards that need human attention.
 */
type ReviewType = 'plan' | 'code' | 'help';

/**
 * Get the review type for an issue based on title patterns, status, and notes.
 * Returns null if the issue doesn't need review.
 */
function getReviewType(issue: Issue): ReviewType | null {
  const hasNeedReview = issue.title?.includes('[Need Review]') ?? false;
  const isReviewStatus = issue.status === 'review';
  const isBlockedWithNotes = issue.status === 'blocked' && !!issue.notes;

  // Plan review: Title contains [Need Review]
  if (hasNeedReview) {
    return 'plan';
  }

  // Code review: Status is review AND no [Need Review] in title
  if (isReviewStatus && !hasNeedReview) {
    return 'code';
  }

  // Needs help: Blocked with notes
  if (isBlockedWithNotes) {
    return 'help';
  }

  return null;
}

/**
 * Review badge configuration by type.
 */
const REVIEW_BADGE_CONFIG: Record<ReviewType, { icon: string; label: string; className: string }> = {
  plan: { icon: '📝', label: 'Plan', className: styles.reviewPlan ?? '' },
  code: { icon: '🔍', label: 'Code', className: styles.reviewCode ?? '' },
  help: { icon: '❓', label: 'Help', className: styles.reviewHelp ?? '' },
};

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
  /** Number of issues blocking this one (optional) */
  blockedByCount?: number;
  /** IDs of blocking issues (optional) */
  blockedBy?: string[];
  /** Whether this card is in the Pending column (dimmed appearance) */
  isPending?: boolean;
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
 * Shows title, ID, priority badge, and optional blocked indicator.
 */
export function IssueCard({
  issue,
  onClick,
  className,
  blockedByCount,
  blockedBy,
  isPending = false,
}: IssueCardProps): JSX.Element {
  const priority = getPriorityLevel(issue.priority);
  const displayId = formatIssueId(issue.id);
  const displayTitle = issue.title || 'Untitled';
  const isBlocked = (blockedByCount ?? 0) > 0;
  const reviewType = getReviewType(issue);

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
      data-blocked={isBlocked ? 'true' : undefined}
      data-in-pending={isPending ? 'true' : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      aria-label={`Issue: ${displayTitle}${isBlocked ? ' (blocked)' : ''}${isPending ? ' (pending)' : ''}`}
    >
      <header className={styles.header}>
        <span className={styles.id}>{displayId}</span>
        {reviewType && (
          <span
            className={`${styles.reviewTypeBadge} ${REVIEW_BADGE_CONFIG[reviewType].className}`}
            aria-label={`${REVIEW_BADGE_CONFIG[reviewType].label} review`}
          >
            <span className={styles.reviewIcon} aria-hidden="true">
              {REVIEW_BADGE_CONFIG[reviewType].icon}
            </span>
            {REVIEW_BADGE_CONFIG[reviewType].label}
          </span>
        )}
        {isBlocked && (
          <BlockedBadge
            count={blockedByCount ?? 0}
            {...(blockedBy !== undefined && { issueIds: blockedBy })}
          />
        )}
        <span
          className={`${styles.priorityBadge} ${styles[`priority${priority}`]}`}
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
