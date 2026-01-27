/**
 * React hook for managing issue state with real-time updates.
 * Composes useWebSocket + useMutationHandler + API fetch.
 *
 * This hook is the single source of truth for issue data across the application,
 * handling initial data fetching, real-time updates via WebSocket, and optimistic updates.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { Issue, WorkFilter, Status } from '@/types'
import type { ConnectionState, GraphFilter } from '@/api'
import { getReadyIssues, updateIssue as apiUpdateIssue, fetchGraphIssues } from '@/api'
import { useWebSocket } from './useWebSocket'
import { useMutationHandler } from './useMutationHandler'

/**
 * Options for the useIssues hook.
 */
export interface UseIssuesOptions {
  /** Initial filter for fetching issues (default: all ready issues) */
  filter?: WorkFilter
  /** Data source mode: 'ready' for ready issues, 'graph' for all issues with deps */
  mode?: 'ready' | 'graph'
  /** Filter options when mode is 'graph' */
  graphFilter?: GraphFilter
  /** Auto-fetch on mount (default: true) */
  autoFetch?: boolean
  /** Auto-connect WebSocket (default: true) */
  autoConnect?: boolean
  /** Subscribe to mutations on connect (default: true) */
  subscribeOnConnect?: boolean
}

/**
 * Return type for the useIssues hook.
 */
export interface UseIssuesReturn {
  /** Issues as array for rendering */
  issues: Issue[]
  /** Issues as Map for O(1) lookups */
  issuesMap: Map<string, Issue>
  /** Loading state for initial fetch */
  isLoading: boolean
  /** Error from fetch or WebSocket */
  error: string | null
  /** WebSocket connection state */
  connectionState: ConnectionState
  /** Whether WebSocket is connected */
  isConnected: boolean
  /** Current number of reconnection attempts */
  reconnectAttempts: number
  /** Refetch issues from API */
  refetch: () => Promise<void>
  /** Update an issue's status (optimistic + API call) */
  updateIssueStatus: (issueId: string, newStatus: Status) => Promise<void>
  /** Get a single issue by ID */
  getIssue: (id: string) => Issue | undefined
  /** Number of mutations processed */
  mutationCount: number
  /** Immediately retry WebSocket connection */
  retryConnection: () => void
}

/**
 * React hook for managing issue state with real-time updates.
 *
 * @example
 * ```tsx
 * function IssueBoard() {
 *   const {
 *     issues,
 *     isLoading,
 *     error,
 *     connectionState,
 *     updateIssueStatus,
 *   } = useIssues()
 *
 *   if (isLoading) return <Spinner />
 *   if (error) return <ErrorDisplay error={error} />
 *
 *   return (
 *     <>
 *       <StatusBadge state={connectionState} />
 *       <KanbanBoard
 *         issues={issues}
 *         onStatusChange={updateIssueStatus}
 *       />
 *     </>
 *   )
 * }
 * ```
 */
export function useIssues(options: UseIssuesOptions = {}): UseIssuesReturn {
  const {
    filter,
    mode = 'ready',
    graphFilter,
    autoFetch = true,
    autoConnect = true,
    subscribeOnConnect = true,
  } = options

  // Primary state: Map for O(1) lookups
  const [issuesMap, setIssuesMap] = useState<Map<string, Issue>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track fetch timestamp for subscription (catch-up on reconnect)
  const fetchTimestampRef = useRef<number>(0)
  const mountedRef = useRef(true)

  // Mutation handler setup
  const { handleMutation, mutationCount } = useMutationHandler({
    issues: issuesMap,
    setIssues: setIssuesMap,
    onMutationSkipped: (mutation, reason) => {
      // Debug logging for development
      if (process.env.NODE_ENV === 'development') {
        console.debug('[useIssues] Mutation skipped:', mutation.issue_id, reason)
      }
    },
  })

  // WebSocket setup
  const {
    state: connectionState,
    isConnected,
    lastError: wsError,
    reconnectAttempts,
    subscribe,
    retryNow,
  } = useWebSocket({
    autoConnect,
    subscribeOnConnect: false, // We control subscription timing manually
    onMutation: handleMutation,
  })

  // Subscribe when connected with the correct timestamp
  useEffect(() => {
    if (isConnected && subscribeOnConnect && fetchTimestampRef.current > 0) {
      subscribe(fetchTimestampRef.current)
    }
  }, [isConnected, subscribeOnConnect, subscribe])

  // Fetch issues from API
  const refetch = useCallback(async () => {
    if (!mountedRef.current) return

    setIsLoading(true)
    setError(null)
    fetchTimestampRef.current = Date.now()

    try {
      let data: Issue[]
      if (mode === 'graph') {
        data = await fetchGraphIssues(graphFilter)
      } else {
        data = await getReadyIssues(filter)
      }
      if (!mountedRef.current) return

      // Convert array to Map
      const newMap = new Map<string, Issue>()
      for (const issue of data) {
        newMap.set(issue.id, issue)
      }
      setIssuesMap(newMap)
    } catch (err) {
      if (!mountedRef.current) return
      const message = err instanceof Error ? err.message : 'Failed to fetch issues'
      setError(message)
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [filter, mode, graphFilter])

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      void refetch()
    }
  }, [autoFetch, refetch])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Optimistic status update
  const updateIssueStatus = useCallback(
    async (issueId: string, newStatus: Status) => {
      const existingIssue = issuesMap.get(issueId)
      if (!existingIssue) {
        throw new Error(`Issue ${issueId} not found`)
      }

      // Capture state for rollback BEFORE optimistic update to avoid race conditions
      // with WebSocket mutations that might arrive during the API call
      const preUpdateMap = new Map(issuesMap)

      // Optimistic update
      const optimisticIssue: Issue = {
        ...existingIssue,
        status: newStatus,
        updated_at: new Date().toISOString(),
      }
      const newMap = new Map(issuesMap)
      newMap.set(issueId, optimisticIssue)
      setIssuesMap(newMap)

      try {
        await apiUpdateIssue(issueId, { status: newStatus })
      } catch (err) {
        // Rollback on failure using pre-update state
        if (!mountedRef.current) return
        preUpdateMap.set(issueId, existingIssue)
        setIssuesMap(preUpdateMap)
        throw err
      }
    },
    [issuesMap]
  )

  // Get single issue by ID
  const getIssue = useCallback((id: string) => issuesMap.get(id), [issuesMap])

  // Derive array from Map (memoized)
  const issues = useMemo(() => Array.from(issuesMap.values()), [issuesMap])

  // Combine errors (fetch error takes priority, then WebSocket error)
  const combinedError = error ?? wsError

  return {
    issues,
    issuesMap,
    isLoading,
    error: combinedError,
    connectionState,
    isConnected,
    reconnectAttempts,
    refetch,
    updateIssueStatus,
    getIssue,
    mutationCount,
    retryConnection: retryNow,
  }
}
