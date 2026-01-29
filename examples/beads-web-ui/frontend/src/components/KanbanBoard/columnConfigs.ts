/**
 * Default column configurations for the 5-column kanban layout.
 *
 * Columns:
 * - Ready: Open issues with no blockers (can be started immediately)
 * - Pending: Open issues blocked by dependencies (auto-calculated)
 * - In Progress: Issues actively being worked on
 * - Review: Issues needing human attention (review, blocked, [Need Review])
 * - Done: Closed issues
 */

import type { KanbanColumnConfig } from './types';

/**
 * Default kanban columns for multi-agent workflows.
 * Order matters: filter functions are evaluated in order, issue belongs to first match.
 */
/**
 * Helper to check if issue needs review based on title.
 */
const needsReviewByTitle = (title: string): boolean =>
  title.includes('[Need Review]');

export const DEFAULT_COLUMNS: KanbanColumnConfig[] = [
  {
    id: 'ready',
    label: 'Ready',
    filter: (issue, blockedInfo) =>
      (issue.status === 'open' || issue.status === undefined) &&
      (!blockedInfo || blockedInfo.blockedByCount === 0) &&
      !needsReviewByTitle(issue.title),
    targetStatus: 'open',
    allowedDropTargets: ['ready', 'in_progress', 'review', 'done'],
    style: 'normal',
  },
  {
    id: 'pending',
    label: 'Pending',
    filter: (issue, blockedInfo) =>
      (issue.status === 'open' || issue.status === undefined) &&
      !!blockedInfo &&
      blockedInfo.blockedByCount > 0 &&
      !needsReviewByTitle(issue.title),
    droppableDisabled: true, // Cannot drop TO pending (auto-calculated)
    allowedDropTargets: ['done'], // Can only drag FROM pending to Done
    style: 'muted',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    filter: (issue) => issue.status === 'in_progress',
    targetStatus: 'in_progress',
    allowedDropTargets: ['ready', 'in_progress', 'review', 'done'],
    style: 'normal',
  },
  {
    id: 'review',
    label: 'Review',
    filter: (issue) =>
      issue.status === 'review' ||
      issue.status === 'blocked' ||
      needsReviewByTitle(issue.title),
    targetStatus: 'review',
    allowedDropTargets: ['ready', 'in_progress', 'review', 'done'],
    style: 'highlighted',
  },
  {
    id: 'done',
    label: 'Done',
    filter: (issue) => issue.status === 'closed',
    targetStatus: 'closed',
    allowedDropTargets: ['ready', 'in_progress', 'review', 'done'],
    style: 'normal',
  },
];
