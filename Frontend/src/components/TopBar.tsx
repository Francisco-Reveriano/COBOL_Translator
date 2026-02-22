import { Moon, Sun } from 'lucide-react'

interface TopBarProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function TopBar({ theme, onToggleTheme }: TopBarProps) {
  return (
    <header
      className="flex items-center justify-between px-6 py-3 border-b"
      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
    >
      {/* Logo — Deep Blue on light, White on dark (FR-4.2) */}
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
          style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
        >
          C2P
        </div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          COBOL-to-Python Migration
        </h1>
      </div>

      {/* Theme toggle (FR-4.2) */}
      <button
        onClick={onToggleTheme}
        className="p-2 rounded-lg hover:opacity-80"
        style={{ color: 'var(--text-secondary)' }}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </header>
  )
}
