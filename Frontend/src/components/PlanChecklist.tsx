/**
 * PlanChecklist — TodoWrite-style plan checklist (FR-5.6)
 *
 * Shows conversion plan items with live status, inline score badges,
 * and progress tracking from plan_tracker.
 */

import { useEffect, useRef } from 'react'
import { Check, Circle, Loader2, SkipForward, XCircle } from 'lucide-react'
import type { PlanItem } from '../types/events'

interface PlanChecklistProps {
  items: PlanItem[]
  progressPct: number
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Circle size={14} style={{ color: 'var(--node-pending)' }} />,
  in_progress: <Loader2 size={14} className="animate-spin" style={{ color: 'var(--node-active)' }} />,
  completed: <Check size={14} style={{ color: 'var(--node-pass)' }} />,
  skipped: <SkipForward size={14} style={{ color: 'var(--text-secondary)' }} />,
  blocked: <XCircle size={14} style={{ color: 'var(--score-red)' }} />,
}

export function PlanChecklist({ items, progressPct }: PlanChecklistProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the in-progress item
  useEffect(() => {
    if (scrollRef.current) {
      const activeEl = scrollRef.current.querySelector('[data-active="true"]')
      activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [items])

  if (items.length === 0) return null

  const completed = items.filter(i => i.status === 'completed').length
  const total = items.length

  return (
    <div
      className="border rounded-lg overflow-hidden"
      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center justify-between border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          Conversion Plan
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {completed}/{total}
          </span>
          <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--accent)' }}>
            {progressPct.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Mini progress bar */}
      <div style={{ height: 2, backgroundColor: 'var(--bg-secondary)' }}>
        <div
          style={{
            height: '100%',
            width: `${progressPct}%`,
            backgroundColor: 'var(--accent)',
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      {/* Item list */}
      <div className="max-h-64 overflow-y-auto" ref={scrollRef}>
        {items.map(item => {
          const isActive = item.status === 'in_progress'
          return (
            <div
              key={item.id}
              data-active={isActive}
              className="flex items-center gap-2 px-3 py-1.5 border-b last:border-b-0"
              style={{
                borderColor: 'var(--border-color)',
                backgroundColor: isActive ? 'rgba(0, 169, 244, 0.05)' : undefined,
              }}
            >
              {STATUS_ICONS[item.status] || STATUS_ICONS.pending}
              <div className="flex-1 min-w-0">
                <span
                  className="text-xs block truncate"
                  style={{
                    color: item.status === 'completed' ? 'var(--step-done)' :
                           item.status === 'skipped' ? 'var(--text-muted)' :
                           'var(--text-primary)',
                    opacity: item.status === 'skipped' ? 0.5 : 1,
                  }}
                >
                  {item.title}
                </span>
                {item.complexity && (
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    {item.phase} · {item.complexity}
                  </span>
                )}
              </div>
              {item.score !== undefined && item.score !== null && (
                <ScoreBadge score={item.score} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85 ? 'var(--score-green)' : score >= 70 ? 'var(--score-yellow)' : 'var(--score-red)'
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded score-badge-animate"
      style={{ color, borderColor: color, border: '1px solid' }}
    >
      {score.toFixed(0)}
    </span>
  )
}
