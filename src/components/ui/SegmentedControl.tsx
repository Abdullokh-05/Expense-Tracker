import React from 'react'

export interface SegmentOption<T extends string> {
  value: T
  label: React.ReactNode
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  // Names the group for screen readers
  label: string
  // Segments share the full width (the default) or size to their labels
  fill?: boolean
  className?: string
}

// Capsule track with the selected segment as a glass thumb
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  fill = true,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div className={`seg${fill ? ' fill' : ''} ${className}`} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? 'on' : undefined}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
