/**
 * ModeSelector — Two-option landing page for choosing translation source.
 * Option 1: Upload COBOL files
 * Option 2: Use pre-loaded sample code from Data/Sample_Code
 */

import { useEffect, useState } from 'react'
import { Upload, FileCode } from 'lucide-react'

interface SampleFile {
  name: string
  path: string
  size: number
}

interface ModeSelectorProps {
  onSelectUpload: () => void
  onSelectSample: () => void
}

export function ModeSelector({ onSelectUpload, onSelectSample }: ModeSelectorProps) {
  const [sampleFiles, setSampleFiles] = useState<SampleFile[]>([])

  useEffect(() => {
    fetch('/api/v1/samples')
      .then(r => r.json())
      .then(data => setSampleFiles(data.files ?? []))
      .catch(() => {})
  }, [])

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
        <div style={{ textAlign: 'center' }}>
          <h2
            className="text-lg font-semibold"
            style={{ color: 'var(--text-primary)', marginBottom: 4 }}
          >
            COBOL-to-Python Translation
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Choose a source for the COBOL programs to translate
          </p>
        </div>

        <div className="flex gap-6 w-full">
          <OptionCard
            icon={<Upload size={28} />}
            title="Translate Uploaded Files"
            description="Upload your own COBOL source files (.cbl, .cob, .cpy) for translation"
            buttonLabel="Select Files"
            onClick={onSelectUpload}
          />
          <OptionCard
            icon={<FileCode size={28} />}
            title="Translate Sample Code"
            description={
              sampleFiles.length > 0
                ? `Use ${sampleFiles.length} pre-loaded sample COBOL program${sampleFiles.length > 1 ? 's' : ''}`
                : 'Use pre-loaded sample COBOL programs'
            }
            buttonLabel="Use Samples"
            onClick={onSelectSample}
            badge={sampleFiles.length > 0 ? `${sampleFiles.length} files` : undefined}
            files={sampleFiles}
          />
        </div>
      </div>
    </div>
  )
}

function OptionCard({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
  badge,
  files,
}: {
  icon: React.ReactNode
  title: string
  description: string
  buttonLabel: string
  onClick: () => void
  badge?: string
  files?: SampleFile[]
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="flex-1 flex flex-col items-center gap-4 rounded-xl p-6 transition-all"
      style={{
        backgroundColor: 'var(--bg-card, var(--bg-secondary))',
        border: `2px solid ${hovered ? 'var(--accent-primary)' : 'var(--border-color)'}`,
        cursor: 'pointer',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 4px 20px rgba(0,0,0,0.1)' : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div
        className="flex items-center justify-center rounded-lg"
        style={{
          width: 56,
          height: 56,
          backgroundColor: hovered ? 'var(--accent-primary)' : 'var(--bg-primary)',
          color: hovered ? '#fff' : 'var(--accent-primary)',
          transition: 'all 0.2s',
        }}
      >
        {icon}
      </div>

      <div style={{ textAlign: 'center' }}>
        <h3
          className="text-sm font-semibold"
          style={{ color: 'var(--text-primary)', marginBottom: 4 }}
        >
          {title}
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {description}
        </p>
      </div>

      {files && files.length > 0 && (
        <div
          className="flex flex-wrap gap-1 justify-center"
          style={{ maxWidth: '100%' }}
        >
          {files.map(f => (
            <span
              key={f.name}
              className="text-[10px] px-2 py-0.5 rounded-full font-mono"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
              }}
            >
              {f.name}
            </span>
          ))}
        </div>
      )}

      <button
        className="px-5 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
        style={{
          backgroundColor: 'var(--accent-primary)',
          border: 'none',
          cursor: 'pointer',
          opacity: hovered ? 1 : 0.85,
        }}
      >
        {buttonLabel}
        {badge && (
          <span
            className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            {badge}
          </span>
        )}
      </button>
    </div>
  )
}
