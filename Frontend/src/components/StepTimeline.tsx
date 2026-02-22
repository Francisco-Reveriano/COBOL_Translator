import { Check, Circle, Loader2, XCircle } from 'lucide-react'
import type { SessionStatus } from '../types/events'

const PHASES = [
  { key: 'scan', label: 'Scan' },
  { key: 'plan', label: 'Plan' },
  { key: 'convert', label: 'Convert' },
  { key: 'score', label: 'Score' },
  { key: 'validate', label: 'Validate' },
  { key: 'report', label: 'Report' },
]

const PHASE_ORDER = PHASES.map(p => p.key)

interface StepTimelineProps {
  currentPhase: string
  isRunning: boolean
  sessionStatus: SessionStatus
}

export function StepTimeline({ currentPhase, isRunning, sessionStatus }: StepTimelineProps) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase)

  return (
    <div className="flex flex-col gap-1 py-4 px-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
        Pipeline
      </span>
      {PHASES.map((phase, idx) => {
        const isFailed = sessionStatus === 'failed' && phase.key === currentPhase
        const isActive = phase.key === currentPhase && isRunning
        const isCompleted = !isFailed && (currentIdx > idx || (!isRunning && currentIdx >= idx && currentPhase !== ''))
        const isPending = !isActive && !isCompleted && !isFailed

        return (
          <div key={phase.key} className="flex items-center gap-2 py-1.5">
            {isFailed ? (
              <XCircle size={16} style={{ color: 'var(--score-red)' }} />
            ) : isActive ? (
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--step-active)' }} />
            ) : isCompleted ? (
              <Check size={16} style={{ color: 'var(--step-done)' }} />
            ) : (
              <Circle size={16} style={{ color: isPending ? 'var(--node-pending)' : 'var(--text-secondary)' }} />
            )}
            <span
              className="text-xs font-medium"
              style={{
                color: isFailed
                  ? 'var(--score-red)'
                  : isActive
                  ? 'var(--step-active)'
                  : isCompleted
                  ? 'var(--step-done)'
                  : 'var(--text-secondary)',
              }}
            >
              {phase.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
