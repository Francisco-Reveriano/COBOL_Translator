import { useCallback, useEffect, useRef, useState } from 'react'
import type { SteeringAction, SteeringResponse } from '../types/events'

interface UseWebSocketOptions {
  url: string
  onResponse?: (resp: SteeringResponse) => void
}

/**
 * WebSocket hook for sending steering commands (FR-7).
 */
export function useWebSocket({ url, onResponse }: UseWebSocketOptions) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const onResponseRef = useRef(onResponse)
  onResponseRef.current = onResponse

  useEffect(() => {
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      // Auto-reconnect after 2s
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          wsRef.current = new WebSocket(url)
        }
      }, 2000)
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
  }, [url])

  const send = useCallback((command: SteeringAction, itemId?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command, item_id: itemId }))
    }
  }, [])

  return { connected, send }
}
