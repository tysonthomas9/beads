/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for columnConfigs – verifies the 6-column kanban layout:
 * Backlog, Open, Blocked, In Progress, Needs Review, Done.
 *
 * Backlog: Open issues blocked by dependencies, or deferred status.
 * Blocked: Issues with status=blocked.
 * Needs Review: Issues with status=review or [Need Review] title.
 */

import { describe, it, expect } from 'vitest';

import { DEFAULT_COLUMNS } from '../columnConfigs';
import type { Issue } from '@/types';
import type { BlockedInfo } from '../KanbanBoard';

/**
 * Create a mock issue for testing column filters.
 */
function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: `issue-${Math.random().toString(36).slice(2, 9)}`,
    title: 'Test Issue',
    priority: 2,
    status: 'open',
    issue_type: 'task',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Convenience helpers to look up column configs by id.
 */
function getColumn(id: string) {
  const col = DEFAULT_COLUMNS.find((c) => c.id === id);
  if (!col) throw new Error(`Column "${id}" not found`);
  return col;
}

const blocked: BlockedInfo = { blockedByCount: 1, blocksCount: 0 };
const notBlocked: BlockedInfo = { blockedByCount: 0, blocksCount: 0 };

describe('columnConfigs', () => {
  // ---------------------------------------------------------------
  // 1. Column order and identity
  // ---------------------------------------------------------------
  describe('Column order and identity', () => {
    it('has 6 columns', () => {
      expect(DEFAULT_COLUMNS.length).toBe(6);
    });

    it('has id "backlog" at index 0', () => {
      expect(DEFAULT_COLUMNS[0].id).toBe('backlog');
    });

    it('has label "Backlog" at index 0', () => {
      expect(DEFAULT_COLUMNS[0].label).toBe('Backlog');
    });

    it('has id "ready" (Open) at index 1', () => {
      expect(DEFAULT_COLUMNS[1].id).toBe('ready');
    });

    it('has label "Open" at index 1', () => {
      expect(DEFAULT_COLUMNS[1].label).toBe('Open');
    });

    it('has id "blocked" at index 2', () => {
      expect(DEFAULT_COLUMNS[2].id).toBe('blocked');
    });

    it('has label "Blocked" at index 2', () => {
      expect(DEFAULT_COLUMNS[2].label).toBe('Blocked');
    });

    it('has label "Needs Review" for review column', () => {
      expect(getColumn('review').label).toBe('Needs Review');
    });
  });

  // ---------------------------------------------------------------
  // 2-5. Backlog filter (blocked by dependencies or deferred)
  // ---------------------------------------------------------------
  describe('Backlog filter', () => {
    const backlog = getColumn('backlog');

    it('matches open issues blocked by dependencies (blockedByCount > 0)', () => {
      const issue = createMockIssue({ status: 'open' });
      expect(backlog.filter(issue, blocked)).toBe(true);
    });

    it('does NOT match issues with status=blocked (goes to Blocked column)', () => {
      const issue = createMockIssue({ status: 'blocked' });
      expect(backlog.filter(issue, notBlocked)).toBe(false);
    });

    it('matches issues with status=deferred', () => {
      const issue = createMockIssue({ status: 'deferred' });
      expect(backlog.filter(issue, notBlocked)).toBe(true);
    });

    it('rejects [Need Review] titled issues even if blocked', () => {
      const issue = createMockIssue({
        title: '[Need Review] Fix login flow',
        status: 'open',
      });
      expect(backlog.filter(issue, blocked)).toBe(false);
    });

    it('rejects [Need Review] titled issues even if deferred', () => {
      const issue = createMockIssue({
        title: '[Need Review] Cleanup',
        status: 'deferred',
      });
      expect(backlog.filter(issue, notBlocked)).toBe(false);
    });

    it('rejects open issues with no blockers', () => {
      const issue = createMockIssue({ status: 'open' });
      expect(backlog.filter(issue, notBlocked)).toBe(false);
    });

    it('rejects open issues when blockedInfo is undefined', () => {
      const issue = createMockIssue({ status: 'open' });
      expect(backlog.filter(issue, undefined)).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Blocked column filter
  // ---------------------------------------------------------------
  describe('Blocked column filter', () => {
    const blockedCol = getColumn('blocked');

    it('matches issues with status=blocked', () => {
      const issue = createMockIssue({ status: 'blocked' });
      expect(blockedCol.filter(issue, notBlocked)).toBe(true);
    });

    it('does NOT match open issues', () => {
      const issue = createMockIssue({ status: 'open' });
      expect(blockedCol.filter(issue, notBlocked)).toBe(false);
    });

    it('does NOT match deferred issues', () => {
      const issue = createMockIssue({ status: 'deferred' });
      expect(blockedCol.filter(issue, notBlocked)).toBe(false);
    });

    it('rejects [Need Review] titled issues even if blocked status', () => {
      const issue = createMockIssue({
        title: '[Need Review] Fix bug',
        status: 'blocked',
      });
      expect(blockedCol.filter(issue, notBlocked)).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // 6-8. Review filter (Needs Review)
  // ---------------------------------------------------------------
  describe('Review filter', () => {
    const review = getColumn('review');

    it('does NOT match status=blocked issues without [Need Review] title', () => {
      const issue = createMockIssue({ status: 'blocked' });
      expect(review.filter(issue, notBlocked)).toBe(false);
    });

    it('matches status=review issues', () => {
      const issue = createMockIssue({ status: 'review' });
      expect(review.filter(issue, notBlocked)).toBe(true);
    });

    it('matches [Need Review] titled issues', () => {
      const issue = createMockIssue({
        title: '[Need Review] Update docs',
        status: 'open',
      });
      expect(review.filter(issue, notBlocked)).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // 9. Ready column still works
  // ---------------------------------------------------------------
  describe('Ready filter', () => {
    const ready = getColumn('ready');

    it('matches open issues with no blockers and no [Need Review]', () => {
      const issue = createMockIssue({ status: 'open' });
      expect(ready.filter(issue, notBlocked)).toBe(true);
    });

    it('matches issues with undefined status (treated as open)', () => {
      const issue = createMockIssue({ status: undefined });
      expect(ready.filter(issue, notBlocked)).toBe(true);
    });

    it('rejects open issues that have blockers', () => {
      const issue = createMockIssue({ status: 'open' });
      expect(ready.filter(issue, blocked)).toBe(false);
    });

    it('rejects [Need Review] titled issues', () => {
      const issue = createMockIssue({
        title: '[Need Review] Refactor API',
        status: 'open',
      });
      expect(ready.filter(issue, notBlocked)).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Column style configuration
  // ---------------------------------------------------------------
  describe('Column style configuration', () => {
    it('review column has style "normal" (not highlighted)', () => {
      const review = getColumn('review');
      expect(review.style).toBe('normal');
    });

    it('backlog column has style "muted"', () => {
      const backlog = getColumn('backlog');
      expect(backlog.style).toBe('muted');
    });

    it('all non-backlog columns have style "normal"', () => {
      const nonBacklog = DEFAULT_COLUMNS.filter((c) => c.id !== 'backlog');
      for (const col of nonBacklog) {
        expect(col.style).toBe('normal');
      }
    });
  });

  // ---------------------------------------------------------------
  // Epic exclusion from kanban columns
  // ---------------------------------------------------------------
  describe('Epic exclusion from kanban columns', () => {
    it('excludes epics from Ready (Open)', () => {
      const issue = createMockIssue({ issue_type: 'epic', status: 'open' });
      expect(getColumn('ready').filter(issue, notBlocked)).toBe(false);
    });

    it('excludes epics from Backlog (open + blocked)', () => {
      const issue = createMockIssue({ issue_type: 'epic', status: 'open' });
      expect(getColumn('backlog').filter(issue, blocked)).toBe(false);
    });

    it('excludes epics from Blocked column', () => {
      const issue = createMockIssue({ issue_type: 'epic', status: 'blocked' });
      expect(getColumn('blocked').filter(issue, notBlocked)).toBe(false);
    });

    it('excludes epics from Backlog (deferred status)', () => {
      const issue = createMockIssue({ issue_type: 'epic', status: 'deferred' });
      expect(getColumn('backlog').filter(issue, notBlocked)).toBe(false);
    });

    it('excludes epics from In Progress', () => {
      const issue = createMockIssue({ issue_type: 'epic', status: 'in_progress' });
      expect(getColumn('in_progress').filter(issue, notBlocked)).toBe(false);
    });

    it('excludes epics from Review (status)', () => {
      const issue = createMockIssue({ issue_type: 'epic', status: 'review' });
      expect(getColumn('review').filter(issue, notBlocked)).toBe(false);
    });

    it('excludes epics from Review (title)', () => {
      const issue = createMockIssue({
        issue_type: 'epic',
        title: '[Need Review] Epic cleanup',
      });
      expect(getColumn('review').filter(issue, notBlocked)).toBe(false);
    });

    it('includes epics in Done', () => {
      const issue = createMockIssue({ issue_type: 'epic', status: 'closed' });
      expect(getColumn('done').filter(issue, notBlocked)).toBe(true);
    });

    it('still includes non-epic tasks in Ready (regression)', () => {
      const issue = createMockIssue({ issue_type: 'task', status: 'open' });
      expect(getColumn('ready').filter(issue, notBlocked)).toBe(true);
    });

    it('still includes undefined issue_type in Ready (regression)', () => {
      const issue = createMockIssue({ issue_type: undefined, status: 'open' });
      expect(getColumn('ready').filter(issue, notBlocked)).toBe(true);
    });
  });
});
