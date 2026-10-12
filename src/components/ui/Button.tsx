import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  loading?: boolean
  children: React.ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 active:scale-[0.96] select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-accent)] cursor-pointer'

  const variants: Record<string, string> = {
    primary:
      'bg-[var(--color-accent)] text-[var(--color-surface)] hover:opacity-90 disabled:opacity-40',
    secondary:
      'bg-[var(--color-surface-2)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)] border border-[var(--color-border)] disabled:opacity-40',
    ghost:
      'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-40',
    danger:
      'bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500 disabled:bg-red-200',
  }

  const sizes: Record<string, string> = {
    sm: 'text-sm px-3 py-2 min-h-[36px] gap-1.5',
    md: 'text-sm px-4 py-3 min-h-[44px] gap-2',
    lg: 'text-base px-6 py-4 min-h-[52px] gap-2',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" />
        </svg>
      ) : null}
      {children}
    </button>
  )
}
