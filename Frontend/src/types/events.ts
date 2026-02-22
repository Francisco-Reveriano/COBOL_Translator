/** SSE event types matching PRD Section 5.5.1 and Backend schemas */

export type SessionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'
export type ScoreThreshold = 'green' | 'yellow' | 'red'
export type IssueSeverity = 'critical' | 'warning' | 'info'
export type SteeringAction = 'PAUSE' | 'RESUME' | 'SKIP' | 'RETRY'

export interface ReasoningEvent {
  id: number
  text: string
  phase: string
}

export interface ToolCallEvent {
  id: string
  tool: string
  input: Record<string, unknown>
}

export interface ToolResultEvent {
  id: string
  tool: string
  output: Record<string, unknown>
  duration_ms: number
}

export interface PlanItem {
  id: string
  title: string
  status: string
  phase: string
  program_id: string
  complexity: string
  score?: number
}

export interface PlanUpdateEvent {
  plan_id: string
  items: PlanItem[]
  progress_pct: number
}

export interface ScoreIssue {
  severity: IssueSeverity
  dimension: string
  description: string
  line?: number
  remediation?: string
}

export interface ScoreDimensions {
  correctness: number
  completeness: number
  maintainability: number
  banking_compliance: number
}

export interface ScoreEvent {
  module: string
  scores: ScoreDimensions
  overall: number
  threshold: ScoreThreshold
  issues: ScoreIssue[]
  summary: string
  fallback?: boolean
}

export interface FlowNode {
  id: string
  label: string
  type: string
  status: string
  complexity: string
  loc: number
  score?: number
  has_sql?: boolean
  has_cics?: boolean
  source_file?: string
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  type: string
}

export interface FlowchartEvent {
  nodes: FlowNode[]
  edges: FlowEdge[]
  updated_node_id?: string
}

export interface ErrorEvent {
  message: string
  tool?: string
  recoverable: boolean
  retry_count: number
}

export interface CompleteEvent {
  summary: Record<string, unknown>
  output_dir: string
  total_modules?: number
  completed_modules?: number
  skipped_modules?: number
}

export interface ConversionStatus {
  session_id: string | null
  status: SessionStatus
  current_phase: string | null
  current_item_id: string | null
  progress_pct: number
  start_time: string | null
  elapsed_seconds: number | null
}

export interface SteeringResponse {
  command: string
  status: string
  item_id?: string
  reason?: string
}

export type SSEEventType =
  | 'reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'plan_update'
  | 'score'
  | 'flowchart'
  | 'error'
  | 'complete'
