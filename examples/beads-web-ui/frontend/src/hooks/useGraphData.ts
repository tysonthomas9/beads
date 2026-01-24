/**
 * React hook for transforming issue data into React Flow nodes and edges.
 *
 * This hook serves as the data transformation layer between the issue data
 * (from useIssues) and the graph visualization (React Flow). It extracts
 * dependency relationships, computes counts, and creates properly typed
 * IssueNode and DependencyEdge objects.
 */

import { useMemo } from 'react'
import type {
  Issue,
  Dependency,
  DependencyType,
  IssueNode,
  DependencyEdge,
} from '@/types'

/**
 * Blocking dependency types that affect ready work calculation.
 * These dependencies prevent an issue from being "ready" to work on.
 */
const BLOCKING_TYPES = new Set<DependencyType>([
  'blocks',
  'parent-child',
  'conditional-blocks',
  'waits-for',
])

/**
 * Check if a dependency type is blocking.
 */
function isBlockingType(type: DependencyType): boolean {
  return BLOCKING_TYPES.has(type)
}

/**
 * Options for the useGraphData hook.
 */
export interface UseGraphDataOptions {
  /** Filter to include only certain dependency types in edges (default: all) */
  includeDependencyTypes?: DependencyType[]
  /** Set of issue IDs that are blocked by open dependencies */
  blockedIssueIds?: Set<string>
}

/**
 * Return type for the useGraphData hook.
 */
export interface UseGraphDataReturn {
  /** React Flow nodes for rendering */
  nodes: IssueNode[]
  /** React Flow edges for rendering */
  edges: DependencyEdge[]
  /** Map from issue ID to node ID for lookups */
  issueIdToNodeId: Map<string, string>
  /** Total number of dependencies found */
  totalDependencies: number
  /** Number of blocking dependencies */
  blockingDependencies: number
}

/**
 * Create a node ID from an issue ID.
 */
function createNodeId(issueId: string): string {
  return `node-${issueId}`
}

/**
 * Create an edge ID from source and target issue IDs and dependency type.
 * Includes dependency type to ensure unique IDs when the same pair has multiple dependencies.
 */
function createEdgeId(
  sourceIssueId: string,
  targetIssueId: string,
  depType: DependencyType
): string {
  return `edge-${sourceIssueId}-${targetIssueId}-${depType}`
}

/**
 * Check if a dependency should be included based on existence and type filtering.
 * Consolidates filter logic to ensure consistent behavior across passes.
 */
function shouldIncludeDependency(
  dep: Dependency,
  issueIdSet: Set<string>,
  includeDependencyTypes?: DependencyType[]
): boolean {
  // Skip if target doesn't exist in our issue set
  if (!issueIdSet.has(dep.depends_on_id)) {
    return false
  }
  // If filter is specified, check if type is included
  // Empty array means "include nothing"
  if (includeDependencyTypes) {
    if (includeDependencyTypes.length === 0) {
      return false
    }
    if (!includeDependencyTypes.includes(dep.type)) {
      return false
    }
  }
  return true
}

/**
 * React hook for transforming issue data into React Flow nodes and edges.
 *
 * @example
 * ```tsx
 * function DependencyGraph() {
 *   const { issues } = useIssues()
 *   const { nodes, edges, totalDependencies } = useGraphData(issues)
 *
 *   return (
 *     <ReactFlow nodes={nodes} edges={edges}>
 *       <Background />
 *       <Controls />
 *     </ReactFlow>
 *   )
 * }
 * ```
 */
/**
 * Non-ready statuses - issues with these statuses are never "ready".
 */
const NON_READY_STATUSES = new Set(['closed', 'deferred'])

/**
 * Check if an issue is ready based on status and blocked state.
 * An issue is ready if:
 * - It's not closed or deferred
 * - It's not in the blockedIssueIds set
 */
function computeIsReady(
  issueId: string,
  status: string | undefined,
  blockedIssueIds: Set<string> | undefined
): boolean {
  // Closed and deferred issues are never ready
  if (status && NON_READY_STATUSES.has(status)) {
    return false
  }
  // If we have blocked info, check if this issue is blocked
  if (blockedIssueIds && blockedIssueIds.has(issueId)) {
    return false
  }
  // Default to ready if not blocked and not closed/deferred
  return true
}

export function useGraphData(
  issues: Issue[],
  options: UseGraphDataOptions = {}
): UseGraphDataReturn {
  const { includeDependencyTypes, blockedIssueIds } = options

  return useMemo(() => {
    // Handle empty input
    if (issues.length === 0) {
      return {
        nodes: [],
        edges: [],
        issueIdToNodeId: new Map(),
        totalDependencies: 0,
        blockingDependencies: 0,
      }
    }

    // Build set of issue IDs for O(1) existence checks
    const issueIdSet = new Set<string>(issues.map((issue) => issue.id))

    // Build issueIdToNodeId map and count incoming/outgoing dependencies
    const issueIdToNodeId = new Map<string, string>()
    const outgoingCounts = new Map<string, number>()
    const incomingCounts = new Map<string, number>()

    // Initialize counts
    for (const issue of issues) {
      const nodeId = createNodeId(issue.id)
      issueIdToNodeId.set(issue.id, nodeId)
      outgoingCounts.set(issue.id, 0)
      incomingCounts.set(issue.id, 0)
    }

    // First pass: count dependencies (need both directions)
    for (const issue of issues) {
      const deps = issue.dependencies ?? []
      for (const dep of deps) {
        if (!shouldIncludeDependency(dep, issueIdSet, includeDependencyTypes)) {
          continue
        }

        // dep.issue_id is the source (has dependency)
        // dep.depends_on_id is the target (is depended upon)
        outgoingCounts.set(
          dep.issue_id,
          (outgoingCounts.get(dep.issue_id) ?? 0) + 1
        )
        incomingCounts.set(
          dep.depends_on_id,
          (incomingCounts.get(dep.depends_on_id) ?? 0) + 1
        )
      }
    }

    // Create nodes
    const nodes: IssueNode[] = issues.map((issue) => ({
      id: createNodeId(issue.id),
      type: 'issue',
      position: { x: 0, y: 0 }, // Layout handled by dagre in T061
      data: {
        issue,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        issueType: issue.issue_type,
        dependencyCount: outgoingCounts.get(issue.id) ?? 0,
        dependentCount: incomingCounts.get(issue.id) ?? 0,
        isReady: computeIsReady(issue.id, issue.status, blockedIssueIds),
      },
    }))

    // Create edges and count totals
    const edges: DependencyEdge[] = []
    let totalDependencies = 0
    let blockingDependencies = 0

    for (const issue of issues) {
      const deps = issue.dependencies ?? []
      for (const dep of deps) {
        if (!shouldIncludeDependency(dep, issueIdSet, includeDependencyTypes)) {
          continue
        }

        const isBlocking = isBlockingType(dep.type)

        edges.push({
          id: createEdgeId(dep.issue_id, dep.depends_on_id, dep.type),
          type: 'dependency',
          source: createNodeId(dep.issue_id),
          target: createNodeId(dep.depends_on_id),
          data: {
            dependencyType: dep.type,
            isBlocking,
            sourceIssueId: dep.issue_id,
            targetIssueId: dep.depends_on_id,
          },
        })

        totalDependencies++
        if (isBlocking) {
          blockingDependencies++
        }
      }
    }

    return {
      nodes,
      edges,
      issueIdToNodeId,
      totalDependencies,
      blockingDependencies,
    }
  }, [issues, includeDependencyTypes, blockedIssueIds])
}
