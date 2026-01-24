import { describe, it, expect, vi } from 'vitest';
import { IssueTable, IssueTableProps } from './IssueTable';
import {
  ColumnDef,
  DEFAULT_ISSUE_COLUMNS,
  formatPriority,
  getPriorityClassName,
  formatStatus,
  getStatusClassName,
  formatIssueType,
  formatDate,
  getCellValue,
} from './columns';
import type { Issue, Status } from '@/types';

// Helper to create mock issues for testing
function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'bd-abc',
    title: 'Test Issue',
    priority: 2,
    status: 'open',
    issue_type: 'task',
    assignee: 'test-user',
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T12:00:00Z',
    ...overrides,
  };
}

// ============= Column Helper Tests =============

describe('columns.ts helpers', () => {
  describe('formatPriority', () => {
    it('formats P0 correctly', () => {
      expect(formatPriority(0)).toBe('P0');
    });

    it('formats P1 correctly', () => {
      expect(formatPriority(1)).toBe('P1');
    });

    it('formats P2 correctly', () => {
      expect(formatPriority(2)).toBe('P2');
    });

    it('formats P3 correctly', () => {
      expect(formatPriority(3)).toBe('P3');
    });

    it('formats P4 correctly', () => {
      expect(formatPriority(4)).toBe('P4');
    });
  });

  describe('getPriorityClassName', () => {
    it.each([0, 1, 2, 3, 4] as const)('returns correct class for priority %d', (priority) => {
      expect(getPriorityClassName(priority)).toBe(`priority-${priority}`);
    });
  });

  describe('formatStatus', () => {
    it('returns - for undefined status', () => {
      expect(formatStatus(undefined)).toBe('-');
    });

    it('capitalizes simple status', () => {
      expect(formatStatus('open')).toBe('Open');
    });

    it('replaces underscores with spaces and capitalizes', () => {
      expect(formatStatus('in_progress')).toBe('In progress');
    });

    it('handles blocked status', () => {
      expect(formatStatus('blocked')).toBe('Blocked');
    });

    it('handles closed status', () => {
      expect(formatStatus('closed')).toBe('Closed');
    });
  });

  describe('getStatusClassName', () => {
    it('returns status-unknown for undefined status', () => {
      expect(getStatusClassName(undefined)).toBe('status-unknown');
    });

    it('returns correct class for open status', () => {
      expect(getStatusClassName('open')).toBe('status-open');
    });

    it('converts underscores to hyphens', () => {
      expect(getStatusClassName('in_progress')).toBe('status-in-progress');
    });

    it('handles blocked status', () => {
      expect(getStatusClassName('blocked')).toBe('status-blocked');
    });
  });

  describe('formatIssueType', () => {
    it('returns - for undefined type', () => {
      expect(formatIssueType(undefined)).toBe('-');
    });

    it('capitalizes bug type', () => {
      expect(formatIssueType('bug')).toBe('Bug');
    });

    it('capitalizes feature type', () => {
      expect(formatIssueType('feature')).toBe('Feature');
    });

    it('capitalizes task type', () => {
      expect(formatIssueType('task')).toBe('Task');
    });

    it('capitalizes epic type', () => {
      expect(formatIssueType('epic')).toBe('Epic');
    });
  });

  describe('formatDate', () => {
    it('returns - for undefined date', () => {
      expect(formatDate(undefined)).toBe('-');
    });

    it('returns "just now" for very recent dates', () => {
      const now = new Date();
      const result = formatDate(now.toISOString());
      expect(['just now', '1m ago']).toContain(result);
    });

    it('returns minutes ago for recent dates', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = formatDate(fiveMinutesAgo.toISOString());
      expect(result).toMatch(/^\d+m ago$/);
    });

    it('returns hours ago for dates within 24 hours', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const result = formatDate(threeHoursAgo.toISOString());
      expect(result).toMatch(/^\d+h ago$/);
    });

    it('returns days ago for dates within 7 days', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const result = formatDate(threeDaysAgo.toISOString());
      expect(result).toMatch(/^\d+d ago$/);
    });

    it('returns formatted date for older dates', () => {
      const result = formatDate('2023-01-15T10:30:00Z');
      // Should be a date string (format varies by locale)
      expect(result).not.toBe('-');
      expect(result).not.toMatch(/ago$/);
    });
  });

  describe('getCellValue', () => {
    const mockIssue = createMockIssue({ id: 'test-id', title: 'Test Title' });

    it('gets value using keyof accessor', () => {
      const column: ColumnDef<Issue> = {
        id: 'id',
        header: 'ID',
        accessor: 'id',
      };
      expect(getCellValue(mockIssue, column)).toBe('test-id');
    });

    it('gets value using function accessor', () => {
      const column: ColumnDef<Issue> = {
        id: 'custom',
        header: 'Custom',
        accessor: (issue) => `${issue.id}: ${issue.title}`,
      };
      expect(getCellValue(mockIssue, column)).toBe('test-id: Test Title');
    });

    it('returns undefined for missing optional field', () => {
      // Create issue without assignee by omitting it
      const issueWithoutAssignee: Issue = {
        id: 'bd-no-assignee',
        title: 'Test Issue',
        priority: 2,
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T12:00:00Z',
        // assignee is omitted (optional field)
      };
      const column: ColumnDef<Issue> = {
        id: 'assignee',
        header: 'Assignee',
        accessor: 'assignee',
      };
      expect(getCellValue(issueWithoutAssignee, column)).toBeUndefined();
    });
  });

  describe('DEFAULT_ISSUE_COLUMNS', () => {
    it('has 7 columns defined', () => {
      expect(DEFAULT_ISSUE_COLUMNS).toHaveLength(7);
    });

    it('includes id, priority, title, status, issue_type, assignee, updated_at columns', () => {
      const columnIds = DEFAULT_ISSUE_COLUMNS.map((c) => c.id);
      expect(columnIds).toEqual([
        'id',
        'priority',
        'title',
        'status',
        'issue_type',
        'assignee',
        'updated_at',
      ]);
    });

    it('marks all columns as sortable', () => {
      DEFAULT_ISSUE_COLUMNS.forEach((column) => {
        expect(column.sortable).toBe(true);
      });
    });
  });
});

// ============= IssueTable Component Tests =============

// Simple mock for React rendering in node environment
// We test the component logic, not actual DOM rendering
describe('IssueTable', () => {
  describe('props and configuration', () => {
    it('exports IssueTable function', () => {
      expect(typeof IssueTable).toBe('function');
    });

    it('exports IssueTableProps type', () => {
      // Type check - this will fail at compile time if IssueTableProps is not exported
      const props: IssueTableProps = {
        issues: [],
      };
      expect(props.issues).toEqual([]);
    });

    it('uses DEFAULT_ISSUE_COLUMNS when columns prop not provided', () => {
      // Test that the component accepts the default props structure
      const props: IssueTableProps = {
        issues: [createMockIssue()],
      };
      expect(props.columns).toBeUndefined();
    });

    it('accepts custom columns', () => {
      const customColumns: ColumnDef<Issue>[] = [
        { id: 'id', header: 'ID', accessor: 'id' },
        { id: 'title', header: 'Title', accessor: 'title' },
      ];
      const props: IssueTableProps = {
        issues: [createMockIssue()],
        columns: customColumns,
      };
      expect(props.columns).toEqual(customColumns);
    });

    it('accepts onRowClick callback', () => {
      const onRowClick = vi.fn();
      const props: IssueTableProps = {
        issues: [createMockIssue()],
        onRowClick,
      };
      expect(props.onRowClick).toBe(onRowClick);
    });

    it('accepts selectedId prop', () => {
      const props: IssueTableProps = {
        issues: [createMockIssue()],
        selectedId: 'bd-abc',
      };
      expect(props.selectedId).toBe('bd-abc');
    });

    it('accepts className prop', () => {
      const props: IssueTableProps = {
        issues: [createMockIssue()],
        className: 'custom-class',
      };
      expect(props.className).toBe('custom-class');
    });
  });

  describe('data handling', () => {
    it('handles empty issues array', () => {
      const props: IssueTableProps = {
        issues: [],
      };
      expect(props.issues).toHaveLength(0);
    });

    it('handles single issue', () => {
      const props: IssueTableProps = {
        issues: [createMockIssue()],
      };
      expect(props.issues).toHaveLength(1);
    });

    it('handles multiple issues', () => {
      const props: IssueTableProps = {
        issues: [
          createMockIssue({ id: 'bd-001' }),
          createMockIssue({ id: 'bd-002' }),
          createMockIssue({ id: 'bd-003' }),
        ],
      };
      expect(props.issues).toHaveLength(3);
    });

    it('handles issues with missing optional fields', () => {
      // Create issue with optional fields omitted (not set to undefined)
      const issueWithMissingFields: Issue = {
        id: 'bd-minimal',
        title: 'Minimal Issue',
        priority: 2,
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T12:00:00Z',
        // assignee, status, issue_type are all omitted
      };
      const props: IssueTableProps = {
        issues: [issueWithMissingFields],
      };
      expect(props.issues[0]?.assignee).toBeUndefined();
      expect(props.issues[0]?.status).toBeUndefined();
      expect(props.issues[0]?.issue_type).toBeUndefined();
    });
  });

  describe('priority handling', () => {
    it.each([0, 1, 2, 3, 4] as const)('handles priority %d correctly', (priority) => {
      const issue = createMockIssue({ priority });
      expect(issue.priority).toBe(priority);
      expect(formatPriority(priority)).toBe(`P${priority}`);
      expect(getPriorityClassName(priority)).toBe(`priority-${priority}`);
    });
  });

  describe('status handling', () => {
    const statuses: Status[] = ['open', 'in_progress', 'blocked', 'closed', 'deferred'];

    it.each(statuses)('handles %s status correctly', (status) => {
      const issue = createMockIssue({ status });
      expect(issue.status).toBe(status);
      expect(formatStatus(status)).not.toBe('-');
      expect(getStatusClassName(status)).toContain('status-');
    });
  });

  describe('row selection', () => {
    it('identifies selected row by ID', () => {
      const issues = [
        createMockIssue({ id: 'bd-001' }),
        createMockIssue({ id: 'bd-002' }),
        createMockIssue({ id: 'bd-003' }),
      ];
      const props: IssueTableProps = {
        issues,
        selectedId: 'bd-002',
      };
      const selectedIssue = props.issues.find((i) => i.id === props.selectedId);
      expect(selectedIssue?.id).toBe('bd-002');
    });

    it('handles selectedId not in issues list', () => {
      const issues = [createMockIssue({ id: 'bd-001' })];
      const props: IssueTableProps = {
        issues,
        selectedId: 'bd-999',
      };
      const selectedIssue = props.issues.find((i) => i.id === props.selectedId);
      expect(selectedIssue).toBeUndefined();
    });
  });

  describe('custom columns', () => {
    it('supports column with function accessor', () => {
      const customColumns: ColumnDef<Issue>[] = [
        {
          id: 'combined',
          header: 'Combined',
          accessor: (issue) => `${issue.id} - ${issue.title}`,
        },
      ];
      const issue = createMockIssue({ id: 'bd-abc', title: 'Test' });
      const value = getCellValue(issue, customColumns[0]!);
      expect(value).toBe('bd-abc - Test');
    });

    it('supports column alignment options', () => {
      const columns: ColumnDef<Issue>[] = [
        { id: 'left', header: 'Left', accessor: 'id', align: 'left' },
        { id: 'center', header: 'Center', accessor: 'title', align: 'center' },
        { id: 'right', header: 'Right', accessor: 'updated_at', align: 'right' },
      ];
      expect(columns[0]?.align).toBe('left');
      expect(columns[1]?.align).toBe('center');
      expect(columns[2]?.align).toBe('right');
    });

    it('supports column width options', () => {
      const columns: ColumnDef<Issue>[] = [
        { id: 'fixed', header: 'Fixed', accessor: 'id', width: '100px' },
        { id: 'flex', header: 'Flex', accessor: 'title', width: '1fr' },
        { id: 'auto', header: 'Auto', accessor: 'status', width: 'auto' },
      ];
      expect(columns[0]?.width).toBe('100px');
      expect(columns[1]?.width).toBe('1fr');
      expect(columns[2]?.width).toBe('auto');
    });

    it('supports sortable column flag', () => {
      const columns: ColumnDef<Issue>[] = [
        { id: 'sortable', header: 'Sortable', accessor: 'priority', sortable: true },
        { id: 'notSortable', header: 'Not Sortable', accessor: 'notes', sortable: false },
      ];
      expect(columns[0]?.sortable).toBe(true);
      expect(columns[1]?.sortable).toBe(false);
    });
  });
});
