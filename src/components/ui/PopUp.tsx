import React, { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { lockScroll } from '@/lib/scrollLock'

interface PopUpProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  // Names the dialog for screen readers when the title is drawn inside `header` instead
  label?: string
  subtitle?: React.ReactNode
  // Shown above the title, e.g. a category's icon
  header?: React.ReactNode
  children?: React.ReactNode
  // Buttons pinned under the scrolling body
  footer?: React.ReactNode
  // Footer buttons one above the other instead of side by side
  footerStack?: boolean
}

// The one pop-up every short task uses: an inset floating glass card over the blurred
// screen, with a round close button, a title, a short grey line and its content.
export const PopUp: React.FC<PopUpProps> = ({
  isOpen,
  onClose,
  title,
  label,
  subtitle,
  header,
  children,
  footer,
  footerStack = false,
}) => {
  const { t } = useTranslation()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  // Read through a ref so a parent re-rendering with a new function doesn't redo the setup
  // below (which would pull focus out of a field being typed in)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!isOpen) return
    const unlock = lockScroll()
    // Focus moves into the pop-up (unless a field in it took focus already) and back to
    // where it was when it closes
    const dialog = dialogRef.current
    const previous = document.activeElement as HTMLElement | null
    const cameFromOutside = Boolean(previous && dialog && !dialog.contains(previous))
    if (cameFromOutside) dialog?.focus()

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // With one pop-up over another, Escape closes only the one on top
      const pops = document.querySelectorAll('.pop')
      if (dialog && pops[pops.length - 1] !== dialog) return
      onCloseRef.current()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      unlock()
      document.removeEventListener('keydown', handleKey)
      if (cameFromOutside) previous?.focus?.()
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div className="pop-layer">
      <div className="scrim scrim-fade" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        tabIndex={-1}
      >
        <div className="pop-top">
          <button className="pop-x" onClick={onClose} aria-label={t('common.close')}>
            <span><X size={16} strokeWidth={2} /></span>
          </button>
        </div>
        <div className="pop-body">
          {(header || title || subtitle) && (
            <div className="pop-head">
              {header}
              {title && <h2 id={titleId} className="pop-title">{title}</h2>}
              {subtitle && <p className="pop-sub">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>
        {footer && <div className={`pop-foot${footerStack ? ' stack' : ''}`}>{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
