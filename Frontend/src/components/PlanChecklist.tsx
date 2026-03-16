/**
 * PlanChecklist — Expanded plan panel with phase groups + detail expansion (FR-5.6)
 *
 * Shows conversion plan items grouped by phase, with collapsible detail panels,
 * priority badges, dependency tags, conversion notes, and live micro-animations.
 */

import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, ChevronRight, Circle, Loader2, SkipForward, XCircle } from 'lucide-react'
import type { ConversionGuidelines, PhaseSummary, PlanItem } from '../types/events'

interface PlanChecklistProps {
  items: PlanItem[]
  progressPct: number
  phases: Record<string, PhaseSummary>
  guidelines: ConversionGuidelines
  prevItemStatuses: Record<string, string>
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Circle size={12} style={{ color: 'var(--node-pending)' }} />,
  in_progress: <Loader2 size={12} className="animate-spin" style={{ color: 'var(--node-active)' }} />,
  completed: <Check size={12} style={{ color: 'var(--node-pass)' }} />,
  skipped: <SkipForward size={12} style={{ color: 'var(--text-secondary)' }} />,
  blocked: <XCircle size={12} style={{ color: 'var(--score-red)' }} />,
}

const PHASE_ORDER = ['shared_modules', 'core_programs', 'integration', 'validation'] as const

const PHASE_LABELS: Record<string, string> = {
  shared_modules: 'Shared Modules',
  core_programs: 'Core Programs',
  integration: 'Integration',
  validation: 'Validation',
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'var(--score-red)',
  P1: 'var(--score-yellow)',
  P2: 'var(--accent)',
  P3: 'var(--text-muted)',
}

export function PlanChecklist({ items, progressPct, phases, guidelines, prevItemStatuses }: PlanChecklistProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [guidelinesOpen, setGuidelinesOpen] = useState(false)

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

  // Group items by phase
  const itemsByPhase: Record<string, PlanItem[]> = {}
  for (const item of items) {
    if (!itemsByPhase[item.phase]) itemsByPhase[item.phase] = []
    itemsByPhase[item.phase].push(item)
  }

  const togglePhase = (phase: string) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev)
      if (next.has(phase)) next.delete(phase)
      else next.add(phase)
      return next
    })
  }

  const handleItemClick = (id: string) => {
    setExpandedItemId(prev => prev === id ? null : id)
  }

  const hasGuidelines = Object.keys(guidelines).length > 0

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
            backgroundColor: progressPct >= 100 ? 'var(--score-green)' : 'var(--accent)',
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      {/* Scrollable content */}
      <div className="max-h-80 overflow-y-auto" ref={scrollRef}>
        {PHASE_ORDER.map(phase => {
          const phaseItems = itemsByPhase[phase]
          if (!phaseItems || phaseItems.length === 0) return null
          const phaseMeta = phases[phase]
          const isCollapsed = collapsedPhases.has(phase)
          const phaseCompleted = phaseItems.filter(i => i.status === 'completed' || i.status === 'skipped').length
          const allComplete = phaseCompleted === phaseItems.length

          return (
            <PhaseGroup
              key={phase}
              phase={phase}
              label={PHASE_LABELS[phase] || phase}
              items={phaseItems}
              phaseMeta={phaseMeta}
              isCollapsed={isCollapsed}
              allComplete={allComplete}
              phaseCompleted={phaseCompleted}
              expandedItemId={expandedItemId}
              prevItemStatuses={prevItemStatuses}
              onTogglePhase={() => togglePhase(phase)}
              onItemClick={handleItemClick}
            />
          )
        })}

        {/* Guidelines section */}
        {hasGuidelines && (
          <GuidelinesSection
            guidelines={guidelines}
            isOpen={guidelinesOpen}
            onToggle={() => setGuidelinesOpen(prev => !prev)}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PhaseGroup — collapsible section per phase
// ---------------------------------------------------------------------------
interface PhaseGroupProps {
  phase: string
  label: string
  items: PlanItem[]
  phaseMeta?: PhaseSummary
  isCollapsed: boolean
  allComplete: boolean
  phaseCompleted: number
  expandedItemId: string | null
  prevItemStatuses: Record<string, string>
  onTogglePhase: () => void
  onItemClick: (id: string) => void
}

function PhaseGroup({
  label, items, phaseMeta, isCollapsed, allComplete, phaseCompleted,
  expandedItemId, prevItemStatuses, onTogglePhase, onItemClick,
}: PhaseGroupProps) {
  return (
    <div className={allComplete ? 'plan-phase-complete' : ''}>
      {/* Phase header */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer border-b"
        style={{
          borderColor: 'var(--border-color)',
          backgroundColor: 'var(--bg-secondary)',
        }}
        onClick={onTogglePhase}
      >
        <ChevronRight
          size={10}
          style={{
            color: 'var(--text-muted)',
            transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
            transition: 'transform 0.15s ease',
          }}
        />
        <span className="text-[10px] font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
        <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {phaseCompleted}/{items.length}
        </span>
        {phaseMeta && phaseMeta.total_loc > 0 && (
          <span className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {phaseMeta.total_loc} LOC
          </span>
        )}
      </div>

      {/* Phase items */}
      {!isCollapsed && items.map(item => (
        <PlanItemRow
          key={item.id}
          item={item}
          isExpanded={expandedItemId === item.id}
          prevStatus={prevItemStatuses[item.id]}
          onClick={() => onItemClick(item.id)}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PlanItemRow — single plan item with status animation
// ---------------------------------------------------------------------------
interface PlanItemRowProps {
  item: PlanItem
  isExpanded: boolean
  prevStatus?: string
  onClick: () => void
}

function PlanItemRow({ item, isExpanded, prevStatus, onClick }: PlanItemRowProps) {
  const isActive = item.status === 'in_progress'

  // Detect status transitions for animation
  let animClass = ''
  if (prevStatus && prevStatus !== item.status) {
    if (item.status === 'completed') animClass = 'plan-item-complete'
    else if (item.status === 'in_progress') animClass = 'plan-item-activate'
  }

  return (
    <>
      <div
        data-active={isActive}
        className={`flex items-center gap-1.5 px-3 py-1 border-b last:border-b-0 cursor-pointer ${animClass}`}
        style={{
          borderColor: 'var(--border-color)',
          backgroundColor: isActive ? 'rgba(0, 169, 244, 0.05)' : undefined,
        }}
        onClick={onClick}
      >
        {STATUS_ICONS[item.status] || STATUS_ICONS.pending}
        <div className="flex-1 min-w-0">
          <span
            className="text-[10px] block truncate"
            style={{
              color: item.status === 'completed' ? 'var(--step-done)' :
                     item.status === 'skipped' ? 'var(--text-muted)' :
                     'var(--text-primary)',
              opacity: item.status === 'skipped' ? 0.5 : 1,
            }}
          >
            {item.title}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {item.priority && <PriorityBadge priority={item.priority} />}
          {item.complexity && (
            <span className="text-[8px] font-mono px-1 py-px rounded"
              style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary)' }}>
              {item.complexity}
            </span>
          )}
          {item.estimated_loc != null && item.estimated_loc > 0 && (
            <span className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {item.estimated_loc}L
            </span>
          )}
          {item.score !== undefined && item.score !== null && (
            <ScoreBadge score={item.score} />
          )}
        </div>
      </div>
      {isExpanded && (
        <PlanItemDetail item={item} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// PlanItemDetail — expanded panel with deps, notes, strategies
// ---------------------------------------------------------------------------
function PlanItemDetail({ item }: { item: PlanItem }) {
  const notes = item.conversion_notes
  const deps = item.depends_on

  return (
    <div
      className="plan-item-expand px-3 py-1.5 border-b"
      style={{
        borderColor: 'var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      {/* Dependencies */}
      {deps && deps.length > 0 && (
        <div className="mb-1">
          <span className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Depends on
          </span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {deps.map(dep => (
              <span key={dep} className="text-[8px] font-mono px-1 py-px rounded"
                style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                {dep}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Conversion notes */}
      {notes && (
        <div className="flex flex-col gap-0.5">
          {notes.description && (
            <NoteEntry label="Description" value={notes.description} />
          )}
          {notes.data_mapping_strategy && (
            <NoteEntry label="Data Mapping" value={notes.data_mapping_strategy} />
          )}
          {notes.control_flow_strategy && (
            <NoteEntry label="Control Flow" value={notes.control_flow_strategy} />
          )}
          {notes.io_strategy && (
            <NoteEntry label="I/O" value={notes.io_strategy} />
          )}
          {notes.sql_strategy && (
            <NoteEntry label="SQL" value={notes.sql_strategy} flagColor="var(--score-yellow)" />
          )}
          {notes.cics_strategy && (
            <NoteEntry label="CICS" value={notes.cics_strategy} flagColor="var(--score-red)" />
          )}
          {notes.risk_factors && notes.risk_factors.length > 0 && (
            <div>
              <span className="text-[8px] font-semibold" style={{ color: 'var(--score-red)' }}>
                Risk:
              </span>
              {notes.risk_factors.map((rf, i) => (
                <span key={i} className="text-[8px] ml-1" style={{ color: 'var(--text-secondary)' }}>
                  {rf}{i < notes.risk_factors!.length - 1 ? ';' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// NoteEntry — single key-value note line
// ---------------------------------------------------------------------------
function NoteEntry({ label, value, flagColor }: { label: string; value: string; flagColor?: string }) {
  return (
    <div className="leading-tight">
      <span className="text-[8px] font-semibold" style={{ color: flagColor || 'var(--text-muted)' }}>
        {label}:
      </span>
      <span className="text-[8px] ml-1" style={{ color: 'var(--text-secondary)' }}>
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PriorityBadge — P0=red, P1=yellow, P2=accent, P3=muted
// ---------------------------------------------------------------------------
function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] || 'var(--text-muted)'
  return (
    <span
      className="text-[8px] font-bold px-1 py-px rounded"
      style={{ color, border: `1px solid ${color}` }}
    >
      {priority}
    </span>
  )
}

// ---------------------------------------------------------------------------
// GuidelinesSection — collapsible section with BookOpen icon
// ---------------------------------------------------------------------------
interface GuidelinesSectionProps {
  guidelines: ConversionGuidelines
  isOpen: boolean
  onToggle: () => void
}

function GuidelinesSection({ guidelines, isOpen, onToggle }: GuidelinesSectionProps) {
  const entries = Object.entries(guidelines).filter(([, v]) => v !== undefined) as [string, string][]
  if (entries.length === 0) return null

  return (
    <div className="border-t" style={{ borderColor: 'var(--border-color)' }}>
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
        onClick={onToggle}
      >
        <BookOpen size={10} style={{ color: 'var(--text-muted)' }} />
        <span className="text-[10px] font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
          Conversion Guidelines
        </span>
        <ChevronRight
          size={10}
          style={{
            color: 'var(--text-muted)',
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        />
      </div>
      {isOpen && (
        <div className="plan-item-expand px-3 py-1.5">
          {entries.map(([key, val]) => (
            <div key={key} className="leading-tight mb-0.5">
              <span className="text-[8px] font-semibold" style={{ color: 'var(--accent)' }}>
                {key.replace(/_/g, ' ')}:
              </span>
              <span className="text-[8px] ml-1" style={{ color: 'var(--text-secondary)' }}>
                {val}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ScoreBadge (unchanged from original)
// ---------------------------------------------------------------------------
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
