/**
 * DiffView — Side-by-side COBOL (left) + Python (right) comparison (FR-5.7)
 *
 * Uses Monaco's DiffEditor for syntax-highlighted comparison.
 * Allows selecting COBOL/Python file pairs to compare.
 *
 * Key behaviour:
 *   - On mount, immediately fetches file list and loads the latest
 *     COBOL + Python pair so the user sees content right away.
 *   - During conversion, fileRefreshTick bumps trigger a re-fetch of
 *     both the file list and the currently selected Python file's content.
 *   - Auto-navigates to the newest Python file as they appear, unless
 *     the user has manually picked one from the dropdown.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, FileCode } from 'lucide-react'

import type { SessionStatus } from '../types/events'

interface DiffViewProps {
  theme: 'light' | 'dark'
  fileRefreshTick?: number
  isRunning?: boolean
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

export function DiffView({ theme, fileRefreshTick, isRunning, sessionStatus }: DiffViewProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Monaco's DiffEditor props are untyped in the lazy import
  const [DiffEditor, setDiffEditor] = useState<React.ComponentType<Record<string, any>> | null>(null)
  const [files, setFiles] = useState<FileList>({ cobol: [], python: [] })
  const [cobolContent, setCobolContent] = useState<string>('')
  const [pythonContent, setPythonContent] = useState<string>('')
  const [selectedCobol, setSelectedCobol] = useState<string>('')
  const [selectedPython, setSelectedPython] = useState<string>('')
  const manualPythonRef = useRef(false)
  const prevPythonCountRef = useRef(0)

  // Lazy-load Monaco DiffEditor
  useEffect(() => {
    import('@monaco-editor/react').then(mod => {
      setDiffEditor(() => mod.DiffEditor)
    })
  }, [])

  // ── Stable content loader (never changes) ──────────────────────────
  const loadContent = useCallback(async (path: string, side: 'cobol' | 'python') => {
    try {
      const resp = await fetch(`/api/v1/files/content?path=${encodeURIComponent(path)}`)
      if (resp.ok) {
        const data = await resp.json()
        if (side === 'cobol') {
          setCobolContent(data.content)
          setSelectedCobol(path)
        } else {
          setPythonContent(data.content)
          setSelectedPython(path)
        }
      }
    } catch { /* ignore network errors */ }
  }, [])

  // ── Fetch file list (does NOT auto-select — that's in a separate effect) ──
  const fetchFiles = useCallback(async () => {
    try {
      const resp = await fetch('/api/v1/files')
      if (resp.ok) {
        const data: FileList = await resp.json()
        setFiles(data)
      }
    } catch { /* ignore */ }
  }, [])

  // ── Baseline polling ───────────────────────────────────────────────
  useEffect(() => {
    fetchFiles()
    const timer = setInterval(fetchFiles, 5000)
    return () => clearInterval(timer)
  }, [fetchFiles])

  // ── Event-driven refresh on fileRefreshTick ────────────────────────
  useEffect(() => {
    if (fileRefreshTick && fileRefreshTick > 0) {
      fetchFiles()
    }
  }, [fileRefreshTick, fetchFiles])

  // ── Auto-select: load latest Python file when files appear ─────────
  //    Runs when file list changes. Handles:
  //      A) First mount with existing files (cold start after conversion)
  //      B) New Python file appearing during conversion
  useEffect(() => {
    const count = files.python.length
    if (count === 0) {
      prevPythonCountRef.current = count
      return
    }

    const shouldAutoSelect =
      // Nothing selected yet (cold start / first mount)
      (!selectedPython && count > 0) ||
      // New file appeared during conversion and user hasn't manually picked
      (count > prevPythonCountRef.current && !manualPythonRef.current)

    if (shouldAutoSelect) {
      const latest = files.python[count - 1]
      loadContent(latest.path, 'python')
    }

    prevPythonCountRef.current = count
  }, [files.python.length, selectedPython, loadContent]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-select: load first COBOL file when files appear ───────────
  useEffect(() => {
    if (!selectedCobol && files.cobol.length > 0) {
      loadContent(files.cobol[0].path, 'cobol')
    }
  }, [files.cobol.length, selectedCobol, loadContent])

  // ── Live content reload: re-fetch selected Python file on tick ─────
  //    This ensures the Diff view shows the latest on-disk content even
  //    if the file was overwritten (e.g., after refinement).
  useEffect(() => {
    if (fileRefreshTick && fileRefreshTick > 0 && selectedPython) {
      loadContent(selectedPython, 'python')
    }
  }, [fileRefreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── On completion: force-refresh the selected Python file ──────────
  useEffect(() => {
    if (sessionStatus === 'completed' && selectedPython) {
      loadContent(selectedPython, 'python')
    }
    if (sessionStatus === 'completed' && !selectedPython && files.python.length > 0) {
      loadContent(files.python[files.python.length - 1].path, 'python')
    }
  }, [sessionStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset manual selection when a new conversion starts ────────────
  useEffect(() => {
    if (isRunning) {
      manualPythonRef.current = false
    }
  }, [isRunning])

  // ── Render ─────────────────────────────────────────────────────────
  if (!DiffEditor) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--code-bg)' }}>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Loading diff editor...</p>
      </div>
    )
  }

  const noFiles = files.cobol.length === 0 && files.python.length === 0

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: 'var(--code-bg)' }}>
      {/* File selectors */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <FileCode size={12} style={{ color: 'var(--text-muted)' }} />
        <select
          value={selectedCobol}
          onChange={e => loadContent(e.target.value, 'cobol')}
          className="text-xs font-mono flex-1 truncate px-1 py-0.5 rounded"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
          }}
        >
          <option value="">-- COBOL Source --</option>
          {files.cobol.map(f => (
            <option key={f.path} value={f.path}>{f.name}</option>
          ))}
        </select>

        <ArrowLeftRight size={14} style={{ color: 'var(--accent)' }} />

        <select
          value={selectedPython}
          onChange={e => {
            manualPythonRef.current = true
            loadContent(e.target.value, 'python')
          }}
          className="text-xs font-mono flex-1 truncate px-1 py-0.5 rounded"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
          }}
        >
          <option value="">-- Python Output --</option>
          {files.python.map(f => (
            <option key={f.path} value={f.path}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* Diff editor */}
      <div className="flex-1">
        {noFiles ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
            <span className="text-xs">No files available. Start a conversion to see the diff view.</span>
          </div>
        ) : (
          <DiffEditor
            height="100%"
            language="plaintext"
            theme={theme === 'dark' ? 'vs-dark' : 'vs'}
            original={cobolContent || '      * COBOL source will appear here\n'}
            modified={pythonContent || '# Python output will appear here\n'}
            options={{
              readOnly: true,
              automaticLayout: true,
              renderSideBySide: true,
              useInlineViewWhenSpaceIsLimited: true,
              renderSideBySideInlineBreakpoint: 700,
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              originalEditable: false,
              overviewRulerLanes: 1,
              scrollbar: {
                alwaysConsumeMouseWheel: false,
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              },
            }}
          />
        )}
      </div>
    </div>
  )
}
