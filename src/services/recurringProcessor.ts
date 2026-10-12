import { db } from '@/db/schema'
import type { Transaction } from '@/types'
import { generateId, nowISO, todayDate } from '@/lib/utils'

export async function processRecurringTransactions(userId = 'guest'): Promise<number> {
  const today = todayDate()
  const activeRTs = await db.recurringTransactions
    .where('userId')
    .equals(userId)
    .filter((rt) => rt.isActive && rt.nextRunDate <= today)
    .toArray()

  if (activeRTs.length === 0) return 0

  let processedCount = 0
  const now = nowISO()

  for (const rt of activeRTs) {
    // 1. Create transaction (confirmed or pending)
    const txnStatus = rt.autoCreate ? 'confirmed' : 'pending'
    const newTxn: Transaction = {
      id: generateId(),
      userId: rt.userId,
      type: rt.type,
      status: txnStatus,
      amount: rt.amount,
      currency: rt.currency,
      // For base conversion, we fetch the base currency of settings
      amountInBaseCurrency: rt.amount, // stub base currency conversion or we resolve settings base
      exchangeRate: 1,
      categoryId: rt.categoryId,
      date: rt.nextRunDate, // created on the next run date
      note: rt.note,
      noteOriginal: rt.note,
      noteLanguage: null,
      translationConfidence: null,
      paymentMethod: null,
      recurringTransactionId: rt.id,
      createdAt: now,
      updatedAt: now,
    }

    // Resolve base currency exchange rate if we can access settings
    const settings = await db.settings.get(userId)
    if (settings && settings.baseCurrency !== rt.currency) {
      const cachedRates = await db.exchangeRates.get(settings.baseCurrency)
      if (cachedRates && cachedRates.rates[rt.currency]) {
        const rate = cachedRates.rates[rt.currency]
        newTxn.amountInBaseCurrency = rt.amount / rate
        newTxn.exchangeRate = 1 / rate
      }
    }

    await db.transactions.add(newTxn)
    
    // Add to sync queue for dual-write offline sync
    const syncItem = {
      id: generateId(),
      table: 'transactions' as const,
      operation: 'create' as const,
      recordId: newTxn.id,
      payload: newTxn,
      createdAt: now,
      retries: 0,
    }
    await db.syncQueue.add(syncItem)

    // 2. Calculate next run date based on frequency
    const nextDate = new Date(rt.nextRunDate + 'T00:00:00')
    if (rt.frequency === 'weekly') {
      nextDate.setDate(nextDate.getDate() + 7)
    } else if (rt.frequency === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1)
    } else if (rt.frequency === 'yearly') {
      nextDate.setFullYear(nextDate.getFullYear() + 1)
    }

    const nextRunDateStr = nextDate.toISOString().split('T')[0]
    
    // Update next run date in DB
    await db.recurringTransactions.update(rt.id, {
      nextRunDate: nextRunDateStr,
      updatedAt: now,
    })

    const syncRTItem = {
      id: generateId(),
      table: 'recurring_transactions' as const,
      operation: 'update' as const,
      recordId: rt.id,
      payload: { ...rt, nextRunDate: nextRunDateStr, updatedAt: now },
      createdAt: now,
      retries: 0,
    }
    await db.syncQueue.add(syncRTItem)

    processedCount++
  }

  return processedCount
}
