/**
 * IssueRow component for rendering a single table row.
 * Encapsulates row rendering logic from IssueTable for better separation of concerns.
 */

import type { KeyboardEvent } from 'react';
import type { Issue } from '@/types';
import type { ColumnDef } from './columns';
import { getCellValue } from './columns';
import { renderCellContent } from './cellRenderers';

/**
 * Props for IssueRow component.
 * Generic over row type T (extends Issue) to work with ColumnDef<T>.
 */
export interface IssueRowProps<T extends Issue> {
  /** The issue data to render */
  issue: T;
  /** Column definitions for cell rendering */
  columns: ColumnDef<T>[];
  /** Whether this row is selected */
  isSelected?: boolean | undefined;
  /** Whether the row is clickable */
  isClickable?: boolean | undefined;
  /** Callback when row is clicked */
  onClick?: ((issue: T) => void) | undefined;
  /** Additional CSS class name */
  className?: string | undefined;
}

/**
 * IssueRow renders a single table row within IssueTable.
 * Handles cell rendering, selection state, click/keyboard interactions, and accessibility.
 */
export function IssueRow<T extends Issue>({
  issue,
  columns,
  isSelected = false,
  isClickable = false,
  onClick,
  className,
}: IssueRowProps<T>) {
  const handleClick = () => {
    if (isClickable && onClick) {
      onClick(issue);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (isClickable && onClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onClick(issue);
    }
  };

  const rowClassName = [
    'issue-table__row',
    isSelected ? 'issue-table__row--selected' : '',
    isClickable ? 'issue-table__row--clickable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <tr
      className={rowClassName}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={isClickable ? 0 : undefined}
      aria-selected={isClickable ? isSelected : undefined}
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
}

export default IssueRow;
