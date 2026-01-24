/**
 * FilterBar component.
 * UI component for filtering issues by priority and type.
 * Integrates with useFilterState hook for URL synchronization.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Priority, IssueType } from '@/types';
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
 * Type option for the dropdown.
 */
interface TypeOption {
  /** Display label */
  label: string;
  /** Value (undefined = all) */
  value: IssueType | undefined;
}

/**
 * Type options for the dropdown.
 * Order: All, then known types in display order.
 */
const TYPE_OPTIONS: TypeOption[] = [
  { label: 'All types', value: undefined },
  { label: 'Bug', value: 'bug' },
  { label: 'Feature', value: 'feature' },
  { label: 'Task', value: 'task' },
  { label: 'Epic', value: 'epic' },
  { label: 'Chore', value: 'chore' },
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
  /** Available labels for the label filter dropdown */
  availableLabels?: string[];
}

/**
 * FilterBar renders a filter bar with priority and type dropdowns.
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
  availableLabels,
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

  // Handle type change
  const handleTypeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if (value === '') {
        actions.setType(undefined);
      } else {
        actions.setType(value as IssueType);
      }
    },
    [actions]
  );

  // Handle clear all
  const handleClearAll = useCallback(() => {
    actions.clearAll();
  }, [actions]);

  // Label dropdown state
  const [labelDropdownOpen, setLabelDropdownOpen] = useState(false);
  const labelDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        labelDropdownRef.current &&
        !labelDropdownRef.current.contains(event.target as Node)
      ) {
        setLabelDropdownOpen(false);
      }
    }
    if (labelDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [labelDropdownOpen]);

  // Handle label toggle
  const handleLabelToggle = useCallback(
    (label: string) => {
      const current = filters.labels ?? [];
      const newLabels = current.includes(label)
        ? current.filter((l) => l !== label)
        : [...current, label];
      actions.setLabels(newLabels.length > 0 ? newLabels : undefined);
    },
    [filters.labels, actions]
  );

  // Toggle label dropdown
  const toggleLabelDropdown = useCallback(() => {
    setLabelDropdownOpen((prev) => !prev);
  }, []);

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

        {/* Type dropdown */}
        <div className={styles.filterGroup}>
          <label htmlFor="type-filter" className={styles.label}>
            Type
          </label>
          <select
            id="type-filter"
            className={styles.select}
            value={filters.type ?? ''}
            onChange={handleTypeChange}
            aria-label="Filter by type"
            data-testid="type-filter"
          >
            {TYPE_OPTIONS.map((option) => (
              <option
                key={option.value ?? 'all'}
                value={option.value ?? ''}
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Label filter dropdown */}
        {availableLabels && availableLabels.length > 0 && (
          <div className={styles.filterGroup} ref={labelDropdownRef}>
            <span className={styles.label}>Labels</span>
            <div className={styles.dropdownContainer}>
              <button
                type="button"
                className={styles.dropdownTrigger}
                onClick={toggleLabelDropdown}
                aria-expanded={labelDropdownOpen}
                aria-haspopup="true"
                aria-label="Filter by labels"
                data-testid="label-filter-trigger"
              >
                {filters.labels && filters.labels.length > 0
                  ? `${filters.labels.length} selected`
                  : 'All labels'}
                <span className={styles.dropdownArrow} aria-hidden="true">
                  ▼
                </span>
              </button>
              {labelDropdownOpen && (
                <div
                  className={styles.dropdownMenu}
                  role="group"
                  aria-label="Select labels"
                  data-testid="label-filter-menu"
                >
                  {availableLabels.map((label) => {
                    const isSelected = filters.labels?.includes(label) ?? false;
                    return (
                      <label key={label} className={styles.dropdownItem}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleLabelToggle(label)}
                          data-testid={`label-option-${label}`}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
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
