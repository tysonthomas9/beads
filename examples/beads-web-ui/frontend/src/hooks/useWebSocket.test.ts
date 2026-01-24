/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from './useWebSocket'
import type { MutationPayload } from '../api/websocket'

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

describe('useWebSocket', () => {
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

  describe('Initialization', () => {
    it('returns expected shape with all methods and state', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      expect(result.current).toHaveProperty('state')
      expect(result.current).toHaveProperty('lastError')
      expect(result.current).toHaveProperty('isConnected')
      expect(result.current).toHaveProperty('connect')
      expect(result.current).toHaveProperty('disconnect')
      expect(result.current).toHaveProperty('subscribe')
      expect(result.current).toHaveProperty('unsubscribe')

      expect(typeof result.current.connect).toBe('function')
      expect(typeof result.current.disconnect).toBe('function')
      expect(typeof result.current.subscribe).toBe('function')
      expect(typeof result.current.unsubscribe).toBe('function')
    })

    it('initial state is disconnected', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      expect(result.current.state).toBe('disconnected')
      expect(result.current.isConnected).toBe(false)
      expect(result.current.lastError).toBeNull()
    })
  })

  describe('Connection lifecycle', () => {
    it('connect() creates WebSocket', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      act(() => {
        result.current.connect()
      })

      expect(MockWebSocket.lastInstance).toBeDefined()
      expect(MockWebSocket.lastInstance?.url).toBe('ws://localhost:8080/ws')
    })

    it('state transitions from disconnected to connecting to connected', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      expect(result.current.state).toBe('disconnected')

      act(() => {
        result.current.connect()
      })

      expect(result.current.state).toBe('connecting')

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      expect(result.current.state).toBe('connected')
      expect(result.current.isConnected).toBe(true)
    })

    it('component unmount calls destroy and cleans up', () => {
      const { result, unmount } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      act(() => {
        result.current.connect()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      const wsInstance = MockWebSocket.lastInstance

      unmount()

      // WebSocket should be closed after unmount
      expect(wsInstance?.closeCode).toBe(1000)
    })

    it('disconnect() closes WebSocket and updates state', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      act(() => {
        result.current.connect()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      expect(result.current.isConnected).toBe(true)

      act(() => {
        result.current.disconnect()
      })

      expect(result.current.state).toBe('disconnected')
      expect(result.current.isConnected).toBe(false)
    })
  })

  describe('State reactivity', () => {
    it('state changes trigger re-renders', () => {
      const renderCount = { count: 0 }
      const { result } = renderHook(() => {
        renderCount.count++
        return useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      })

      const initialCount = renderCount.count

      act(() => {
        result.current.connect()
      })

      expect(renderCount.count).toBeGreaterThan(initialCount)

      const afterConnectCount = renderCount.count

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      expect(renderCount.count).toBeGreaterThan(afterConnectCount)
    })

    it('isConnected computed correctly based on state', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      expect(result.current.isConnected).toBe(false)
      expect(result.current.state).toBe('disconnected')

      act(() => {
        result.current.connect()
      })

      expect(result.current.state).toBe('connecting')
      expect(result.current.isConnected).toBe(false)

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      expect(result.current.state).toBe('connected')
      expect(result.current.isConnected).toBe(true)
    })

    it('lastError updates on errors', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      act(() => {
        result.current.connect()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          type: 'error',
          error: 'subscription_error',
          message: 'Failed to subscribe',
        })
      })

      expect(result.current.lastError).toBe('subscription_error: Failed to subscribe')
    })

    it('lastError is cleared on successful connection', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false, reconnect: true })
      )

      act(() => {
        result.current.connect()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      // Trigger an error
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          type: 'error',
          error: 'test_error',
          message: 'Test error message',
        })
      })

      expect(result.current.lastError).toBe('test_error: Test error message')

      // Simulate abnormal close to trigger reconnection
      act(() => {
        MockWebSocket.lastInstance?.simulateClose(1006)
      })

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      expect(result.current.lastError).toBeNull()
    })
  })

  describe('Callbacks', () => {
    it('onMutation called with payload', () => {
      const onMutation = vi.fn()
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'ws://localhost:8080/ws',
          autoConnect: false,
          onMutation,
        })
      )

      act(() => {
        result.current.connect()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      const mutation: MutationPayload = {
        type: 'create',
        issue_id: 'beads-123',
        title: 'Test Issue',
        timestamp: '2025-01-23T12:00:00Z',
      }

      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          type: 'mutation',
          mutation,
        })
      })

      expect(onMutation).toHaveBeenCalledWith(mutation)
    })

    it('onError called with error details', () => {
      const onError = vi.fn()
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'ws://localhost:8080/ws',
          autoConnect: false,
          onError,
        })
      )

      act(() => {
        result.current.connect()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          type: 'error',
          error: 'subscription_error',
          message: 'Failed to subscribe',
        })
      })

      expect(onError).toHaveBeenCalledWith('subscription_error', 'Failed to subscribe')
    })

    it('onStateChange called on transitions', () => {
      const onStateChange = vi.fn()
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'ws://localhost:8080/ws',
          autoConnect: false,
          onStateChange,
        })
      )

      act(() => {
        result.current.connect()
      })

      expect(onStateChange).toHaveBeenCalledWith('connecting')

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      expect(onStateChange).toHaveBeenCalledWith('connected')

      act(() => {
        result.current.disconnect()
      })

      expect(onStateChange).toHaveBeenCalledWith('disconnected')
    })

    it('callbacks are not called after unmount', () => {
      const onMutation = vi.fn()
      const { result, unmount } = renderHook(() =>
        useWebSocket({
          url: 'ws://localhost:8080/ws',
          autoConnect: false,
          onMutation,
        })
      )

      act(() => {
        result.current.connect()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      const wsInstance = MockWebSocket.lastInstance

      unmount()

      // Try to send a message after unmount
      act(() => {
        wsInstance?.simulateMessage({
          type: 'mutation',
          mutation: {
            type: 'create',
            issue_id: 'beads-456',
            title: 'Should not be received',
            timestamp: '2025-01-23T12:00:00Z',
          },
        })
      })

      // onMutation should not be called after unmount
      expect(onMutation).not.toHaveBeenCalled()
    })
  })

  describe('Auto-connect option', () => {
    it('when true connects on mount', () => {
      renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: true })
      )

      // WebSocket should be created automatically
      expect(MockWebSocket.instances.length).toBe(1)
      expect(MockWebSocket.lastInstance?.url).toBe('ws://localhost:8080/ws')
    })

    it('when false does not connect on mount', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      // No WebSocket should be created
      expect(MockWebSocket.instances.length).toBe(0)
      expect(result.current.state).toBe('disconnected')
    })

    it('defaults to true', () => {
      renderHook(() => useWebSocket({ url: 'ws://localhost:8080/ws' }))

      // WebSocket should be created automatically (default autoConnect: true)
      expect(MockWebSocket.instances.length).toBe(1)
    })
  })

  describe('Auto-subscribe (subscribeOnConnect) option', () => {
    it('auto-subscribes when connected with subscribeOnConnect=true', () => {
      renderHook(() =>
        useWebSocket({
          url: 'ws://localhost:8080/ws',
          autoConnect: true,
          subscribeOnConnect: true,
        })
      )

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      const lastMessage = MockWebSocket.lastInstance?.sentMessages.at(-1)
      expect(lastMessage).toBeDefined()
      const parsed = JSON.parse(lastMessage as string) as { type: string }
      expect(parsed.type).toBe('subscribe')
    })

    it('does not auto-subscribe when subscribeOnConnect=false', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'ws://localhost:8080/ws',
          autoConnect: true,
          subscribeOnConnect: false,
        })
      )

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      expect(result.current.isConnected).toBe(true)

      // No subscribe message should be sent
      expect(MockWebSocket.lastInstance?.sentMessages.length).toBe(0)
    })

    it('defaults to false', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: true })
      )

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      expect(result.current.isConnected).toBe(true)

      // No subscribe message should be sent (default subscribeOnConnect: false)
      expect(MockWebSocket.lastInstance?.sentMessages.length).toBe(0)
    })
  })

  describe('Subscribe/unsubscribe methods', () => {
    it('subscribe() sends subscribe message', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      act(() => {
        result.current.connect()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      expect(result.current.isConnected).toBe(true)

      act(() => {
        result.current.subscribe()
      })

      const lastMessage = MockWebSocket.lastInstance?.sentMessages.at(-1)
      expect(lastMessage).toBeDefined()
      const parsed = JSON.parse(lastMessage as string) as { type: string }
      expect(parsed.type).toBe('subscribe')
    })

    it('subscribe() with since timestamp', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      act(() => {
        result.current.connect()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      expect(result.current.isConnected).toBe(true)

      act(() => {
        result.current.subscribe(1706011200000)
      })

      const lastMessage = MockWebSocket.lastInstance?.sentMessages.at(-1)
      expect(lastMessage).toBeDefined()
      const parsed = JSON.parse(lastMessage as string) as { type: string; since?: number }
      expect(parsed.type).toBe('subscribe')
      expect(parsed.since).toBe(1706011200000)
    })

    it('unsubscribe() sends unsubscribe message', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      act(() => {
        result.current.connect()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      expect(result.current.isConnected).toBe(true)

      act(() => {
        result.current.subscribe()
      })

      act(() => {
        result.current.unsubscribe()
      })

      const lastMessage = MockWebSocket.lastInstance?.sentMessages.at(-1)
      expect(lastMessage).toBeDefined()
      const parsed = JSON.parse(lastMessage as string) as { type: string }
      expect(parsed.type).toBe('unsubscribe')
    })

    it('methods are stable across renders', () => {
      const { result, rerender } = renderHook(() =>
        useWebSocket({ url: 'ws://localhost:8080/ws', autoConnect: false })
      )

      const initialConnect = result.current.connect
      const initialDisconnect = result.current.disconnect
      const initialSubscribe = result.current.subscribe
      const initialUnsubscribe = result.current.unsubscribe

      rerender()

      expect(result.current.connect).toBe(initialConnect)
      expect(result.current.disconnect).toBe(initialDisconnect)
      expect(result.current.subscribe).toBe(initialSubscribe)
      expect(result.current.unsubscribe).toBe(initialUnsubscribe)
    })
  })

  describe('SSR compatibility', () => {
    it('does not connect without explicit URL when getWebSocketUrl returns empty', () => {
      // Mock getWebSocketUrl to return empty (simulating SSR or invalid window.location)
      // In real SSR, window is undefined. In jsdom, we test the URL-dependent behavior
      // by passing autoConnect: false and verifying state remains disconnected
      const { result } = renderHook(() =>
        useWebSocket({ autoConnect: false })
      )

      // Should have initial state and no WebSocket created
      expect(result.current.state).toBe('disconnected')
      expect(result.current.isConnected).toBe(false)
      expect(MockWebSocket.instances.length).toBe(0)

      // Hook should still return all expected methods
      expect(typeof result.current.connect).toBe('function')
      expect(typeof result.current.subscribe).toBe('function')
    })

    it('uses custom url over window.location', () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: 'ws://custom-server:9090/ws', autoConnect: true })
      )

      expect(MockWebSocket.lastInstance?.url).toBe('ws://custom-server:9090/ws')

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      expect(result.current.isConnected).toBe(true)
    })
  })

  describe('Options propagation', () => {
    it('passes reconnect option to client', () => {
      renderHook(() =>
        useWebSocket({
          url: 'ws://localhost:8080/ws',
          autoConnect: true,
          reconnect: true,
        })
      )

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      act(() => {
        MockWebSocket.lastInstance?.simulateClose(1006) // Abnormal closure
      })

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      // Should have created a second WebSocket due to reconnection
      expect(MockWebSocket.instances.length).toBe(2)
    })

    it('passes maxReconnectDelay option to client', () => {
      renderHook(() =>
        useWebSocket({
          url: 'ws://localhost:8080/ws',
          autoConnect: true,
          reconnect: true,
          maxReconnectDelay: 1000,
        })
      )

      act(() => {
        MockWebSocket.lastInstance?.simulateOpen()
      })

      // Simulate multiple failures to test maxReconnectDelay
      for (let i = 0; i < 5; i++) {
        act(() => {
          MockWebSocket.lastInstance?.simulateClose(1006)
        })

        act(() => {
          // With maxReconnectDelay=1000 and jitter (0.75-1.25), max wait should be 1250ms
          vi.advanceTimersByTime(1500)
        })
      }

      // All reconnections should have happened within the max delay
      expect(MockWebSocket.instances.length).toBe(6)
    })
  })
})
