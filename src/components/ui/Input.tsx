import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightIcon, className = '', id, ...props }, ref) => {
    const inputId = id ?? `input-${Math.random().toString(36).slice(2)}`
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              input-base
              ${error ? 'border-red-400 focus:ring-red-500' : ''}
              ${leftIcon ? 'pl-10' : ''}
              ${rightIcon ? 'pr-10' : ''}
              ${className}
            `}
            {...props}
          />
          {rightIcon && (
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p className="text-xs font-medium" style={{ color: 'var(--color-expense)' }}>
            {error}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const textareaId = id ?? `textarea-${Math.random().toString(36).slice(2)}`
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-xs font-semibold"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`
            input-base resize-none
            ${error ? 'border-red-400' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="text-xs font-medium" style={{ color: 'var(--color-expense)' }}>
            {error}
          </p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
