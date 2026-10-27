import { fromMinorUnits, toMinorUnits } from '@/lib/money'

// The database keeps every amount as whole hundredths (23,67 → 2367); the rest of the app
// works with ordinary amounts. Everything that reads or writes these tables goes through
// toStored / fromStored, so the two never mix.
export const MONEY_FIELDS = {
  transactions: ['amount', 'amountInBaseCurrency', 'toAmount'],
  accounts: ['startingBalance'],
  budgets: ['monthlyLimit'],
  recurringTransactions: ['amount'],
  wishlistItems: ['price'],
  templates: ['amount'],
} as const

export type MoneyTable = keyof typeof MONEY_FIELDS
export const MONEY_TABLES = Object.keys(MONEY_FIELDS) as MoneyTable[]

function convert<T extends object>(table: MoneyTable, record: T, change: (value: number) => number): T {
  const copy = { ...record } as Record<string, unknown>
  for (const field of MONEY_FIELDS[table]) {
    // Missing or null (a transfer's toAmount on other entries) stays as it is
    if (typeof copy[field] === 'number') copy[field] = change(copy[field] as number)
  }
  return copy as T
}

// An amount record (or a change to one) as the database keeps it
export function toStored<T extends object>(table: MoneyTable, record: T): T {
  return convert(table, record, toMinorUnits)
}

// A record from the database, with its amounts as the app uses them
export function fromStored<T extends object>(table: MoneyTable, record: T): T {
  return convert(table, record, fromMinorUnits)
}

export function allFromStored<T extends object>(table: MoneyTable, records: T[]): T[] {
  return records.map((record) => fromStored(table, record))
}

// The one-time backup of the amounts as they were before they moved to hundredths
export const MINOR_UNITS_BACKUP_ID = 'before-minor-units'
