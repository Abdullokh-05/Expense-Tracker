import type { Budget, RecurringTransaction, Transaction } from '@/types'
import { addDays, getDateRange, todayDate, roundMoney } from '@/lib/utils'

// In-app notifications, worked out from the data each time (nothing extra is stored but
// which ones were read). Ids name the event, so the same limit crossed next month is new again.

// A category at 85% of its monthly limit or past it
export interface LimitNotification {
  kind: 'limit'
  id: string
  categoryId: string
  spent: number
  limit: number
  over: boolean
}

export type AppNotification =
  // A recurring payment set to "ask me first" that came due: it waits for Add it / Skip
  | { kind: 'pending'; id: string; transaction: Transaction }
  | LimitNotification
  // A recurring payment the app recorded by itself
  | { kind: 'added'; id: string; transaction: Transaction }
  // A planned payment coming up within its reminder time (daysLeft 0: today)
  | { kind: 'due'; id: string; recurring: RecurringTransaction; date: string; daysLeft: number }

// Automatic entries stay in the list this long
const ADDED_DAYS = 30
// Where a limit starts to warn
const NEAR_LIMIT = 0.85

// Which kinds Settings › Notifications leaves on
export interface NotificationOptions {
  limits: boolean
  reminders: boolean
}

export function buildNotifications(
  transactions: Transaction[],
  budgets: Budget[],
  recurring: RecurringTransaction[],
  options: NotificationOptions = { limits: true, reminders: true }
): AppNotification[] {
  const pending: AppNotification[] = transactions
    .filter((txn) => txn.status === 'pending')
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((txn) => ({ kind: 'pending', id: `pending:${txn.id}`, transaction: txn }))

  const month = getDateRange('month')
  const monthKey = month.from.slice(0, 7)
  const limits: LimitNotification[] = []
  for (const budget of options.limits ? budgets : []) {
    if (budget.monthlyLimit <= 0) continue
    const spent = transactions
      .filter(
        (txn) =>
          txn.status === 'confirmed' &&
          txn.type === 'expense' &&
          txn.categoryId === budget.categoryId &&
          txn.date >= month.from &&
          txn.date <= month.to
      )
      .reduce((sum, txn) => roundMoney(sum + txn.amountInBaseCurrency), 0)
    const share = spent / budget.monthlyLimit
    if (share < NEAR_LIMIT) continue
    const over = share > 1
    limits.push({
      kind: 'limit',
      id: `limit:${budget.categoryId}:${monthKey}:${over ? 'over' : 'near'}`,
      categoryId: budget.categoryId,
      spent,
      limit: budget.monthlyLimit,
      over,
    })
  }
  // Over the limit first
  limits.sort((a, b) => Number(b.over) - Number(a.over))

  // The first entry of a repeating payment is the one the user saved, at the same moment as the
  // repeat itself; later ones were added by the app when they came due. Payments that ask first
  // are never added by the app: the user said yes to them (the pending ones above).
  const createdAt = new Map(
    recurring.filter((item) => item.autoCreate).map((item) => [item.id, Date.parse(item.createdAt)])
  )
  const since = addDays(todayDate(), -ADDED_DAYS)
  const added: AppNotification[] = transactions
    .filter((txn) => {
      if (txn.status !== 'confirmed' || !txn.recurringTransactionId || txn.date < since) return false
      const repeatCreated = createdAt.get(txn.recurringTransactionId)
      return repeatCreated !== undefined && Date.parse(txn.createdAt) - repeatCreated > 60_000
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((txn) => ({ kind: 'added', id: `added:${txn.id}`, transaction: txn }))

  const today = todayDate()
  const due: AppNotification[] = options.reminders
    ? recurring
        .filter((item) => {
          const lead = remindLead(item)
          return item.isActive && lead !== null && item.nextRunDate >= today && item.nextRunDate <= addDays(today, lead)
        })
        .sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate))
        .map((item) => ({
          kind: 'due',
          id: `due:${item.id}:${item.nextRunDate}`,
          recurring: item,
          date: item.nextRunDate,
          daysLeft: daysBetween(today, item.nextRunDate),
        }))
    : []

  return [...pending, ...due, ...limits, ...added]
}

// Days ahead a planned payment reminds of itself, or null for never
export function remindLead(item: RecurringTransaction): number | null {
  return item.remindDaysBefore === undefined ? 1 : item.remindDaysBefore
}

// Whole days from one date to a later one
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

// Unread ones light the dot on the bell. A payment waiting for an answer always counts.
export function countUnread(notifications: AppNotification[], readIds: string[]): number {
  return notifications.filter((item) => item.kind === 'pending' || !readIds.includes(item.id)).length
}
