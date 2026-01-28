/**
 * Loom Agent API client.
 * Fetches agent status from the loom server.
 */

import type {
  LoomAgentStatus,
  LoomAgentsResponse,
  LoomStatusResponse,
  LoomTaskSummary,
  LoomTaskInfo,
  LoomSyncInfo,
  LoomStats,
} from '@/types';

/**
 * Default loom server URL.
 * Can be overridden via environment variable or config.
 */
const LOOM_SERVER_URL = import.meta.env.VITE_LOOM_SERVER_URL ?? 'http://localhost:9000';

/**
 * Fetch agents from the loom server.
 * Returns an empty array if the server is unavailable.
 */
export async function fetchAgents(): Promise<LoomAgentStatus[]> {
  try {
    const response = await fetch(`${LOOM_SERVER_URL}/api/agents`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`Loom server returned ${response.status}: ${response.statusText}`);
      return [];
    }

    const data: LoomAgentsResponse = await response.json();
    return data.agents ?? [];
  } catch (error) {
    // Loom server not available - this is expected when not running agents
    console.warn('Loom server not available:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

/**
 * Check if the loom server is available.
 */
export async function checkLoomHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${LOOM_SERVER_URL}/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Default values for status response when server unavailable.
 */
const DEFAULT_TASK_SUMMARY: LoomTaskSummary = {
  needs_planning: 0,
  ready_to_implement: 0,
  in_progress: 0,
  need_review: 0,
  blocked: 0,
};

const DEFAULT_SYNC_INFO: LoomSyncInfo = {
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

/**
 * Fetched status result type.
 */
export interface FetchStatusResult {
  agents: LoomAgentStatus[];
  tasks: LoomTaskSummary;
  agentTasks: Record<string, LoomTaskInfo>;
  sync: LoomSyncInfo;
  stats: LoomStats;
  timestamp: string;
}

/**
 * Fetch full status from the loom server.
 * Returns default values if the server is unavailable.
 */
export async function fetchStatus(): Promise<FetchStatusResult> {
  try {
    const response = await fetch(`${LOOM_SERVER_URL}/api/status`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`Loom server returned ${response.status}: ${response.statusText}`);
      return {
        agents: [],
        tasks: DEFAULT_TASK_SUMMARY,
        agentTasks: {},
        sync: DEFAULT_SYNC_INFO,
        stats: DEFAULT_STATS,
        timestamp: new Date().toISOString(),
      };
    }

    const data: LoomStatusResponse = await response.json();
    return {
      agents: data.agents ?? [],
      tasks: data.tasks,
      agentTasks: data.agent_tasks ?? {},
      sync: data.sync,
      stats: data.stats,
      timestamp: data.timestamp,
    };
  } catch (error) {
    // Loom server not available - this is expected when not running agents
    console.warn('Loom server not available:', error instanceof Error ? error.message : 'Unknown error');
    return {
      agents: [],
      tasks: DEFAULT_TASK_SUMMARY,
      agentTasks: {},
      sync: DEFAULT_SYNC_INFO,
      stats: DEFAULT_STATS,
      timestamp: new Date().toISOString(),
    };
  }
}
