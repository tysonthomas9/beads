/**
 * KanbanBoard component for displaying issues in a drag-and-drop Kanban layout.
 * Wraps content in @dnd-kit DndContext to enable drag-and-drop between status columns.
 * Renders StatusColumns for each status and uses DragOverlay for visual drag feedback.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { Issue, Status } from '@/types';
import type { FilterState } from '@/hooks/useFilterState';
import { StatusColumn } from '@/components/StatusColumn';
import { DraggableIssueCard } from '@/components/DraggableIssueCard';
import styles from './KanbanBoard.module.css';

/**
 * Props for the KanbanBoard component.
 */
export interface KanbanBoardProps {
  /** Issues to display in the board */
  issues: Issue[];
  /** Status columns to show, in order (default: open, in_progress, closed) */
  statuses?: Status[];
  /** Optional filter state to apply to issues */
  filters?: FilterState;
  /** Callback when card is clicked */
  onIssueClick?: (issue: Issue) => void;
  /** Callback when drag ends - receives issue and new status */
  onDragEnd?: (issueId: string, newStatus: Status, oldStatus: Status) => void;
  /** Additional CSS class name */
  className?: string;
}

/** Default status columns to display */
const DEFAULT_STATUSES: Status[] = ['open', 'in_progress', 'closed'];

/**
 * KanbanBoard displays issues in a horizontal drag-and-drop layout.
 * Issues are grouped by status into columns, and can be dragged between columns.
 * The board uses @dnd-kit for accessible drag-and-drop functionality.
 */
export function KanbanBoard({
  issues,
  statuses = DEFAULT_STATUSES,
  filters,
  onIssueClick,
  onDragEnd,
  className,
}: KanbanBoardProps): JSX.Element {
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);

  // Configure drag sensors with activation constraints
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  // Filter issues based on active filters
  const filteredIssues = useMemo(() => {
    if (!filters) return issues;

    return issues.filter((issue) => {
      // Priority filter (exact match)
      if (filters.priority !== undefined && issue.priority !== filters.priority) {
        return false;
      }

      // Type filter (exact match)
      if (filters.type !== undefined && issue.issue_type !== filters.type) {
        return false;
      }

      // Labels filter (issue must have ALL specified labels)
      if (filters.labels !== undefined && filters.labels.length > 0) {
        const issueLabels = issue.labels ?? [];
        if (!filters.labels.every((label) => issueLabels.includes(label))) {
          return false;
        }
      }

      // Search filter (case-insensitive title match)
      if (filters.search !== undefined && filters.search !== '') {
        const searchLower = filters.search.toLowerCase();
        const titleLower = issue.title.toLowerCase();
        if (!titleLower.includes(searchLower)) {
          return false;
        }
      }

      return true;
    });
  }, [issues, filters]);

  // Group issues by status for efficient rendering
  const issuesByStatus = useMemo(() => {
    const grouped = new Map<Status, Issue[]>();
    // Initialize all statuses with empty arrays
    for (const status of statuses) {
      grouped.set(status, []);
    }
    // Group filtered issues into their respective status buckets
    for (const issue of filteredIssues) {
      const status = issue.status ?? 'open';
      const existing = grouped.get(status);
      if (existing) {
        existing.push(issue);
      }
    }
    return grouped;
  }, [filteredIssues, statuses]);

  // Handle drag start - store the dragged issue for DragOverlay
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const issue = event.active.data.current?.issue as Issue | undefined;
    if (issue) {
      setActiveIssue(issue);
    }
  }, []);

  // Handle drag end - notify parent of status change
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveIssue(null);

      const { active, over } = event;
      if (!over || !onDragEnd) return;

      const issue = active.data.current?.issue as Issue | undefined;
      if (!issue) return;

      const newStatus = over.id as Status;
      const oldStatus = issue.status ?? 'open';

      // Only call callback if status actually changed
      if (newStatus !== oldStatus) {
        onDragEnd(issue.id, newStatus, oldStatus);
      }
    },
    [onDragEnd]
  );

  const rootClassName = className
    ? `${styles.board} ${className}`
    : styles.board;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={rootClassName}>
        {statuses.map((status) => {
          const statusIssues = issuesByStatus.get(status) ?? [];
          return (
            <StatusColumn
              key={status}
              status={status}
              count={statusIssues.length}
            >
              {statusIssues.map((issue) => (
                <DraggableIssueCard
                  key={issue.id}
                  issue={issue}
                  {...(onIssueClick !== undefined && { onClick: onIssueClick })}
                />
              ))}
            </StatusColumn>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeIssue && (
          <DraggableIssueCard issue={activeIssue} isOverlay />
        )}
      </DragOverlay>
    </DndContext>
  );
}
