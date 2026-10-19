import type { TFunction } from 'i18next'
import type { Account, Category, DateRange, Transaction, TransactionType } from '@/types'
import { getCategoryName } from '@/lib/categories'

export type HistoryPeriod = 'all' | 'month' | 'custom'
export type HistorySort = 'newest' | 'oldest' | 'largest' | 'smallest'

// Everything the Filter & sort pop-up narrows History by (the type chips sit outside it)
export interface HistoryFilter {
  categoryId: string
  accountId: string
  period: HistoryPeriod
  from: string
  to: string
  min: string
  max: string
}

export const EMPTY_FILTER: HistoryFilter = {
  categoryId: '',
  accountId: '',
  period: 'all',
  from: '',
  to: '',
  min: '',
  max: '',
}

function parseAmount(text: string): number | null {
  const value = parseFloat(text.replace(/\s/g, '').replace(',', '.'))
  return isNaN(value) ? null : value
}

export function filterHistory(
  transactions: Transaction[],
  type: TransactionType | '',
  filter: HistoryFilter,
  monthRange: DateRange
): Transaction[] {
  const min = parseAmount(filter.min)
  const max = parseAmount(filter.max)
  return transactions.filter((txn) => {
    if (txn.status !== 'confirmed') return false
    if (type && txn.type !== type) return false
    if (filter.categoryId && txn.categoryId !== filter.categoryId) return false
    // A transfer belongs to both of its accounts
    if (filter.accountId && txn.accountId !== filter.accountId && txn.toAccountId !== filter.accountId) return false
    if (filter.period === 'month' && (txn.date < monthRange.from || txn.date > monthRange.to)) return false
    if (filter.period === 'custom') {
      if (filter.from && txn.date < filter.from) return false
      if (filter.to && txn.date > filter.to) return false
    }
    if (min !== null && txn.amountInBaseCurrency < min) return false
    if (max !== null && txn.amountInBaseCurrency > max) return false
    return true
  })
}

// The store keeps transactions newest first
export function sortHistory(transactions: Transaction[], sort: HistorySort): Transaction[] {
  if (sort === 'newest') return transactions
  if (sort === 'oldest') return [...transactions].reverse()
  return [...transactions].sort((a, b) =>
    sort === 'largest' ? b.amountInBaseCurrency - a.amountInBaseCurrency : a.amountInBaseCurrency - b.amountInBaseCurrency
  )
}

// Search looks at the note, the category, the account and the amount
export function matchesSearch(
  txn: Transaction,
  query: string,
  categories: Category[],
  accounts: Account[],
  t: TFunction
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  const digits = q.replace(/[\s ]/g, '')
  if (/^\d+([.,]\d+)?$/.test(digits)) {
    const wanted = digits.replace(',', '.')
    if (String(txn.amount).startsWith(wanted) || String(Math.round(txn.amountInBaseCurrency)).startsWith(wanted)) return true
  }
  // Transfers have no category; they are found by the word "Transfer" instead
  const kind =
    txn.type === 'transfer'
      ? t('transaction.transfer')
      : txn.categoryId
        ? getCategoryName(categories.find((c) => c.id === txn.categoryId), t)
        : ''
  const account = accounts.find((a) => a.id === txn.accountId)?.name ?? ''
  const toAccount = accounts.find((a) => a.id === txn.toAccountId)?.name ?? ''
  return [txn.note ?? '', kind, account, toAccount].some((text) => text.toLowerCase().includes(q))
}
