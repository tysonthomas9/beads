/**
 * DependencyEdge component for React Flow dependency graph.
 * Renders edges between issue nodes with visual styles based on blocking status.
 */

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import type { DependencyEdge as DependencyEdgeType } from '@/types';
import styles from './DependencyEdge.module.css';

/**
 * Props for the DependencyEdge component.
 * Extends React Flow EdgeProps with our custom data.
 */
export type DependencyEdgeProps = EdgeProps<DependencyEdgeType>;

/**
 * DependencyEdge renders a dependency relationship between two issue nodes.
 * Uses smooth step paths for a clean graph appearance.
 * Blocking edges are rendered with animated dashed red lines.
 */
function DependencyEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: DependencyEdgeProps): JSX.Element {
  // Use smooth step path for cleaner graph appearance
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const isBlocking = data?.isBlocking ?? false;
  const isHighlighted = data?.isHighlighted ?? false;
  const dependencyType = data?.dependencyType ?? 'blocks';

  // Format label text (display as-is)
  const labelText = dependencyType;

  // Determine edge class based on blocking and highlight state
  let edgeClassName = isBlocking ? styles.blockingEdge : styles.normalEdge;
  if (isHighlighted) {
    edgeClassName = `${edgeClassName} ${styles.highlighted}`;
  }

  const labelClassName = selected
    ? `${styles.edgeLabel} ${styles.selected}`
    : styles.edgeLabel;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={edgeClassName}
        style={{
          strokeWidth: isBlocking ? 2 : 1.5,
        }}
        markerEnd="url(#arrow)"
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className={labelClassName}
        >
          {labelText}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// Memoize to prevent unnecessary re-renders
export const DependencyEdge = memo(DependencyEdgeComponent);
