import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tinted' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  loading?: boolean
  children: React.ReactNode
}

// One capsule button: sm 36 / md 44 / lg 52
const VARIANT_CLASS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'primary',
  secondary: 'secondary',
  tinted: 'tinted',
  ghost: 'ghost',
  danger: 'destructive',
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  children,
  className = '',
  disabled,
  type = 'button',
  ...props
}) => {
  const classes = [
    'btn',
    VARIANT_CLASS[variant],
    size === 'md' ? '' : size,
    fullWidth ? 'wide' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? (
        <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" />
        </svg>
      ) : null}
      {children}
    </button>
  )
}
