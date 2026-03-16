import { useCallback, useEffect, useRef, useState } from 'react'
import type { SSEEventType } from '../types/events'

type SSEHandler = (eventType: SSEEventType, data: Record<string, unknown>) => void

interface UseSSEOptions {
  url: string
  onEvent: SSEHandler
  enabled?: boolean
}

/* eslint-disable react-hooks/refs -- connectRef.current assigned after useCallback is intentional */

/**
 * SSE client hook with auto-reconnect and Last-Event-ID support (FR-2.2, FR-2.5).
 */
export function useSSE({ url, onEvent, enabled = true }: UseSSEOptions) {
  const [connected, setConnected] = useState(false)
  const lastEventIdRef = useRef<string>('')
  const eventSourceRef = useRef<EventSource | null>(null)
  const onEventRef = useRef(onEvent)
  const connectRef = useRef<() => void>(() => {})

  useEffect(() => { onEventRef.current = onEvent }, [onEvent])

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
      setTimeout(() => connectRef.current(), 2000)
    }

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
        } catch (err) {
          console.warn('[useSSE] Malformed event data:', e.data, err)
        }
      })
    }
  }, [url])
  connectRef.current = connect

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
