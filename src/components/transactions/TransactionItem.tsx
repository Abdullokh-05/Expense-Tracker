import React, { useRef, useState } from 'react'
import type { Transaction, Category } from '@/types'
import { formatAmount } from '@/lib/utils'
import { Trash2, Edit2, CornerDownRight, Repeat } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface TransactionItemProps {
  transaction: Transaction
  category?: Category
  baseCurrency: string
  onEdit: (transaction: Transaction) => void
  onDelete: (id: string) => void
}

export const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction,
  category,
  baseCurrency,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation()
  const [startX, setStartX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const rowRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX)
    setIsSwiping(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return
    const diff = e.touches[0].clientX - startX
    if (diff < 0) {
      const offset = Math.max(diff, -112)
      setSwipeOffset(offset)
    }
  }

  const handleTouchEnd = () => {
    setIsSwiping(false)
    if (swipeOffset < -60) {
      setSwipeOffset(-112)
    } else {
      setSwipeOffset(0)
    }
  }

  const handleResetSwipe = () => setSwipeOffset(0)

  const hasMultiCurrency = transaction.currency !== baseCurrency
  const isExpense = transaction.type === 'expense'

  return (
    <div className="relative overflow-hidden rounded-2xl select-none" style={{ background: 'var(--color-surface-2)' }}>
      {/* Background Actions (revealed by swipe) */}
      <div className="absolute inset-y-0 right-0 flex items-stretch w-28">
        <button
          onClick={() => { onEdit(transaction); handleResetSwipe() }}
          className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
          aria-label={t('transaction.edit')}
        >
          <Edit2 size={15} />
          <span className="text-[9px] font-semibold">{t('transaction.edit')}</span>
        </button>
        <button
          onClick={() => { onDelete(transaction.id); handleResetSwipe() }}
          className="flex-1 flex flex-col items-center justify-center gap-1 rounded-r-2xl transition-colors"
          style={{ background: '#fef2f2', color: '#dc2626' }}
          aria-label={t('transaction.delete')}
        >
          <Trash2 size={15} />
          <span className="text-[9px] font-semibold">{t('transaction.delete')}</span>
        </button>
      </div>

      {/* Swipeable Row */}
      <div
        ref={rowRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={swipeOffset !== 0 ? handleResetSwipe : undefined}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          background: 'var(--color-surface)',
          borderRadius: '16px',
          border: '1px solid var(--color-border)',
        }}
        className="relative p-3.5 flex items-center justify-between"
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Category icon bubble */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{ backgroundColor: `${category?.color ?? '#6b7280'}1a` }}
          >
            {category?.icon ?? '📦'}
          </div>

          {/* Text info */}
          <div className="min-w-0">
            <div
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {transaction.note || category?.name || t('categories.other')}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {transaction.recurringTransactionId && (
                <span className="flex items-center gap-0.5">
                  <Repeat size={10} />
                </span>
              )}
              {transaction.paymentMethod && (
                <span className="capitalize">{t(`transaction.${transaction.paymentMethod}`)}</span>
              )}
              {transaction.paymentMethod && category?.name && <span>·</span>}
              {!transaction.note && transaction.paymentMethod && category?.name && (
                <span>{category.name}</span>
              )}
              {transaction.note && category?.name && (
                <span>{category.name}</span>
              )}
            </div>
          </div>
        </div>

        {/* Amount */}
        <div className="text-right shrink-0 ml-3">
          <div
            className="text-sm font-bold amount-display"
            style={{ color: isExpense ? 'var(--color-text-primary)' : 'var(--color-income)' }}
          >
            {isExpense ? '−' : '+'}
            {formatAmount(transaction.amount, transaction.currency)}
          </div>
          {hasMultiCurrency && (
            <div
              className="text-[10px] mt-0.5 flex items-center justify-end gap-0.5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <CornerDownRight size={9} />
              {formatAmount(transaction.amountInBaseCurrency, baseCurrency)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
