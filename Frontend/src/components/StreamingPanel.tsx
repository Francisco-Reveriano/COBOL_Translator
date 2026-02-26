import { ChevronDown, ChevronRight, Clock, RefreshCw, Target, Wrench, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ActivityEntry } from '../stores/conversionStore'

const PHASE_LABELS: Record<string, string> = {
  scan: 'Scanning',
  plan: 'Planning',
  convert: 'Converting',
  score: 'Scoring',
  validate: 'Validating',
  report: 'Reporting',
}

interface StreamingPanelProps {
  activities: ActivityEntry[]
  isRunning: boolean
}

// Groups consecutive tool_call+tool_result pairs from the same phase
interface ActivityGroup {
  type: 'separator' | 'item' | 'burst'
  phase?: string
  entries: ActivityEntry[]
}

function groupActivities(activities: ActivityEntry[]): ActivityGroup[] {
  const groups: ActivityGroup[] = []
  let lastPhase = ''
  let currentBurst: ActivityEntry[] = []

  const flushBurst = () => {
    if (currentBurst.length === 0) return
    if (currentBurst.length >= 3) {
      groups.push({ type: 'burst', phase: currentBurst[0].phase, entries: [...currentBurst] })
    } else {
      for (const entry of currentBurst) {
        groups.push({ type: 'item', entries: [entry] })
      }
    }
    currentBurst = []
  }

  for (const entry of activities) {
    // Phase separator
    if (entry.phase && entry.phase !== lastPhase && lastPhase !== '') {
      flushBurst()
      groups.push({ type: 'separator', phase: entry.phase, entries: [] })
    }
    if (entry.phase) lastPhase = entry.phase

    // Collect tool_result entries into burst groups (rapid-fire results)
    if (entry.type === 'tool_result') {
      currentBurst.push(entry)
      continue
    }

    flushBurst()
    groups.push({ type: 'item', entries: [entry] })
  }

  flushBurst()
  return groups
}

export function StreamingPanel({ activities, isRunning }: StreamingPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

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

  const groups = useMemo(() => groupActivities(activities), [activities])

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

      {groups.map((group, gi) => {
        if (group.type === 'separator') {
          return <StageSeparator key={`sep-${gi}`} phase={group.phase || ''} />
        }

        if (group.type === 'burst') {
          return <BurstGroup key={`burst-${gi}`} entries={group.entries} />
        }

        return group.entries.map(entry => (
          <ActivityItem key={entry.id} entry={entry} />
        ))
      })}

      {isRunning && <span className="typewriter-cursor" />}

      <div ref={bottomRef} />

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

// ---------------------------------------------------------------------------
// Stage separator
// ---------------------------------------------------------------------------
function StageSeparator({ phase }: { phase: string }) {
  const label = PHASE_LABELS[phase] || phase

  return (
    <div
      className="anim-slide-in-top"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: '16px 0 8px',
      }}
    >
      <div style={{
        flex: 1,
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)',
      }} />
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--accent-primary)',
          padding: '2px 10px',
          borderRadius: 8,
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--accent-primary)',
        }}
      >
        {label}
      </span>
      <div style={{
        flex: 1,
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)',
      }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Burst group — collapsed batch of rapid-fire tool results
// ---------------------------------------------------------------------------
function BurstGroup({ entries }: { entries: ActivityEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const totalMs = entries.reduce((sum, e) => sum + (e.durationMs || 0), 0)
  const tools = [...new Set(entries.map(e => e.tool).filter(Boolean))]

  return (
    <div
      className="my-2 rounded-lg border overflow-hidden anim-sweep-right"
      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Zap size={14} style={{ color: 'var(--accent)' }} />
        <span className="font-semibold text-xs" style={{ color: 'var(--accent)' }}>
          {entries.length} results
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          ({tools.join(', ')})
        </span>
        <span
          className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
        >
          {totalMs}ms total
        </span>
      </button>
      {expanded && (
        <div style={{ padding: '0 8px 8px' }}>
          {entries.map(entry => (
            <ActivityItem key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity item
// ---------------------------------------------------------------------------
function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false)

  if (entry.type === 'reasoning') {
    return (
      <div
        className="mb-1 anim-sweep-right markdown-body"
        style={{ color: 'var(--text-primary)' }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.text || ''}</ReactMarkdown>
      </div>
    )
  }

  if (entry.type === 'tool_call') {
    const input = entry.input as Record<string, unknown> | undefined

    if (entry.tool === 'quality_scorer' && input) {
      const moduleName = String(input.module_name || '')
      return (
        <div
          className="my-2 rounded-lg border overflow-hidden anim-pop-in"
          style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-card)' }}
        >
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Target size={14} style={{ color: 'var(--accent)' }} />
            <span className="font-semibold text-xs" style={{ color: 'var(--accent)' }}>
              Scoring {moduleName}
            </span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
              GPT-5.2-Codex
            </span>
          </button>
          {expanded && input && (
            <pre className="px-3 pb-2 text-xs overflow-x-auto"
              style={{ color: 'var(--text-secondary)' }}>
              {JSON.stringify(input, null, 2).slice(0, 500)}
            </pre>
          )}
        </div>
      )
    }

    if (entry.tool === 'cobol_refiner' && input) {
      const attempt = Number(input.attempt || 0)
      const moduleName = String(input.program_id || '')
      return (
        <div
          className="my-2 rounded-lg border overflow-hidden anim-pop-in"
          style={{ borderColor: 'var(--score-yellow)', backgroundColor: 'var(--bg-card)' }}
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--score-yellow)' }} />
            <span className="font-semibold text-xs" style={{ color: 'var(--score-yellow)' }}>
              Refining {moduleName}
            </span>
            <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded anim-pop-in"
              style={{ backgroundColor: 'var(--score-yellow)', color: '#fff' }}>
              Attempt {attempt}/3
            </span>
          </div>
        </div>
      )
    }

    return (
      <div
        className="my-2 rounded-lg border overflow-hidden anim-sweep-right"
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
        {expanded && input && (
          <pre
            className="px-3 pb-2 text-xs overflow-x-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            {JSON.stringify(input, null, 2).slice(0, 500)}
          </pre>
        )}
      </div>
    )
  }

  if (entry.type === 'tool_result') {
    return (
      <div
        className="my-2 rounded-lg border overflow-hidden anim-sweep-right"
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
        className="my-2 px-3 py-2 rounded-lg border text-xs anim-shake"
        style={{ borderColor: 'var(--score-red)', color: 'var(--score-red)', backgroundColor: 'var(--bg-card)' }}
      >
        {entry.text}
      </div>
    )
  }

  if (entry.type === 'complete') {
    return (
      <div
        className="my-2 px-3 py-2 rounded-lg border text-xs font-semibold anim-success"
        style={{ borderColor: 'var(--step-done)', color: 'var(--step-done)', backgroundColor: 'var(--bg-card)' }}
      >
        Conversion complete.
      </div>
    )
  }

  return null
}
