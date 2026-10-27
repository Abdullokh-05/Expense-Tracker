import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Account, Category, Transaction } from '@/types'
import { formatDayLabel, formatListAmount } from '@/lib/utils'
import { TransactionItem } from '@/components/transactions/TransactionItem'

interface HistoryListProps {
  // In the order to show them
  transactions: Transaction[]
  // Day headings, when the list is in date order
  byDay: boolean
  // What the day totals add up (the whole filtered list, not just the rows shown so far)
  totalsFrom?: Transaction[]
  categories: Category[]
  accounts: Account[]
  baseCurrency: string
  masked: boolean
  onEdit: (transaction: Transaction) => void
  // Without it the rows don't slide open for Edit and Delete
  onDelete?: (id: string) => void
}

// Entries under day headings ("Today −242 900"), each row sliding open for Edit and Delete
export const HistoryList: React.FC<HistoryListProps> = ({
  transactions,
  byDay,
  totalsFrom = transactions,
  categories,
  accounts,
  baseCurrency,
  masked,
  onEdit,
  onDelete,
}) => {
  const { i18n } = useTranslation()
  // One row open at a time
  const [openId, setOpenId] = useState<string | null>(null)

  // Income minus outcome per day; transfers don't change it
  const dayTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const txn of totalsFrom) {
      if (txn.type === 'transfer') continue
      const signed = txn.type === 'income' ? txn.amountInBaseCurrency : -txn.amountInBaseCurrency
      totals.set(txn.date, (totals.get(txn.date) ?? 0) + signed)
    }
    return totals
  }, [totalsFrom])

  const renderRow = (txn: Transaction) => (
    <TransactionItem
      key={txn.id}
      transaction={txn}
      category={categories.find((c) => c.id === txn.categoryId)}
      subcategory={txn.subcategoryId ? categories.find((c) => c.id === txn.subcategoryId) : undefined}
      accounts={accounts}
      baseCurrency={baseCurrency}
      masked={masked}
      onEdit={onEdit}
      onDelete={onDelete}
      open={openId === txn.id}
      onOpenChange={onDelete ? (open) => setOpenId(open ? txn.id : null) : undefined}
    />
  )

  if (!byDay) return <div className="hist-list">{transactions.map(renderRow)}</div>

  // The list is in date order, so each day's entries are next to each other
  const days: { date: string; items: Transaction[] }[] = []
  for (const txn of transactions) {
    const last = days[days.length - 1]
    if (last && last.date === txn.date) last.items.push(txn)
    else days.push({ date: txn.date, items: [txn] })
  }

  return (
    <div className="hist-list">
      {days.map(({ date, items }) => {
        const total = dayTotals.get(date) ?? 0
        return (
          <section key={date} aria-label={formatDayLabel(date, i18n.language)}>
            <h3 className="day">
              <span>{formatDayLabel(date, i18n.language)}</span>
              {!masked && total !== 0 && <span className="num">{formatListAmount(total, baseCurrency, baseCurrency, true)}</span>}
            </h3>
            {items.map(renderRow)}
          </section>
        )
      })}
    </div>
  )
}
