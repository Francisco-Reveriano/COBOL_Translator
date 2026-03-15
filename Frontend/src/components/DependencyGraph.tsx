/**
 * DependencyGraph — Interactive React Flow dependency graph (FR-6)
 *
 * Shows COBOL inter-program dependencies with:
 *   - Custom node types: rectangle (program), rounded (copybook), diamond (CICS)
 *   - Node sizing proportional to LOC (FR-6.6)
 *   - Border thickness by complexity rating
 *   - Live status color: gray → cyan → green/yellow/red (FR-6.3)
 *   - Edge styles: solid (CALL), dashed (COPY), red (critical) (FR-6.12)
 *   - Dagre auto-layout (Section 5.6.1)
 *   - Zoom, pan, minimap, click-to-focus (FR-6.2)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  type NodeTypes,
  type EdgeTypes,
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import type { FlowNode, FlowEdge } from '../types/events'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface DependencyGraphProps {
  flowNodes: FlowNode[]
  flowEdges: FlowEdge[]
  onNodeClick?: (node: FlowNode) => void
}

// ---------------------------------------------------------------------------
// Theme-aware color helpers
// ---------------------------------------------------------------------------
function statusColor(status: string, score?: number): string {
  if (status === 'completed' && score != null) {
    if (score >= 85) return 'var(--score-green)'
    if (score >= 70) return 'var(--score-yellow)'
    return 'var(--score-red)'
  }
  switch (status) {
    case 'in_progress': return 'var(--accent-primary)'
    case 'completed':   return 'var(--score-green)'
    case 'blocked':     return 'var(--score-red)'
    case 'skipped':     return 'var(--text-muted)'
    default:            return 'var(--border-color)'
  }
}

function complexityBorder(complexity: string): number {
  switch (complexity) {
    case 'critical': return 4
    case 'high':     return 3
    case 'medium':   return 2
    default:         return 1
  }
}

function nodeDimensions(loc: number): { width: number; height: number } {
  const base = 140
  const scaled = Math.min(base + Math.sqrt(loc) * 2, 240)
  return { width: scaled, height: 60 + (scaled - base) * 0.3 }
}

// ---------------------------------------------------------------------------
// Custom Nodes
// ---------------------------------------------------------------------------
type CustomNodeData = {
  label: string
  status: string
  complexity: string
  loc: number
  score?: number
  has_sql: boolean
  has_cics: boolean
  nodeType: string
}

function ProgramNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const { width, height } = nodeDimensions(data.loc)
  const border = complexityBorder(data.complexity)
  const color = statusColor(data.status, data.score)
  const isActive = data.status === 'in_progress'

  return (
    <div
      style={{
        width, height,
        border: `${border}px solid ${color}`,
        borderRadius: 6,
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 10px',
        boxShadow: isActive ? `0 0 12px ${color}` : undefined,
        animation: isActive ? 'pulse-active 2s infinite' : undefined,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
        {data.label}
      </span>
      <span style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
        {data.loc} LOC · {data.complexity}
      </span>
      {data.score != null && (
        <span
          style={{
            position: 'absolute', top: -8, right: -8,
            backgroundColor: color, color: '#fff',
            fontSize: 9, fontWeight: 700, borderRadius: 10,
            padding: '1px 5px', minWidth: 24, textAlign: 'center',
          }}
        >
          {Math.round(data.score)}
        </span>
      )}
      {data.has_sql && (
        <span style={{ position: 'absolute', bottom: -6, left: 4, fontSize: 9, color: 'var(--accent-primary)' }}>SQL</span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  )
}

function CopybookNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const { width, height } = nodeDimensions(data.loc)
  const border = complexityBorder(data.complexity)
  const color = statusColor(data.status, data.score)

  return (
    <div
      style={{
        width, height,
        border: `${border}px solid ${color}`,
        borderRadius: 20,
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 10px',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
        {data.label}
      </span>
      <span style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
        COPY · {data.loc} LOC
      </span>
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  )
}

function CicsNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const size = Math.max(80, 60 + Math.sqrt(data.loc))
  const border = complexityBorder(data.complexity)
  const color = statusColor(data.status, data.score)
  const isActive = data.status === 'in_progress'

  return (
    <div
      style={{
        width: size, height: size,
        transform: 'rotate(45deg)',
        border: `${border}px solid ${color}`,
        background: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: isActive ? `0 0 12px ${color}` : undefined,
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <div style={{ transform: 'rotate(-45deg)', textAlign: 'center' }}>
        <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>
          {data.label}
        </span>
        <br />
        <span style={{ color: 'var(--score-red)', fontSize: 9 }}>CICS</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  )
}

function ParagraphNode({ data }: NodeProps<Node<CustomNodeData>>) {
  return (
    <div
      style={{
        width: 120, height: 36,
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        background: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 8px',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <span style={{ color: 'var(--text-secondary)', fontSize: 10, fontWeight: 500 }}>
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  program: ProgramNode,
  copybook: CopybookNode,
  cics: CicsNode,
  paragraph: ParagraphNode,
}

// ---------------------------------------------------------------------------
// Custom Edges
// ---------------------------------------------------------------------------
function CallEdge(props: EdgeProps) {
  const [path] = getBezierPath({
    sourceX: props.sourceX, sourceY: props.sourceY,
    targetX: props.targetX, targetY: props.targetY,
    sourcePosition: props.sourcePosition, targetPosition: props.targetPosition,
  })
  return (
    <BaseEdge
      path={path}
      style={{ stroke: 'var(--edge-call)', strokeWidth: 2 }}
      markerEnd="url(#arrow)"
    />
  )
}

function CopyEdge(props: EdgeProps) {
  const [path] = getBezierPath({
    sourceX: props.sourceX, sourceY: props.sourceY,
    targetX: props.targetX, targetY: props.targetY,
    sourcePosition: props.sourcePosition, targetPosition: props.targetPosition,
  })
  return (
    <BaseEdge
      path={path}
      style={{ stroke: 'var(--edge-copy)', strokeWidth: 1.5, strokeDasharray: '6 3' }}
      markerEnd="url(#arrow)"
    />
  )
}

function CriticalEdge(props: EdgeProps) {
  const [path] = getBezierPath({
    sourceX: props.sourceX, sourceY: props.sourceY,
    targetX: props.targetX, targetY: props.targetY,
    sourcePosition: props.sourcePosition, targetPosition: props.targetPosition,
  })
  return (
    <BaseEdge
      path={path}
      style={{ stroke: 'var(--edge-critical)', strokeWidth: 2.5 }}
      markerEnd="url(#arrow-critical)"
    />
  )
}

function PerformEdge(props: EdgeProps) {
  const [path] = getBezierPath({
    sourceX: props.sourceX, sourceY: props.sourceY,
    targetX: props.targetX, targetY: props.targetY,
    sourcePosition: props.sourcePosition, targetPosition: props.targetPosition,
  })
  return (
    <BaseEdge
      path={path}
      style={{ stroke: 'var(--text-muted)', strokeWidth: 1, strokeDasharray: '3 3' }}
    />
  )
}

const edgeTypes: EdgeTypes = {
  call: CallEdge,
  copy: CopyEdge,
  critical: CriticalEdge,
  perform: PerformEdge,
}

// ---------------------------------------------------------------------------
// Dagre layout
// ---------------------------------------------------------------------------
function layoutWithDagre(
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
): { nodes: Node<CustomNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 50 })

  // Add nodes
  for (const n of flowNodes) {
    if (n.type === 'paragraph') {
      g.setNode(n.id, { width: 140, height: 56 })
    } else {
      const { width, height } = nodeDimensions(n.loc)
      g.setNode(n.id, { width: width + 20, height: height + 20 })
    }
  }

  // Add edges
  for (const e of flowEdges) {
    g.setEdge(e.source, e.target)
  }

  dagre.layout(g)

  // Map back to React Flow nodes
  const nodes: Node<CustomNodeData>[] = flowNodes.map((fn) => {
    const pos = g.node(fn.id)
    const { width, height } = nodeDimensions(fn.loc)
    return {
      id: fn.id,
      type: fn.type === 'paragraph' ? 'paragraph' : fn.type === 'cics' ? 'cics' : fn.type === 'copybook' ? 'copybook' : 'program',
      position: { x: (pos?.x ?? 0) - width / 2, y: (pos?.y ?? 0) - height / 2 },
      data: {
        label: fn.label,
        status: fn.status,
        complexity: fn.complexity,
        loc: fn.loc,
        score: fn.score,
        has_sql: fn.has_sql ?? false,
        has_cics: fn.has_cics ?? false,
        nodeType: fn.type,
      },
    }
  })

  // Map edges with type
  const nodeSet = new Set(flowNodes.map(n => n.id))
  const edges: Edge[] = flowEdges
    .filter(fe => nodeSet.has(fe.source) && nodeSet.has(fe.target))
    .map((fe) => {
      // Determine edge visual type
      let edgeType = 'call'
      if (fe.type === 'PERFORM') edgeType = 'perform'
      else if (fe.type === 'COPY') edgeType = 'copy'
      // Mark as critical if source or target is CICS / high-complexity
      const srcNode = flowNodes.find(n => n.id === fe.source)
      if (edgeType === 'call' && (srcNode?.has_cics || srcNode?.complexity === 'critical')) edgeType = 'critical'

      return {
        id: fe.id,
        source: fe.source,
        target: fe.target,
        type: edgeType,
      }
    })

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------
function NodeDetailPanel({ node, onClose }: { node: FlowNode; onClose: () => void }) {
  const color = statusColor(node.status, node.score)

  return (
    <div
      style={{
        position: 'absolute', top: 10, right: 10,
        width: 280, maxHeight: 'calc(100% - 20px)',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 8, padding: 16, zIndex: 10,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, margin: 0 }}>{node.label}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Status</span>
          <span style={{ color, fontWeight: 600, textTransform: 'capitalize' }}>{node.status}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Complexity</span>
          <span style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{node.complexity}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Lines of Code</span>
          <span style={{ color: 'var(--text-primary)' }}>{node.loc.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Type</span>
          <span style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{node.type}</span>
        </div>
        {node.score != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Quality Score</span>
            <span style={{ color, fontWeight: 700 }}>{Math.round(node.score)}/100</span>
          </div>
        )}
        {node.has_sql && (
          <div style={{ color: 'var(--accent-primary)', fontSize: 11 }}>Contains embedded SQL</div>
        )}
        {node.has_cics && (
          <div style={{ color: 'var(--score-red)', fontSize: 11 }}>Contains CICS transactions</div>
        )}
        {node.data_items_count != null && node.data_items_count > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Data Items</span>
            <span style={{ color: 'var(--text-primary)' }}>{node.data_items_count}</span>
          </div>
        )}
        {node.sections && node.sections.length > 0 && (
          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Sections</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
              {node.sections.map(s => (
                <span key={s} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>{s}</span>
              ))}
            </div>
          </div>
        )}
        {node.paragraphs && node.paragraphs.length > 0 && (
          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Paragraphs ({node.paragraphs.length})</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
              {node.paragraphs.slice(0, 12).map(p => (
                <span key={p} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>{p}</span>
              ))}
              {node.paragraphs.length > 12 && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{node.paragraphs.length - 12} more</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function DependencyGraph({ flowNodes, flowEdges, onNodeClick }: DependencyGraphProps) {
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null)

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => layoutWithDagre(flowNodes, flowEdges),
    [flowNodes, flowEdges],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)

  // Update when layout changes (live SSE updates)
  useEffect(() => {
    setNodes(layoutNodes)
    setEdges(layoutEdges)
  }, [layoutNodes, layoutEdges, setNodes, setEdges])

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const original = flowNodes.find(n => n.id === node.id)
      if (original) {
        setSelectedNode(original)
        onNodeClick?.(original)
      }
    },
    [flowNodes, onNodeClick],
  )

  if (flowNodes.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--text-muted)', fontSize: 14,
      }}>
        No dependency graph available yet. Start a conversion to see the graph.
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border-color)" gap={20} />
        <Controls
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
        />
        <MiniMap
          nodeColor={(node) => {
            const d = node.data as CustomNodeData
            return statusColor(d.status, d.score)
          }}
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
          maskColor="rgba(0,0,0,0.2)"
        />

        {/* SVG marker definitions for arrows */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge-call)" />
            </marker>
            <marker id="arrow-critical" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge-critical)" />
            </marker>
          </defs>
        </svg>
      </ReactFlow>

      {selectedNode && (
        <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  )
}
