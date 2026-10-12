import { db } from '@/db/schema'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { SyncQueueItem, SyncTable } from '@/types'

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
  // Everything the guest owns moves to the account: leaving budgets or recurring items
  // behind would make them vanish from the UI after signing in.
  const tables = [
    { table: db.transactions, syncTable: 'transactions' },
    { table: db.categories, syncTable: 'categories' },
    { table: db.budgets, syncTable: 'budgets' },
    { table: db.recurringTransactions, syncTable: 'recurring_transactions' },
    { table: db.accounts, syncTable: 'accounts' },
    { table: db.wishlistItems, syncTable: 'wishlist_items' },
  ] as const

  for (const { table, syncTable } of tables) {
    const guestRecords = await table.where('userId').equals('guest').toArray()
    for (const record of guestRecords) {
      await table.update(record.id, { userId: targetUserId, synced: false })
      await db.syncQueue.put({
        id: `${record.id}-migrate`,
        table: syncTable as SyncTable,
        operation: 'create',
        recordId: record.id,
        payload: { ...record, userId: targetUserId },
        createdAt: new Date().toISOString(),
        retries: 0,
      })
    }
  }

  // Trigger queue processing
  await processSyncQueue()
}
