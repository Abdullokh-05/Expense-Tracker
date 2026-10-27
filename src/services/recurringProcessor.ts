import { db } from '@/db/schema'
import { allFromStored, toStored } from '@/db/money'
import type { SyncQueueItem, Transaction } from '@/types'
import { advanceByFrequency, generateId, nowISO, roundMoney, todayDate } from '@/lib/utils'
import { getConversionRate } from '@/services/currencyApi'

// Upper bound on occurrences created per recurring item in one run (the rest follow next start)
const MAX_CATCH_UP = 60

let running: Promise<number> | null = null

// Creates the transactions that recurring items owe up to today. Calls are serialised so two
// callers (e.g. React StrictMode running effects twice) can't both create the same occurrence.
export function processRecurringTransactions(userId = 'guest', baseCurrency: string): Promise<number> {
  if (!running) {
    running = run(userId, baseCurrency).finally(() => {
      running = null
    })
  }
  return running
}

async function run(userId: string, baseCurrency: string): Promise<number> {
  const today = todayDate()
  const activeRTs = allFromStored(
    'recurringTransactions',
    await db.recurringTransactions
      .where('userId')
      .equals(userId)
      .filter((rt) => rt.isActive && rt.nextRunDate <= today)
      .toArray()
  )

  if (activeRTs.length === 0) return 0

  let processedCount = 0

  for (const rt of activeRTs) {
    // Without a rate (offline, never fetched) leave the item due and retry on the next start
    // rather than record a foreign-currency amount as if it were the base currency.
    const rate = await getConversionRate(rt.currency, baseCurrency)
    if (rate === null) continue

    const now = nowISO()
    const created: Transaction[] = []
    let nextRunDate = rt.nextRunDate

    // 1. One transaction (confirmed or pending) per occurrence missed while the app was closed
    while (nextRunDate <= today && created.length < MAX_CATCH_UP) {
      created.push({
        id: generateId(),
        userId: rt.userId,
        type: rt.type,
        status: rt.autoCreate && rt.accountId ? 'confirmed' : 'pending',
        amount: rt.amount,
        currency: rt.currency,
        amountInBaseCurrency: roundMoney(rt.amount * rate),
        exchangeRate: rate,
        categoryId: rt.categoryId,
        subcategoryId: rt.subcategoryId ?? null,
        accountId: rt.accountId,
        toAccountId: null,
        toAmount: null,
        date: nextRunDate,
        note: rt.note,
        noteOriginal: rt.note,
        noteLanguage: null,
        translationConfidence: null,
        paymentMethod: null,
        recurringTransactionId: rt.id,
        createdAt: now,
        updatedAt: now,
        synced: false,
      })
      // 2. Calculate next run date based on frequency
      nextRunDate = advanceByFrequency(nextRunDate, rt.frequency)
    }

    // Add to sync queue for dual-write offline sync
    const syncItems: SyncQueueItem[] = [
      ...created.map((txn) => ({
        id: generateId(),
        table: 'transactions' as const,
        operation: 'create' as const,
        recordId: txn.id,
        payload: txn,
        createdAt: now,
        retries: 0,
      })),
      {
        id: generateId(),
        table: 'recurring_transactions' as const,
        operation: 'update' as const,
        recordId: rt.id,
        payload: { ...rt, nextRunDate, updatedAt: now },
        createdAt: now,
        retries: 0,
      },
    ]

    // All or nothing, so a crash can't leave transactions created but the date not advanced
    await db.transaction('rw', db.transactions, db.recurringTransactions, db.syncQueue, async () => {
      await db.transactions.bulkAdd(created.map((txn) => toStored('transactions', txn)))
      await db.recurringTransactions.update(rt.id, { nextRunDate, updatedAt: now })
      await db.syncQueue.bulkAdd(syncItems)
    })

    processedCount += created.length
  }

  return processedCount
}
