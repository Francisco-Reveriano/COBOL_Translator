/**
 * ScoreDashboard — Quality score display with animations (FR-5.8)
 *
 * Shows per-module scores with 4-dimension breakdown.
 * Score badges fade in with color ring animation when new scores arrive.
 * Click a score card to expand detailed issues, remediation, and summary.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScoreEvent, ScoreIssue } from '../types/events'

// ---------------------------------------------------------------------------
// useAnimatedNumber — tick from old value to new with ease-out cubic
// ---------------------------------------------------------------------------
function useAnimatedNumber(target: number, durationMs = 600): { value: number; animating: boolean } {
  const [display, setDisplay] = useState(target)
  const [animating, setAnimating] = useState(false)
  const prevRef = useRef(target)
  const rafRef = useRef<number>(0)

  const animate = useCallback((from: number, to: number) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setAnimating(true)
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      const t = Math.min(elapsed / durationMs, 1)
      // ease-out cubic: 1 - (1-t)^3
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(to)
        setAnimating(false)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [durationMs])

  useEffect(() => {
    if (target !== prevRef.current) {
      animate(prevRef.current, target)
      prevRef.current = target
    }
  }, [target, animate])

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  return { value: display, animating }
}

interface ScoreDashboardProps {
  scores: ScoreEvent[]
}

export function ScoreDashboard({ scores }: ScoreDashboardProps) {
  const [animateIdx, setAnimateIdx] = useState<number>(-1)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
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
      <div className="max-h-72 overflow-y-auto">
        {scores.map((s, i) => (
          <div
            key={`${s.module}-${i}`}
            className={`border-b last:border-b-0 ${i === animateIdx ? 'score-badge-animate' : ''}`}
            style={{ borderColor: 'var(--border-color)' }}
          >
            {/* Compact summary row (always visible) */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:opacity-80"
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              role="button"
              aria-expanded={expandedIdx === i}
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
              <span
                className="text-[9px]"
                style={{ color: 'var(--text-muted)', transition: 'transform 0.15s' }}
              >
                {expandedIdx === i ? '▾' : '▸'}
              </span>
            </div>

            {/* Expanded detail panel */}
            {expandedIdx === i && <ScoreDetail score={s} />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score detail panel (expanded view)
// ---------------------------------------------------------------------------
function ScoreDetail({ score }: { score: ScoreEvent }) {
  const { issues, summary, fallback } = score

  return (
    <div
      className="px-3 pb-2 pt-1"
      style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)' }}
    >
      {/* Fallback badge */}
      {fallback && (
        <div
          className="text-[9px] font-semibold px-2 py-0.5 rounded inline-block mb-1.5"
          style={{ backgroundColor: 'var(--score-yellow)', color: '#fff' }}
        >
          AST FALLBACK
        </div>
      )}

      {/* Summary */}
      {summary && (
        <p className="text-[10px] mb-1.5 leading-tight" style={{ color: 'var(--text-secondary)' }}>
          {summary}
        </p>
      )}

      {/* Issues list */}
      {issues.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span
            className="text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Issues ({issues.length})
          </span>
          {issues.map((issue, j) => (
            <IssueRow key={j} issue={issue} />
          ))}
        </div>
      ) : (
        <p className="text-[10px]" style={{ color: 'var(--score-green)' }}>
          No issues found
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual issue row
// ---------------------------------------------------------------------------
function IssueRow({ issue }: { issue: ScoreIssue }) {
  const severityColor =
    issue.severity === 'critical' ? 'var(--score-red)' :
    issue.severity === 'warning' ? 'var(--score-yellow)' :
    'var(--accent-primary)'

  return (
    <div
      className="rounded px-1.5 py-1"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      {/* Severity + dimension header */}
      <div className="flex items-center gap-1 mb-0.5">
        <span
          className="text-[8px] font-bold uppercase px-1 py-px rounded"
          style={{ backgroundColor: severityColor, color: '#fff' }}
        >
          {issue.severity}
        </span>
        <span className="text-[9px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
          {issue.dimension}
          {issue.line != null && ` :${issue.line}`}
        </span>
      </div>
      {/* Description */}
      <p className="text-[10px] leading-tight" style={{ color: 'var(--text-primary)' }}>
        {issue.description}
      </p>
      {/* Remediation */}
      {issue.remediation && (
        <p className="text-[9px] leading-tight mt-0.5" style={{ color: 'var(--score-green)' }}>
          Fix: {issue.remediation}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------
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
  const { value: displayScore, animating: ticking } = useAnimatedNumber(score)
  const color =
    displayScore >= 85 ? 'var(--score-green)' : displayScore >= 70 ? 'var(--score-yellow)' : 'var(--score-red)'
  const cssClass = [
    'text-[10px] font-bold px-1.5 py-0.5 rounded',
    animate ? 'score-badge-animate score-ring-animate' : '',
    ticking ? 'score-tick-up' : '',
  ].filter(Boolean).join(' ')
  return (
    <span
      className={cssClass}
      style={{ color, border: `1px solid ${color}` }}
    >
      {displayScore.toFixed(1)}{label ? ` ${label}` : ''}
    </span>
  )
}
