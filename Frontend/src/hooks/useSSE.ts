import { useCallback, useEffect, useRef, useState } from 'react'
import type { SSEEventType } from '../types/events'

type SSEHandler = (eventType: SSEEventType, data: Record<string, unknown>) => void

interface UseSSEOptions {
  url: string
  onEvent: SSEHandler
  enabled?: boolean
}

/**
 * SSE client hook with auto-reconnect and Last-Event-ID support (FR-2.2, FR-2.5).
 */
export function useSSE({ url, onEvent, enabled = true }: UseSSEOptions) {
  const [connected, setConnected] = useState(false)
  const lastEventIdRef = useRef<string>('')
  const eventSourceRef = useRef<EventSource | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const fullUrl = lastEventIdRef.current
      ? `${url}?lastEventId=${lastEventIdRef.current}`
      : url

    const es = new EventSource(fullUrl)
    eventSourceRef.current = es

    es.onopen = () => setConnected(true)
    es.onerror = () => {
      setConnected(false)
      es.close()
      // Auto-reconnect after 2s
      setTimeout(connect, 2000)
    }

    // Listen for all event types from the PRD spec
    const eventTypes: SSEEventType[] = [
      'reasoning', 'tool_call', 'tool_result', 'plan_update',
      'score', 'flowchart', 'error', 'complete',
    ]

    for (const type of eventTypes) {
      es.addEventListener(type, (e: MessageEvent) => {
        if (e.lastEventId) {
          lastEventIdRef.current = e.lastEventId
        }
        try {
          const data = JSON.parse(e.data)
          onEventRef.current(type, data)
        } catch {
          // skip malformed events
        }
      })
    }
  }, [url])

  useEffect(() => {
    if (enabled) {
      connect()
    }
    return () => {
      eventSourceRef.current?.close()
      eventSourceRef.current = null
    }
  }, [enabled, connect])

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    setConnected(false)
  }, [])

  return { connected, disconnect }
}
