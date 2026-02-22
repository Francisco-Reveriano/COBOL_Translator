import { ChevronDown, ChevronRight, Clock, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ActivityEntry } from '../stores/conversionStore'

interface StreamingPanelProps {
  activities: ActivityEntry[]
  isRunning: boolean
}

export function StreamingPanel({ activities, isRunning }: StreamingPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Auto-scroll with smart pause (FR-5.10)
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activities, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    setAutoScroll(atBottom)
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 font-mono text-sm"
      style={{ backgroundColor: 'var(--stream-bg)' }}
    >
      {activities.length === 0 && (
        <p className="opacity-50" style={{ color: 'var(--text-secondary)' }}>
          Upload COBOL files and start conversion to see agent activity...
        </p>
      )}

      {activities.map(entry => (
        <ActivityItem key={entry.id} entry={entry} />
      ))}

      {/* Typewriter cursor (FR-5.4) */}
      {isRunning && <span className="typewriter-cursor" />}

      <div ref={bottomRef} />

      {/* Scroll-to-bottom button */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true)
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
          }}
          className="fixed bottom-20 right-8 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          Scroll to bottom
        </button>
      )}
    </div>
  )
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false)

  if (entry.type === 'reasoning') {
    return (
      <div className="mb-1 whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
        {entry.text}
      </div>
    )
  }

  if (entry.type === 'tool_call') {
    return (
      <div
        className="my-2 rounded-lg border overflow-hidden"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Wrench size={14} style={{ color: 'var(--accent)' }} />
          <span className="font-semibold text-xs" style={{ color: 'var(--accent)' }}>
            {entry.tool}
          </span>
        </button>
        {expanded && entry.input && (
          <pre
            className="px-3 pb-2 text-xs overflow-x-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            {JSON.stringify(entry.input, null, 2).slice(0, 500)}
          </pre>
        )}
      </div>
    )
  }

  if (entry.type === 'tool_result') {
    return (
      <div
        className="my-2 rounded-lg border overflow-hidden"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Clock size={14} style={{ color: 'var(--step-done)' }} />
          <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
            {entry.tool}
          </span>
          {entry.durationMs !== undefined && (
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              {entry.durationMs}ms
            </span>
          )}
        </button>
        {expanded && entry.output && (
          <pre
            className="px-3 pb-2 text-xs overflow-x-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            {JSON.stringify(entry.output, null, 2).slice(0, 1000)}
          </pre>
        )}
      </div>
    )
  }

  if (entry.type === 'error') {
    return (
      <div
        className="my-2 px-3 py-2 rounded-lg border text-xs"
        style={{ borderColor: 'var(--score-red)', color: 'var(--score-red)', backgroundColor: 'var(--bg-card)' }}
      >
        {entry.text}
      </div>
    )
  }

  if (entry.type === 'complete') {
    return (
      <div
        className="my-2 px-3 py-2 rounded-lg border text-xs font-semibold"
        style={{ borderColor: 'var(--step-done)', color: 'var(--step-done)', backgroundColor: 'var(--bg-card)' }}
      >
        Conversion complete.
      </div>
    )
  }

  return null
}
