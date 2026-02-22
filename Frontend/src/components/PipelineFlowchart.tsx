/**
 * PipelineFlowchart — Sticky top orchestration rail.
 *
 * Pure CSS pipeline (no ReactFlow overhead for a simple horizontal flow).
 * Shows: Upload -> Scan -> Plan -> Convert -> Score -> Validate -> Report -> Done
 *
 * Features:
 *   - Animated edge-travel particles on the active connector
 *   - Stage-enter / stage-exit handoff micro-animations
 *   - Success flash on completed stages
 *   - "Current Execution" strip with phase / tool / module badges
 *   - Recent-transitions ticker showing last 3 tool events
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessionStatus } from '../types/events'
import type { ActivityEntry } from '../stores/conversionStore'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface PipelineFlowchartProps {
  currentPhase: string
  isRunning: boolean
  phaseDurations?: Record<string, number>
  currentTool?: string
  currentItemId?: string
  sessionStatus?: SessionStatus
  recentActivities?: ActivityEntry[]
}

// ---------------------------------------------------------------------------
// Pipeline phases
// ---------------------------------------------------------------------------
const PHASES = [
  { id: 'upload',   label: 'Upload',   icon: '\u2191' },
  { id: 'scan',     label: 'Scan',     icon: '\u2315' },
  { id: 'plan',     label: 'Plan',     icon: '\u2630' },
  { id: 'convert',  label: 'Convert',  icon: '\u21C4' },
  { id: 'score',    label: 'Score',    icon: '\u2605' },
  { id: 'validate', label: 'Validate', icon: '\u2713' },
  { id: 'report',   label: 'Report',   icon: '\u2637' },
  { id: 'done',     label: 'Done',     icon: '\u2714' },
]

const TOOL_LABELS: Record<string, string> = {
  cobol_scanner: 'COBOL Scanner',
  conversion_planner: 'Conversion Planner',
  cobol_converter: 'COBOL Converter',
  cobol_refiner: 'COBOL Refiner',
  quality_scorer: 'Quality Scorer',
  plan_tracker: 'Plan Tracker',
  validation_checker: 'Validation Checker',
}

const PHASE_LABELS: Record<string, string> = {
  upload: 'Uploading',
  scan: 'Scanning',
  plan: 'Planning',
  convert: 'Converting',
  score: 'Scoring',
  validate: 'Validating',
  report: 'Reporting',
  done: 'Done',
}

type NodeStatus = 'idle' | 'pending' | 'active' | 'completed' | 'failed'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resolveEffectivePhase(
  currentPhase: string,
  sessionStatus: SessionStatus,
  isRunning: boolean,
): string {
  if (sessionStatus === 'completed') return 'done'
  if (sessionStatus === 'idle' && !currentPhase) return ''
  if (isRunning && !currentPhase) return 'upload'
  return currentPhase
}

function statusColor(status: NodeStatus): string {
  switch (status) {
    case 'active':    return 'var(--accent-primary)'
    case 'completed': return 'var(--score-green)'
    case 'failed':    return 'var(--score-red)'
    default:          return 'var(--border-color)'
  }
}

function statusTextColor(status: NodeStatus): string {
  switch (status) {
    case 'active':    return 'var(--accent-primary)'
    case 'completed': return 'var(--score-green)'
    case 'failed':    return 'var(--score-red)'
    case 'pending':   return 'var(--text-muted)'
    default:          return 'var(--text-muted)'
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function PhaseNode({ phase, status, duration }: {
  phase: typeof PHASES[number]
  status: NodeStatus
  duration?: number
}) {
  const prevStatusRef = useRef<NodeStatus>(status)
  const [animClass, setAnimClass] = useState('')

  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status

    if (prev !== status) {
      const enter = setTimeout(() => {
        if (status === 'active') {
          setAnimClass('anim-pop-in')
        } else if (status === 'completed' && prev === 'active') {
          setAnimClass('anim-success')
        } else if (status === 'failed') {
          setAnimClass('anim-shake')
        }
      }, 0)
      const clear = setTimeout(() => setAnimClass(''), 700)
      return () => { clearTimeout(enter); clearTimeout(clear) }
    }
  }, [status])

  const isActive = status === 'active'
  const borderCol = statusColor(status)
  const textCol = statusTextColor(status)

  return (
    <div
      className={animClass}
      style={{
        width: 88,
        height: 52,
        border: `2px solid ${borderCol}`,
        borderRadius: 10,
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: isActive ? `0 0 18px ${borderCol}` : undefined,
        transition: `border-color var(--motion-fast) var(--ease-smooth),
                     box-shadow var(--motion-medium) var(--ease-out-expo)`,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {isActive && (
        <span
          className="anim-breathe"
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: 14,
            border: `1px solid ${borderCol}`,
            pointerEvents: 'none',
          }}
        />
      )}
      <span style={{ fontSize: 14, lineHeight: 1 }}>{phase.icon}</span>
      <span style={{ color: textCol, fontSize: 10, fontWeight: 700, marginTop: 2 }}>
        {phase.label}
      </span>
      {status === 'completed' && duration != null && (
        <span style={{ color: 'var(--text-muted)', fontSize: 8, marginTop: 1 }}>
          {duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m${duration % 60}s`}
        </span>
      )}
    </div>
  )
}

function Connector({ status, isActive }: { status: 'done' | 'active' | 'pending'; isActive: boolean }) {
  const color = status === 'done' ? 'var(--score-green)' : 'var(--border-color)'

  return (
    <div
      style={{
        width: 32,
        height: 2,
        background: color,
        position: 'relative',
        flexShrink: 0,
        alignSelf: 'center',
        transition: `background var(--motion-fast) var(--ease-smooth)`,
        overflow: 'visible',
      }}
    >
      {isActive && (
        <span
          style={{
            position: 'absolute',
            top: -3,
            left: 0,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--accent-primary)',
            animation: 'particle-travel 1.2s var(--ease-smooth) infinite',
            offsetPath: 'none',
          }}
        />
      )}
    </div>
  )
}

function TickerItem({ entry }: { entry: ActivityEntry }) {
  const label = entry.tool
    ? (TOOL_LABELS[entry.tool] || entry.tool)
    : entry.type

  const phaseTag = entry.phase ? (PHASE_LABELS[entry.phase] || entry.phase) : ''
  const isError = entry.type === 'error'

  return (
    <span
      className="anim-sweep-right"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 500,
        background: isError ? 'var(--score-red)' : 'var(--bg-secondary)',
        color: isError ? '#fff' : 'var(--text-secondary)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {phaseTag && (
        <span style={{ fontWeight: 700, color: isError ? '#fff' : 'var(--accent-primary)' }}>
          {phaseTag}
        </span>
      )}
      <span>{label}</span>
      {entry.durationMs != null && (
        <span style={{ opacity: 0.6 }}>{entry.durationMs}ms</span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function PipelineFlowchart({
  currentPhase,
  isRunning,
  phaseDurations = {},
  currentTool,
  currentItemId,
  sessionStatus = 'idle',
  recentActivities = [],
}: PipelineFlowchartProps) {
  const effectivePhase = resolveEffectivePhase(currentPhase, sessionStatus, isRunning)
  const currentIdx = PHASES.findIndex(p => p.id === effectivePhase)

  const statuses = useMemo(() => {
    return PHASES.map((p, i): NodeStatus => {
      if (sessionStatus === 'idle' && !currentPhase) return 'idle'
      if (sessionStatus === 'completed' && p.id === 'done') return 'completed'
      if (sessionStatus === 'failed' && i === currentIdx) return 'failed'
      if (i < currentIdx) return 'completed'
      if (i === currentIdx && isRunning) return 'active'
      if (i === currentIdx && !isRunning && currentPhase) return 'completed'
      return 'pending'
    })
  }, [currentPhase, isRunning, currentIdx, sessionStatus])

  const toolLabel = currentTool ? (TOOL_LABELS[currentTool] || currentTool) : null
  const phaseLabel = effectivePhase ? (PHASE_LABELS[effectivePhase] || effectivePhase) : null
  const showExecStrip = isRunning || sessionStatus === 'completed' || sessionStatus === 'failed'

  const tickerItems = recentActivities
    .filter(a => a.type === 'tool_call' || a.type === 'tool_result' || a.type === 'error')
    .slice(-4)

  return (
    <div>
      {/* Phase rail */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0,
          padding: '10px 16px 6px',
          overflowX: 'auto',
          background: 'var(--bg-secondary)',
        }}
      >
        {PHASES.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
            <PhaseNode
              phase={p}
              status={statuses[i]}
              duration={phaseDurations[p.id]}
            />
            {i < PHASES.length - 1 && (
              <Connector
                status={i < currentIdx ? 'done' : i === currentIdx && isRunning ? 'active' : 'pending'}
                isActive={i === currentIdx && isRunning}
              />
            )}
          </div>
        ))}
      </div>

      {/* Execution strip */}
      {showExecStrip && (
        <div
          className="anim-slide-in-bottom"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '4px 16px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
            minHeight: 28,
            overflow: 'hidden',
          }}
        >
          {/* Live dot */}
          {isRunning && (
            <span
              className="anim-breathe"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: 'var(--accent-primary)',
                flexShrink: 0,
              }}
            />
          )}

          {/* Status badge */}
          {sessionStatus === 'completed' && (
            <span
              className="anim-pop-in"
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#fff',
                background: 'var(--score-green)',
                padding: '2px 8px',
                borderRadius: 6,
              }}
            >
              Completed
            </span>
          )}
          {sessionStatus === 'failed' && (
            <span
              className="anim-shake"
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#fff',
                background: 'var(--score-red)',
                padding: '2px 8px',
                borderRadius: 6,
              }}
            >
              Failed
            </span>
          )}

          {/* Phase label */}
          {phaseLabel && isRunning && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)' }}>
              {phaseLabel}
            </span>
          )}

          {/* Tool badge */}
          {toolLabel && isRunning && (
            <>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/</span>
              <span
                className="anim-pop-in"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-secondary)',
                  padding: '2px 8px',
                  borderRadius: 6,
                }}
              >
                {toolLabel}
              </span>
            </>
          )}

          {/* Module ID chip */}
          {currentItemId && isRunning && (
            <>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>&middot;</span>
              <span
                className="anim-sweep-right"
                style={{
                  fontSize: 10,
                  fontFamily: 'monospace',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-secondary)',
                  padding: '1px 6px',
                  borderRadius: 4,
                }}
              >
                {currentItemId}
              </span>
            </>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Recent transitions ticker */}
          {tickerItems.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                overflow: 'hidden',
                maxWidth: '40%',
              }}
            >
              <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, fontWeight: 600 }}>
                RECENT
              </span>
              {tickerItems.map(item => (
                <TickerItem key={item.id} entry={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
