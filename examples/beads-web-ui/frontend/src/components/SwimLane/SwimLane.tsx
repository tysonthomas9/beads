/**
 * SwimLane component for Kanban board.
 * Displays a horizontal lane containing status columns for a group of issues.
 * Each swim lane represents a grouping (e.g., epic, assignee, priority).
 */

import { useMemo } from 'react';
import type { Issue, Status } from '@/types';
import type { BlockedInfo } from '@/components/KanbanBoard';
import { StatusColumn } from '@/components/StatusColumn';
import { DraggableIssueCard } from '@/components/DraggableIssueCard';
import { EmptyColumn } from '@/components/EmptyColumn';
import styles from './SwimLane.module.css';

/**
 * Props for the SwimLane component.
 */
export interface SwimLaneProps {
  /** Unique identifier for this lane */
  id: string;
  /** Display title (e.g., "Epic: User Authentication") */
  title: string;
  /** Issues belonging to this lane */
  issues: Issue[];
  /** Status columns to display */
  statuses: Status[];
  /** Whether the lane content is collapsed */
  isCollapsed?: boolean;
  /** Callback when collapse toggle is clicked */
  onToggleCollapse?: () => void;
  /** Callback when an issue card is clicked */
  onIssueClick?: (issue: Issue) => void;
  /** Map of issue ID to blocked info */
  blockedIssues?: Map<string, BlockedInfo>;
  /** Whether to show blocked issues */
  showBlocked?: boolean;
  /** Additional CSS class */
  className?: string;
}

/**
 * SwimLane displays a horizontal lane with status columns for grouped issues.
 * Used within SwimLaneBoard to organize issues by epic, assignee, or other criteria.
 * Does NOT create its own DndContext - parent provides it for cross-lane drag support.
 */
export function SwimLane({
  id,
  title,
  issues,
  statuses,
  isCollapsed = false,
  onToggleCollapse,
  onIssueClick,
  blockedIssues,
  showBlocked = true,
  className,
}: SwimLaneProps): JSX.Element {
  // Filter issues based on blocked visibility
  const filteredIssues = useMemo(() => {
    if (showBlocked || !blockedIssues) return issues;
    return issues.filter((issue) => !blockedIssues.has(issue.id));
  }, [issues, showBlocked, blockedIssues]);

  // Group issues by status
  const issuesByStatus = useMemo(() => {
    const grouped = new Map<Status, Issue[]>();
    for (const status of statuses) {
      grouped.set(status, []);
    }
    for (const issue of filteredIssues) {
      const status = issue.status ?? 'open';
      const existing = grouped.get(status);
      if (existing) existing.push(issue);
    }
    return grouped;
  }, [filteredIssues, statuses]);

  const headerId = `lane-header-${id}`;
  const rootClassName = [styles.swimLane, className].filter(Boolean).join(' ');

  return (
    <section
      className={rootClassName}
      aria-labelledby={headerId}
      data-collapsed={isCollapsed}
      data-testid={`swim-lane-${id}`}
    >
      <header className={styles.laneHeader} id={headerId}>
        <button
          className={styles.collapseToggle}
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
          data-testid="collapse-toggle"
        >
          <svg
            className={styles.chevronIcon}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h3 className={styles.laneTitle}>{title}</h3>
        <span className={styles.laneCount} aria-label={`${filteredIssues.length} issues`}>
          {filteredIssues.length}
        </span>
      </header>
      <div
        className={styles.laneContent}
        data-collapsed={isCollapsed}
        aria-hidden={isCollapsed}
      >
        {statuses.map((status) => {
          const statusIssues = issuesByStatus.get(status) ?? [];
          return (
            <StatusColumn
              key={status}
              status={status}
              count={statusIssues.length}
              droppableDisabled={isCollapsed}
            >
              {statusIssues.length === 0 ? (
                <EmptyColumn status={status} />
              ) : (
                statusIssues.map((issue) => {
                  const blockedInfo = blockedIssues?.get(issue.id);
                  const cardProps = {
                    issue,
                    ...(onIssueClick !== undefined && { onClick: onIssueClick }),
                    ...(blockedInfo !== undefined && {
                      blockedByCount: blockedInfo.blockedByCount,
                      blockedBy: blockedInfo.blockedBy,
                    }),
                  };
                  return <DraggableIssueCard key={issue.id} {...cardProps} />;
                })
              )}
            </StatusColumn>
          );
        })}
      </div>
    </section>
  );
}
