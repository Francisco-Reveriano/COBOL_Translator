import type { TokenUsage } from '../types/events'

interface ProgressBarProps {
  progressPct: number
  phase: string
  tokenUsage?: TokenUsage | null
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

const PHASE_LABELS: Record<string, string> = {
  scan: 'Scanning',
  plan: 'Planning',
  convert: 'Converting',
  score: 'Scoring',
  validate: 'Validating',
  report: 'Reporting',
}

export function ProgressBar({ progressPct, phase, tokenUsage }: ProgressBarProps) {
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
      {tokenUsage && tokenUsage.totalTokens > 0 && (
        <span
          className="text-[10px] font-mono flex items-center gap-2 ml-2"
          style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
        >
          <span title="Input tokens">{formatTokenCount(tokenUsage.inputTokens)} in</span>
          <span style={{ color: 'var(--border-color)' }}>|</span>
          <span title="Output tokens">{formatTokenCount(tokenUsage.outputTokens)} out</span>
        </span>
      )}
    </div>
  )
}
