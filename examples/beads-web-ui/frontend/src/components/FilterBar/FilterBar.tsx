/**
 * FilterBar component.
 * UI component for filtering issues by priority.
 * Integrates with useFilterState hook for URL synchronization.
 */

import { useCallback } from 'react';
import type { Priority } from '@/types';
import {
  useFilterState,
  type FilterState,
  type FilterActions,
  isEmptyFilter,
} from '@/hooks/useFilterState';
import styles from './FilterBar.module.css';

/**
 * Priority option for the dropdown.
 */
interface PriorityOption {
  /** Display label */
  label: string;
  /** Value (undefined = all) */
  value: Priority | undefined;
}

/**
 * Priority options for the dropdown.
 * Order: All, then P0-P4.
 */
const PRIORITY_OPTIONS: PriorityOption[] = [
  { label: 'All priorities', value: undefined },
  { label: 'P0 (Critical)', value: 0 },
  { label: 'P1 (High)', value: 1 },
  { label: 'P2 (Medium)', value: 2 },
  { label: 'P3 (Normal)', value: 3 },
  { label: 'P4 (Backlog)', value: 4 },
];

/**
 * Props for the FilterBar component.
 */
export interface FilterBarProps {
  /** Current filter state (controlled mode) */
  filters?: FilterState;
  /** Filter actions (controlled mode) */
  actions?: FilterActions;
  /** Additional CSS class name */
  className?: string;
  /** Show/hide clear button (defaults to auto-detect from filters) */
  showClear?: boolean;
}

/**
 * FilterBar renders a filter bar with priority dropdown.
 * Supports both controlled and uncontrolled modes.
 *
 * @example
 * ```tsx
 * // Uncontrolled mode (uses internal useFilterState)
 * <FilterBar />
 *
 * // Controlled mode (external state)
 * const [filters, actions] = useFilterState();
 * <FilterBar filters={filters} actions={actions} />
 * ```
 */
export function FilterBar({
  filters: externalFilters,
  actions: externalActions,
  className,
  showClear,
}: FilterBarProps): JSX.Element {
  // Use internal hook when not in controlled mode
  const [internalFilters, internalActions] = useFilterState();

  // Determine if controlled mode
  const isControlled = externalFilters !== undefined && externalActions !== undefined;
  const filters = isControlled ? externalFilters : internalFilters;
  const actions = isControlled ? externalActions : internalActions;

  // Warn in dev if filters provided without actions
  if (process.env.NODE_ENV === 'development') {
    if (externalFilters !== undefined && externalActions === undefined) {
      console.warn(
        'FilterBar: filters provided without actions. Falling back to internal state.'
      );
    }
  }

  // Determine if clear button should be visible
  const hasActiveFilters = !isEmptyFilter(filters);
  const shouldShowClear = showClear ?? hasActiveFilters;

  // Handle priority change
  const handlePriorityChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if (value === '') {
        actions.setPriority(undefined);
      } else {
        const priority = parseInt(value, 10) as Priority;
        actions.setPriority(priority);
      }
    },
    [actions]
  );

  // Handle clear all
  const handleClearAll = useCallback(() => {
    actions.clearAll();
  }, [actions]);

  const rootClassName = className
    ? `${styles.filterBar} ${className}`
    : styles.filterBar;

  return (
    <div className={rootClassName} data-testid="filter-bar">
      <div className={styles.filters}>
        {/* Priority dropdown */}
        <div className={styles.filterGroup}>
          <label htmlFor="priority-filter" className={styles.label}>
            Priority
          </label>
          <select
            id="priority-filter"
            className={styles.select}
            value={filters.priority ?? ''}
            onChange={handlePriorityChange}
            aria-label="Filter by priority"
            data-testid="priority-filter"
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option
                key={option.value ?? 'all'}
                value={option.value ?? ''}
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Clear button */}
      {shouldShowClear && (
        <button
          type="button"
          className={styles.clearButton}
          onClick={handleClearAll}
          aria-label="Clear all filters"
          data-testid="clear-filters"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
