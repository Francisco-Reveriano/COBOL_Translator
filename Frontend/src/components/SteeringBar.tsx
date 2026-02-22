import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import type { SessionStatus, SteeringAction } from '../types/events'

interface SteeringBarProps {
  status: SessionStatus
  onCommand: (action: SteeringAction) => void
}

export function SteeringBar({ status, onCommand }: SteeringBarProps) {
  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isActive = isRunning || isPaused

  if (!isActive) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      {/* Pause / Resume toggle (FR-7.5) */}
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
          accent
        />
      )}

      {/* Skip (FR-7.3) */}
      <SteerButton
        icon={<SkipForward size={14} />}
        label="Skip"
        onClick={() => onCommand('SKIP')}
      />

      {/* Retry (FR-7.4) */}
      <SteerButton
        icon={<RotateCcw size={14} />}
        label="Retry"
        onClick={() => onCommand('RETRY')}
      />
    </div>
  )
}

function SteerButton({
  icon,
  label,
  onClick,
  accent,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
      style={{
        borderColor: accent ? 'var(--accent)' : 'var(--border-color)',
        color: accent ? 'var(--accent)' : 'var(--text-primary)',
        backgroundColor: 'var(--bg-card)',
      }}
    >
      {icon}
      {label}
    </button>
  )
}
