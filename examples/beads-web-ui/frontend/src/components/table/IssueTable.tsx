/**
 * IssueTable component for displaying issues in a table format.
 * Foundational component for Phase 4 List/Table View.
 */

import type { ReactNode, KeyboardEvent } from 'react';
import type { Issue, Priority, Status, IssueType } from '@/types';
import {
  ColumnDef,
  DEFAULT_ISSUE_COLUMNS,
  getCellValue,
  formatPriority,
  getPriorityClassName,
  formatStatus,
  getStatusClassName,
  formatIssueType,
  formatDate,
} from './columns';
import './IssueTable.css';

export interface IssueTableProps {
  /** Array of issues to display */
  issues: Issue[];
  /** Custom column definitions (defaults to DEFAULT_ISSUE_COLUMNS) */
  columns?: ColumnDef<Issue>[];
  /** Callback when a row is clicked */
  onRowClick?: (issue: Issue) => void;
  /** ID of the currently selected issue */
  selectedId?: string;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Render a cell value based on column type.
 */
function renderCellContent(
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

/**
 * IssueTable displays issues in a semantic HTML table with column definitions,
 * row selection, and click handling.
 */
export function IssueTable({
  issues,
  columns = DEFAULT_ISSUE_COLUMNS,
  onRowClick,
  selectedId,
  className,
}: IssueTableProps) {
  const tableClassName = ['issue-table', className].filter(Boolean).join(' ');

  const handleRowClick = (issue: Issue) => {
    onRowClick?.(issue);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    issue: Issue
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick?.(issue);
    }
  };

  return (
    <div className="issue-table__wrapper">
      <table className={tableClassName} data-testid="issue-table">
        <thead className="issue-table__head">
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                className="issue-table__header-cell"
                style={{
                  width: column.width,
                  textAlign: column.align ?? 'left',
                }}
                data-column={column.id}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="issue-table__body">
          {issues.length === 0 ? (
            <tr className="issue-table__empty-row">
              <td
                colSpan={columns.length}
                className="issue-table__empty-cell"
                data-testid="issue-table-empty"
              >
                No issues to display
              </td>
            </tr>
          ) : (
            issues.map((issue) => {
              const isSelected = selectedId === issue.id;
              const rowClassName = [
                'issue-table__row',
                isSelected ? 'issue-table__row--selected' : '',
                onRowClick ? 'issue-table__row--clickable' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <tr
                  key={issue.id}
                  className={rowClassName}
                  onClick={() => handleRowClick(issue)}
                  onKeyDown={(e) => handleKeyDown(e, issue)}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? 'button' : undefined}
                  aria-selected={isSelected}
                  data-testid={`issue-row-${issue.id}`}
                >
                  {columns.map((column) => {
                    const value = getCellValue(issue, column);
                    return (
                      <td
                        key={column.id}
                        className="issue-table__cell"
                        style={{ textAlign: column.align ?? 'left' }}
                        data-column={column.id}
                      >
                        {renderCellContent(column.id, value, issue)}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default IssueTable;
