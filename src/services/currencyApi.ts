import { db } from '@/db/schema'
import { allFromStored, toStored } from '@/db/money'
import { addToSyncQueue } from '@/db/operations'
import type { ExchangeRate } from '@/types'
import { nowISO, roundMoney } from '@/lib/utils'
import { rateBetween, withCustomRates } from '@/lib/rates'
import { useAppStore } from '@/store/appStore'

const API_URL = 'https://open.er-api.com/v6/latest'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 // 24 hours

// Every conversion goes through one USD-based table. The API rounds rates to six decimals,
// so a table based on a low-value currency is useless (1 UZS = 0.000084 USD is off by ~0.4%),
// while USD-based figures keep full precision for every currency. One table also means one
// cached copy covers every pair offline.
const PIVOT_CURRENCY = 'USD'

// USD-based rates: 1 USD = rates[X] units of X.
// Fresh from the API when possible, otherwise the last cached copy however old.
// Returns null when there are no rates at all — callers must not guess one.
export async function fetchExchangeRates(): Promise<Record<string, number> | null> {
  const baseCurrency = PIVOT_CURRENCY

  // 1. Check if we have cached rates in IndexedDB
  const cached = await db.exchangeRates.get(baseCurrency)
  if (cached) {
    const ageMs = Date.now() - new Date(cached.lastUpdated).getTime()
    if (ageMs <= MAX_AGE_MS) return cached.rates
  }

  // 2. Fetch fresh rates if online
  if (navigator.onLine) {
    try {
      const res = await fetch(`${API_URL}/${baseCurrency}`)
      if (!res.ok) throw new Error('API request failed')
      const data = await res.json()

      if (data.rates) {
        const ratesRecord: ExchangeRate = {
          baseCurrency,
          rates: data.rates,
          lastUpdated: nowISO(),
        }
        // Save to IndexedDB
        await db.exchangeRates.put(ratesRecord)
        return data.rates
      }
    } catch (error) {
      console.error('Error fetching exchange rates:', error)
    }
  }

  // 3. Offline or the API failed: a stale cache is still better than nothing
  return cached?.rates ?? null
}

// How many units of `toCurrency` one unit of `fromCurrency` is worth, or null if unknown
export async function getConversionRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
  if (fromCurrency === toCurrency) return 1

  const rates = await fetchExchangeRates()
  // A rate the user set by hand wins over the live one
  return rateBetween(withCustomRates(rates, useAppStore.getState().settings.customRates), fromCurrency, toCurrency)
}

// Re-express every stored base-currency amount (transactions and budget limits) in a new base
// currency. Throws without touching anything if the rate isn't available.
export async function convertBaseCurrency(userId: string, oldBase: string, newBase: string): Promise<void> {
  if (oldBase === newBase) return

  const transactions = allFromStored('transactions', await db.transactions.where('userId').equals(userId).toArray())
  const budgets = allFromStored('budgets', await db.budgets.where('userId').equals(userId).toArray())
  if (transactions.length === 0 && budgets.length === 0) return

  const oldToNew = await getConversionRate(oldBase, newBase)
  if (oldToNew === null) throw new Error('Exchange rate unavailable')

  const now = nowISO()

  const convertedTransactions = transactions.map((txn) => {
    // Something paid in the new base currency gets its exact amount back; everything else
    // keeps the value it was recorded at, carried over at today's rate.
    const amountInBaseCurrency =
      txn.currency === newBase ? txn.amount : roundMoney(txn.amountInBaseCurrency * oldToNew)
    return {
      ...txn,
      amountInBaseCurrency,
      exchangeRate: txn.amount > 0 ? amountInBaseCurrency / txn.amount : 1,
      updatedAt: now,
      synced: false,
    }
  })

  const convertedBudgets = budgets.map((budget) => ({
    ...budget,
    monthlyLimit: roundMoney(budget.monthlyLimit * oldToNew),
    updatedAt: now,
    synced: false,
  }))

  await db.transaction('rw', db.transactions, db.budgets, db.syncQueue, async () => {
    await db.transactions.bulkPut(convertedTransactions.map((txn) => toStored('transactions', txn)))
    await db.budgets.bulkPut(convertedBudgets.map((budget) => toStored('budgets', budget)))
    for (const txn of convertedTransactions) await addToSyncQueue('transactions', 'update', txn.id, txn)
    for (const budget of convertedBudgets) await addToSyncQueue('budgets', 'update', budget.id, budget)
  })
}
