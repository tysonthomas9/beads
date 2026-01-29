/**
 * @deprecated Use useSSE hook instead. This WebSocket hook will be removed
 * in a future version. SSE provides simpler push model with built-in reconnection.
 *
 * React hook that wraps BeadsWebSocketClient for use in components.
 * Manages WebSocket lifecycle with React component lifecycle (connect on mount, cleanup on unmount).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  BeadsWebSocketClient,
  getWebSocketUrl,
  type ConnectionState,
  type MutationPayload,
  type WebSocketClientOptions,
} from '../api/websocket'

/**
 * Options for the useWebSocket hook.
 * Extends WebSocketClientOptions with React-specific options.
 */
export interface UseWebSocketOptions extends WebSocketClientOptions {
  /** Custom WebSocket URL. If not provided, uses getWebSocketUrl(). */
  url?: string
  /** Auto-connect on mount. Default: true */
  autoConnect?: boolean
  /** Auto-subscribe to mutations on connect. Default: false */
  subscribeOnConnect?: boolean
}

/**
 * Return type for the useWebSocket hook.
 */
export interface UseWebSocketReturn {
  /** Current connection state (reactive) */
  state: ConnectionState
  /** Last error message, if any (reactive) */
  lastError: string | null
  /** Convenience boolean - true when state === 'connected' */
  isConnected: boolean
  /** Current number of reconnection attempts (reactive) */
  reconnectAttempts: number
  /** Connect to the WebSocket server */
  connect: () => void
  /** Disconnect from the WebSocket server */
  disconnect: () => void
  /** Subscribe to mutation events with optional since timestamp */
  subscribe: (since?: number) => void
  /** Unsubscribe from mutation events */
  unsubscribe: () => void
  /** Immediately retry connection (only works in 'reconnecting' state) */
  retryNow: () => void
}

/**
 * React hook for managing WebSocket connections to the beads daemon.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { state, isConnected, subscribe } = useWebSocket({
 *     autoConnect: true,
 *     subscribeOnConnect: true,
 *     onMutation: (mutation) => {
 *       console.log('Received mutation:', mutation)
 *     },
 *   })
 *
 *   return <div>Status: {state}</div>
 * }
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url,
    autoConnect = true,
    subscribeOnConnect = false,
    onMutation,
    onError,
    onStateChange,
    reconnect,
    maxReconnectDelay,
  } = options

  // Reactive state
  const [state, setState] = useState<ConnectionState>('disconnected')
  const [lastError, setLastError] = useState<string | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  // Refs for stable references across renders
  const clientRef = useRef<BeadsWebSocketClient | null>(null)
  const mountedRef = useRef(true)

  // Store callbacks in refs to avoid stale closures
  const onMutationRef = useRef(onMutation)
  const onErrorRef = useRef(onError)
  const onStateChangeRef = useRef(onStateChange)

  // Update refs when callbacks change
  useEffect(() => {
    onMutationRef.current = onMutation
  }, [onMutation])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    onStateChangeRef.current = onStateChange
  }, [onStateChange])

  // Compute WebSocket URL (memoized to handle SSR)
  const wsUrl = useMemo(() => {
    if (url) return url
    // Guard against SSR (no window)
    if (typeof window === 'undefined') return ''
    return getWebSocketUrl()
  }, [url])

  // Create client on mount
  useEffect(() => {
    // Skip if SSR or no URL
    if (!wsUrl) return

    mountedRef.current = true

    // Build options object, only including defined values
    // This is required because exactOptionalPropertyTypes is enabled
    const clientOptions: WebSocketClientOptions = {
      onMutation: (mutation: MutationPayload) => {
        if (!mountedRef.current) return
        onMutationRef.current?.(mutation)
      },
      onError: (error: string, message: string) => {
        if (!mountedRef.current) return
        // Deprecation warnings are informational, not fatal errors
        if (error === 'deprecated') {
          console.warn(`[WebSocket] ${error}: ${message}`)
        } else {
          setLastError(`${error}: ${message}`)
        }
        // Always call user's onError callback for custom handling
        onErrorRef.current?.(error, message)
      },
      onStateChange: (newState: ConnectionState) => {
        if (!mountedRef.current) return
        setState(newState)
        // Clear error on successful connection
        // (reconnectAttempts is reset via onReconnect callback for consistency)
        if (newState === 'connected') {
          setLastError(null)
        }
        onStateChangeRef.current?.(newState)
      },
      onReconnect: (attempt: number) => {
        if (!mountedRef.current) return
        setReconnectAttempts(attempt)
      },
    }

    // Only add optional properties if they are defined
    if (reconnect !== undefined) {
      clientOptions.reconnect = reconnect
    }
    if (maxReconnectDelay !== undefined) {
      clientOptions.maxReconnectDelay = maxReconnectDelay
    }

    const client = new BeadsWebSocketClient(wsUrl, clientOptions)

    clientRef.current = client

    // Auto-connect if enabled
    if (autoConnect) {
      client.connect()
    }

    // Cleanup on unmount
    return () => {
      mountedRef.current = false
      client.destroy()
      clientRef.current = null
    }
  }, [wsUrl, autoConnect, reconnect, maxReconnectDelay])

  // Auto-subscribe when connected (if enabled)
  useEffect(() => {
    if (subscribeOnConnect && state === 'connected' && clientRef.current) {
      clientRef.current.subscribe()
    }
  }, [subscribeOnConnect, state])

  // Stable method references
  const connect = useCallback(() => {
    clientRef.current?.connect()
  }, [])

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect()
  }, [])

  const subscribe = useCallback((since?: number) => {
    clientRef.current?.subscribe(since)
  }, [])

  const unsubscribe = useCallback(() => {
    clientRef.current?.unsubscribe()
  }, [])

  const retryNow = useCallback(() => {
    clientRef.current?.retryNow()
  }, [])

  // Computed values
  const isConnected = state === 'connected'

  return {
    state,
    lastError,
    isConnected,
    reconnectAttempts,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    retryNow,
  }
}
