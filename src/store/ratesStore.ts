import { useCallback, useMemo } from 'react'
import { create } from 'zustand'
import { db } from '@/db/schema'
import { fetchExchangeRates } from '@/services/currencyApi'
import { useAppStore } from '@/store/appStore'
import { rateBetween, withCustomRates } from '@/lib/rates'
import type { RateTable } from '@/lib/rates'
import type { Converter } from '@/lib/accounts'

interface RatesStore {
  // Live USD-based exchange rates (1 USD = rates[X]); null until loaded, or if none are available
  rates: RateTable | null
  // When those rates were fetched
  updatedAt: string | null
  loadRates: () => Promise<void>
}

export const useRatesStore = create<RatesStore>((set) => ({
  rates: null,
  updatedAt: null,

  loadRates: async () => {
    const rates = await fetchExchangeRates().catch(() => null)
    if (!rates) return
    const cached = await db.exchangeRates.get('USD').catch(() => undefined)
    set({ rates, updatedAt: cached?.lastUpdated ?? null })
  },
}))

function convertWith(table: RateTable | null, amount: number, from: string, to: string): number | null {
  const rate = rateBetween(table, from, to)
  return rate === null ? null : amount * rate
}

// The rates every conversion uses: live ones with the user's own laid over them
export function useRateTable(): RateTable | null {
  const rates = useRatesStore((s) => s.rates)
  const custom = useAppStore((s) => s.settings.customRates)
  return useMemo(() => withCustomRates(rates, custom), [rates, custom])
}

// Converter bound to the latest rates, for use while rendering
export function useConverter(): Converter {
  const table = useRateTable()
  return useCallback((amount, from, to) => convertWith(table, amount, from, to), [table])
}

// Same, for code that runs outside React
export function getConverter(): Converter {
  return (amount, from, to) =>
    convertWith(
      withCustomRates(useRatesStore.getState().rates, useAppStore.getState().settings.customRates),
      amount,
      from,
      to
    )
}
