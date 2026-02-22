import { useCallback, useEffect, useRef, useState } from 'react'
import type { SteeringAction, SteeringResponse } from '../types/events'

interface UseWebSocketOptions {
  url: string
  onResponse?: (resp: SteeringResponse) => void
  enabled?: boolean
}

/**
 * WebSocket hook for sending steering commands (FR-7).
 */
export function useWebSocket({ url, onResponse, enabled = true }: UseWebSocketOptions) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const onResponseRef = useRef(onResponse)

  useEffect(() => { onResponseRef.current = onResponse }, [onResponse])

  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      return
    }

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
    }
    ws.onmessage = (e) => {
      try {
        const data: SteeringResponse = JSON.parse(e.data)
        onResponseRef.current?.(data)
      } catch {
        // skip malformed messages
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [url, enabled])

  const send = useCallback((command: SteeringAction, itemId?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command, item_id: itemId }))
    }
  }, [])

  return { connected, send }
}
