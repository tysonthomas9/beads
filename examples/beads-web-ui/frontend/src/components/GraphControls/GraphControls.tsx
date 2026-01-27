/**
 * GraphControls component for graph view toggle controls.
 * Provides a status filter dropdown, "Highlight Ready" toggle that dims blocked and closed nodes,
 * plus zoom controls (zoom in, zoom out, fit view).
 */

import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { Status } from '@/types/status';
import { formatStatusLabel } from '@/components/StatusColumn/utils';
import styles from './GraphControls.module.css';

/**
 * Status filter option for the dropdown.
 */
interface StatusFilterOption {
  /** Display label */
  label: string;
  /** Value ('all' or a Status value) */
  value: Status | 'all';
}

/**
 * Status filter options for the dropdown.
 * Order: All, then user-selectable statuses matching USER_SELECTABLE_STATUSES order.
 */
const STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
  { label: 'All', value: 'all' },
  { label: formatStatusLabel('open'), value: 'open' },
  { label: formatStatusLabel('in_progress'), value: 'in_progress' },
  { label: formatStatusLabel('blocked'), value: 'blocked' },
  { label: formatStatusLabel('deferred'), value: 'deferred' },
  { label: formatStatusLabel('closed'), value: 'closed' },
];

/**
 * Props for the GraphControls component.
 */
export interface GraphControlsProps {
  /** Whether highlight ready mode is enabled */
  highlightReady: boolean;
  /** Callback when highlight ready mode is toggled */
  onHighlightReadyChange: (value: boolean) => void;
  /** Whether show blocked only mode is enabled */
  showBlockedOnly?: boolean;
  /** Callback when show blocked only mode is toggled */
  onShowBlockedOnlyChange?: (value: boolean) => void;
  /** Whether to show closed issues (default: true) */
  showClosed?: boolean;
  /** Callback when show closed toggle is changed */
  onShowClosedChange?: (value: boolean) => void;
  /** Current status filter value */
  statusFilter?: Status | 'all';
  /** Callback when status filter changes */
  onStatusFilterChange?: (value: Status | 'all') => void;
  /** Whether the toggle should be disabled (e.g., while loading) */
  disabled?: boolean;
  /** Title for disabled state tooltip */
  disabledTitle?: string;
  /** Whether to show zoom controls (default: true) */
  showZoomControls?: boolean;
  /** Additional CSS class name */
  className?: string;
}

/**
 * GraphControls renders toggle controls for the dependency graph.
 * Provides a "Highlight Ready" toggle that dims blocked nodes,
 * plus zoom controls for navigating large graphs.
 *
 * NOTE: This component must be rendered inside a ReactFlow component
 * to use the zoom controls (useReactFlow hook requires ReactFlow context).
 *
 * @example
 * ```tsx
 * function GraphView() {
 *   const [highlightReady, setHighlightReady] = useState(false);
 *
 *   return (
 *     <div data-highlight-ready={highlightReady}>
 *       <ReactFlow nodes={nodes} edges={edges}>
 *         <GraphControls
 *           highlightReady={highlightReady}
 *           onHighlightReadyChange={setHighlightReady}
 *         />
 *       </ReactFlow>
 *     </div>
 *   );
 * }
 * ```
 */
export function GraphControls({
  highlightReady,
  onHighlightReadyChange,
  showBlockedOnly = false,
  onShowBlockedOnlyChange,
  showClosed,
  onShowClosedChange,
  statusFilter,
  onStatusFilterChange,
  disabled = false,
  disabledTitle,
  showZoomControls = true,
  className,
}: GraphControlsProps): JSX.Element {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const handleHighlightReadyChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onHighlightReadyChange(event.target.checked);
    },
    [onHighlightReadyChange]
  );

  const handleShowBlockedOnlyChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onShowBlockedOnlyChange?.(event.target.checked);
    },
    [onShowBlockedOnlyChange]
  );

  const handleShowClosedChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onShowClosedChange?.(event.target.checked);
    },
    [onShowClosedChange]
  );

  const handleStatusFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value as Status | 'all';
      onStatusFilterChange?.(value);
    },
    [onStatusFilterChange]
  );

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: 200 });
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    fitView({ duration: 200, padding: 0.2 });
  }, [fitView]);

  const rootClassName = className
    ? `${styles.graphControls} ${className}`
    : styles.graphControls;

  return (
    <div className={rootClassName} data-testid="graph-controls">
      {onStatusFilterChange && (
        <div className={styles.filterGroup}>
          <label htmlFor="status-filter" className={styles.filterLabel}>
            Status
          </label>
          <select
            id="status-filter"
            className={styles.statusSelect}
            value={statusFilter ?? 'all'}
            onChange={handleStatusFilterChange}
            disabled={disabled}
            aria-label="Filter by status"
            data-testid="status-filter"
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <label
        className={styles.toggleLabel}
        title={disabled ? disabledTitle : undefined}
      >
        <input
          type="checkbox"
          checked={highlightReady}
          onChange={handleHighlightReadyChange}
          disabled={disabled}
          className={styles.checkbox}
          aria-label="Highlight ready issues"
          data-testid="highlight-ready-toggle"
        />
        <span className={styles.toggleText}>Highlight Ready</span>
      </label>

      {onShowBlockedOnlyChange && (
        <label
          className={styles.toggleLabel}
          title={disabled ? disabledTitle : undefined}
        >
          <input
            type="checkbox"
            checked={showBlockedOnly}
            onChange={handleShowBlockedOnlyChange}
            disabled={disabled}
            className={`${styles.checkbox} ${styles.blockedCheckbox}`}
            aria-label="Show only blocked issues"
            data-testid="show-blocked-only-toggle"
          />
          <span className={styles.toggleText}>Show Blocked</span>
        </label>
      )}

      {onShowClosedChange && (
        <label
          className={styles.toggleLabel}
          title={disabled ? disabledTitle : undefined}
        >
          <input
            type="checkbox"
            checked={showClosed ?? true}
            onChange={handleShowClosedChange}
            disabled={disabled}
            className={`${styles.checkbox} ${styles.closedCheckbox}`}
            aria-label="Show closed issues"
            data-testid="show-closed-toggle"
          />
          <span className={styles.toggleText}>Show Closed</span>
        </label>
      )}

      {showZoomControls && (
        <>
          <div className={styles.divider} aria-hidden="true" />
          <div className={styles.zoomControls} role="group" aria-label="Zoom controls">
            <button
              type="button"
              onClick={handleZoomIn}
              className={styles.zoomButton}
              aria-label="Zoom in"
              data-testid="zoom-in-button"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className={styles.zoomButton}
              aria-label="Zoom out"
              data-testid="zoom-out-button"
            >
              −
            </button>
            <button
              type="button"
              onClick={handleFitView}
              className={styles.zoomButton}
              aria-label="Fit to view"
              data-testid="fit-view-button"
            >
              ⊞
            </button>
          </div>
        </>
      )}
    </div>
  );
}
