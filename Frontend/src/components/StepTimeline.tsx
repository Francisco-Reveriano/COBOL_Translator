import { Check, Circle, Loader2 } from 'lucide-react'

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
}

export function StepTimeline({ currentPhase, isRunning }: StepTimelineProps) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase)

  return (
    <div className="flex flex-col gap-1 py-4 px-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
        Pipeline
      </span>
      {PHASES.map((phase, idx) => {
        const isActive = phase.key === currentPhase && isRunning
        const isCompleted = currentIdx > idx || (!isRunning && currentIdx >= idx && currentPhase !== '')
        const isPending = !isActive && !isCompleted

        return (
          <div key={phase.key} className="flex items-center gap-2 py-1.5">
            {isActive ? (
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--step-active)' }} />
            ) : isCompleted ? (
              <Check size={16} style={{ color: 'var(--step-done)' }} />
            ) : (
              <Circle size={16} style={{ color: isPending ? 'var(--node-pending)' : 'var(--text-secondary)' }} />
            )}
            <span
              className="text-xs font-medium"
              style={{
                color: isActive
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
