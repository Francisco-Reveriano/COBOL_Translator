/**
 * PipelineFlowchart — Horizontal conversion pipeline (Section 5.6.1)
 *
 * Shows: Scan → Plan → Convert → Score → Validate → Report
 * Current phase highlighted with Cyan glow, completed phases show duration.
 */

import { useMemo } from 'react'
import {
  ReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface PipelineFlowchartProps {
  currentPhase: string
  isRunning: boolean
  phaseDurations?: Record<string, number>  // phase name → seconds
}

// ---------------------------------------------------------------------------
// Pipeline phases in order
// ---------------------------------------------------------------------------
const PHASES = [
  { id: 'scan',     label: 'Scan' },
  { id: 'plan',     label: 'Plan' },
  { id: 'convert',  label: 'Convert' },
  { id: 'score',    label: 'Score' },
  { id: 'validate', label: 'Validate' },
  { id: 'report',   label: 'Report' },
]

// ---------------------------------------------------------------------------
// Custom Phase Node
// ---------------------------------------------------------------------------
type PhaseNodeData = {
  label: string
  phaseStatus: 'pending' | 'active' | 'completed'
  duration?: number
}

function PhaseNode({ data }: NodeProps<Node<PhaseNodeData>>) {
  const { phaseStatus, label, duration } = data
  const isActive = phaseStatus === 'active'
  const isCompleted = phaseStatus === 'completed'

  let bg = 'var(--bg-secondary)'
  let borderColor = 'var(--border-color)'
  let textColor = 'var(--text-muted)'

  if (isActive) {
    borderColor = 'var(--accent-primary)'
    textColor = 'var(--accent-primary)'
  } else if (isCompleted) {
    borderColor = 'var(--score-green)'
    textColor = 'var(--score-green)'
    bg = 'var(--bg-secondary)'
  }

  return (
    <div
      style={{
        width: 110,
        height: 56,
        border: `2px solid ${borderColor}`,
        borderRadius: 10,
        background: bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: isActive ? `0 0 16px var(--accent-primary)` : undefined,
        animation: isActive ? 'pulse-active 2s infinite' : undefined,
        transition: 'all 0.3s ease',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
      <span style={{ color: textColor, fontSize: 13, fontWeight: 700 }}>{label}</span>
      {isCompleted && duration != null && (
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
          {duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m ${duration % 60}s`}
        </span>
      )}
      {isActive && (
        <span style={{ color: 'var(--accent-primary)', fontSize: 10, marginTop: 2 }}>
          Running...
        </span>
      )}
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
    </div>
  )
}

const nodeTypes: NodeTypes = { phase: PhaseNode }

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function PipelineFlowchart({ currentPhase, isRunning, phaseDurations = {} }: PipelineFlowchartProps) {
  const currentIdx = PHASES.findIndex(p => p.id === currentPhase)

  const { nodes, edges } = useMemo(() => {
    const ns: Node<PhaseNodeData>[] = PHASES.map((p, i) => {
      let phaseStatus: 'pending' | 'active' | 'completed' = 'pending'
      if (i < currentIdx || (!isRunning && currentIdx >= 0 && i <= currentIdx)) {
        phaseStatus = 'completed'
      } else if (i === currentIdx && isRunning) {
        phaseStatus = 'active'
      }

      return {
        id: p.id,
        type: 'phase',
        position: { x: i * 150, y: 0 },
        data: {
          label: p.label,
          phaseStatus,
          duration: phaseDurations[p.id],
        },
        draggable: false,
      }
    })

    const es: Edge[] = PHASES.slice(0, -1).map((p, i) => {
      const nextPhase = PHASES[i + 1]
      const isComplete = i < currentIdx
      return {
        id: `pipe-${p.id}-${nextPhase.id}`,
        source: p.id,
        target: nextPhase.id,
        style: {
          stroke: isComplete ? 'var(--score-green)' : 'var(--border-color)',
          strokeWidth: 2,
        },
        animated: i === currentIdx && isRunning,
      }
    })

    return { nodes: ns, edges: es }
  }, [currentPhase, isRunning, currentIdx, phaseDurations])

  return (
    <div style={{ width: '100%', height: 100 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  )
}
