import type { Account, RecurringTransaction } from '@/types'
import type { Converter } from '@/lib/accounts'
import { advanceByFrequency } from '@/lib/utils'

export interface UpcomingPayment {
  recurring: RecurringTransaction
  date: string
  // In the base currency; null when the exchange rate is unknown
  amountInBase: number | null
}

// Safety cap per recurring item, far above what one month can hold
const MAX_OCCURRENCES = 60

// Every occurrence the active recurring items still owe up to and including `until`,
// soonest first. A weekly item shows up once for each week that is left.
export function getUpcomingPayments(
  recurring: RecurringTransaction[],
  until: string,
  baseCurrency: string,
  convert: Converter
): UpcomingPayment[] {
  const upcoming: UpcomingPayment[] = []

  for (const item of recurring) {
    if (!item.isActive) continue
    const amountInBase = convert(item.amount, item.currency, baseCurrency)
    let date = item.nextRunDate
    for (let count = 0; date <= until && count < MAX_OCCURRENCES; count++) {
      upcoming.push({ recurring: item, date, amountInBase })
      date = advanceByFrequency(date, item.frequency)
    }
  }

  return upcoming.sort((a, b) => a.date.localeCompare(b.date))
}

// What the upcoming payments add to (or take from) the balance shown on the home screen.
// Payments from accounts that are left out of that balance don't move it.
export function getUpcomingNet(upcoming: UpcomingPayment[], accounts: Account[]): number {
  return upcoming.reduce((net, { recurring, amountInBase }) => {
    const account = accounts.find((a) => a.id === recurring.accountId)
    if (account && (!account.includeInTotal || account.isArchived)) return net
    const amount = amountInBase ?? 0
    return recurring.type === 'income' ? net + amount : net - amount
  }, 0)
}
