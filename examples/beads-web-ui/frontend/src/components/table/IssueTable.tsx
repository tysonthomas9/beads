/**
 * IssueTable component for displaying issues in a table format.
 * Foundational component for Phase 4 List/Table View.
 */

import { useState } from 'react';
import type { Issue } from '@/types';
import { ColumnDef, DEFAULT_ISSUE_COLUMNS } from './columns';
import { IssueRow } from './IssueRow';
import { TableHeader, SortState } from './TableHeader';
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
  // Sort state - stub implementation until useSort hook is connected (T045)
  const [sortState, setSortState] = useState<SortState>({
    key: null,
    direction: 'asc',
  });

  const handleSort = (columnId: string) => {
    setSortState((prev) => {
      if (prev.key !== columnId) {
        return { key: columnId, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key: columnId, direction: 'desc' };
      }
      return { key: null, direction: 'asc' };
    });
  };

  const tableClassName = ['issue-table', className].filter(Boolean).join(' ');

  return (
    <div className="issue-table__wrapper">
      <table className={tableClassName} data-testid="issue-table">
        <TableHeader
          columns={columns}
          sortState={sortState}
          onSort={handleSort}
        />
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
            issues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                columns={columns}
                isSelected={selectedId === issue.id}
                isClickable={!!onRowClick}
                onClick={onRowClick}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default IssueTable;
