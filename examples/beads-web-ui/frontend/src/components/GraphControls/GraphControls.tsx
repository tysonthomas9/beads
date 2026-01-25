/**
 * GraphControls component for graph view toggle controls.
 * Provides a "Highlight Ready" toggle that dims blocked and closed nodes,
 * plus zoom controls (zoom in, zoom out, fit view).
 */

import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import styles from './GraphControls.module.css';

/**
 * Props for the GraphControls component.
 */
export interface GraphControlsProps {
  /** Whether highlight ready mode is enabled */
  highlightReady: boolean;
  /** Callback when highlight ready mode is toggled */
  onHighlightReadyChange: (value: boolean) => void;
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
  disabled = false,
  disabledTitle,
  showZoomControls = true,
  className,
}: GraphControlsProps): JSX.Element {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onHighlightReadyChange(event.target.checked);
    },
    [onHighlightReadyChange]
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
      <label
        className={styles.toggleLabel}
        title={disabled ? disabledTitle : undefined}
      >
        <input
          type="checkbox"
          checked={highlightReady}
          onChange={handleChange}
          disabled={disabled}
          className={styles.checkbox}
          aria-label="Highlight ready issues"
          data-testid="highlight-ready-toggle"
        />
        <span className={styles.toggleText}>Highlight Ready</span>
      </label>

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
