import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { lockScroll } from '@/lib/scrollLock'
import { PopUp } from '@/components/ui/PopUp'
import { Button } from '@/components/ui/Button'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  // Names the sheet for screen readers when it has no title
  label?: string
  // Replaces the title row (the add sheet puts its type switch there)
  header?: React.ReactNode
  // Pinned under the scrolling body, e.g. a keypad
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

// Full-width sheet from the bottom edge, for longer tasks such as adding an entry
export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  label,
  header,
  footer,
  children,
  className = '',
  bodyClassName = 'px-4 pt-2 pb-6 overflow-y-auto',
}) => {
  const { t } = useTranslation()
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!isOpen) return
    const unlock = lockScroll()
    const handleKey = (e: KeyboardEvent) => {
      // A pop-up opened over the sheet takes Escape for itself
      if (e.key === 'Escape' && !document.querySelector('.pop')) onCloseRef.current()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      unlock()
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div className="pop-layer">
      <div className="scrim scrim-fade" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? label}
        className={`sheet ${className}`}
        // A footer keeps clear of the home indicator itself
        style={footer ? undefined : { paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grab" aria-hidden="true" />

        {header}
        {!header && title && (
          <div className="flex items-center justify-between gap-2 pl-4 pr-2 min-h-[52px] flex-none">
            <h2 className="t-head text-ink">{title}</h2>
            <button className="pop-x" onClick={onClose} aria-label={t('common.close')}>
              <span><X size={16} strokeWidth={2} /></span>
            </button>
          </div>
        )}

        <div className={bodyClassName}>{children}</div>
        {footer}
      </div>
    </div>,
    document.body
  )
}

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

// Short tasks use the shared pop-up
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => (
  <PopUp isOpen={isOpen} onClose={onClose} title={title}>
    {children}
  </PopUp>
)

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

  return (
    <PopUp
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={description}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={onClose}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            fullWidth
            onClick={() => { onConfirm(); onClose() }}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    />
  )
}
