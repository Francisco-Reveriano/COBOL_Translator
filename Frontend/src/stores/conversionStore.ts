import { useCallback, useReducer } from 'react'
import type {
  CompleteEvent,
  ErrorEvent,
  FlowchartEvent,
  PlanItem,
  PlanUpdateEvent,
  ReasoningEvent,
  ScoreEvent,
  SSEEventType,
  ToolCallEvent,
  ToolResultEvent,
} from '../types/events'

/** A single entry in the activity stream */
export interface ActivityEntry {
  id: string
  type: 'reasoning' | 'tool_call' | 'tool_result' | 'error' | 'complete'
  timestamp: number
  text?: string
  tool?: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  durationMs?: number
  phase?: string
}

export interface ConversionState {
  /** Current agent phase */
  phase: string
  /** Currently executing tool name */
  currentTool: string
  /** Currently processing item/module ID */
  currentItemId: string
  /** Activity stream entries */
  activities: ActivityEntry[]
  /** Plan items from plan_tracker */
  planItems: PlanItem[]
  planId: string
  progressPct: number
  /** Quality scores per module */
  scores: ScoreEvent[]
  /** React Flow graph data */
  flowNodes: FlowchartEvent['nodes']
  flowEdges: FlowchartEvent['edges']
  /** Error messages */
  errors: ErrorEvent[]
  /** Final completion event */
  completion: CompleteEvent | null
  /** Is conversion running? */
  isRunning: boolean
  /** Timestamp of last phase transition */
  lastPhaseChangeAt: number
  /** Timestamps of recent events for density calculation */
  recentEventTimestamps: number[]
}

type Action =
  | { type: 'REASONING'; payload: ReasoningEvent }
  | { type: 'TOOL_CALL'; payload: ToolCallEvent }
  | { type: 'TOOL_RESULT'; payload: ToolResultEvent }
  | { type: 'PLAN_UPDATE'; payload: PlanUpdateEvent }
  | { type: 'SCORE'; payload: ScoreEvent }
  | { type: 'FLOWCHART'; payload: FlowchartEvent }
  | { type: 'ERROR'; payload: ErrorEvent }
  | { type: 'COMPLETE'; payload: CompleteEvent }
  | { type: 'RESET' }
  | { type: 'SET_RUNNING'; payload: boolean }

const initialState: ConversionState = {
  phase: '',
  currentTool: '',
  currentItemId: '',
  activities: [],
  planItems: [],
  planId: '',
  progressPct: 0,
  scores: [],
  flowNodes: [],
  flowEdges: [],
  errors: [],
  completion: null,
  isRunning: false,
  lastPhaseChangeAt: 0,
  recentEventTimestamps: [],
}

const DENSITY_WINDOW_MS = 5000

function pushTimestamp(timestamps: number[]): number[] {
  const now = Date.now()
  const cutoff = now - DENSITY_WINDOW_MS
  return [...timestamps.filter(t => t > cutoff), now]
}

function reducer(state: ConversionState, action: Action): ConversionState {
  switch (action.type) {
    case 'REASONING': {
      const { text, phase } = action.payload
      const phaseChanged = phase !== state.phase
      const last = state.activities[state.activities.length - 1]
      if (last?.type === 'reasoning' && last.phase === phase) {
        const updated = [...state.activities]
        updated[updated.length - 1] = {
          ...last,
          text: (last.text || '') + text,
        }
        return {
          ...state,
          phase,
          activities: updated,
          recentEventTimestamps: pushTimestamp(state.recentEventTimestamps),
          lastPhaseChangeAt: phaseChanged ? Date.now() : state.lastPhaseChangeAt,
        }
      }
      return {
        ...state,
        phase,
        activities: [
          ...state.activities,
          {
            id: `r-${Date.now()}`,
            type: 'reasoning',
            timestamp: Date.now(),
            text,
            phase,
          },
        ],
        recentEventTimestamps: pushTimestamp(state.recentEventTimestamps),
        lastPhaseChangeAt: phaseChanged ? Date.now() : state.lastPhaseChangeAt,
      }
    }

    case 'TOOL_CALL': {
      const toolPhase = action.payload.phase || state.phase
      const toolInput = action.payload.input as Record<string, unknown> | undefined
      const itemId = String(
        toolInput?.program_id || toolInput?.module_name || toolInput?.source_file || state.currentItemId || ''
      )
      const phaseChanged = toolPhase !== state.phase
      return {
        ...state,
        phase: toolPhase,
        currentTool: action.payload.tool,
        currentItemId: itemId,
        activities: [
          ...state.activities,
          {
            id: `tc-${action.payload.id}`,
            type: 'tool_call',
            timestamp: Date.now(),
            tool: action.payload.tool,
            input: action.payload.input,
            phase: toolPhase,
          },
        ],
        recentEventTimestamps: pushTimestamp(state.recentEventTimestamps),
        lastPhaseChangeAt: phaseChanged ? Date.now() : state.lastPhaseChangeAt,
      }
    }

    case 'TOOL_RESULT': {
      const resultPhase = action.payload.phase || state.phase
      return {
        ...state,
        phase: resultPhase,
        activities: [
          ...state.activities,
          {
            id: `tr-${action.payload.id}`,
            type: 'tool_result',
            timestamp: Date.now(),
            tool: action.payload.tool,
            output: action.payload.output,
            durationMs: action.payload.duration_ms,
            phase: resultPhase,
          },
        ],
      }
    }

    case 'PLAN_UPDATE': {
      const inProgressItem = action.payload.items.find(
        (i: PlanItem) => i.status === 'in_progress'
      )
      return {
        ...state,
        planId: action.payload.plan_id,
        planItems: action.payload.items,
        progressPct: action.payload.progress_pct,
        currentItemId: inProgressItem?.program_id || inProgressItem?.id || state.currentItemId,
      }
    }

    case 'SCORE':
      return {
        ...state,
        scores: [...state.scores, action.payload],
      }

    case 'FLOWCHART':
      return {
        ...state,
        flowNodes: action.payload.nodes,
        flowEdges: action.payload.edges,
      }

    case 'ERROR':
      return {
        ...state,
        errors: [...state.errors, action.payload],
        activities: [
          ...state.activities,
          {
            id: `e-${Date.now()}`,
            type: 'error',
            timestamp: Date.now(),
            text: action.payload.message,
            phase: state.phase,
          },
        ],
      }

    case 'COMPLETE':
      return {
        ...state,
        completion: action.payload,
        isRunning: false,
        currentTool: '',
        currentItemId: '',
        activities: [
          ...state.activities,
          {
            id: `done-${Date.now()}`,
            type: 'complete',
            timestamp: Date.now(),
            text: 'Conversion complete.',
            phase: 'report',
          },
        ],
      }

    case 'RESET':
      return { ...initialState }

    case 'SET_RUNNING':
      return { ...state, isRunning: action.payload }

    default:
      return state
  }
}

/**
 * Central state store for conversion data.
 * Returns state + a dispatch handler for SSE events.
 */
export function useConversionStore() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const handleSSEEvent = useCallback(
    (eventType: SSEEventType, data: Record<string, unknown>) => {
      const actionMap: Record<SSEEventType, string> = {
        reasoning: 'REASONING',
        tool_call: 'TOOL_CALL',
        tool_result: 'TOOL_RESULT',
        plan_update: 'PLAN_UPDATE',
        score: 'SCORE',
        flowchart: 'FLOWCHART',
        error: 'ERROR',
        complete: 'COMPLETE',
      }
      const type = actionMap[eventType]
      if (type) {
        dispatch({ type, payload: data } as Action)
      }
    },
    [],
  )

  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])
  const setRunning = useCallback(
    (v: boolean) => dispatch({ type: 'SET_RUNNING', payload: v }),
    [],
  )

  const eventDensity = state.recentEventTimestamps.length

  return { state, handleSSEEvent, reset, setRunning, eventDensity }
}
