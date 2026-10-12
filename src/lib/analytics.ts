import type { TFunction } from 'i18next'
import type { Category, CategorySpending, DateRange, Transaction, TransactionType } from '@/types'
import { getCategoryName } from '@/lib/categories'
import { addDays, formatMonthName, formatWeekdayShort, parseDateString } from '@/lib/utils'

const UNCATEGORIZED_ID = 'uncategorized'
const UNCATEGORIZED_COLOR = '#6b7280'

// Confirmed transactions dated inside the range (both ends inclusive)
export function confirmedInRange(transactions: Transaction[], range: DateRange): Transaction[] {
  return transactions.filter(
    (txn) => txn.status === 'confirmed' && txn.date >= range.from && txn.date <= range.to
  )
}

// Total of one transaction type, in the base currency. Transfers are neither income nor
// expense, so asking for either never counts them.
export function sumByType(transactions: Transaction[], type: TransactionType): number {
  return transactions
    .filter((txn) => txn.type === type)
    .reduce((sum, txn) => sum + txn.amountInBaseCurrency, 0)
}

// Expenses (or income) grouped by category, biggest first. Transactions without a (known)
// category are grouped under "Other" rather than dropped, so the shares always add up to the total.
export function getCategorySpending(
  transactions: Transaction[],
  categories: Category[],
  t: TFunction,
  type: 'expense' | 'income' = 'expense'
): CategorySpending[] {
  const totals = new Map<string, { amount: number; count: number }>()
  let total = 0

  for (const txn of transactions) {
    if (txn.type !== type) continue
    const known = txn.categoryId && categories.some((c) => c.id === txn.categoryId)
    const key = known ? txn.categoryId! : UNCATEGORIZED_ID
    const entry = totals.get(key) ?? { amount: 0, count: 0 }
    entry.amount += txn.amountInBaseCurrency
    entry.count += 1
    totals.set(key, entry)
    total += txn.amountInBaseCurrency
  }

  return [...totals.entries()]
    .map(([categoryId, { amount, count }]) => {
      const category = categories.find((c) => c.id === categoryId)
      return {
        categoryId,
        categoryName: getCategoryName(category, t),
        categoryIcon: category?.icon ?? '📦',
        categoryColor: category?.color ?? UNCATEGORIZED_COLOR,
        amount,
        percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
        transactionCount: count,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

export interface TrendPoint {
  key: string
  label: string
  amount: number
}

// Expenses (or income) over time for a chart: one bar per month for a year, otherwise one bar
// per day. Every bucket in the range is present, including the ones with nothing in them.
export function getSpendingTrend(
  transactions: Transaction[],
  period: 'week' | 'month' | 'year',
  range: DateRange,
  locale: string,
  type: 'expense' | 'income' = 'expense'
): TrendPoint[] {
  const expenses = transactions.filter((txn) => txn.type === type)

  if (period === 'year') {
    const year = range.from.slice(0, 4)
    return Array.from({ length: 12 }, (_, month) => {
      const key = `${year}-${String(month + 1).padStart(2, '0')}`
      return {
        key,
        label: formatMonthName(new Date(Number(year), month, 1), locale, 'short'),
        amount: expenses
          .filter((txn) => txn.date.startsWith(key))
          .reduce((sum, txn) => sum + txn.amountInBaseCurrency, 0),
      }
    })
  }

  const points: TrendPoint[] = []
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    const date = parseDateString(day)
    points.push({
      key: day,
      label: period === 'week' ? formatWeekdayShort(date, locale) : String(date.getDate()),
      amount: expenses
        .filter((txn) => txn.date === day)
        .reduce((sum, txn) => sum + txn.amountInBaseCurrency, 0),
    })
  }
  return points
}
