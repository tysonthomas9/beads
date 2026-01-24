/**
 * StatusColumn component for Kanban board.
 * Displays a vertical column representing a specific issue status.
 * Acts as a drop target for draggable IssueCards via @dnd-kit.
 */

import { useDroppable } from '@dnd-kit/core';
import type { Status } from '@/types';
import { formatStatusLabel } from './utils';
import styles from './StatusColumn.module.css';

/**
 * Props for the StatusColumn component.
 */
export interface StatusColumnProps {
  /** The status this column represents (also used as droppable ID) */
  status: Status;
  /** Human-readable label override (defaults to formatted status) */
  statusLabel?: string;
  /** Number of issues in this column */
  count: number;
  /** IssueCard components to display */
  children?: React.ReactNode;
  /** Additional CSS class name */
  className?: string;
  /** Whether dropping is disabled for this column */
  droppableDisabled?: boolean;
}

/**
 * StatusColumn displays a vertical column in the Kanban board.
 * Shows a header with status name and count, and contains IssueCard components.
 * The content area is a drop target for IssueCards when used within a DndContext.
 */
export function StatusColumn({
  status,
  statusLabel,
  count,
  children,
  className,
  droppableDisabled = false,
}: StatusColumnProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    disabled: droppableDisabled,
    data: { status },
  });

  const displayLabel = statusLabel ?? formatStatusLabel(status);
  const issueWord = count === 1 ? 'issue' : 'issues';

  const rootClassName = className
    ? `${styles.statusColumn} ${className}`
    : styles.statusColumn;

  // Build content class with drop state
  // Note: isOver is only true during an active drag operation
  const contentClasses = [styles.content];
  if (isOver) {
    contentClasses.push(styles.contentDropOver);
  }

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
      <div
        ref={setNodeRef}
        className={contentClasses.join(' ')}
        role="list"
        data-droppable-id={status}
        data-is-over={isOver ? 'true' : undefined}
      >
        {children}
      </div>
    </section>
  );
}
