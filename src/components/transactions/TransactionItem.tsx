import React, { useRef } from 'react'
import type { Transaction, Category, Account } from '@/types'
import { formatAmount, formatListAmount, MASK } from '@/lib/utils'
import { getCategoryName } from '@/lib/categories'
import { ArrowLeftRight, Pencil, Repeat, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface TransactionItemProps {
  transaction: Transaction
  category?: Category
  // Looked up by the row for its own account and, on transfers, the receiving one
  accounts: Account[]
  baseCurrency: string
  onEdit: (transaction: Transaction) => void
  // Without it the row doesn't slide open
  onDelete?: (id: string) => void
  // Whether Edit and Delete are showing; the list keeps one row open at a time
  open?: boolean
  onOpenChange?: (open: boolean) => void
  masked?: boolean
}

// How far the row slides to show Edit and Delete (two 72 px buttons, the gaps and the edge)
const REVEAL = 164

// One History entry. Tap to edit; on touch screens slide it left for Edit and Delete.
export const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction,
  category,
  accounts,
  baseCurrency,
  onEdit,
  onDelete,
  open = false,
  onOpenChange,
  masked = false,
}) => {
  const { t } = useTranslation()
  const rowRef = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ x: number; y: number; start: number; offset: number; on: boolean } | null>(null)
  // Set while the row is dragged, so the click that ends the drag isn't taken for a tap
  const moved = useRef(false)
  const swipeable = Boolean(onDelete && onOpenChange)

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!swipeable || (e.pointerType === 'mouse' && e.button !== 0)) return
    const start = open ? -REVEAL : 0
    drag.current = { x: e.clientX, y: e.clientY, start, offset: start, on: false }
    moved.current = false
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    const row = rowRef.current
    if (!d || !row) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.on) {
      // Scrolling the list wins over sliding the row
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null
        return
      }
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return
      d.on = true
      moved.current = true
      row.setPointerCapture(e.pointerId)
      row.classList.add('dragging')
    }
    let next = d.start + dx
    // Resist past either end
    if (next > 0) next = next / 3
    if (next < -REVEAL) next = -REVEAL + (next + REVEAL) / 3
    d.offset = next
    row.style.transform = `translateX(${next}px)`
  }

  const handlePointerEnd = () => {
    const d = drag.current
    const row = rowRef.current
    drag.current = null
    if (!d?.on || !row) return
    row.classList.remove('dragging')
    const shouldOpen = d.offset < -REVEAL / 2
    row.style.transform = shouldOpen ? `translateX(${-REVEAL}px)` : ''
    onOpenChange?.(shouldOpen)
  }

  const handleClick = () => {
    if (moved.current) {
      moved.current = false
      return
    }
    if (open) {
      onOpenChange?.(false)
      return
    }
    onEdit(transaction)
  }

  const isTransfer = transaction.type === 'transfer'
  const isIncome = transaction.type === 'income'
  const categoryName = getCategoryName(category, t)
  const accountName = accounts.find((a) => a.id === transaction.accountId)?.name
  const toAccountName = accounts.find((a) => a.id === transaction.toAccountId)?.name

  const title = isTransfer
    ? transaction.note || t('transaction.transfer')
    : transaction.note || categoryName
  // "Card → Cash" for a transfer; otherwise the account, plus the category when the title is a note
  const details = isTransfer
    ? [accountName, toAccountName].filter(Boolean).join(' → ')
    : [accountName, transaction.note ? categoryName : null].filter(Boolean).join(' · ')

  const amount = masked
    ? MASK
    : isTransfer
      ? formatListAmount(transaction.amount, transaction.currency, baseCurrency)
      : formatListAmount(isIncome ? transaction.amount : -transaction.amount, transaction.currency, baseCurrency, isIncome)
  const converted =
    !masked && transaction.currency !== baseCurrency
      ? `≈ ${formatAmount(transaction.amountInBaseCurrency, baseCurrency)}`
      : null

  return (
    <div className={`swipe${open ? ' open' : ''}`}>
      {swipeable && (
        <div className="swipe-actions" aria-hidden={!open}>
          <button
            type="button"
            className="sw edit"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onOpenChange?.(false)
              onEdit(transaction)
            }}
          >
            <Pencil size={18} strokeWidth={1.75} aria-hidden="true" />
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="sw del"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onOpenChange?.(false)
              onDelete?.(transaction.id)
            }}
          >
            <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
            {t('common.delete')}
          </button>
        </div>
      )}

      <button
        ref={rowRef}
        type="button"
        className="tx"
        style={open ? { transform: `translateX(${-REVEAL}px)` } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={handleClick}
      >
        <span
          className={`bub${isTransfer ? ' tr' : ''}`}
          style={isTransfer ? undefined : ({ '--c': category?.color ?? '#8E8E93' } as React.CSSProperties)}
          aria-hidden="true"
        >
          {isTransfer ? <ArrowLeftRight size={20} strokeWidth={1.75} /> : category?.icon ?? '📦'}
        </span>
        <span className="tx-main">
          <span className="tx-title">
            <span>{title}</span>
            {transaction.recurringTransactionId && (
              <Repeat size={16} strokeWidth={1.75} role="img" aria-label={t('transaction.recurring')} />
            )}
          </span>
          {details && <span className="tx-sub">{details}</span>}
        </span>
        <span className="tx-end">
          <span className={`amt${isIncome ? ' in' : ''}${isTransfer ? ' tr' : ''}${masked ? ' masked' : ''}`}>{amount}</span>
          {converted && <span className="amt-sub">{converted}</span>}
        </span>
      </button>
    </div>
  )
}
