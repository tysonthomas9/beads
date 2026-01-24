import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  BeadsWebSocketClient,
  getWebSocketUrl,
  type ConnectionState,
  type MutationPayload,
} from './websocket'

// Mock WebSocket class with static constants matching the real WebSocket API
class MockWebSocket {
  // WebSocket readyState constants
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  static instances: MockWebSocket[] = []

  url: string
  readyState: number = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null

  sentMessages: string[] = []
  closeCode: number | undefined
  closeReason: string | undefined

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sentMessages.push(data)
  }

  close(code?: number, reason?: string): void {
    this.closeCode = code
    this.closeReason = reason
    this.readyState = MockWebSocket.CLOSED
    // Note: onclose is triggered separately in tests
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent)
  }

  simulateError(): void {
    this.onerror?.({ type: 'error' } as Event)
  }

  simulateClose(code: number, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason } as CloseEvent)
  }

  static reset(): void {
    MockWebSocket.instances = []
  }

  static get lastInstance(): MockWebSocket | undefined {
    return MockWebSocket.instances.at(-1)
  }
}

describe('BeadsWebSocketClient', () => {
  let originalWebSocket: typeof WebSocket

  beforeEach(() => {
    originalWebSocket = global.WebSocket
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket
    MockWebSocket.reset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    global.WebSocket = originalWebSocket
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('Connection lifecycle', () => {
    it('connects to the WebSocket server', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws')
      client.connect()

      expect(MockWebSocket.lastInstance).toBeDefined()
      expect(MockWebSocket.lastInstance?.url).toBe('ws://localhost:8080/ws')
    })

    it('transitions to connecting state on connect()', () => {
      const onStateChange = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        onStateChange,
      })

      client.connect()

      expect(onStateChange).toHaveBeenCalledWith('connecting')
      expect(client.getState()).toBe('connecting')
    })

    it('transitions to connected state on open', () => {
      const onStateChange = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        onStateChange,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      expect(onStateChange).toHaveBeenCalledWith('connected')
      expect(client.getState()).toBe('connected')
    })

    it('is idempotent when already connecting', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws')

      client.connect()
      const firstInstance = MockWebSocket.lastInstance
      client.connect()

      expect(MockWebSocket.instances.length).toBe(1)
      expect(MockWebSocket.lastInstance).toBe(firstInstance)
    })

    it('is idempotent when already connected', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws')

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      client.connect()

      expect(MockWebSocket.instances.length).toBe(1)
    })

    it('disconnects with code 1000', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws')

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      client.disconnect()

      expect(MockWebSocket.lastInstance?.closeCode).toBe(1000)
      expect(client.getState()).toBe('disconnected')
    })

    it('cleans up on destroy()', () => {
      const onMutation = vi.fn()
      const onStateChange = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        onMutation,
        onStateChange,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      client.destroy()

      expect(client.getState()).toBe('disconnected')

      // Callbacks should be cleared
      onMutation.mockClear()
      onStateChange.mockClear()

      // If we could reconnect (which we can't after destroy),
      // callbacks shouldn't fire
    })
  })

  describe('Reconnection', () => {
    it('reconnects on abnormal close when reconnect=true', () => {
      const onStateChange = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
        onStateChange,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      onStateChange.mockClear()

      MockWebSocket.lastInstance?.simulateClose(1006) // Abnormal closure

      expect(client.getState()).toBe('reconnecting')
      expect(onStateChange).toHaveBeenCalledWith('reconnecting')

      // Advance timer to trigger reconnect
      vi.advanceTimersByTime(2000)

      expect(MockWebSocket.instances.length).toBe(2)
      expect(client.getState()).toBe('connecting')
    })

    it('does not reconnect on normal close (code 1000)', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      MockWebSocket.lastInstance?.simulateClose(1000)

      expect(client.getState()).toBe('disconnected')

      vi.advanceTimersByTime(5000)

      expect(MockWebSocket.instances.length).toBe(1)
    })

    it('does not reconnect when reconnect=false', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: false,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      MockWebSocket.lastInstance?.simulateClose(1006)

      expect(client.getState()).toBe('disconnected')

      vi.advanceTimersByTime(5000)

      expect(MockWebSocket.instances.length).toBe(1)
    })

    it('does not reconnect after manual disconnect()', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      client.disconnect()

      vi.advanceTimersByTime(5000)

      expect(MockWebSocket.instances.length).toBe(1)
    })

    it('uses exponential backoff with jitter', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      MockWebSocket.lastInstance?.simulateClose(1006)

      // First reconnect: base delay 1000ms * jitter (0.75-1.25) = 750-1250ms
      // Wait until first reconnect occurs (worst case 1250ms)
      vi.advanceTimersByTime(1500)
      expect(MockWebSocket.instances.length).toBe(2)

      // Simulate another failure
      MockWebSocket.lastInstance?.simulateClose(1006)

      // Second reconnect: base delay 2000ms * jitter = 1500-2500ms
      // Wait until second reconnect occurs (worst case 2500ms)
      vi.advanceTimersByTime(3000)
      expect(MockWebSocket.instances.length).toBe(3)

      // Simulate another failure
      MockWebSocket.lastInstance?.simulateClose(1006)

      // Third reconnect: base delay 4000ms * jitter = 3000-5000ms
      // Wait until third reconnect occurs (worst case 5000ms)
      vi.advanceTimersByTime(5500)
      expect(MockWebSocket.instances.length).toBe(4)
    })

    it('resets backoff on successful connection', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      // First connection
      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      MockWebSocket.lastInstance?.simulateClose(1006)

      // Wait for first reconnect attempt
      vi.advanceTimersByTime(1500)
      expect(MockWebSocket.instances.length).toBe(2)

      // Simulate another failure
      MockWebSocket.lastInstance?.simulateClose(1006)

      // Wait for second reconnect attempt (longer backoff)
      vi.advanceTimersByTime(3000)
      expect(MockWebSocket.instances.length).toBe(3)

      // Now succeed
      MockWebSocket.lastInstance?.simulateOpen()
      MockWebSocket.lastInstance?.simulateClose(1006)

      // Backoff should be reset - first attempt within ~1.5s
      vi.advanceTimersByTime(1500)
      expect(MockWebSocket.instances.length).toBe(4)
    })

    it('respects maxReconnectDelay', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
        maxReconnectDelay: 2000, // Very short max for testing
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      // Simulate many failures to build up backoff
      for (let i = 0; i < 10; i++) {
        MockWebSocket.lastInstance?.simulateClose(1006)
        vi.advanceTimersByTime(3000) // Should always reconnect within 2.5s (2000 * 1.25)
        expect(MockWebSocket.instances.length).toBe(i + 2)
      }
    })
  })

  describe('getReconnectAttempts', () => {
    it('returns 0 initially', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      expect(client.getReconnectAttempts()).toBe(0)
    })

    it('increments on each reconnect attempt', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      // First disconnection
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(client.getReconnectAttempts()).toBe(1)

      vi.advanceTimersByTime(2000)

      // Second disconnection
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(client.getReconnectAttempts()).toBe(2)
    })

    it('resets to 0 on successful connection', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      // Simulate failure and reconnect attempts
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(client.getReconnectAttempts()).toBe(1)

      vi.advanceTimersByTime(2000)
      expect(client.getReconnectAttempts()).toBe(1)

      // Successful reconnection
      MockWebSocket.lastInstance?.simulateOpen()
      expect(client.getReconnectAttempts()).toBe(0)
    })
  })

  describe('retryNow', () => {
    it('connects immediately when in reconnecting state', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      // Simulate disconnection
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(client.getState()).toBe('reconnecting')
      expect(MockWebSocket.instances.length).toBe(1)

      // Call retryNow
      client.retryNow()

      // Should have created a new WebSocket immediately
      expect(MockWebSocket.instances.length).toBe(2)
      expect(client.getState()).toBe('connecting')
    })

    it('cancels pending reconnect timer', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      // Simulate disconnection (schedules reconnect)
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(MockWebSocket.instances.length).toBe(1)

      // Call retryNow immediately
      client.retryNow()
      expect(MockWebSocket.instances.length).toBe(2)

      // Advance timer past when the scheduled reconnect would have fired
      vi.advanceTimersByTime(5000)

      // Should still only have 2 instances (the scheduled one was cancelled)
      expect(MockWebSocket.instances.length).toBe(2)
    })

    it('resets reconnectAttempts to 0', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      // Simulate failure and let some reconnect attempts happen
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(client.getReconnectAttempts()).toBe(1)

      vi.advanceTimersByTime(2000)
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(client.getReconnectAttempts()).toBe(2)

      vi.advanceTimersByTime(4000)
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(client.getReconnectAttempts()).toBe(3)

      // Now call retryNow
      client.retryNow()
      expect(client.getReconnectAttempts()).toBe(0)
    })

    it('is no-op when state is not reconnecting', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      // Disconnected state
      expect(client.getState()).toBe('disconnected')
      client.retryNow()
      expect(MockWebSocket.instances.length).toBe(0)

      // Connecting state
      client.connect()
      expect(client.getState()).toBe('connecting')
      client.retryNow()
      expect(MockWebSocket.instances.length).toBe(1)

      // Connected state
      MockWebSocket.lastInstance?.simulateOpen()
      expect(client.getState()).toBe('connected')
      client.retryNow()
      expect(MockWebSocket.instances.length).toBe(1)
    })
  })

  describe('onReconnect callback', () => {
    it('is called with attempt number on each reconnect', () => {
      const onReconnect = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
        onReconnect,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      // Initial connection calls onReconnect(0)
      expect(onReconnect).toHaveBeenCalledWith(0)
      onReconnect.mockClear()

      // First disconnection
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(onReconnect).toHaveBeenCalledWith(1)

      vi.advanceTimersByTime(2000)

      // Second disconnection
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(onReconnect).toHaveBeenCalledWith(2)

      vi.advanceTimersByTime(4000)

      // Third disconnection
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(onReconnect).toHaveBeenCalledWith(3)

      expect(onReconnect).toHaveBeenCalledTimes(3)
    })

    it('is called with 0 on initial connect', () => {
      const onReconnect = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
        onReconnect,
      })

      // During connection phase, onReconnect should not be called yet
      client.connect()
      expect(onReconnect).not.toHaveBeenCalled()

      // On successful connection, onReconnect is called with 0
      MockWebSocket.lastInstance?.simulateOpen()
      expect(onReconnect).toHaveBeenCalledWith(0)
      expect(onReconnect).toHaveBeenCalledTimes(1)
    })

    it('is not called again after manual disconnect', () => {
      const onReconnect = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
        onReconnect,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      // Initial connection calls onReconnect(0)
      expect(onReconnect).toHaveBeenCalledWith(0)
      expect(onReconnect).toHaveBeenCalledTimes(1)

      onReconnect.mockClear()

      // Manual disconnect should not trigger onReconnect
      client.disconnect()

      expect(onReconnect).not.toHaveBeenCalled()
    })

    it('is called with 0 when retryNow() is used', () => {
      const onReconnect = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
        onReconnect,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      // Simulate failure to enter reconnecting state
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(onReconnect).toHaveBeenCalledWith(1)

      onReconnect.mockClear()

      // Call retryNow
      client.retryNow()

      // Should notify that counter was reset to 0
      expect(onReconnect).toHaveBeenCalledWith(0)
    })

    it('is called with 0 on successful connection', () => {
      const onReconnect = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
        onReconnect,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      // First call should be with 0 on initial connection
      expect(onReconnect).toHaveBeenCalledWith(0)
      onReconnect.mockClear()

      // Simulate failure
      MockWebSocket.lastInstance?.simulateClose(1006)
      expect(onReconnect).toHaveBeenCalledWith(1)
      onReconnect.mockClear()

      // Advance timer to trigger reconnect
      vi.advanceTimersByTime(2000)

      // Successful reconnection
      MockWebSocket.lastInstance?.simulateOpen()

      // Should notify with 0 on successful reconnection
      expect(onReconnect).toHaveBeenCalledWith(0)
    })
  })

  describe('Message handling', () => {
    it('calls onMutation for mutation messages', () => {
      const onMutation = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        onMutation,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      const mutation: MutationPayload = {
        type: 'create',
        issue_id: 'beads-123',
        title: 'Test Issue',
        timestamp: '2025-01-23T12:00:00Z',
      }

      MockWebSocket.lastInstance?.simulateMessage({
        type: 'mutation',
        mutation,
      })

      expect(onMutation).toHaveBeenCalledWith(mutation)
    })

    it('calls onError for error messages', () => {
      const onError = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        onError,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      MockWebSocket.lastInstance?.simulateMessage({
        type: 'error',
        error: 'subscription_error',
        message: 'Failed to subscribe',
      })

      expect(onError).toHaveBeenCalledWith(
        'subscription_error',
        'Failed to subscribe'
      )
    })

    it('ignores pong messages', () => {
      const onMutation = vi.fn()
      const onError = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        onMutation,
        onError,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      MockWebSocket.lastInstance?.simulateMessage({
        type: 'pong',
        timestamp: '2025-01-23T12:00:00Z',
      })

      expect(onMutation).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    })

    it('ignores unknown message types', () => {
      const onMutation = vi.fn()
      const onError = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        onMutation,
        onError,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      MockWebSocket.lastInstance?.simulateMessage({
        type: 'unknown_future_type',
        data: 'something',
      })

      expect(onMutation).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    })

    it('ignores invalid JSON messages', () => {
      const onMutation = vi.fn()
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        onMutation,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()

      // Send invalid JSON directly
      MockWebSocket.lastInstance?.onmessage?.({
        data: 'not valid json {',
      } as MessageEvent)

      expect(onMutation).not.toHaveBeenCalled()
    })

    it('tracks last mutation timestamp for reconnection', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      client.subscribe()

      // Receive a mutation
      MockWebSocket.lastInstance?.simulateMessage({
        type: 'mutation',
        mutation: {
          type: 'create',
          issue_id: 'beads-123',
          timestamp: '2025-01-23T12:00:00Z',
        },
      })

      // Simulate disconnection and reconnection
      MockWebSocket.lastInstance?.simulateClose(1006)
      vi.advanceTimersByTime(2000)

      // Connect again
      MockWebSocket.lastInstance?.simulateOpen()

      // Check that subscribe was sent with the since timestamp
      const lastMessage = MockWebSocket.lastInstance?.sentMessages.at(-1)
      expect(lastMessage).toBeDefined()
      const parsed = JSON.parse(lastMessage as string) as {
        type: string
        since?: number
      }
      expect(parsed.type).toBe('subscribe')
      expect(parsed.since).toBe(Date.parse('2025-01-23T12:00:00Z'))
    })
  })

  describe('Subscribe/Unsubscribe', () => {
    it('sends subscribe message when connected', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws')

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      client.subscribe()

      const lastMessage = MockWebSocket.lastInstance?.sentMessages.at(-1)
      expect(lastMessage).toBeDefined()
      const parsed = JSON.parse(lastMessage as string) as { type: string }
      expect(parsed.type).toBe('subscribe')
    })

    it('sends subscribe with since timestamp', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws')

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      client.subscribe(1706011200000) // Some timestamp

      const lastMessage = MockWebSocket.lastInstance?.sentMessages.at(-1)
      expect(lastMessage).toBeDefined()
      const parsed = JSON.parse(lastMessage as string) as {
        type: string
        since?: number
      }
      expect(parsed.type).toBe('subscribe')
      expect(parsed.since).toBe(1706011200000)
    })

    it('queues subscription for when connected', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws')

      client.connect()
      client.subscribe() // Called before open

      expect(MockWebSocket.lastInstance?.sentMessages.length).toBe(0)

      MockWebSocket.lastInstance?.simulateOpen()

      const lastMessage = MockWebSocket.lastInstance?.sentMessages.at(-1)
      expect(lastMessage).toBeDefined()
      const parsed = JSON.parse(lastMessage as string) as { type: string }
      expect(parsed.type).toBe('subscribe')
    })

    it('sends unsubscribe message when connected', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws')

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      client.subscribe()
      client.unsubscribe()

      const lastMessage = MockWebSocket.lastInstance?.sentMessages.at(-1)
      expect(lastMessage).toBeDefined()
      const parsed = JSON.parse(lastMessage as string) as { type: string }
      expect(parsed.type).toBe('unsubscribe')
    })

    it('tracks subscription state correctly', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws')

      expect(client.isSubscribed()).toBe(false)

      client.subscribe()
      expect(client.isSubscribed()).toBe(true)

      client.unsubscribe()
      expect(client.isSubscribed()).toBe(false)
    })

    it('re-subscribes after reconnection', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      client.subscribe()

      // Clear sent messages
      const instance = MockWebSocket.lastInstance
      if (instance) {
        instance.sentMessages.length = 0
      }

      // Simulate disconnection
      MockWebSocket.lastInstance?.simulateClose(1006)
      vi.advanceTimersByTime(2000)

      // Should auto-subscribe on reconnect
      MockWebSocket.lastInstance?.simulateOpen()

      const lastMessage = MockWebSocket.lastInstance?.sentMessages.at(-1)
      expect(lastMessage).toBeDefined()
      const parsed = JSON.parse(lastMessage as string) as { type: string }
      expect(parsed.type).toBe('subscribe')
    })
  })

  describe('Ping', () => {
    it('sends ping message when connected', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws')

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      client.ping()

      const lastMessage = MockWebSocket.lastInstance?.sentMessages.at(-1)
      expect(lastMessage).toBeDefined()
      const parsed = JSON.parse(lastMessage as string) as { type: string }
      expect(parsed.type).toBe('ping')
    })

    it('does nothing when disconnected', () => {
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws')

      client.connect()
      client.ping() // Before connected

      expect(MockWebSocket.lastInstance?.sentMessages.length).toBe(0)
    })
  })

  describe('State transitions', () => {
    it('follows expected state flow on successful connection', () => {
      const states: ConnectionState[] = []
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        onStateChange: (state) => states.push(state),
      })

      expect(client.getState()).toBe('disconnected')

      client.connect()
      expect(states).toEqual(['connecting'])

      MockWebSocket.lastInstance?.simulateOpen()
      expect(states).toEqual(['connecting', 'connected'])
    })

    it('follows expected state flow on disconnection', () => {
      const states: ConnectionState[] = []
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        onStateChange: (state) => states.push(state),
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      states.length = 0 // Clear previous states

      client.disconnect()

      expect(states).toEqual(['disconnected'])
    })

    it('follows expected state flow on reconnection', () => {
      const states: ConnectionState[] = []
      const client = new BeadsWebSocketClient('ws://localhost:8080/ws', {
        reconnect: true,
        onStateChange: (state) => states.push(state),
      })

      client.connect()
      MockWebSocket.lastInstance?.simulateOpen()
      states.length = 0

      MockWebSocket.lastInstance?.simulateClose(1006)

      expect(states).toEqual(['reconnecting'])

      vi.advanceTimersByTime(2000)

      expect(states).toEqual(['reconnecting', 'connecting'])

      MockWebSocket.lastInstance?.simulateOpen()

      expect(states).toEqual(['reconnecting', 'connecting', 'connected'])
    })
  })
})

describe('getWebSocketUrl', () => {
  // Store original window if it exists
  const originalWindow = typeof window !== 'undefined' ? window : undefined

  beforeEach(() => {
    // Create a mock window for browser-like testing
    ;(global as unknown as { window: { location: { protocol: string; host: string } } }).window = {
      location: {
        protocol: 'http:',
        host: 'localhost:8080',
      },
    }
  })

  afterEach(() => {
    if (originalWindow !== undefined) {
      ;(global as unknown as { window: typeof window }).window = originalWindow
    } else {
      delete (global as unknown as { window?: unknown }).window
    }
  })

  it('returns wss:// for https:// pages', () => {
    ;(global as unknown as { window: { location: { protocol: string; host: string } } }).window = {
      location: {
        protocol: 'https:',
        host: 'example.com',
      },
    }

    expect(getWebSocketUrl()).toBe('wss://example.com/ws')
  })

  it('returns ws:// for http:// pages', () => {
    ;(global as unknown as { window: { location: { protocol: string; host: string } } }).window = {
      location: {
        protocol: 'http:',
        host: 'localhost:8080',
      },
    }

    expect(getWebSocketUrl()).toBe('ws://localhost:8080/ws')
  })
})
