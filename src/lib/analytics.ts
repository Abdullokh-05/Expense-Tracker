import type { TFunction } from 'i18next'
import type { Category, CategorySpending, DateRange, Transaction, TransactionType } from '@/types'
import { getCategoryName, rootCategoryId } from '@/lib/categories'
import { addDays, formatMonthName, formatWeekdayShort, parseDateString, roundMoney } from '@/lib/utils'

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
    .reduce((sum, txn) => roundMoney(sum + txn.amountInBaseCurrency), 0)
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
    // An entry counts under its top-level category (its subcategory is a split inside it)
    const categoryId = rootCategoryId(categories, txn.categoryId)
    const known = categoryId && categories.some((c) => c.id === categoryId)
    const key = known ? categoryId! : UNCATEGORIZED_ID
    const entry = totals.get(key) ?? { amount: 0, count: 0 }
    entry.amount = roundMoney(entry.amount + txn.amountInBaseCurrency)
    entry.count += 1
    totals.set(key, entry)
    total = roundMoney(total + txn.amountInBaseCurrency)
  }

  return [...totals.entries()]
    .map(([categoryId, { amount, count }]) => {
      const category = categories.find((c) => c.id === categoryId)
      return {
        categoryId,
        categoryName: category ? getCategoryName(category, t) : t('transaction.noCategory'),
        categoryIcon: category?.icon ?? '❔',
        categoryColor: category?.color ?? UNCATEGORIZED_COLOR,
        amount,
        percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
        transactionCount: count,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

export interface PeriodBucket {
  // "2026-10-14" for a day, "2026-10" for a month
  key: string
  from: string
  to: string
  income: number
  outcome: number
}

// A month split into its days, or a year into its months, each with what came in and went out.
// Every day (or month) is there, empty ones too. Transfers between the user's own accounts are
// neither, so they never count. Days are the entries' own calendar dates (Tashkent days, as
// recorded), never UTC timestamps.
export function getPeriodBuckets(transactions: Transaction[], range: DateRange, unit: 'day' | 'month'): PeriodBucket[] {
  const buckets: PeriodBucket[] = []
  if (unit === 'day') {
    for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
      buckets.push({ key: day, from: day, to: day, income: 0, outcome: 0 })
    }
  } else {
    const year = Number(range.from.slice(0, 4))
    for (let month = 1; month <= 12; month++) {
      const key = `${year}-${String(month).padStart(2, '0')}`
      const last = new Date(year, month, 0).getDate()
      buckets.push({ key, from: `${key}-01`, to: `${key}-${String(last).padStart(2, '0')}`, income: 0, outcome: 0 })
    }
  }
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  for (const txn of confirmedInRange(transactions, range)) {
    if (txn.type === 'transfer') continue
    const bucket = byKey.get(unit === 'day' ? txn.date : txn.date.slice(0, 7))
    if (!bucket) continue
    if (txn.type === 'income') bucket.income = roundMoney(bucket.income + txn.amountInBaseCurrency)
    else bucket.outcome = roundMoney(bucket.outcome + txn.amountInBaseCurrency)
  }
  return buckets
}

export interface SubcategorySpending {
  // The subcategory's id, or '' for entries in the category without one
  id: string
  name: string
  icon: string
  amount: number
  // Share of the category's total
  percentage: number
  transactionCount: number
}

// One category's expenses (or income) split by subcategory, biggest first. Entries without a
// (known) subcategory form their own row, so the rows add up to the category's total.
export function getSubcategorySpending(
  transactions: Transaction[],
  categories: Category[],
  t: TFunction,
  parentId: string,
  type: 'expense' | 'income' = 'expense'
): SubcategorySpending[] {
  const parent = categories.find((c) => c.id === parentId)
  const subs = new Map(categories.filter((c) => c.parentId === parentId).map((c) => [c.id, c]))
  const totals = new Map<string, { amount: number; count: number }>()
  let total = 0

  for (const txn of transactions) {
    if (txn.type !== type || rootCategoryId(categories, txn.categoryId) !== parentId) continue
    const key = txn.subcategoryId && subs.has(txn.subcategoryId) ? txn.subcategoryId : ''
    const entry = totals.get(key) ?? { amount: 0, count: 0 }
    entry.amount = roundMoney(entry.amount + txn.amountInBaseCurrency)
    entry.count += 1
    totals.set(key, entry)
    total = roundMoney(total + txn.amountInBaseCurrency)
  }

  return [...totals.entries()]
    .map(([id, { amount, count }]) => {
      const sub = subs.get(id)
      return {
        id,
        name: sub ? getCategoryName(sub, t) : t('stats.noSub'),
        icon: sub?.icon ?? parent?.icon ?? '📦',
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
          .reduce((sum, txn) => roundMoney(sum + txn.amountInBaseCurrency), 0),
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
        .reduce((sum, txn) => roundMoney(sum + txn.amountInBaseCurrency), 0),
    })
  }
  return points
}
