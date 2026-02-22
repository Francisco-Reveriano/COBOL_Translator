/**
 * CodePreview — Right-pane Monaco editor with file browser (FR-1.7, FR-5.7)
 *
 * Features:
 *   - File selector to browse COBOL source and converted Python files
 *   - Syntax highlighting for Python and COBOL
 *   - Theme sync: VS Code Dark+ / Light+ (FR-4.5)
 *   - Read-only view
 */

import { useCallback, useEffect, useState } from 'react'
import { FileCode, FolderOpen, ChevronDown } from 'lucide-react'

interface CodePreviewProps {
  theme: 'light' | 'dark'
  /** Externally selected file path (e.g., from node click) */
  selectedFile?: string
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

export function CodePreview({ theme, selectedFile }: CodePreviewProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Monaco's editor props are untyped in the lazy import
  const [MonacoEditor, setMonacoEditor] = useState<React.ComponentType<Record<string, any>> | null>(null)
  const [files, setFiles] = useState<FileList>({ cobol: [], python: [] })
  const [activeFile, setActiveFile] = useState<FileContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  // Lazy-load Monaco
  useEffect(() => {
    import('@monaco-editor/react').then(mod => {
      setMonacoEditor(() => mod.default)
    })
  }, [])

  // Fetch file list periodically
  useEffect(() => {
    async function fetchFiles() {
      try {
        const resp = await fetch('/api/v1/files')
        if (resp.ok) {
          setFiles(await resp.json())
        }
      } catch { /* ignore */ }
    }
    fetchFiles()
    const timer = setInterval(fetchFiles, 5000)
    return () => clearInterval(timer)
  }, [])

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
      loadFile(selectedFile)
    }
  }, [selectedFile, loadFile])

  // Auto-load latest Python file when list changes
  useEffect(() => {
    if (!activeFile && files.python.length > 0) {
      loadFile(files.python[files.python.length - 1].path)
    }
  }, [files.python.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const allFiles = [...files.python, ...files.cobol]
  const monacoLanguage = activeFile?.language === 'cobol' ? 'plaintext' : (activeFile?.language || 'python')

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
                  <FileItem key={f.path} file={f} active={activeFile?.path === f.path} onClick={() => loadFile(f.path)} />
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
                  <FileItem key={f.path} file={f} active={activeFile?.path === f.path} onClick={() => loadFile(f.path)} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Monaco editor (FR-4.5 theme sync) */}
      <div className="flex-1">
        {loading ? (
          <div className="flex-1 flex items-center justify-center h-full"
            style={{ color: 'var(--text-muted)' }}>
            <span className="text-xs">Loading file...</span>
          </div>
        ) : (
          <MonacoEditor
            height="100%"
            language={monacoLanguage}
            theme={theme === 'dark' ? 'vs-dark' : 'vs'}
            value={activeFile?.content || '# Select a file from the dropdown above\n'}
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

function FileItem({ file, active, onClick }: { file: FileEntry; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-1.5 text-left text-xs font-mono truncate block"
      style={{
        backgroundColor: active ? 'var(--accent-primary)' : 'transparent',
        color: active ? '#fff' : 'var(--text-primary)',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {file.relative}
    </button>
  )
}
