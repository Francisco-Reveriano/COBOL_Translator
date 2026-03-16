/**
 * StructureChart — Interactive structure chart wrapping DependencyGraph.
 * Shows program structure and inter-program relationships from COBOL analysis.
 * Provides a summary header, detail toggle, and action buttons.
 */

import { useMemo, useState } from 'react'
import { ArrowLeft, Play, ToggleLeft, ToggleRight } from 'lucide-react'
import { DependencyGraph } from './DependencyGraph'
import type { FlowNode, FlowEdge, ScanSummary } from '../types/events'

interface StructureChartProps {
  flowNodes: FlowNode[]
  flowEdges: FlowEdge[]
  scanSummary: ScanSummary | null
  onStartTranslation: () => void
  onBack: () => void
}

export function StructureChart({
  flowNodes,
  flowEdges,
  scanSummary,
  onStartTranslation,
  onBack,
}: StructureChartProps) {
  const [showParagraphs, setShowParagraphs] = useState(false)

  // Filter nodes/edges based on toggle: Level 1 = programs only, Level 2 = include paragraphs
  const { visibleNodes, visibleEdges } = useMemo(() => {
    if (showParagraphs) {
      return { visibleNodes: flowNodes, visibleEdges: flowEdges }
    }
    // Filter out paragraph nodes and PERFORM edges
    const nodes = flowNodes.filter(n => n.type !== 'paragraph')
    const nodeIds = new Set(nodes.map(n => n.id))
    const edges = flowEdges.filter(
      e => e.type !== 'PERFORM' && nodeIds.has(e.source) && nodeIds.has(e.target),
    )
    return { visibleNodes: nodes, visibleEdges: edges }
  }, [flowNodes, flowEdges, showParagraphs])

  const paragraphCount = flowNodes.filter(n => n.type === 'paragraph').length

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Summary header */}
      <div
        className="flex items-center gap-4 px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors"
          style={{
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-color)',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={12} /> Back
        </button>

        <div className="flex-1 flex items-center gap-4">
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            Structure Chart
          </h3>

          {scanSummary && (
            <div className="flex gap-3">
              <StatBadge label="Programs" value={scanSummary.total_files} />
              <StatBadge label="LOC" value={scanSummary.total_lines_of_code} />
              {scanSummary.programs_with_sql > 0 && (
                <StatBadge label="SQL" value={scanSummary.programs_with_sql} color="var(--score-yellow)" />
              )}
              {scanSummary.programs_with_cics > 0 && (
                <StatBadge label="CICS" value={scanSummary.programs_with_cics} color="var(--score-red)" />
              )}
              {Object.entries(scanSummary.complexity_distribution).map(([k, v]) => (
                <StatBadge key={k} label={k} value={v} />
              ))}
            </div>
          )}
        </div>

        {/* Paragraph toggle */}
        <button
          onClick={() => setShowParagraphs(p => !p)}
          className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded transition-colors"
          style={{
            backgroundColor: showParagraphs ? 'var(--accent-primary)' : 'var(--bg-primary)',
            color: showParagraphs ? '#fff' : 'var(--text-muted)',
            border: `1px solid ${showParagraphs ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            cursor: 'pointer',
          }}
        >
          {showParagraphs ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
          Full Structure
          {showParagraphs && (
            <span style={{ opacity: 0.7, fontWeight: 400 }}>
              ({paragraphCount} paragraphs)
            </span>
          )}
        </button>

        <button
          onClick={onStartTranslation}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors hover:opacity-90"
          style={{
            backgroundColor: 'var(--accent-alt, var(--accent-primary))',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Play size={12} />
          Start Translation
        </button>
      </div>

      {/* Graph */}
      <div className="flex-1">
        <DependencyGraph flowNodes={visibleNodes} flowEdges={visibleEdges} />
      </div>
    </div>
  )
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: string
}) {
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: color ?? 'var(--text-secondary)',
        border: '1px solid var(--border-color)',
      }}
    >
      <span style={{ fontWeight: 600 }}>{value}</span>{' '}
      <span style={{ opacity: 0.7 }}>{label}</span>
    </span>
  )
}
