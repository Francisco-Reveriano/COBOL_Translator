import { Check, Circle, Loader2, XCircle } from 'lucide-react'
import type { SessionStatus } from '../types/events'

const PHASES = [
  { key: 'analyze', label: 'Analyze' },
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
    <div className="flex flex-col py-4 px-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
        Pipeline
      </span>
      {PHASES.map((phase, idx) => {
        const isFailed = sessionStatus === 'failed' && phase.key === currentPhase
        const isActive = phase.key === currentPhase && isRunning
        const isCompleted = !isFailed && (currentIdx > idx || (!isRunning && currentIdx >= idx && currentPhase !== ''))
        const isPending = !isActive && !isCompleted && !isFailed
        const isLast = idx === PHASES.length - 1

        // Connector line color: done if next phase has started, active if this is the active phase, pending otherwise
        const nextStarted = currentIdx > idx
        const connectorColor = nextStarted
          ? 'var(--step-done)'
          : isActive
          ? 'var(--step-active)'
          : 'var(--node-pending)'

        return (
          <div key={phase.key} className="flex flex-col">
            {/* Phase row */}
            <div className="flex items-center gap-2.5 py-1">
              {/* Icon with subtle background ring */}
              <div
                className="relative flex items-center justify-center flex-shrink-0"
                style={{ width: 24, height: 24 }}
              >
                {(isActive || isCompleted) && (
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      backgroundColor: isActive
                        ? 'color-mix(in srgb, var(--step-active) 12%, transparent)'
                        : 'color-mix(in srgb, var(--step-done) 10%, transparent)',
                    }}
                  />
                )}
                {isFailed ? (
                  <XCircle size={16} style={{ color: 'var(--score-red)' }} />
                ) : isActive ? (
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--step-active)' }} />
                ) : isCompleted ? (
                  <Check size={16} style={{ color: 'var(--step-done)' }} />
                ) : (
                  <Circle size={16} style={{ color: isPending ? 'var(--node-pending)' : 'var(--text-secondary)' }} />
                )}
              </div>
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

            {/* Connector line between phases */}
            {!isLast && (
              <div className="flex justify-start" style={{ paddingLeft: 11 }}>
                <div
                  style={{
                    width: 2,
                    height: 12,
                    borderRadius: 1,
                    backgroundColor: connectorColor,
                    transition: 'background-color 400ms ease',
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
