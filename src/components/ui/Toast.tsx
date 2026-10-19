import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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

// Dark glass pills at the top: a coloured dot (green done, red problem), the message and ×
export const ToastContainer: React.FC = () => {
  const { t } = useTranslation()
  const [items, setItems] = React.useState<Toast[]>([])

  useEffect(() => {
    toastListeners.push(setItems)
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setItems)
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div
      className="fixed inset-x-3 z-[70] mx-auto flex max-w-[420px] flex-col gap-2 pointer-events-none"
      style={{ top: 'max(12px, env(safe-area-inset-top))' }}
      aria-live="polite"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast${item.type === 'error' ? ' err' : item.type === 'info' ? ' info' : ''}`}
          role={item.type === 'error' ? 'alert' : 'status'}
        >
          <span className="tdot" aria-hidden="true" />
          <span className="t-main">{item.message}</span>
          <button
            type="button"
            onClick={() => {
              toasts = toasts.filter((t) => t.id !== item.id)
              notify(toastListeners)
            }}
            className="iconbtn"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
