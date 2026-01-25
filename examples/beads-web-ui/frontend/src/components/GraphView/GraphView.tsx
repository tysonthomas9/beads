/**
 * GraphView container component for dependency graph visualization.
 *
 * Composes React Flow with useGraphData and useAutoLayout hooks to render
 * issues as nodes and dependencies as edges in an interactive DAG layout.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Issue, IssueNode as IssueNodeType } from '@/types';
import { useGraphData, type UseGraphDataOptions } from '@/hooks/useGraphData';
import { useAutoLayout, type UseAutoLayoutOptions } from '@/hooks/useAutoLayout';
import { useBlockedIssues } from '@/hooks/useBlockedIssues';
import { IssueNode, DependencyEdge, GraphControls, NodeTooltip } from '@/components';
import type { TooltipPosition } from '@/components/NodeTooltip';
import styles from './GraphView.module.css';

// Register custom node and edge types
const nodeTypes = {
  issue: IssueNode,
} as const;

const edgeTypes = {
  dependency: DependencyEdge,
} as const;

/**
 * Props for the GraphView component.
 */
export interface GraphViewProps {
  /** Issues to display in the graph */
  issues: Issue[];
  /** Callback when a node is clicked */
  onNodeClick?: (issue: Issue) => void;
  /** Callback when a node is hovered */
  onNodeMouseEnter?: (issue: Issue, event: React.MouseEvent) => void;
  /** Callback when mouse leaves a node */
  onNodeMouseLeave?: () => void;
  /** Whether nodes can be manually dragged (default: false) */
  nodesDraggable?: boolean;
  /** Layout direction (default: 'LR') */
  layoutDirection?: UseAutoLayoutOptions['direction'];
  /** Whether to show the MiniMap (default: true) */
  showMiniMap?: boolean;
  /** Whether to show the GraphControls (default: true) */
  showControls?: boolean;
  /** Additional CSS class name */
  className?: string;
}

/**
 * GraphView renders an interactive dependency graph using React Flow.
 *
 * @example
 * ```tsx
 * function DependencyGraphPage() {
 *   const { issues } = useIssues();
 *
 *   return (
 *     <GraphView
 *       issues={issues}
 *       onNodeClick={(issue) => console.log('Clicked:', issue.id)}
 *     />
 *   );
 * }
 * ```
 */
export function GraphView({
  issues,
  onNodeClick,
  onNodeMouseEnter,
  onNodeMouseLeave,
  nodesDraggable = false,
  layoutDirection = 'LR',
  showMiniMap = true,
  showControls = true,
  className,
}: GraphViewProps): JSX.Element {
  const [highlightReady, setHighlightReady] = useState(false);

  // Tooltip state for hover preview
  const [hoveredIssue, setHoveredIssue] = useState<Issue | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);

  // Fetch blocked issues for ready state calculation
  const { data: blockedIssues } = useBlockedIssues({ enabled: true });
  const blockedIssueIds = useMemo(() => {
    if (!blockedIssues) return new Set<string>();
    return new Set(blockedIssues.map((bi) => bi.id));
  }, [blockedIssues]);

  // Transform issues to nodes and edges
  const graphDataOptions: UseGraphDataOptions = useMemo(
    () => ({ blockedIssueIds }),
    [blockedIssueIds]
  );
  const { nodes: rawNodes, edges } = useGraphData(issues, graphDataOptions);

  // Apply auto-layout
  const layoutOptions: UseAutoLayoutOptions = useMemo(
    () => ({ direction: layoutDirection }),
    [layoutDirection]
  );
  const { nodes: layoutedNodes } = useAutoLayout(rawNodes, edges, layoutOptions);

  // Handle node click - extract issue from node data
  const handleNodeClick: NodeMouseHandler<IssueNodeType> = useCallback(
    (_event, node) => {
      if (onNodeClick && node.data?.issue) {
        onNodeClick(node.data.issue);
      }
    },
    [onNodeClick]
  );

  // Handle node mouse enter - sets tooltip state and calls external callback
  const handleNodeMouseEnter: NodeMouseHandler<IssueNodeType> = useCallback(
    (event, node) => {
      if (node.data?.issue) {
        // Set tooltip position from mouse coordinates
        const mouseEvent = event as unknown as React.MouseEvent;
        setHoveredIssue(node.data.issue);
        setTooltipPosition({ x: mouseEvent.clientX, y: mouseEvent.clientY });

        // Call external callback if provided
        if (onNodeMouseEnter) {
          onNodeMouseEnter(node.data.issue, event);
        }
      }
    },
    [onNodeMouseEnter]
  );

  // Handle node mouse leave - clears tooltip state and calls external callback
  const handleNodeMouseLeave: NodeMouseHandler<IssueNodeType> = useCallback(
    () => {
      setHoveredIssue(null);
      setTooltipPosition(null);
      onNodeMouseLeave?.();
    },
    [onNodeMouseLeave]
  );

  const rootClassName = className
    ? `${styles.graphView} ${className}`
    : styles.graphView;

  // Build ReactFlow props conditionally to avoid passing undefined
  const reactFlowProps: Record<string, unknown> = {
    nodes: layoutedNodes,
    edges,
    nodeTypes,
    edgeTypes,
    nodesDraggable,
    nodesConnectable: false,
    elementsSelectable: true,
    fitView: true,
    fitViewOptions: { padding: 0.2, maxZoom: 1.5 },
    minZoom: 0.1,
    maxZoom: 2,
    attributionPosition: 'bottom-left',
  };

  if (onNodeClick) {
    reactFlowProps.onNodeClick = handleNodeClick;
  }
  // Always add mouse handlers for tooltip functionality
  reactFlowProps.onNodeMouseEnter = handleNodeMouseEnter;
  reactFlowProps.onNodeMouseLeave = handleNodeMouseLeave;

  // Build MiniMap props conditionally
  const miniMapProps: Record<string, unknown> = {
    maskColor: 'rgba(0, 0, 0, 0.1)',
    position: 'bottom-right',
  };
  if (styles.miniMapNode) {
    miniMapProps.nodeClassName = styles.miniMapNode;
  }

  return (
    <div
      className={rootClassName}
      data-highlight-ready={highlightReady}
      data-testid="graph-view"
    >
      {showControls && (
        <GraphControls
          highlightReady={highlightReady}
          onHighlightReadyChange={setHighlightReady}
          {...(styles.controls ? { className: styles.controls } : {})}
        />
      )}
      <ReactFlow {...(reactFlowProps as Record<string, never>)}>
        <Background gap={16} size={1} />
        {showMiniMap && <MiniMap {...(miniMapProps as Record<string, never>)} />}
      </ReactFlow>
      <NodeTooltip issue={hoveredIssue} position={tooltipPosition} />
    </div>
  );
}
