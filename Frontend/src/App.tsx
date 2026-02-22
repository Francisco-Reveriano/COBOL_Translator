import { useCallback, useState } from 'react'
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

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const { state, handleSSEEvent, reset, setRunning } = useConversionStore()

  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle')
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])
  const [centerTab, setCenterTab] = useState<CenterTab>('stream')
  const [rightTab, setRightTab] = useState<RightTab>('code')

  // SSE connection — enabled when conversion is running
  const sseEnabled = sessionStatus === 'running' || sessionStatus === 'paused'
  useSSE({
    url: '/api/v1/convert/stream',
    onEvent: handleSSEEvent,
    enabled: sseEnabled,
  })

  // WebSocket for steering
  const { send: sendSteering } = useWebSocket({
    url: `ws://${window.location.host}/api/v1/ws`,
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
        setRunning(false)
      }
    } catch (e) {
      console.error('Failed to start:', e)
      setSessionStatus('failed')
      setRunning(false)
    }
  }, [reset, setRunning])

  const isIdle = sessionStatus === 'idle' || sessionStatus === 'completed' || sessionStatus === 'failed'
  const hasGraph = state.flowNodes.length > 0

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Top bar */}
      <TopBar theme={theme} onToggleTheme={toggleTheme} />

      {/* Pipeline flowchart — horizontal phase indicator (Section 5.6.1) */}
      {state.isRunning || state.phase ? (
        <div style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
          <PipelineFlowchart currentPhase={state.phase} isRunning={state.isRunning} />
        </div>
      ) : null}

      {/* Steering controls */}
      <SteeringBar status={sessionStatus} onCommand={handleSteer} />

      {/* Main content area — split pane (FR-1.6) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar: timeline + plan */}
        <aside
          className="w-56 flex-shrink-0 border-r flex flex-col overflow-y-auto"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <StepTimeline currentPhase={state.phase} isRunning={state.isRunning} />
          <div className="px-3 pb-3 flex flex-col gap-3">
            <PlanChecklist items={state.planItems} progressPct={state.progressPct} />
            <ScoreDashboard scores={state.scores} />
          </div>
        </aside>

        {/* Center: tabs for stream vs graph */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Tab bar — only show when conversion has started */}
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

        {/* Right pane: code preview / diff (FR-1.6, FR-5.7) */}
        <aside className="w-[480px] flex-shrink-0 border-l flex flex-col" style={{ borderColor: 'var(--border-color)' }}>
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

          {rightTab === 'code' ? (
            <CodePreview theme={theme} />
          ) : (
            <DiffView theme={theme} />
          )}
        </aside>
      </div>

      {/* Bottom progress bar (FR-1.8) */}
      <ProgressBar progressPct={state.progressPct} phase={state.phase} />
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
