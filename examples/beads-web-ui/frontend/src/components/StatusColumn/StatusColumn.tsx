/**
 * StatusColumn component for Kanban board.
 * Displays a vertical column representing a specific issue status.
 */

import type { Status } from '@/types';
import { formatStatusLabel } from './utils';
import styles from './StatusColumn.module.css';

/**
 * Props for the StatusColumn component.
 */
export interface StatusColumnProps {
  /** The status this column represents */
  status: Status;
  /** Human-readable label override (defaults to formatted status) */
  statusLabel?: string;
  /** Number of issues in this column */
  count: number;
  /** IssueCard components to display */
  children?: React.ReactNode;
  /** Additional CSS class name */
  className?: string;
}

/**
 * StatusColumn displays a vertical column in the Kanban board.
 * Shows a header with status name and count, and contains IssueCard components.
 */
export function StatusColumn({
  status,
  statusLabel,
  count,
  children,
  className,
}: StatusColumnProps): JSX.Element {
  const displayLabel = statusLabel ?? formatStatusLabel(status);
  const issueWord = count === 1 ? 'issue' : 'issues';

  const rootClassName = className
    ? `${styles.statusColumn} ${className}`
    : styles.statusColumn;

  return (
    <section
      className={rootClassName}
      data-status={status}
      aria-label={`${displayLabel} issues`}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>{displayLabel}</h2>
        <span
          className={styles.count}
          aria-label={`${count} ${issueWord}`}
        >
          {count}
        </span>
      </header>
      <div className={styles.content} role="list">
        {children}
      </div>
    </section>
  );
}
