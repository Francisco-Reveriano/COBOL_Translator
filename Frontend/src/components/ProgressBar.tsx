interface ProgressBarProps {
  progressPct: number
  phase: string
}

const PHASE_LABELS: Record<string, string> = {
  scan: 'Scanning',
  plan: 'Planning',
  convert: 'Converting',
  score: 'Scoring',
  validate: 'Validating',
  report: 'Reporting',
}

export function ProgressBar({ progressPct, phase }: ProgressBarProps) {
  const label = PHASE_LABELS[phase] || phase || 'Idle'

  return (
    <div
      className="px-6 py-2 border-t flex items-center gap-4"
      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
    >
      <span className="text-xs font-medium w-24" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <div
        className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(progressPct, 100)}%`,
            backgroundColor: 'var(--accent)',
          }}
        />
      </div>
      <span className="text-xs font-mono w-12 text-right" style={{ color: 'var(--text-secondary)' }}>
        {progressPct.toFixed(0)}%
      </span>
    </div>
  )
}
