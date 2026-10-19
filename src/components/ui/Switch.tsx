import React from 'react'

interface SwitchProps {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  // Read by screen readers; the visible label sits next to the switch
  label: string
  disabled?: boolean
}

export const Switch: React.FC<SwitchProps> = ({ id, checked, onChange, label, disabled }) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`switch${checked ? ' on' : ''}`}
  />
)
