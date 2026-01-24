/**
 * IssueTable component for displaying issues in a table format.
 * Foundational component for Phase 4 List/Table View.
 */

import type { Issue } from '@/types';
import { useSort, SortDirection } from '@/hooks';
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
  /** Whether to show checkbox column */
  showCheckbox?: boolean;
  /** Set of selected issue IDs */
  selectedIds?: Set<string>;
  /** Callback when checkbox selection changes */
  onSelectionChange?: (issueId: string, selected: boolean) => void;
  /** Enable sorting functionality (default: false for backwards compatibility) */
  sortable?: boolean;
  /** Initial sort configuration (only used when sortable=true) */
  initialSort?: {
    key: string;
    direction: SortDirection;
  };
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
  sortable = false,
  initialSort,
}: IssueTableProps) {
  // Use the useSort hook for sorting
  const {
    sortedData,
    sortState: hookSortState,
    handleSort: hookHandleSort,
  } = useSort({
    data: issues,
    columns,
    initialKey: sortable ? (initialSort?.key ?? null) : null,
    initialDirection: initialSort?.direction ?? 'asc',
  });

  // Use sorted data when sortable, otherwise original issues
  const displayData = sortable ? sortedData : issues;

  // Use hook state and handlers when sortable, otherwise provide stable defaults
  // Note: Even when sortable=false, TableHeader still handles UI state internally
  // but the data won't actually be sorted since we pass the original issues array
  const sortState: SortState = sortable ? hookSortState : { key: null, direction: 'asc' };
  const handleSort = sortable ? hookHandleSort : () => {};

  const tableClassName = ['issue-table', className].filter(Boolean).join(' ');

  return (
    <div className="issue-table__wrapper">
      <table className={tableClassName} data-testid="issue-table">
        <TableHeader
          columns={columns}
          sortState={sortState}
          onSort={handleSort}
          {...(showCheckbox !== undefined && { showCheckbox })}
        />
        <tbody className="issue-table__body">
          {displayData.length === 0 ? (
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
            displayData.map((issue) => (
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
