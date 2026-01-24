/**
 * WebSocket client for real-time mutation events from the beads daemon.
 * Connects to the /ws endpoint and provides automatic reconnection with exponential backoff.
 */

// Connection states
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'

// Mutation types from the backend
export type MutationType =
  | 'create'
  | 'update'
  | 'delete'
  | 'comment'
  | 'status'
  | 'bonded'
  | 'squashed'
  | 'burned'

// Server → Client: Mutation payload
export interface MutationPayload {
  type: MutationType
  issue_id: string
  title?: string
  assignee?: string
  actor?: string
  timestamp: string // ISO 8601
  old_status?: string
  new_status?: string
  parent_id?: string
  step_count?: number
}

// Server → Client messages
interface MutationMessage {
  type: 'mutation'
  mutation: MutationPayload
}

interface PongMessage {
  type: 'pong'
  timestamp: string
}

interface ErrorMessage {
  type: 'error'
  error: string
  message: string
}

type ServerMessage = MutationMessage | PongMessage | ErrorMessage

// Client → Server messages
interface SubscribeMessage {
  type: 'subscribe'
  since?: number // Unix timestamp (ms)
}

interface UnsubscribeMessage {
  type: 'unsubscribe'
}

interface PingMessage {
  type: 'ping'
}

// Event handlers
export interface WebSocketClientOptions {
  onMutation?: (mutation: MutationPayload) => void
  onError?: (error: string, message: string) => void
  onStateChange?: (state: ConnectionState) => void
  onReconnect?: (attempt: number) => void
  reconnect?: boolean // Default true
  maxReconnectDelay?: number // Default 30000ms
}

// Default reconnection configuration
const DEFAULT_BASE_DELAY = 1000
const DEFAULT_MAX_DELAY = 30000

/**
 * Type guard to check if parsed data is a valid server message.
 */
function isServerMessage(data: unknown): data is ServerMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    ['mutation', 'pong', 'error'].includes((data as { type: string }).type)
  )
}

/**
 * WebSocket client for beads mutation events.
 * Handles automatic reconnection with exponential backoff.
 */
export class BeadsWebSocketClient {
  private ws: WebSocket | null = null
  private state: ConnectionState = 'disconnected'
  private subscribed = false
  private pendingSince: number | undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private reconnectAttempts = 0
  private manualDisconnect = false

  private readonly url: string
  private readonly reconnectEnabled: boolean
  private readonly maxDelay: number
  private onMutation: ((mutation: MutationPayload) => void) | undefined
  private onError: ((error: string, message: string) => void) | undefined
  private onStateChange: ((state: ConnectionState) => void) | undefined
  private onReconnect: ((attempt: number) => void) | undefined

  constructor(url: string, options: WebSocketClientOptions = {}) {
    this.url = url
    this.reconnectEnabled = options.reconnect ?? true
    this.maxDelay = options.maxReconnectDelay ?? DEFAULT_MAX_DELAY
    this.onMutation = options.onMutation
    this.onError = options.onError
    this.onStateChange = options.onStateChange
    this.onReconnect = options.onReconnect
  }

  /**
   * Connect to the WebSocket server.
   * Idempotent - does nothing if already connecting or connected.
   */
  connect(): void {
    if (this.state === 'connecting' || this.state === 'connected') {
      return
    }

    this.manualDisconnect = false
    this.setState('connecting')

    try {
      this.ws = new WebSocket(this.url)
      this.ws.onopen = () => this.handleOpen()
      this.ws.onclose = (e) => this.handleClose(e)
      this.ws.onerror = () => this.handleError()
      this.ws.onmessage = (e) => this.handleMessage(e)
    } catch {
      this.handleError()
    }
  }

  /**
   * Disconnect from the WebSocket server.
   * Cancels any pending reconnection attempts.
   */
  disconnect(): void {
    this.manualDisconnect = true
    this.clearReconnectTimer()

    if (this.ws) {
      const ws = this.ws
      this.ws = null // Clear reference first

      // Clear all handlers to prevent any callbacks after disconnect
      ws.onopen = null
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null

      // Only close if not already closed/closing
      if (
        ws.readyState !== WebSocket.CLOSED &&
        ws.readyState !== WebSocket.CLOSING
      ) {
        ws.close(1000)
      }
    }

    this.setState('disconnected')
  }

  /**
   * Subscribe to mutation events.
   * If not connected, subscription will be sent when connection is established.
   * @param since Optional timestamp (ms) to receive events since that time
   */
  subscribe(since?: number): void {
    this.subscribed = true
    this.pendingSince = since

    if (
      this.state === 'connected' &&
      this.ws &&
      this.ws.readyState === WebSocket.OPEN
    ) {
      const message: SubscribeMessage = { type: 'subscribe' }
      if (since !== undefined) {
        message.since = since
      }
      this.ws.send(JSON.stringify(message))
    }
  }

  /**
   * Unsubscribe from mutation events.
   */
  unsubscribe(): void {
    this.subscribed = false

    if (
      this.state === 'connected' &&
      this.ws &&
      this.ws.readyState === WebSocket.OPEN
    ) {
      const message: UnsubscribeMessage = { type: 'unsubscribe' }
      this.ws.send(JSON.stringify(message))
    }
  }

  /**
   * Send a ping message to the server.
   * The server will respond with a pong.
   */
  ping(): void {
    if (
      this.state === 'connected' &&
      this.ws &&
      this.ws.readyState === WebSocket.OPEN
    ) {
      const message: PingMessage = { type: 'ping' }
      this.ws.send(JSON.stringify(message))
    }
  }

  /**
   * Get the current connection state.
   */
  getState(): ConnectionState {
    return this.state
  }

  /**
   * Check if currently subscribed to mutations.
   */
  isSubscribed(): boolean {
    return this.subscribed
  }

  /**
   * Get the current number of reconnection attempts.
   * Resets to 0 on successful connection.
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts
  }

  /**
   * Immediately retry connection.
   * Only works when in 'reconnecting' state.
   * Resets the backoff counter on manual retry.
   */
  retryNow(): void {
    if (this.state !== 'reconnecting') {
      return
    }

    this.clearReconnectTimer()
    this.reconnectAttempts = 0
    this.onReconnect?.(0) // Notify that counter has been reset
    this.connect()
  }

  /**
   * Disconnect and clean up all resources.
   * After calling destroy(), this instance should not be reused.
   */
  destroy(): void {
    // Clear callbacks first to prevent any callbacks during cleanup
    this.onMutation = undefined
    this.onError = undefined
    this.onStateChange = undefined
    this.onReconnect = undefined
    this.disconnect()
  }

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state
      this.onStateChange?.(state)
    }
  }

  private handleOpen(): void {
    this.setState('connected')
    this.reconnectAttempts = 0
    this.onReconnect?.(0) // Notify that counter has been reset on successful connection

    // Re-subscribe if we were subscribed before reconnection
    if (this.subscribed && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message: SubscribeMessage = { type: 'subscribe' }
      if (this.pendingSince !== undefined) {
        message.since = this.pendingSince
      }
      this.ws.send(JSON.stringify(message))
    }
  }

  private handleClose(event: CloseEvent): void {
    this.ws = null

    // Don't reconnect if manually disconnected or normal closure
    if (this.manualDisconnect || event.code === 1000) {
      this.setState('disconnected')
      return
    }

    // Attempt reconnection if enabled
    if (this.reconnectEnabled) {
      this.setState('reconnecting')
      this.scheduleReconnect()
    } else {
      this.setState('disconnected')
    }
  }

  private handleError(): void {
    // onerror is always followed by onclose, so just log
    // No-op: errors are logged by the browser
  }

  private handleMessage(event: MessageEvent): void {
    let data: unknown
    try {
      data = JSON.parse(event.data as string)
    } catch {
      // Invalid JSON - ignore
      return
    }

    if (!isServerMessage(data)) {
      // Unknown message type - ignore for forward compatibility
      return
    }

    switch (data.type) {
      case 'mutation': {
        // Track max received timestamp for reconnection catch-up
        // Using max prevents issues with out-of-order message delivery
        const mutationTime = Date.parse(data.mutation.timestamp)
        if (
          this.pendingSince === undefined ||
          mutationTime > this.pendingSince
        ) {
          this.pendingSince = mutationTime
        }
        this.onMutation?.(data.mutation)
        break
      }

      case 'error':
        this.onError?.(data.error, data.message)
        break

      case 'pong':
        // Pong messages are typically ignored unless needed for keepalive
        break
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++
    this.onReconnect?.(this.reconnectAttempts)

    const jitter = 0.75 + Math.random() * 0.5 // 0.75 to 1.25
    const delay = Math.min(
      DEFAULT_BASE_DELAY * Math.pow(2, this.reconnectAttempts - 1) * jitter,
      this.maxDelay
    )

    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }
}

/**
 * Helper function to get the WebSocket URL for the current page.
 * Automatically uses wss:// for https:// and ws:// for http://.
 */
export function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}
