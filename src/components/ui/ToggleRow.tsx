import React from 'react'

interface ToggleRowProps {
  id?: string
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

// A labelled on/off switch that fills its row
export const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, description, checked, onChange }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <span className="text-sm font-semibold block" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
      {description && (
        <span className="text-xs block" style={{ color: 'var(--color-text-muted)' }}>{description}</span>
      )}
    </div>
    <button
      id={id}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="w-9 h-5 rounded-full p-0.5 transition-colors duration-200 flex-shrink-0"
      style={{ background: checked ? 'var(--color-accent)' : 'var(--color-border)' }}
    >
      <div
        className="w-4 h-4 rounded-full transition-transform duration-200"
        style={{
          background: checked ? 'var(--color-bg)' : '#fff',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
        }}
      />
    </button>
  </div>
)
