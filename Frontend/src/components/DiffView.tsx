/**
 * DiffView — Side-by-side COBOL (left) + Python (right) comparison (FR-5.7)
 *
 * Uses Monaco's DiffEditor for syntax-highlighted comparison.
 * Allows selecting COBOL/Python file pairs to compare.
 */

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, FileCode } from 'lucide-react'

interface DiffViewProps {
  theme: 'light' | 'dark'
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

export function DiffView({ theme }: DiffViewProps) {
  const [DiffEditor, setDiffEditor] = useState<React.ComponentType<any> | null>(null)
  const [files, setFiles] = useState<FileList>({ cobol: [], python: [] })
  const [cobolContent, setCobolContent] = useState<string>('')
  const [pythonContent, setPythonContent] = useState<string>('')
  const [cobolFile, setCobolFile] = useState<string>('')
  const [pythonFile, setPythonFile] = useState<string>('')

  // Lazy-load Monaco DiffEditor
  useEffect(() => {
    import('@monaco-editor/react').then(mod => {
      setDiffEditor(() => mod.DiffEditor)
    })
  }, [])

  // Fetch file list
  useEffect(() => {
    async function fetchFiles() {
      try {
        const resp = await fetch('/api/v1/files')
        if (resp.ok) {
          const data: FileList = await resp.json()
          setFiles(data)
          // Auto-select first pair if available
          if (!cobolFile && data.cobol.length > 0) {
            loadContent(data.cobol[0].path, 'cobol')
            setCobolFile(data.cobol[0].path)
          }
          if (!pythonFile && data.python.length > 0) {
            loadContent(data.python[0].path, 'python')
            setPythonFile(data.python[0].path)
          }
        }
      } catch { /* ignore */ }
    }
    fetchFiles()
    const timer = setInterval(fetchFiles, 8000)
    return () => clearInterval(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadContent = useCallback(async (path: string, side: 'cobol' | 'python') => {
    try {
      const resp = await fetch(`/api/v1/files/content?path=${encodeURIComponent(path)}`)
      if (resp.ok) {
        const data = await resp.json()
        if (side === 'cobol') {
          setCobolContent(data.content)
          setCobolFile(path)
        } else {
          setPythonContent(data.content)
          setPythonFile(path)
        }
      }
    } catch { /* ignore */ }
  }, [])

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
          value={cobolFile}
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
          value={pythonFile}
          onChange={e => loadContent(e.target.value, 'python')}
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
            language="python"
            theme={theme === 'dark' ? 'vs-dark' : 'vs'}
            original={cobolContent || '      * COBOL source will appear here\n'}
            modified={pythonContent || '# Python output will appear here\n'}
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              originalEditable: false,
            }}
          />
        )}
      </div>
    </div>
  )
}
