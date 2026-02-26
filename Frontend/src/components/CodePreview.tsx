/**
 * CodePreview — Right-pane Monaco editor with file browser (FR-1.7, FR-5.7)
 *
 * Features:
 *   - File selector to browse COBOL source and converted Python files
 *   - Syntax highlighting for Python and COBOL
 *   - Theme sync: VS Code Dark+ / Light+ (FR-4.5)
 *   - Read-only view
 *   - Dynamic empty state reflecting conversion phase
 *   - Event-driven file refresh + auto-navigate to latest file
 *   - NEW badges on recently generated files
 *   - Activity indicator + file counts in selector bar
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FileCode, FolderOpen, ChevronDown, Upload,
  ArrowRightLeft, CheckCircle2, Loader2, ScanSearch,
  ClipboardList, Star, ShieldCheck, FileBarChart,
} from 'lucide-react'

import type { SessionStatus } from '../types/events'

interface CodePreviewProps {
  theme: 'light' | 'dark'
  /** Externally selected file path (e.g., from node click) */
  selectedFile?: string
  phase?: string
  isRunning?: boolean
  currentTool?: string
  currentItemId?: string
  fileRefreshTick?: number
  sessionStatus?: SessionStatus
}

interface FileEntry {
  path: string
  name: string
  relative: string
}

interface FileList {
  cobol: FileEntry[]
  python: FileEntry[]
}

interface FileContent {
  path: string
  name: string
  content: string
  language: string
}

// Phase metadata for the dynamic empty state
const PHASE_META: Record<string, { icon: React.ElementType; label: string; description: string }> = {
  scanning:   { icon: ScanSearch,    label: 'Scanning',    description: 'Analyzing COBOL source structure...' },
  scan:       { icon: ScanSearch,    label: 'Scanning',    description: 'Analyzing COBOL source structure...' },
  planning:   { icon: ClipboardList, label: 'Planning',    description: 'Building migration strategy...' },
  plan:       { icon: ClipboardList, label: 'Planning',    description: 'Building migration strategy...' },
  converting: { icon: ArrowRightLeft, label: 'Converting', description: 'Translating COBOL to Python...' },
  convert:    { icon: ArrowRightLeft, label: 'Converting', description: 'Translating COBOL to Python...' },
  scoring:    { icon: Star,          label: 'Scoring',     description: 'Evaluating conversion quality...' },
  score:      { icon: Star,          label: 'Scoring',     description: 'Evaluating conversion quality...' },
  validating: { icon: ShieldCheck,   label: 'Validating',  description: 'Running compliance checks...' },
  validate:   { icon: ShieldCheck,   label: 'Validating',  description: 'Running compliance checks...' },
  reporting:  { icon: FileBarChart,  label: 'Reporting',   description: 'Generating final report...' },
  report:     { icon: FileBarChart,  label: 'Reporting',   description: 'Generating final report...' },
}

function DynamicEmptyState({
  phase,
  isRunning,
  currentItemId,
  sessionStatus,
  fileCount,
}: {
  phase?: string
  isRunning?: boolean
  currentItemId?: string
  sessionStatus?: SessionStatus
  fileCount: number
}) {
  // Completed state
  if (sessionStatus === 'completed') {
    return (
      <div className="flex flex-col items-center gap-4 text-center px-6 anim-sweep-right">
        <CheckCircle2 size={40} style={{ color: 'var(--score-green)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Conversion complete
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {fileCount > 0
              ? `${fileCount} file${fileCount !== 1 ? 's' : ''} generated — select from dropdown above`
              : 'Select a file from the dropdown above'}
          </p>
        </div>
      </div>
    )
  }

  // Running with a known phase
  if (isRunning && phase) {
    const meta = PHASE_META[phase.toLowerCase()]
    if (meta) {
      const Icon = meta.icon
      return (
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <div className="anim-breathe">
            <Icon size={40} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {meta.label}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {meta.description}
            </p>
            {currentItemId && (
              <p className="text-[11px] mt-2 font-mono" style={{ color: 'var(--text-muted)' }}>
                {currentItemId}
              </p>
            )}
          </div>
        </div>
      )
    }
  }

  // Running but no phase yet — fallback spinner
  if (isRunning) {
    return (
      <div className="flex flex-col items-center gap-4 text-center px-6">
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Waiting for output...
        </p>
      </div>
    )
  }

  // Idle state
  return (
    <div className="flex flex-col items-center gap-4 text-center px-6 anim-sweep-right">
      <Upload size={36} style={{ color: 'var(--text-muted)' }} />
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        Upload files and start conversion to preview code here
      </p>
    </div>
  )
}

export function CodePreview({
  theme,
  selectedFile,
  phase,
  isRunning,
  currentTool: _currentTool,
  currentItemId,
  fileRefreshTick,
  sessionStatus,
}: CodePreviewProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Monaco's editor props are untyped in the lazy import
  const [MonacoEditor, setMonacoEditor] = useState<React.ComponentType<Record<string, any>> | null>(null)
  const [files, setFiles] = useState<FileList>({ cobol: [], python: [] })
  const [activeFile, setActiveFile] = useState<FileContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [recentlyAddedFiles, setRecentlyAddedFiles] = useState<Set<string>>(new Set())
  const prevPythonCountRef = useRef(0)
  const manualSelectionRef = useRef(false)
  const knownPathsRef = useRef<Set<string>>(new Set())

  // Lazy-load Monaco
  useEffect(() => {
    import('@monaco-editor/react').then(mod => {
      setMonacoEditor(() => mod.default)
    })
  }, [])

  // Fetch file list with new-file detection
  const fetchFiles = useCallback(async () => {
    try {
      const resp = await fetch('/api/v1/files')
      if (!resp.ok) return
      const data: FileList = await resp.json()

      // Detect newly added files
      const allPaths = [...data.python, ...data.cobol].map(f => f.path)
      const newPaths = allPaths.filter(p => !knownPathsRef.current.has(p))

      if (newPaths.length > 0 && knownPathsRef.current.size > 0) {
        setRecentlyAddedFiles(prev => {
          const next = new Set(prev)
          newPaths.forEach(p => next.add(p))
          return next
        })

        // Auto-clear NEW badges after 15 seconds
        const pathsCopy = [...newPaths]
        setTimeout(() => {
          setRecentlyAddedFiles(prev => {
            const next = new Set(prev)
            pathsCopy.forEach(p => next.delete(p))
            return next
          })
        }, 15000)
      }

      // Update known paths
      knownPathsRef.current = new Set(allPaths)
      setFiles(data)
    } catch { /* ignore */ }
  }, [])

  // Baseline 5-second polling
  useEffect(() => {
    fetchFiles()
    const timer = setInterval(fetchFiles, 5000)
    return () => clearInterval(timer)
  }, [fetchFiles])

  // Event-driven instant refresh on fileRefreshTick
  useEffect(() => {
    if (fileRefreshTick && fileRefreshTick > 0) {
      fetchFiles()
    }
  }, [fileRefreshTick, fetchFiles])

  // Load file content
  const loadFile = useCallback(async (path: string) => {
    setLoading(true)
    setShowPicker(false)
    try {
      const resp = await fetch(`/api/v1/files/content?path=${encodeURIComponent(path)}`)
      if (resp.ok) {
        setActiveFile(await resp.json())
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  // Handle externally selected file
  useEffect(() => {
    if (selectedFile) {
      manualSelectionRef.current = true
      loadFile(selectedFile)
    }
  }, [selectedFile, loadFile])

  // Auto-navigate to latest Python file when new ones appear during conversion
  useEffect(() => {
    const count = files.python.length
    if (count > prevPythonCountRef.current && count > 0 && (isRunning || sessionStatus === 'completed') && !manualSelectionRef.current) {
      loadFile(files.python[count - 1].path)
    }
    // Also auto-load if no file selected and python files appear
    if (!activeFile && count > 0) {
      loadFile(files.python[count - 1].path)
    }
    prevPythonCountRef.current = count
  }, [files.python.length, isRunning, sessionStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // When sessionStatus transitions to 'completed', auto-load latest Python file
  // if nothing is displayed yet (closes the race condition window)
  useEffect(() => {
    if (sessionStatus === 'completed' && !activeFile && files.python.length > 0) {
      loadFile(files.python[files.python.length - 1].path)
    }
  }, [sessionStatus, activeFile, files.python.length, loadFile])

  // Reset manualSelection when a new conversion starts so auto-nav works again
  useEffect(() => {
    if (isRunning) {
      manualSelectionRef.current = false
    }
  }, [isRunning])

  // Live content reload — re-fetch active file when tick changes
  useEffect(() => {
    if (fileRefreshTick && fileRefreshTick > 0 && activeFile) {
      loadFile(activeFile.path)
    }
  }, [fileRefreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  const allFiles = [...files.python, ...files.cobol]
  const monacoLanguage = activeFile?.language === 'cobol' ? 'plaintext' : (activeFile?.language || 'python')
  const showEmptyState = !activeFile && !loading

  if (!MonacoEditor) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ backgroundColor: 'var(--code-bg)' }}
      >
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Loading editor...
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: 'var(--code-bg)' }}>
      {/* File selector bar */}
      <div
        className="px-3 py-1.5 border-b flex items-center gap-2 relative"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <FileCode size={14} style={{ color: 'var(--accent)' }} />

        <button
          onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-1 text-xs font-mono truncate flex-1 text-left"
          style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {activeFile ? activeFile.name : 'Select a file...'}
          <ChevronDown size={12} />
        </button>

        {/* File counts */}
        {(files.python.length > 0 || files.cobol.length > 0) && (
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {files.python.length > 0 && <>{files.python.length} py</>}
            {files.python.length > 0 && files.cobol.length > 0 && ' / '}
            {files.cobol.length > 0 && <>{files.cobol.length} cbl</>}
          </span>
        )}

        {/* Activity dot */}
        {isRunning && (
          <span
            className="activity-pulse"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: 'var(--score-green)',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
        )}

        {/* File picker dropdown */}
        {showPicker && allFiles.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 z-20 border border-t-0 max-h-64 overflow-y-auto shadow-lg"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
          >
            {files.python.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary)' }}>
                  <FolderOpen size={10} className="inline mr-1" />
                  Python Output
                </div>
                {files.python.map(f => (
                  <FileItem
                    key={f.path}
                    file={f}
                    active={activeFile?.path === f.path}
                    isNew={recentlyAddedFiles.has(f.path)}
                    onClick={() => {
                      manualSelectionRef.current = true
                      loadFile(f.path)
                    }}
                  />
                ))}
              </>
            )}
            {files.cobol.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary)' }}>
                  <FolderOpen size={10} className="inline mr-1" />
                  COBOL Source
                </div>
                {files.cobol.map(f => (
                  <FileItem
                    key={f.path}
                    file={f}
                    active={activeFile?.path === f.path}
                    isNew={recentlyAddedFiles.has(f.path)}
                    onClick={() => {
                      manualSelectionRef.current = true
                      loadFile(f.path)
                    }}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1">
        {loading ? (
          <div className="flex-1 flex items-center justify-center h-full"
            style={{ color: 'var(--text-muted)' }}>
            <span className="text-xs">Loading file...</span>
          </div>
        ) : showEmptyState ? (
          <div className="flex-1 flex items-center justify-center h-full">
            <DynamicEmptyState
              phase={phase}
              isRunning={isRunning}
              currentItemId={currentItemId}
              sessionStatus={sessionStatus}
              fileCount={files.python.length}
            />
          </div>
        ) : (
          <MonacoEditor
            height="100%"
            language={monacoLanguage}
            theme={theme === 'dark' ? 'vs-dark' : 'vs'}
            value={activeFile?.content || ''}
            options={{
              readOnly: true,
              automaticLayout: true,
              minimap: { enabled: true },
              fontSize: 13,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderLineHighlight: 'gutter',
              folding: true,
            }}
          />
        )}
      </div>
    </div>
  )
}

function FileItem({
  file,
  active,
  isNew,
  onClick,
}: {
  file: FileEntry
  active: boolean
  isNew: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-1.5 text-left text-xs font-mono truncate flex items-center gap-2 ${isNew ? 'new-file-glow' : ''}`}
      style={{
        backgroundColor: active ? 'var(--accent-primary)' : 'transparent',
        color: active ? '#fff' : 'var(--text-primary)',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      <span className="truncate flex-1">{file.relative}</span>
      {isNew && (
        <span
          className="anim-pop-in"
          style={{
            fontSize: 9,
            fontWeight: 700,
            fontFamily: 'inherit',
            padding: '1px 5px',
            borderRadius: 4,
            backgroundColor: 'var(--score-green)',
            color: '#fff',
            flexShrink: 0,
            letterSpacing: '0.5px',
          }}
        >
          NEW
        </span>
      )}
    </button>
  )
}
