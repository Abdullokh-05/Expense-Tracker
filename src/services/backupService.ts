import { db } from '@/db/schema'
import type { Budget, Category, RecurringTransaction, Transaction } from '@/types'
import { todayDate } from '@/lib/utils'

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ===================================
// Export CSV / Excel Data
// ===================================
function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value)
  // A note starting with = + - @ would be run as a formula by Excel; make it plain text
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function exportTransactionsToCSV(
  transactions: Transaction[],
  getCategoryLabel: (categoryId: string | null) => string
): void {
  const headers = ['Date', 'Type', 'Amount', 'Currency', 'Amount (Base)', 'Category', 'Note', 'Payment Method', 'Status']
  const rows = transactions.map((t) => [
    t.date,
    t.type,
    t.amount,
    t.currency,
    t.amountInBaseCurrency,
    getCategoryLabel(t.categoryId),
    t.note,
    t.paymentMethod,
    t.status,
  ])

  const csvContent = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')

  // BOM so Excel reads the file as UTF-8
  downloadFile(`xarajat_export_${todayDate()}.csv`, '﻿' + csvContent, 'text/csv;charset=utf-8;')
}

// ===================================
// Full backup (JSON) and restore
// ===================================
interface BackupFile {
  app: 'xarajat'
  version: 1
  exportedAt: string
  baseCurrency: string
  transactions: Transaction[]
  categories: Category[]
  budgets: Budget[]
  recurringTransactions: RecurringTransaction[]
}

export async function exportBackup(userId: string, baseCurrency: string): Promise<void> {
  const backup: BackupFile = {
    app: 'xarajat',
    version: 1,
    exportedAt: new Date().toISOString(),
    baseCurrency,
    transactions: await db.transactions.where('userId').equals(userId).toArray(),
    categories: await db.categories.where('userId').equals(userId).toArray(),
    budgets: await db.budgets.where('userId').equals(userId).toArray(),
    recurringTransactions: await db.recurringTransactions.where('userId').equals(userId).toArray(),
  }
  downloadFile(`xarajat_backup_${todayDate()}.json`, JSON.stringify(backup, null, 2), 'application/json')
}

const hasId = (record: unknown): boolean =>
  typeof record === 'object' && record !== null && typeof (record as { id?: unknown }).id === 'string'

function parseBackup(text: string): BackupFile {
  const data = JSON.parse(text)
  const tables = ['transactions', 'categories', 'budgets', 'recurringTransactions'] as const

  const valid =
    data?.app === 'xarajat' &&
    typeof data.baseCurrency === 'string' &&
    tables.every((table) => Array.isArray(data[table]) && data[table].every(hasId)) &&
    data.transactions.every(
      (t: Partial<Transaction>) =>
        typeof t.amount === 'number' &&
        typeof t.amountInBaseCurrency === 'number' &&
        typeof t.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(t.date)
    )
  if (!valid) throw new Error('Not a Xarajat backup file')

  return data as BackupFile
}

// Replaces the user's current data with the contents of a backup file. Throws (changing
// nothing) if the file isn't a valid backup. Returns the base currency its amounts are in.
export async function restoreBackup(
  file: File,
  userId: string
): Promise<{ baseCurrency: string; transactionCount: number }> {
  const backup = parseBackup(await file.text())
  const own = <T extends { userId: string }>(records: T[]): T[] =>
    records.map((record) => ({ ...record, userId, synced: false }))

  await db.transaction(
    'rw',
    db.transactions,
    db.categories,
    db.budgets,
    db.recurringTransactions,
    async () => {
      await db.transactions.where('userId').equals(userId).delete()
      await db.categories.where('userId').equals(userId).delete()
      await db.budgets.where('userId').equals(userId).delete()
      await db.recurringTransactions.where('userId').equals(userId).delete()

      await db.transactions.bulkPut(own(backup.transactions))
      await db.categories.bulkPut(own(backup.categories))
      await db.budgets.bulkPut(own(backup.budgets))
      await db.recurringTransactions.bulkPut(own(backup.recurringTransactions))
    }
  )

  return { baseCurrency: backup.baseCurrency, transactionCount: backup.transactions.length }
}
