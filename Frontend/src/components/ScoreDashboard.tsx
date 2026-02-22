/**
 * ScoreDashboard — Quality score display with animations (FR-5.8)
 *
 * Shows per-module scores with 4-dimension breakdown.
 * Score badges fade in with color ring animation when new scores arrive.
 */

import { useEffect, useRef, useState } from 'react'
import type { ScoreEvent } from '../types/events'

interface ScoreDashboardProps {
  scores: ScoreEvent[]
}

export function ScoreDashboard({ scores }: ScoreDashboardProps) {
  const [animateIdx, setAnimateIdx] = useState<number>(-1)
  const prevCount = useRef(scores.length)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Trigger animation when a new score arrives (deferred to avoid synchronous setState)
  useEffect(() => {
    if (scores.length > prevCount.current) {
      const idx = scores.length - 1
      timerRef.current = setTimeout(() => {
        setAnimateIdx(idx)
        timerRef.current = setTimeout(() => setAnimateIdx(-1), 800)
      }, 0)
    }
    prevCount.current = scores.length
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [scores.length])

  if (scores.length === 0) return null

  const avgOverall =
    scores.reduce((sum, s) => sum + s.overall, 0) / scores.length

  return (
    <div
      className="border rounded-lg overflow-hidden"
      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          Quality Scores
        </span>
        <OverallBadge score={avgOverall} label="avg" />
      </div>
      <div className="max-h-48 overflow-y-auto">
        {scores.map((s, i) => (
          <div
            key={`${s.module}-${i}`}
            className={`flex items-center gap-2 px-3 py-1.5 border-b last:border-b-0 ${i === animateIdx ? 'score-badge-animate' : ''}`}
            style={{ borderColor: 'var(--border-color)' }}
          >
            <ThresholdDot threshold={s.threshold} animate={i === animateIdx} />
            <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
              {s.module}
            </span>
            <div className="flex gap-1.5">
              <DimBadge label="C" value={s.scores.correctness} />
              <DimBadge label="Co" value={s.scores.completeness} />
              <DimBadge label="M" value={s.scores.maintainability} />
              <DimBadge label="B" value={s.scores.banking_compliance} />
            </div>
            <OverallBadge score={s.overall} animate={i === animateIdx} />
          </div>
        ))}
      </div>
    </div>
  )
}

function ThresholdDot({ threshold, animate }: { threshold: string; animate?: boolean }) {
  const color =
    threshold === 'green' ? 'var(--score-green)' :
    threshold === 'yellow' ? 'var(--score-yellow)' :
    'var(--score-red)'
  return (
    <div
      className={`w-2.5 h-2.5 rounded-full ${animate ? 'score-ring-animate' : ''}`}
      style={{ backgroundColor: color, color }}
    />
  )
}

function DimBadge({ label, value }: { label: string; value: number }) {
  const color =
    value >= 85 ? 'var(--score-green)' : value >= 70 ? 'var(--score-yellow)' : 'var(--score-red)'
  return (
    <span className="text-[9px] font-mono" style={{ color }}>
      {label}:{value}
    </span>
  )
}

function OverallBadge({ score, label, animate }: { score: number; label?: string; animate?: boolean }) {
  const color =
    score >= 85 ? 'var(--score-green)' : score >= 70 ? 'var(--score-yellow)' : 'var(--score-red)'
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${animate ? 'score-badge-animate score-ring-animate' : ''}`}
      style={{ color, border: `1px solid ${color}` }}
    >
      {score.toFixed(1)}{label ? ` ${label}` : ''}
    </span>
  )
}
