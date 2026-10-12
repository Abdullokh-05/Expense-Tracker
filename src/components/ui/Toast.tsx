import React, { useEffect } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

let toastListeners: ((toasts: Toast[]) => void)[] = []
let toasts: Toast[] = []

function notify(listeners: ((toasts: Toast[]) => void)[]) {
  listeners.forEach((l) => l([...toasts]))
}

export const toast = {
  show: (message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    toasts = [...toasts, { id, message, type }]
    notify(toastListeners)
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id)
      notify(toastListeners)
    }, 3500)
  },
  success: (message: string) => toast.show(message, 'success'),
  error: (message: string) => toast.show(message, 'error'),
  info: (message: string) => toast.show(message, 'info'),
}

export const ToastContainer: React.FC = () => {
  const [items, setItems] = React.useState<Toast[]>([])

  useEffect(() => {
    toastListeners.push(setItems)
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setItems)
    }
  }, [])

  if (items.length === 0) return null

  const icons = {
    success: <CheckCircle size={16} style={{ color: 'var(--color-income)', flexShrink: 0 }} />,
    error: <AlertCircle size={16} style={{ color: 'var(--color-expense)', flexShrink: 0 }} />,
    info: <Info size={16} style={{ color: 'var(--color-info)', flexShrink: 0 }} />,
  }

  const borderColors = {
    success: 'var(--color-income)',
    error: 'var(--color-expense)',
    info: 'var(--color-info)',
  }

  return (
    <div
      className="toast-container"
      aria-live="polite"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="toast"
          style={{ borderLeftColor: borderColors[item.type] }}
          role="alert"
        >
          {icons[item.type]}
          <span
            className="flex-1 text-sm"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {item.message}
          </span>
          <button
            onClick={() => {
              toasts = toasts.filter((t) => t.id !== item.id)
              notify(toastListeners)
            }}
            className="transition-opacity hover:opacity-70"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Закрыть"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
