import type { Table } from 'dexie'
import { db } from '@/db/schema'
import { fromStored, MONEY_FIELDS, toStored, type MoneyTable } from '@/db/money'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { reloadAllData } from '@/store/reloadAll'
import { mergeDuplicates } from '@/services/dedupe'
import type { SyncQueueItem, SyncTable } from '@/types'

// Two-way sync with Supabase while signed in. Every change made on this device waits in the
// sync queue; a sync sends the queue, then downloads what changed elsewhere. Whichever copy of
// a record was changed last wins. Runs on start, a moment after each change, when the app
// comes back to the front and when the connection returns.

interface SyncedTable {
  local: Table<{ id: string; userId: string; updatedAt: string }, string>
  remote: SyncTable
  money: MoneyTable | null
}

const TABLES: SyncedTable[] = [
  { local: db.accounts as never, remote: 'accounts', money: 'accounts' },
  { local: db.categories as never, remote: 'categories', money: null },
  { local: db.transactions as never, remote: 'transactions', money: 'transactions' },
  { local: db.budgets as never, remote: 'budgets', money: 'budgets' },
  { local: db.recurringTransactions as never, remote: 'recurring_transactions', money: 'recurringTransactions' },
  { local: db.wishlistItems as never, remote: 'wishlist_items', money: 'wishlistItems' },
  { local: db.templates as never, remote: 'templates', money: 'templates' },
]
// Rows asked for at a time when downloading
const PAGE = 1000

export interface SyncResult {
  signedIn: boolean
  pushed: number
  pulled: number
  failed: number
  // The first error the server gave, to show
  error: string | null
}

const toSnake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())

// A record as a row: snake_case, without the local-only flag, owned by the signed-in user
function toRow(table: SyncTable, record: Record<string, unknown>, userId: string): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === 'synced' || value === undefined) continue
    row[toSnake(key)] = value
  }
  row.user_id = userId
  // Planned payments made before reminders could be set remind a day ahead; stored as such,
  // so the null that means "no reminder" stays distinct
  if (table === 'recurring_transactions' && record.remindDaysBefore === undefined) row.remind_days_before = 1
  return row
}

// A row as a record, with the app's amounts and ISO timestamps
function fromRow(table: SyncedTable, row: Record<string, unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) record[toCamel(key)] = value
  for (const key of ['createdAt', 'updatedAt']) {
    if (typeof record[key] === 'string') record[key] = new Date(record[key] as string).toISOString()
  }
  if (table.money) {
    // numeric columns can come back as text
    for (const field of MONEY_FIELDS[table.money]) {
      if (typeof record[field] === 'string') record[field] = Number(record[field])
    }
    return toStored(table.money, record)
  }
  return record
}

let running: Promise<SyncResult> | null = null

export function syncAll(): Promise<SyncResult> {
  if (!running) {
    running = run().finally(() => {
      running = null
    })
  }
  return running
}

// Soon after a change, rather than once per keystroke-sized edit
let timer: number | null = null
export function scheduleSync(delay = 2000): void {
  if (!isSupabaseConfigured) return
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = null
    syncAll().catch((err) => console.error('Sync failed', err))
  }, delay)
}

async function run(): Promise<SyncResult> {
  const result: SyncResult = { signedIn: false, pushed: 0, pulled: 0, failed: 0, error: null }
  if (!isSupabaseConfigured || !navigator.onLine) return result
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return result
  result.signedIn = true

  const adopted = await adoptLocalData(userId)
  if (useAppStore.getState().settings.userId !== userId) useAppStore.getState().setUserId(userId)

  await push(userId, result)
  await pull(result)
  // Built-ins and starting accounts made separately on two devices become one
  const merged = await mergeDuplicates(userId)

  if (adopted > 0 || result.pulled > 0 || merged > 0) await reloadAllData()
  return result
}

// Everything on this device belongs to whoever is signed in on it. Records still marked as the
// guest's (or as an id from an earlier, unfinished sign-up) move to the account and are sent.
async function adoptLocalData(userId: string): Promise<number> {
  let count = 0
  const now = new Date().toISOString()
  for (const table of TABLES) {
    const strays = await table.local.filter((record) => record.userId !== userId).toArray()
    for (const record of strays) {
      await table.local.update(record.id, { userId, synced: false } as never)
      await db.syncQueue.put({
        id: `${record.id}-adopt`,
        table: table.remote,
        operation: 'create',
        recordId: record.id,
        // The queue carries ordinary amounts, the database hundredths
        payload: { ...(table.money ? fromStored(table.money, record) : record), userId },
        createdAt: now,
        retries: 0,
      })
      count++
    }
  }
  return count
}

// Sends the queue in the order the changes were made; a failed item stays for the next try
async function push(userId: string, result: SyncResult): Promise<void> {
  const items = await db.syncQueue.orderBy('createdAt').toArray()
  for (const item of items) {
    const error = await send(item, userId)
    if (!error) {
      await db.syncQueue.delete(item.id)
      result.pushed++
    } else {
      await db.syncQueue.update(item.id, { retries: item.retries + 1 })
      result.failed++
      result.error ??= error
      console.error(`Sync failed for ${item.table} ${item.recordId}:`, error)
    }
  }
}

async function send(item: SyncQueueItem, userId: string): Promise<string | null> {
  if (item.operation === 'delete') {
    const { error } = await supabase.from(item.table).delete().eq('id', item.recordId)
    return error ? error.message : null
  }
  const { error } = await supabase.from(item.table).upsert(toRow(item.table, item.payload, userId))
  return error ? error.message : null
}

// Takes what changed on the server: rows this device doesn't have, or has an older copy of.
// Records with changes still waiting to be sent keep the local copy.
async function pull(result: SyncResult): Promise<void> {
  const waiting = new Set((await db.syncQueue.toArray()).map((item) => item.recordId))
  for (const table of TABLES) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from(table.remote).select('*').range(from, from + PAGE - 1)
      if (error) {
        result.error ??= error.message
        break
      }
      for (const row of data ?? []) {
        const record = fromRow(table, row)
        const id = record.id as string
        if (waiting.has(id)) continue
        const local = await table.local.get(id)
        if (local && Date.parse(local.updatedAt) >= Date.parse(record.updatedAt as string)) continue
        await table.local.put({ ...record, synced: true } as never)
        result.pulled++
      }
      if (!data || data.length < PAGE) break
    }
  }
}
