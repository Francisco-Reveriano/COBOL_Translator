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
}

function reducer(state: ConversionState, action: Action): ConversionState {
  switch (action.type) {
    case 'REASONING': {
      const { text, phase } = action.payload
      // Append to last reasoning entry if same phase, otherwise create new
      const last = state.activities[state.activities.length - 1]
      if (last?.type === 'reasoning' && last.phase === phase) {
        const updated = [...state.activities]
        updated[updated.length - 1] = {
          ...last,
          text: (last.text || '') + text,
        }
        return { ...state, phase, activities: updated }
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
      }
    }

    case 'TOOL_CALL':
      return {
        ...state,
        activities: [
          ...state.activities,
          {
            id: `tc-${action.payload.id}`,
            type: 'tool_call',
            timestamp: Date.now(),
            tool: action.payload.tool,
            input: action.payload.input,
            phase: state.phase,
          },
        ],
      }

    case 'TOOL_RESULT':
      return {
        ...state,
        activities: [
          ...state.activities,
          {
            id: `tr-${action.payload.id}`,
            type: 'tool_result',
            timestamp: Date.now(),
            tool: action.payload.tool,
            output: action.payload.output,
            durationMs: action.payload.duration_ms,
            phase: state.phase,
          },
        ],
      }

    case 'PLAN_UPDATE':
      return {
        ...state,
        planId: action.payload.plan_id,
        planItems: action.payload.items,
        progressPct: action.payload.progress_pct,
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

  return { state, handleSSEEvent, reset, setRunning }
}
