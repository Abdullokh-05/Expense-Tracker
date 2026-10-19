import React from 'react'
import { Switch } from '@/components/ui/Switch'

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
      <span className="t-strong block text-ink">{label}</span>
      {description && <span className="t-cap block">{description}</span>}
    </div>
    <Switch id={id} checked={checked} onChange={onChange} label={label} />
  </div>
)
