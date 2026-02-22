/**
 * ResumePrompt — Shown on startup when a previous conversion was interrupted (FR-8.5)
 *
 * Offers the user a choice to resume or start fresh.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Play, Trash2 } from 'lucide-react'

interface ResumeData {
  resumable: boolean
  checkpoint?: {
    session_id: string
    status: string
    current_phase: string
    progress_pct: number
    timestamp: string
  }
  plan_summary?: {
    total: number
    completed: number
    pending: number
    in_progress: number
    progress_pct: number
    plan_id: string
  }
}

interface ResumePromptProps {
  onResume: () => void
  onDiscard: () => void
}

export function ResumePrompt({ onResume, onDiscard }: ResumePromptProps) {
  const [data, setData] = useState<ResumeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    fetch('/api/v1/convert/resume')
      .then(r => r.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleResume = useCallback(async () => {
    setActing(true)
    try {
      const resp = await fetch('/api/v1/convert/resume', { method: 'POST' })
      if (resp.ok) {
        onResume()
      }
    } catch { /* ignore */ }
    setActing(false)
  }, [onResume])

  const handleDiscard = useCallback(async () => {
    setActing(true)
    try {
      await fetch('/api/v1/convert/resume', { method: 'DELETE' })
      onDiscard()
    } catch { /* ignore */ }
    setActing(false)
  }, [onDiscard])

  if (loading || !data?.resumable) return null

  const plan = data.plan_summary
  const checkpoint = data.checkpoint

  return (
    <div
      className="border rounded-lg p-5 max-w-md w-full"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--score-yellow)',
        boxShadow: '0 0 20px rgba(180, 83, 9, 0.15)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={18} style={{ color: 'var(--score-yellow)' }} />
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          Interrupted Conversion Detected
        </h3>
      </div>

      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
        A previous conversion was interrupted. Would you like to resume from where it left off?
      </p>

      {plan && (
        <div
          className="rounded p-3 mb-4 text-xs space-y-1"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Progress</span>
            <span style={{ color: 'var(--accent)' }}>{plan.progress_pct}%</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Modules</span>
            <span style={{ color: 'var(--text-primary)' }}>
              {plan.completed} completed / {plan.total} total
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Pending</span>
            <span style={{ color: 'var(--text-primary)' }}>{plan.pending} remaining</span>
          </div>
          {checkpoint?.current_phase && (
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Last phase</span>
              <span className="capitalize" style={{ color: 'var(--text-primary)' }}>
                {checkpoint.current_phase}
              </span>
            </div>
          )}
          {/* Progress bar */}
          <div className="mt-2" style={{ height: 4, borderRadius: 2, backgroundColor: 'var(--border-color)' }}>
            <div
              style={{
                height: '100%',
                width: `${plan.progress_pct}%`,
                borderRadius: 2,
                backgroundColor: 'var(--accent)',
              }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleResume}
          disabled={acting}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white"
          style={{ backgroundColor: 'var(--accent-alt)', opacity: acting ? 0.6 : 1 }}
        >
          <Play size={14} />
          Resume Conversion
        </button>
        <button
          onClick={handleDiscard}
          disabled={acting}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border"
          style={{
            borderColor: 'var(--border-color)',
            color: 'var(--text-secondary)',
            backgroundColor: 'transparent',
            opacity: acting ? 0.6 : 1,
          }}
        >
          <Trash2 size={14} />
          Start Fresh
        </button>
      </div>
    </div>
  )
}
