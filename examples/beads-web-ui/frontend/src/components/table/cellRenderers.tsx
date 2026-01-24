/**
 * Cell rendering functions for IssueTable and IssueRow.
 * Extracted to enable code sharing between components.
 */

import type { ReactNode } from 'react';
import type { Issue, Priority, Status, IssueType } from '@/types';
import {
  formatPriority,
  getPriorityClassName,
  formatStatus,
  getStatusClassName,
  formatIssueType,
  formatDate,
} from './columns';

/**
 * Render a cell value based on column type.
 * Used by both IssueTable and IssueRow for consistent cell rendering.
 */
export function renderCellContent(
  columnId: string,
  value: unknown,
  _issue: Issue
): ReactNode {
  switch (columnId) {
    case 'id':
      return <span className="issue-table__id">{String(value)}</span>;

    case 'priority': {
      const priority = value as Priority;
      const validPriority = priority >= 0 && priority <= 4 ? priority : 2;
      return (
        <span
          className={`issue-table__priority ${getPriorityClassName(validPriority)}`}
        >
          {formatPriority(validPriority)}
        </span>
      );
    }

    case 'title':
      return (
        <span className="issue-table__title" title={String(value)}>
          {String(value)}
        </span>
      );

    case 'status': {
      const status = value as Status | undefined;
      return (
        <span className={`issue-table__status ${getStatusClassName(status)}`}>
          {formatStatus(status)}
        </span>
      );
    }

    case 'issue_type': {
      const issueType = value as IssueType | undefined;
      return (
        <span className="issue-table__type">{formatIssueType(issueType)}</span>
      );
    }

    case 'assignee':
      return (
        <span className="issue-table__assignee">
          {value ? String(value) : '-'}
        </span>
      );

    case 'updated_at':
      return (
        <span className="issue-table__date">
          {formatDate(value as string | undefined)}
        </span>
      );

    default:
      return value != null ? String(value) : '-';
  }
}
