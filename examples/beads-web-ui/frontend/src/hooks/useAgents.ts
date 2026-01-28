/**
 * useAgents - React hook for fetching agent status from loom server.
 * Provides real-time agent status with automatic polling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchStatus, fetchTasks } from '@/api';
import type { LoomAgentStatus, LoomTaskSummary, LoomTaskInfo, LoomTaskLists, LoomSyncInfo, LoomStats } from '@/types';

/**
 * Options for the useAgents hook.
 */
export interface UseAgentsOptions {
  /** Poll interval in ms (default: 5000) */
  pollInterval?: number;
  /** Whether to fetch (default: true) */
  enabled?: boolean;
}

/**
 * Return type for the useAgents hook.
 */
export interface UseAgentsResult {
  /** Agent status data, empty array if not yet loaded or server unavailable */
  agents: LoomAgentStatus[];
  /** Task queue summary counts */
  tasks: LoomTaskSummary;
  /** Task lists organized by category */
  taskLists: LoomTaskLists;
  /** Map of agent name to current task info (for task titles) */
  agentTasks: Record<string, LoomTaskInfo>;
  /** Sync status (DB and Git) */
  sync: LoomSyncInfo;
  /** Project statistics */
  stats: LoomStats;
  /** Whether a fetch is currently in progress */
  isLoading: boolean;
  /** Whether the loom server is available */
  isConnected: boolean;
  /** Error from the last fetch attempt, null if successful */
  error: Error | null;
  /** Last successful update time */
  lastUpdated: Date | null;
  /** Function to manually trigger a refetch */
  refetch: () => Promise<void>;
}

/**
 * React hook for fetching agent status from the loom server.
 *
 * @param options - Configuration options for the hook
 * @returns Object with agents data, loading/error states and refetch function
 *
 * @example
 * ```tsx
 * function AgentsSidebar() {
 *   const { agents, isLoading, isConnected, refetch } = useAgents({
 *     pollInterval: 5000, // Poll every 5 seconds
 *   });
 *
 *   if (!isConnected) {
 *     return <div>Loom server not available</div>;
 *   }
 *
 *   return (
 *     <div>
 *       {agents.map(agent => (
 *         <AgentCard key={agent.name} agent={agent} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
// Default values for initial state
const DEFAULT_TASKS: LoomTaskSummary = {
  needs_planning: 0,
  ready_to_implement: 0,
  in_progress: 0,
  need_review: 0,
  blocked: 0,
};

const DEFAULT_SYNC: LoomSyncInfo = {
  db_synced: true,
  db_last_sync: '',
  git_needs_push: 0,
  git_needs_pull: 0,
};

const DEFAULT_STATS: LoomStats = {
  open: 0,
  closed: 0,
  total: 0,
  completion: 0,
};

const DEFAULT_TASK_LISTS: LoomTaskLists = {
  needsPlanning: [],
  readyToImplement: [],
  needsReview: [],
  inProgress: [],
  blocked: [],
};

export function useAgents(options?: UseAgentsOptions): UseAgentsResult {
  const { pollInterval = 5000, enabled = true } = options ?? {};

  const [agents, setAgents] = useState<LoomAgentStatus[]>([]);
  const [tasks, setTasks] = useState<LoomTaskSummary>(DEFAULT_TASKS);
  const [taskLists, setTaskLists] = useState<LoomTaskLists>(DEFAULT_TASK_LISTS);
  const [agentTasks, setAgentTasks] = useState<Record<string, LoomTaskInfo>>({});
  const [sync, setSync] = useState<LoomSyncInfo>(DEFAULT_SYNC);
  const [stats, setStats] = useState<LoomStats>(DEFAULT_STATS);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Track if a fetch is in progress to prevent overlapping requests
  const fetchInProgressRef = useRef<boolean>(false);

  // Track if the component is mounted for cleanup
  const mountedRef = useRef<boolean>(true);

  // Stable fetch function using useCallback
  const fetchData = useCallback(async () => {
    // Skip if already fetching
    if (fetchInProgressRef.current) {
      return;
    }

    fetchInProgressRef.current = true;
    setIsLoading(true);

    try {
      // Fetch status and task lists in parallel
      const [statusResult, tasksResult] = await Promise.all([
        fetchStatus(),
        fetchTasks(),
      ]);

      // Only update state if still mounted
      if (mountedRef.current) {
        setAgents(statusResult.agents);
        setTasks(statusResult.tasks);
        setTaskLists(tasksResult);
        setAgentTasks(statusResult.agentTasks);
        setSync(statusResult.sync);
        setStats(statusResult.stats);
        // Consider connected if we got any agents or valid stats
        setIsConnected(statusResult.agents.length > 0 || statusResult.stats.total > 0);
        setError(null);
        setLastUpdated(new Date());
      }
    } catch (err) {
      // Only update state if still mounted
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsConnected(false);
        // Keep stale data on error
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
      fetchInProgressRef.current = false;
    }
  }, []);

  // Refetch function exposed to consumers
  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Initial fetch and polling setup
  useEffect(() => {
    mountedRef.current = true;

    // Don't fetch if disabled
    if (!enabled) {
      return;
    }

    // Initial fetch
    void fetchData();

    // Setup polling
    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (pollInterval > 0) {
      intervalId = setInterval(() => {
        void fetchData();
      }, pollInterval);
    }

    // Cleanup
    return () => {
      mountedRef.current = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [enabled, pollInterval, fetchData]);

  return {
    agents,
    tasks,
    taskLists,
    agentTasks,
    sync,
    stats,
    isLoading,
    isConnected,
    error,
    lastUpdated,
    refetch,
  };
}
