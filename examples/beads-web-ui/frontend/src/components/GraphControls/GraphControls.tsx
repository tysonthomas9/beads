/**
 * GraphControls component for graph view toggle controls.
 * Provides a "Highlight Ready" toggle that dims blocked and closed nodes.
 */

import { useCallback } from 'react';
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
  /** Additional CSS class name */
  className?: string;
}

/**
 * GraphControls renders toggle controls for the dependency graph.
 * Currently provides a "Highlight Ready" toggle that dims blocked nodes.
 *
 * @example
 * ```tsx
 * function GraphView() {
 *   const [highlightReady, setHighlightReady] = useState(false);
 *
 *   return (
 *     <div data-highlight-ready={highlightReady}>
 *       <GraphControls
 *         highlightReady={highlightReady}
 *         onHighlightReadyChange={setHighlightReady}
 *       />
 *       <ReactFlow nodes={nodes} edges={edges} />
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
  className,
}: GraphControlsProps): JSX.Element {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onHighlightReadyChange(event.target.checked);
    },
    [onHighlightReadyChange]
  );

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
    </div>
  );
}
