import { Pause, Play, RotateCcw, SkipForward, Trash2 } from 'lucide-react'
import type { SessionStatus, SteeringAction } from '../types/events'

interface SteeringBarProps {
  status: SessionStatus
  onCommand: (action: SteeringAction) => void
  onClear?: () => void
}

export function SteeringBar({ status, onCommand, onClear }: SteeringBarProps) {
  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isActive = isRunning || isPaused

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      {isActive && (
        <>
          {isRunning ? (
            <SteerButton
              icon={<Pause size={14} />}
              label="Pause"
              onClick={() => onCommand('PAUSE')}
            />
          ) : (
            <SteerButton
              icon={<Play size={14} />}
              label="Resume"
              onClick={() => onCommand('RESUME')}
              variant="accent"
            />
          )}

          <SteerButton
            icon={<SkipForward size={14} />}
            label="Skip"
            onClick={() => onCommand('SKIP')}
          />

          <SteerButton
            icon={<RotateCcw size={14} />}
            label="Retry"
            onClick={() => onCommand('RETRY')}
          />
        </>
      )}

      {onClear && (
        <SteerButton
          icon={<Trash2 size={14} />}
          label="Clear"
          onClick={onClear}
          variant="danger"
        />
      )}
    </div>
  )
}

function SteerButton({
  icon,
  label,
  onClick,
  variant,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  variant?: 'accent' | 'danger'
}) {
  return (
    <button
      onClick={onClick}
      className={`steer-btn ${variant === 'accent' ? 'steer-btn--accent' : variant === 'danger' ? 'steer-btn--danger' : ''}`}
    >
      {icon}
      {label}
    </button>
  )
}
