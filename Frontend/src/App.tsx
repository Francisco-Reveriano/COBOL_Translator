import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from './hooks/useTheme'
import { useSSE } from './hooks/useSSE'
import { useWebSocket } from './hooks/useWebSocket'
import { useConversionStore } from './stores/conversionStore'

import { TopBar } from './components/TopBar'
import { ProgressBar } from './components/ProgressBar'
import { StepTimeline } from './components/StepTimeline'
import { StreamingPanel } from './components/StreamingPanel'
import { PlanChecklist } from './components/PlanChecklist'
import { ScoreDashboard } from './components/ScoreDashboard'
import { FileUpload } from './components/FileUpload'
import { SteeringBar } from './components/SteeringBar'
import { CodePreview } from './components/CodePreview'
import { DiffView } from './components/DiffView'
import { DependencyGraph } from './components/DependencyGraph'
import { PipelineFlowchart } from './components/PipelineFlowchart'
import { ResumePrompt } from './components/ResumePrompt'

import type { SessionStatus, SteeringAction, SteeringResponse } from './types/events'

type CenterTab = 'stream' | 'graph'
type RightTab = 'code' | 'diff'
type LayoutFocus = 'balanced' | 'stream' | 'code'

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const { state, handleSSEEvent, reset, setRunning, eventDensity } = useConversionStore()

  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])
  const [centerTab, setCenterTab] = useState<CenterTab>('stream')
  const [rightTab, setRightTab] = useState<RightTab>('code')
  const [fileRefreshTick, setFileRefreshTick] = useState(0)
  const [layoutFocus, setLayoutFocus] = useState<LayoutFocus>('balanced')
  const manualFocusRef = useRef(false)

  const RIGHT_MIN = 320
  const RIGHT_MAX = 900
  const presetWidth = (f: LayoutFocus) => f === 'code' ? 640 : f === 'stream' ? 360 : 480
  const [rightPaneWidth, setRightPaneWidth] = useState(presetWidth('balanced'))
  const manualResizeRef = useRef(false)
  const isDraggingRef = useRef(false)

  // Auto-adjust layout focus based on event density (deferred to avoid cascading render)
  useEffect(() => {
    if (manualFocusRef.current) return
    if (!state.isRunning) return
    const t = setTimeout(() => {
      const next: LayoutFocus = eventDensity > 8 ? 'stream' : 'balanced'
      setLayoutFocus(next)
      if (!manualResizeRef.current) {
        setRightPaneWidth(presetWidth(next))
      }
    }, 0)
    return () => clearTimeout(t)
  }, [eventDensity, state.isRunning])

  // Splitter drag handlers
  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    const startX = e.clientX
    const startWidth = rightPaneWidth

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return
      const delta = startX - ev.clientX
      const next = Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, startWidth + delta))
      manualResizeRef.current = true
      setRightPaneWidth(next)
    }

    const onMouseUp = () => {
      isDraggingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [rightPaneWidth])

  const handleSplitterDoubleClick = useCallback(() => {
    manualResizeRef.current = true
    setRightPaneWidth(prev => prev < (RIGHT_MIN + RIGHT_MAX) / 2 ? RIGHT_MAX : RIGHT_MIN)
  }, [])

  const handleLayoutFocus = useCallback((f: LayoutFocus) => {
    manualFocusRef.current = true
    manualResizeRef.current = false
    setLayoutFocus(f)
    setRightPaneWidth(presetWidth(f))
  }, [])

  // SSE connection — enabled when conversion is running
  const sseEnabled = sessionStatus === 'running' || sessionStatus === 'paused'

  const FILE_PRODUCING_TOOLS = ['cobol_converter', 'cobol_refiner', 'validation_checker', 'quality_scorer']

  const onSSEEvent = useCallback(
    (eventType: string, data: Record<string, unknown>) => {
      handleSSEEvent(eventType as import('./types/events').SSEEventType, data)

      // Bump file refresh tick when a file-producing tool completes
      if (
        eventType === 'tool_result' &&
        typeof data.tool === 'string' &&
        FILE_PRODUCING_TOOLS.includes(data.tool)
      ) {
        setFileRefreshTick(t => t + 1)
      }

      if (eventType === 'complete') {
        setFileRefreshTick(t => t + 1)
        setSessionStatus('completed')
        setRunning(false)
      }
      if (eventType === 'error' && data.recoverable === false) {
        setSessionStatus('failed')
        setErrorMessage(String(data.message || 'Conversion failed'))
        setRunning(false)
      }
    },
    [handleSSEEvent, setRunning],
  )

  useSSE({
    url: '/api/v1/convert/stream',
    onEvent: onSSEEvent,
    enabled: sseEnabled,
  })

  // WebSocket for steering — only connect when conversion is active
  const { send: sendSteering } = useWebSocket({
    url: `ws://${window.location.host}/api/v1/ws`,
    enabled: sseEnabled,
    onResponse: (resp: SteeringResponse) => {
      if (resp.status === 'acknowledged') {
        if (resp.command === 'PAUSE') setSessionStatus('paused')
        if (resp.command === 'RESUME') setSessionStatus('running')
      }
    },
  })

  const handleSteer = useCallback(
    (action: SteeringAction) => sendSteering(action),
    [sendSteering],
  )

  // Start conversion
  const startConversion = useCallback(async () => {
    reset()
    setRunning(true)
    setSessionStatus('running')
    try {
      const resp = await fetch('/api/v1/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output_dir: './output' }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        console.error('Failed to start:', err)
        setSessionStatus('failed')
        setErrorMessage(err.detail || 'Failed to start conversion')
        setRunning(false)
      }
    } catch (e) {
      console.error('Failed to start:', e)
      setSessionStatus('failed')
      setErrorMessage(e instanceof Error ? e.message : 'Network error')
      setRunning(false)
    }
  }, [reset, setRunning])

  const clearAll = useCallback(() => {
    fetch('/api/v1/convert/resume', { method: 'DELETE' }).catch(() => {})
    fetch('/api/v1/files', { method: 'DELETE' }).catch(() => {})
    reset()
    setSessionStatus('idle')
    setErrorMessage('')
    setUploadedFiles([])
    setLayoutFocus('balanced')
    setRightPaneWidth(presetWidth('balanced'))
    manualFocusRef.current = false
    manualResizeRef.current = false
  }, [reset])

  const isIdle = sessionStatus === 'idle' || sessionStatus === 'completed' || sessionStatus === 'failed'
  const hasGraph = state.flowNodes.length > 0

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* ── Fixed header block — never scrolls away ── */}
      <div className="flex-shrink-0" style={{ zIndex: 20 }}>
        {/* Top bar */}
        <TopBar theme={theme} onToggleTheme={toggleTheme} />

        {/* Pipeline orchestration rail — always visible */}
        <div style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
          <PipelineFlowchart
            currentPhase={state.phase}
            isRunning={state.isRunning}
            currentTool={state.currentTool}
            currentItemId={state.currentItemId}
            sessionStatus={sessionStatus}
            recentActivities={state.activities}
          />
        </div>

        {/* Steering controls */}
        <SteeringBar status={sessionStatus} onCommand={handleSteer} onClear={clearAll} />

        {/* Error banner */}
        {sessionStatus === 'failed' && (
          <div
            className="flex items-center gap-3 px-4 py-2 border-b"
            style={{ backgroundColor: 'var(--score-red)', color: '#fff', borderColor: 'var(--score-red)' }}
          >
            <span className="text-xs font-semibold flex-1">
              Conversion failed{errorMessage ? `: ${errorMessage}` : ''}
            </span>
            <button
              onClick={() => { setSessionStatus('idle'); setErrorMessage('') }}
              className="text-xs font-medium px-2 py-0.5 rounded"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Main content area — adaptive split pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar: timeline + plan */}
        <aside
          className="flex-shrink-0 border-r flex flex-col overflow-y-auto panel-transition"
          style={{
            borderColor: 'var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
            width: layoutFocus === 'stream' ? 180 : 224,
          }}
        >
          <StepTimeline currentPhase={state.phase} isRunning={state.isRunning} sessionStatus={sessionStatus} />
          <div className="px-3 pb-3 flex flex-col gap-3">
            <PlanChecklist items={state.planItems} progressPct={state.progressPct} />
            <ScoreDashboard scores={state.scores} />
          </div>
        </aside>

        {/* Center: tabs for stream vs graph */}
        <main className="flex-1 flex flex-col min-w-0 panel-transition">
          {/* Tab bar + layout focus buttons */}
          {!isIdle || state.activities.length > 0 ? (
            <div
              className="flex items-center gap-1 px-3 py-1.5 border-b"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <TabButton active={centerTab === 'stream'} onClick={() => setCenterTab('stream')}>
                Activity
              </TabButton>
              <TabButton active={centerTab === 'graph'} onClick={() => setCenterTab('graph')} disabled={!hasGraph}>
                Dependency Graph
              </TabButton>

              <div style={{ flex: 1 }} />

              {/* Layout focus presets */}
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginRight: 4, fontWeight: 600 }}>LAYOUT</span>
                <FocusButton active={layoutFocus === 'stream'} onClick={() => handleLayoutFocus('stream')} title="Expand activity stream">
                  Stream
                </FocusButton>
                <FocusButton active={layoutFocus === 'balanced'} onClick={() => handleLayoutFocus('balanced')} title="Balanced layout">
                  Balanced
                </FocusButton>
                <FocusButton active={layoutFocus === 'code'} onClick={() => handleLayoutFocus('code')} title="Expand code panel">
                  Code
                </FocusButton>
              </div>
            </div>
          ) : null}

          {/* Content */}
          {isIdle && state.activities.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="w-full max-w-lg flex flex-col gap-6 items-center">
                {/* Resume prompt — shown when a previous conversion was interrupted (FR-8.5) */}
                <ResumePrompt
                  onResume={() => {
                    setRunning(true)
                    setSessionStatus('running')
                  }}
                  onDiscard={() => {
                    /* User wants fresh start — just stay on upload screen */
                  }}
                />

                <FileUpload
                  onUploaded={setUploadedFiles}
                  disabled={!isIdle}
                />
                {uploadedFiles.length > 0 && (
                  <button
                    onClick={startConversion}
                    className="px-6 py-3 rounded-lg font-semibold text-sm text-white transition-colors hover:opacity-90"
                    style={{ backgroundColor: 'var(--accent-alt)' }}
                  >
                    Start Conversion
                  </button>
                )}
              </div>
            </div>
          ) : centerTab === 'stream' ? (
            <StreamingPanel activities={state.activities} isRunning={state.isRunning} />
          ) : (
            <div className="flex-1" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <DependencyGraph flowNodes={state.flowNodes} flowEdges={state.flowEdges} />
            </div>
          )}
        </main>

        {/* Draggable splitter */}
        <div
          className="pane-splitter"
          onMouseDown={handleSplitterMouseDown}
          onDoubleClick={handleSplitterDoubleClick}
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
        />

        {/* Right pane: code preview / diff */}
        <aside
          className="flex-shrink-0 flex flex-col panel-transition"
          style={{
            borderColor: 'var(--border-color)',
            width: rightPaneWidth,
            minWidth: RIGHT_MIN,
            maxWidth: RIGHT_MAX,
          }}
        >
          {/* Tab bar */}
          <div
            className="flex items-center gap-1 px-3 py-1.5 border-b"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <TabButton active={rightTab === 'code'} onClick={() => setRightTab('code')}>
              Code
            </TabButton>
            <TabButton active={rightTab === 'diff'} onClick={() => setRightTab('diff')}>
              Diff View
            </TabButton>
          </div>

          {/* Keep both panes mounted so they retain state across tab switches.
              The hidden pane is removed from layout via display:none. */}
          <div className="flex-1 flex flex-col" style={{ display: rightTab === 'code' ? 'flex' : 'none' }}>
            <CodePreview
              theme={theme}
              phase={state.phase}
              isRunning={state.isRunning}
              currentTool={state.currentTool}
              currentItemId={state.currentItemId}
              fileRefreshTick={fileRefreshTick}
              sessionStatus={sessionStatus}
            />
          </div>
          <div className="flex-1 flex flex-col" style={{ display: rightTab === 'diff' ? 'flex' : 'none' }}>
            <DiffView
              theme={theme}
              fileRefreshTick={fileRefreshTick}
              isRunning={state.isRunning}
              sessionStatus={sessionStatus}
            />
          </div>
        </aside>
      </div>

      {/* Bottom progress bar (FR-1.8) */}
      <ProgressBar
        progressPct={state.progressPct}
        phase={state.phase}
        tokenUsage={state.completion?.token_usage}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------
function TabButton({
  active, onClick, disabled, children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1 text-xs font-medium rounded-md transition-colors"
      style={{
        backgroundColor: active ? 'var(--accent-primary)' : 'transparent',
        color: active ? '#fff' : disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        border: 'none',
      }}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Layout focus preset button
// ---------------------------------------------------------------------------
function FocusButton({
  active, onClick, title, children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="px-2 py-0.5 text-[9px] font-semibold rounded transition-colors"
      style={{
        backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-primary)',
        color: active ? '#fff' : 'var(--text-muted)',
        border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-color)'}`,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
