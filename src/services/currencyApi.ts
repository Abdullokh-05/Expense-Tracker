import { db } from '@/db/schema'
import type { ExchangeRate } from '@/types'
import { nowISO } from '@/lib/utils'

const API_URL = 'https://open.er-api.com/v6/latest'

export async function fetchExchangeRates(baseCurrency: string): Promise<Record<string, number>> {
  try {
    // 1. Check if we have cached rates in IndexedDB
    const cached = await db.exchangeRates.get(baseCurrency)
    if (cached) {
      const ageMs = Date.now() - new Date(cached.lastUpdated).getTime()
      const isExpired = ageMs > 1000 * 60 * 60 * 24 // older than 24 hours
      if (!isExpired) {
        console.log(`Using cached currency rates for ${baseCurrency}`)
        return cached.rates
      }
    }

    // 2. Fetch fresh rates if online
    if (navigator.onLine) {
      console.log(`Fetching fresh exchange rates for ${baseCurrency} from API`)
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
    }
  } catch (error) {
    console.error('Error fetching exchange rates:', error)
  }

  // Fallback to existing cache if offline/API fails, or hardcoded stubs
  const cachedFallback = await db.exchangeRates.get(baseCurrency)
  if (cachedFallback) {
    return cachedFallback.rates
  }

  // hardcoded fallback stubs
  const defaultStubs: Record<string, number> = {
    UZS: 1,
    USD: 1 / 12650,
    EUR: 1 / 13800,
    RUB: 1 / 140,
  }

  if (baseCurrency === 'UZS') {
    return {
      UZS: 1,
      USD: 12650,
      EUR: 13800,
      RUB: 140,
    }
  }

  return defaultStubs
}

export async function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<{ amount: number; rate: number }> {
  if (fromCurrency === toCurrency) {
    return { amount, rate: 1 }
  }

  const rates = await fetchExchangeRates(toCurrency)
  const rate = rates[fromCurrency]
  
  if (rate) {
    // API returns rates as 1 toCurrency = X fromCurrency
    // To convert fromCurrency -> toCurrency: amount / rate
    const converted = amount / rate
    return { amount: converted, rate: 1 / rate }
  }

  return { amount, rate: 1 }
}
