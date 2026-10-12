import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = '',
}) => {
  const { t } = useTranslation()
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="bottom-sheet-backdrop absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet panel */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bottom-sheet-panel ${className}`}
        style={{
          background: 'var(--color-surface)',
          borderRadius: '24px 24px 0 0',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div
            className="w-9 h-1 rounded-full opacity-30"
            style={{ background: 'var(--color-text-primary)' }}
          />
        </div>

        {/* Header */}
        {title && (
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <h2
              className="text-base font-bold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-xl transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="px-5 pt-4 pb-6">{children}</div>
      </div>
    </div>
  )
}

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const { t } = useTranslation()

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="bottom-sheet-backdrop absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* z-index above the backdrop, which is positioned at z-50 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-[51] w-full max-w-sm animate-scale-in"
        style={{
          background: 'var(--color-surface)',
          borderRadius: '20px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--color-border)',
        }}
      >
        {title && (
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <h2
              className="text-base font-bold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label={t('common.close')}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
}) => {
  const { t } = useTranslation()

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <h3
            className="font-bold text-base"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {title}
          </h3>
          {description && (
            <p
              className="text-sm mt-1.5 leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {description}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              danger ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-[var(--color-accent)] text-[var(--color-bg)] hover:opacity-90'
            }`}
          >
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
