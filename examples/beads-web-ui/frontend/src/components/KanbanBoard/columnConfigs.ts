/**
 * Default column configurations for the 6-column kanban layout.
 *
 * Columns:
 * - Backlog: Issues not yet actionable (blocked by deps, blocked status, or deferred)
 * - Open: Open issues with no blockers (can be started immediately)
 * - Blocked: Issues blocked by dependencies
 * - In Progress: Issues actively being worked on
 * - Needs Review: Issues needing human attention (review, [Need Review])
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
const needsReviewByTitle = (title: string): boolean => title.includes('[Need Review]');

export const DEFAULT_COLUMNS: KanbanColumnConfig[] = [
  {
    id: 'backlog',
    label: 'Backlog',
    filter: (issue, blockedInfo) =>
      issue.issue_type !== 'epic' &&
      (((issue.status === 'open' || issue.status === undefined) &&
        !!blockedInfo &&
        blockedInfo.blockedByCount > 0) ||
        issue.status === 'deferred') &&
      !needsReviewByTitle(issue.title),
    droppableDisabled: true, // Cannot drop TO backlog (auto-calculated)
    allowedDropTargets: ['done'], // Can only drag FROM backlog to Done
    style: 'muted',
  },
  {
    id: 'ready',
    label: 'Open',
    filter: (issue, blockedInfo) =>
      issue.issue_type !== 'epic' &&
      (issue.status === 'open' || issue.status === undefined) &&
      (!blockedInfo || blockedInfo.blockedByCount === 0) &&
      !needsReviewByTitle(issue.title),
    targetStatus: 'open',
    allowedDropTargets: ['ready', 'blocked', 'in_progress', 'review', 'done'],
    style: 'normal',
  },
  {
    id: 'blocked',
    label: 'Blocked',
    filter: (issue) =>
      issue.issue_type !== 'epic' && issue.status === 'blocked' && !needsReviewByTitle(issue.title),
    targetStatus: 'blocked',
    allowedDropTargets: ['ready', 'blocked', 'in_progress', 'review', 'done'],
    style: 'normal',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    filter: (issue) => issue.issue_type !== 'epic' && issue.status === 'in_progress',
    targetStatus: 'in_progress',
    allowedDropTargets: ['ready', 'blocked', 'in_progress', 'review', 'done'],
    style: 'normal',
  },
  {
    id: 'review',
    label: 'Needs Review',
    filter: (issue) =>
      issue.issue_type !== 'epic' && (issue.status === 'review' || needsReviewByTitle(issue.title)),
    targetStatus: 'review',
    allowedDropTargets: ['ready', 'blocked', 'in_progress', 'review', 'done'],
    style: 'normal',
  },
  {
    id: 'done',
    label: 'Done',
    filter: (issue) => issue.status === 'closed',
    targetStatus: 'closed',
    allowedDropTargets: ['ready', 'blocked', 'in_progress', 'review', 'done'],
    style: 'normal',
  },
];
