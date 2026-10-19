import React from 'react'
import { ChevronsUpDown } from 'lucide-react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

// A labelled field: the label above, a rounded 44 px box with optional icons, an error under it
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightIcon, className = '', ...props }, ref) => (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      <span className={`input${error ? ' err' : ''}`}>
        {leftIcon && <span className="text-ink-2 flex-none" aria-hidden="true">{leftIcon}</span>}
        <input ref={ref} aria-invalid={error ? true : undefined} {...props} />
        {rightIcon && <span className="text-ink-2 flex-none" aria-hidden="true">{rightIcon}</span>}
      </span>
      {error && <span className="help err">{error}</span>}
    </label>
  )
)

Input.displayName = 'Input'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  children: React.ReactNode
}

// The same box around a native select, with an up-down chevron
export const Select: React.FC<SelectProps> = ({ label, children, className = '', ...props }) => (
  <label className={`field ${className}`}>
    {label && <span className="field-label">{label}</span>}
    <span className="input picker">
      <select {...props}>{children}</select>
      <ChevronsUpDown size={18} strokeWidth={1.75} aria-hidden="true" />
    </span>
  </label>
)
