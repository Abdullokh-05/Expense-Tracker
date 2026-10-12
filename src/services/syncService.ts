import { db } from '@/db/schema'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { SyncQueueItem, Transaction } from '@/types'

// ===================================
// Process pending sync queue items
// ===================================
export async function processSyncQueue(): Promise<{ processed: number; failed: number }> {
  if (!isSupabaseConfigured || !navigator.onLine) {
    return { processed: 0, failed: 0 }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) {
    return { processed: 0, failed: 0 } // sync only when logged in
  }

  const queueItems = await db.syncQueue.orderBy('createdAt').toArray()
  let processed = 0
  let failed = 0

  for (const item of queueItems) {
    try {
      const success = await executeSyncItem(item)
      if (success) {
        await db.syncQueue.delete(item.id)
        processed++
      } else {
        await db.syncQueue.update(item.id, { retries: item.retries + 1 })
        failed++
      }
    } catch (err) {
      console.error(`Sync failed for item ${item.id}:`, err)
      await db.syncQueue.update(item.id, { retries: item.retries + 1 })
      failed++
    }
  }

  return { processed, failed }
}

async function executeSyncItem(item: SyncQueueItem): Promise<boolean> {
  const { table, operation, payload } = item

  if (operation === 'create' || operation === 'update') {
    // Map camelCase payload to snake_case for Postgres table
    const dbPayload = mapToSnakeCase(payload)
    const { error } = await supabase.from(table).upsert(dbPayload)
    if (error) {
      console.error(`Supabase upsert error on ${table}:`, error)
      return false
    }
    return true
  }

  if (operation === 'delete') {
    const { error } = await supabase.from(table).delete().eq('id', item.recordId)
    if (error) {
      console.error(`Supabase delete error on ${table}:`, error)
      return false
    }
    return true
  }

  return false
}

function mapToSnakeCase(obj: Record<string, any>): Record<string, any> {
  const res: Record<string, any> = {}
  for (const key of Object.keys(obj)) {
    if (key === 'synced') continue // don't push local-only synced flag
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    res[snakeKey] = obj[key]
  }
  return res
}

// ===================================
// Migrate guest data to logged-in user
// ===================================
export async function migrateGuestData(targetUserId: string): Promise<void> {
  // 1. Update all guest transactions
  const guestTxns = await db.transactions.where('userId').equals('guest').toArray()
  for (const t of guestTxns) {
    await db.transactions.update(t.id, { userId: targetUserId, synced: false })
    await db.syncQueue.add({
      id: `${t.id}-migrate`,
      table: 'transactions',
      operation: 'create',
      recordId: t.id,
      payload: { ...t, userId: targetUserId },
      createdAt: new Date().toISOString(),
      retries: 0,
    })
  }

  // 2. Update guest categories
  const guestCats = await db.categories.where('userId').equals('guest').toArray()
  for (const c of guestCats) {
    await db.categories.update(c.id, { userId: targetUserId, synced: false })
    await db.syncQueue.add({
      id: `${c.id}-migrate`,
      table: 'categories',
      operation: 'create',
      recordId: c.id,
      payload: { ...c, userId: targetUserId },
      createdAt: new Date().toISOString(),
      retries: 0,
    })
  }

  // 3. Trigger queue processing
  await processSyncQueue()
}

// ===================================
// Export CSV / Excel Data
// ===================================
export function exportTransactionsToCSV(transactions: Transaction[]): void {
  if (transactions.length === 0) return

  const headers = ['ID', 'Date', 'Type', 'Amount', 'Currency', 'Amount (Base)', 'Category ID', 'Note', 'Payment Method']
  const rows = transactions.map((t) => [
    t.id,
    t.date,
    t.type,
    t.amount,
    t.currency,
    t.amountInBaseCurrency,
    t.categoryId || '',
    `"${(t.note || '').replace(/"/g, '""')}"`,
    t.paymentMethod || '',
  ])

  const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `xarajat_export_${new Date().toISOString().split('T')[0]}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
