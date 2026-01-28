/**
 * SwimLaneBoard component for displaying issues grouped into horizontal swim lanes.
 * Each swim lane contains status columns, enabling a two-dimensional view of issues
 * organized by both their grouping (epic, assignee, priority, type, label) and workflow status.
 * When groupBy='none', delegates to KanbanBoard for a flat view.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
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
import type { BlockedInfo } from '@/components/KanbanBoard';
import { KanbanBoard } from '@/components/KanbanBoard';
import { SwimLane } from '@/components/SwimLane';
import { DraggableIssueCard } from '@/components/DraggableIssueCard';
import { groupIssuesByField, sortLanes, type GroupByField, type LaneGroup } from './groupingUtils';
import styles from './SwimLaneBoard.module.css';

/**
 * Storage key prefix for collapsed lanes state.
 * Combined with groupBy for unique key per grouping mode.
 */
const STORAGE_KEY_PREFIX = 'swimlane-collapsed-';

/**
 * Helper to get storage key for a groupBy mode.
 */
function getStorageKey(groupBy: GroupByField): string {
  return `${STORAGE_KEY_PREFIX}${groupBy}`;
}

/**
 * Helper to load collapsed lanes from localStorage.
 */
function loadCollapsedLanes(groupBy: GroupByField): Set<string> {
  if (groupBy === 'none') return new Set();
  try {
    const stored = localStorage.getItem(getStorageKey(groupBy));
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every((item): item is string => typeof item === 'string')) {
        return new Set(parsed);
      }
    }
  } catch {
    // Silently fail if localStorage unavailable or invalid JSON
  }
  return new Set();
}

/**
 * Helper to save collapsed lanes to localStorage.
 */
function saveCollapsedLanes(groupBy: GroupByField, lanes: Set<string>): void {
  if (groupBy === 'none') return;
  try {
    localStorage.setItem(getStorageKey(groupBy), JSON.stringify([...lanes]));
  } catch {
    // Silently fail if localStorage unavailable
  }
}

/**
 * Props for the SwimLaneBoard component.
 */
export interface SwimLaneBoardProps {
  /** Issues to display in the board */
  issues: Issue[];
  /** Field to group issues by */
  groupBy: GroupByField;
  /** Status columns to display */
  statuses?: Status[];
  /** Optional filter state (used by KanbanBoard fallback) */
  filters?: FilterState;
  /** Callback when an issue card is clicked */
  onIssueClick?: (issue: Issue) => void;
  /** Callback when drag ends - receives issue ID and new/old status */
  onDragEnd?: (issueId: string, newStatus: Status, oldStatus: Status) => void;
  /** Additional CSS class name */
  className?: string;
  /** Map of issue ID to blocked info */
  blockedIssues?: Map<string, BlockedInfo>;
  /** Whether to show blocked issues (default: true) */
  showBlocked?: boolean;
  /** Sort lanes by 'title' or 'count' (default: 'title') */
  sortLanesBy?: 'title' | 'count';
  /** Default collapsed state for new lanes (default: false) */
  defaultCollapsed?: boolean;
}

/** Default status columns to display */
const DEFAULT_STATUSES: Status[] = ['open', 'in_progress', 'closed'];

/**
 * SwimLaneBoard displays issues grouped into horizontal swim lanes.
 * Each lane represents a grouping (epic, assignee, priority, type, or label)
 * and contains status columns for drag-and-drop workflow management.
 */
export function SwimLaneBoard({
  issues,
  groupBy,
  statuses = DEFAULT_STATUSES,
  filters,
  onIssueClick,
  onDragEnd,
  className,
  blockedIssues,
  showBlocked = true,
  sortLanesBy = 'title',
  defaultCollapsed = false,
}: SwimLaneBoardProps): JSX.Element {
  // When groupBy='none', delegate to KanbanBoard
  if (groupBy === 'none') {
    // Build props conditionally to satisfy exactOptionalPropertyTypes
    const kanbanProps = {
      issues,
      statuses,
      showBlocked,
      ...(filters !== undefined && { filters }),
      ...(onIssueClick !== undefined && { onIssueClick }),
      ...(onDragEnd !== undefined && { onDragEnd }),
      ...(className !== undefined && { className }),
      ...(blockedIssues !== undefined && { blockedIssues }),
    };
    return <KanbanBoard {...kanbanProps} />;
  }

  // Build props conditionally to satisfy exactOptionalPropertyTypes
  const contentProps = {
    issues,
    groupBy,
    statuses,
    showBlocked,
    sortLanesBy,
    defaultCollapsed,
    ...(onIssueClick !== undefined && { onIssueClick }),
    ...(onDragEnd !== undefined && { onDragEnd }),
    ...(className !== undefined && { className }),
    ...(blockedIssues !== undefined && { blockedIssues }),
  };

  return <SwimLaneBoardContent {...contentProps} />;
}

/**
 * Internal component that handles the actual swim lane rendering.
 * Separated to allow hooks after early return in main component.
 */
function SwimLaneBoardContent({
  issues,
  groupBy,
  statuses,
  onIssueClick,
  onDragEnd,
  className,
  blockedIssues,
  showBlocked,
  sortLanesBy,
  defaultCollapsed,
}: Omit<SwimLaneBoardProps, 'filters' | 'groupBy'> & { groupBy: Exclude<GroupByField, 'none'> }): JSX.Element {
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  // Track lanes that have been toggled from their default state.
  // When defaultCollapsed=true, this tracks lanes that were EXPANDED (toggled to open).
  // When defaultCollapsed=false, this tracks lanes that were COLLAPSED (toggled to closed).
  // Initialize from localStorage for persistence across page refreshes.
  const [toggledLanes, setToggledLanes] = useState<Set<string>>(() =>
    loadCollapsedLanes(groupBy)
  );

  // Persist toggledLanes to localStorage when it changes
  useEffect(() => {
    saveCollapsedLanes(groupBy, toggledLanes);
  }, [toggledLanes, groupBy]);

  // When groupBy changes, reset toggledLanes from localStorage for the new groupBy mode
  useEffect(() => {
    setToggledLanes(loadCollapsedLanes(groupBy));
  }, [groupBy]);

  // Configure drag sensors with activation constraints
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  // Filter issues based on blocked visibility
  const filteredIssues = useMemo(() => {
    if (showBlocked || !blockedIssues) return issues;
    return issues.filter((issue) => !blockedIssues.has(issue.id));
  }, [issues, showBlocked, blockedIssues]);

  // Group and sort lanes
  const lanes = useMemo((): LaneGroup[] => {
    const grouped = groupIssuesByField(filteredIssues, groupBy);
    return sortLanes(grouped, sortLanesBy ?? 'title');
  }, [filteredIssues, groupBy, sortLanesBy]);

  // Toggle lane collapse state - adds/removes from toggled set
  const toggleLaneCollapse = useCallback((laneId: string) => {
    setToggledLanes((prev) => {
      const next = new Set(prev);
      if (next.has(laneId)) {
        next.delete(laneId);
      } else {
        next.add(laneId);
      }
      return next;
    });
  }, []);

  // Determine if a lane is collapsed based on defaultCollapsed and toggled state
  const isLaneCollapsed = useCallback(
    (laneId: string): boolean => {
      const isToggled = toggledLanes.has(laneId);
      // If defaultCollapsed=true, lanes start collapsed, toggling opens them
      // If defaultCollapsed=false, lanes start expanded, toggling closes them
      return defaultCollapsed ? !isToggled : isToggled;
    },
    [toggledLanes, defaultCollapsed]
  );

  // Expand all lanes
  const expandAll = useCallback(() => {
    if (defaultCollapsed) {
      // When defaultCollapsed=true, all lanes need to be in toggled set to be expanded
      const allLaneIds = new Set(lanes.map((lane) => lane.id));
      setToggledLanes(allLaneIds);
    } else {
      // When defaultCollapsed=false, clear toggled set to expand all
      setToggledLanes(new Set());
    }
  }, [lanes, defaultCollapsed]);

  // Collapse all lanes
  const collapseAll = useCallback(() => {
    if (defaultCollapsed) {
      // When defaultCollapsed=true, clear toggled set to collapse all
      setToggledLanes(new Set());
    } else {
      // When defaultCollapsed=false, add all lanes to toggled set to collapse them
      const allLaneIds = new Set(lanes.map((lane) => lane.id));
      setToggledLanes(allLaneIds);
    }
  }, [lanes, defaultCollapsed]);

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

  const rootClassName = [styles.swimLaneBoard, className].filter(Boolean).join(' ');

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={rootClassName} data-testid="swim-lane-board">
        {/* Expand/Collapse All toolbar - only show when there are multiple lanes */}
        {lanes.length > 1 && (
          <div className={styles.toolbar} role="toolbar" aria-label="Lane controls">
            <button
              type="button"
              className={styles.toolbarButton}
              onClick={expandAll}
              aria-label="Expand all lanes"
              data-testid="expand-all-lanes"
            >
              Expand All
            </button>
            <button
              type="button"
              className={styles.toolbarButton}
              onClick={collapseAll}
              aria-label="Collapse all lanes"
              data-testid="collapse-all-lanes"
            >
              Collapse All
            </button>
          </div>
        )}
        {lanes.map((lane) => {
          // Build props conditionally to satisfy exactOptionalPropertyTypes
          const laneProps = {
            id: lane.id,
            title: lane.title,
            issues: lane.issues,
            statuses: statuses ?? DEFAULT_STATUSES,
            isCollapsed: isLaneCollapsed(lane.id),
            onToggleCollapse: () => toggleLaneCollapse(lane.id),
            ...(onIssueClick !== undefined && { onIssueClick }),
            ...(blockedIssues !== undefined && { blockedIssues }),
            ...(showBlocked !== undefined && { showBlocked }),
          };
          return <SwimLane key={lane.id} {...laneProps} />;
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeIssue &&
          (() => {
            const blockedInfo = blockedIssues?.get(activeIssue.id);
            return (
              <DraggableIssueCard
                issue={activeIssue}
                isOverlay
                {...(blockedInfo !== undefined && {
                  blockedByCount: blockedInfo.blockedByCount,
                  blockedBy: blockedInfo.blockedBy,
                })}
              />
            );
          })()}
      </DragOverlay>
    </DndContext>
  );
}
