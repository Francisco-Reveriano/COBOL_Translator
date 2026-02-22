import { FolderUp, Upload } from 'lucide-react'
import { useCallback, useState } from 'react'

interface FileUploadProps {
  onUploaded: (files: string[]) => void
  disabled?: boolean
}

export function FileUpload({ onUploaded, disabled }: FileUploadProps) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])

  const uploadFiles = useCallback(
    async (fileList: FileList) => {
      setUploading(true)
      const formData = new FormData()
      for (const file of Array.from(fileList)) {
        formData.append('files', file)
      }
      try {
        const resp = await fetch('/api/v1/upload', { method: 'POST', body: formData })
        if (!resp.ok) throw new Error(await resp.text())
        const data = await resp.json()
        setUploadedFiles(data.files)
        onUploaded(data.files)
      } catch (err) {
        console.error('Upload failed:', err)
      } finally {
        setUploading(false)
      }
    },
    [onUploaded],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (e.dataTransfer.files.length > 0) {
        uploadFiles(e.dataTransfer.files)
      }
    },
    [uploadFiles],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        uploadFiles(e.target.files)
      }
    },
    [uploadFiles],
  )

  if (uploadedFiles.length > 0) {
    return (
      <div
        className="rounded-lg border p-4"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <FolderUp size={16} style={{ color: 'var(--step-done)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} uploaded
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {uploadedFiles.map(f => (
            <span
              key={f}
              className="text-[10px] px-2 py-0.5 rounded"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <label
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors"
      style={{
        borderColor: dragging ? 'var(--accent)' : 'var(--border-color)',
        backgroundColor: dragging ? 'var(--bg-secondary)' : 'var(--bg-card)',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <Upload size={32} style={{ color: 'var(--text-secondary)' }} />
      <p className="mt-2 text-sm" style={{ color: 'var(--text-primary)' }}>
        {uploading ? 'Uploading...' : 'Drop COBOL files here or click to browse'}
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
        .cbl, .cob, .cpy files accepted
      </p>
      <input
        type="file"
        multiple
        accept=".cbl,.cob,.cpy,.cobol,.pco"
        onChange={handleChange}
        className="hidden"
      />
    </label>
  )
}
