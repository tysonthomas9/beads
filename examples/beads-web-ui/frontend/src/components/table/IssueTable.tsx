/**
 * IssueTable component for displaying issues in a table format.
 * Foundational component for Phase 4 List/Table View.
 */

import type { Issue } from '@/types';
import { ColumnDef, DEFAULT_ISSUE_COLUMNS } from './columns';
import { IssueRow } from './IssueRow';
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
  /** Whether to show checkbox column */
  showCheckbox?: boolean;
  /** Set of selected issue IDs */
  selectedIds?: Set<string>;
  /** Callback when checkbox selection changes */
  onSelectionChange?: (issueId: string, selected: boolean) => void;
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
  showCheckbox,
  selectedIds,
  onSelectionChange,
}: IssueTableProps) {
  const tableClassName = ['issue-table', className].filter(Boolean).join(' ');

  return (
    <div className="issue-table__wrapper">
      <table className={tableClassName} data-testid="issue-table">
        <thead className="issue-table__head">
          <tr>
            {showCheckbox && (
              <th className="issue-table__header-cell issue-table__header-cell--checkbox">
                {/* Header checkbox will be added in a future task */}
                <span className="sr-only">Select</span>
              </th>
            )}
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
                colSpan={columns.length + (showCheckbox ? 1 : 0)}
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
                isSelected={showCheckbox ? selectedIds?.has(issue.id) : selectedId === issue.id}
                isClickable={!!onRowClick}
                onClick={onRowClick}
                showCheckbox={showCheckbox}
                onSelectionChange={onSelectionChange}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default IssueTable;
