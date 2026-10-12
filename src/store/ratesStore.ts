import { useCallback } from 'react'
import { create } from 'zustand'
import { fetchExchangeRates } from '@/services/currencyApi'
import type { Converter } from '@/lib/accounts'

interface RatesStore {
  // USD-based exchange rates (1 USD = rates[X]); null until loaded, or if none are available
  rates: Record<string, number> | null
  loadRates: () => Promise<void>
}

export const useRatesStore = create<RatesStore>((set) => ({
  rates: null,

  loadRates: async () => {
    const rates = await fetchExchangeRates().catch(() => null)
    if (rates) set({ rates })
  },
}))

function convertWith(rates: Record<string, number> | null, amount: number, from: string, to: string): number | null {
  if (from === to) return amount
  const fromRate = rates?.[from]
  const toRate = rates?.[to]
  return fromRate && toRate ? (amount * toRate) / fromRate : null
}

// Converter bound to the latest loaded rates, for use while rendering
export function useConverter(): Converter {
  const rates = useRatesStore((s) => s.rates)
  return useCallback((amount, from, to) => convertWith(rates, amount, from, to), [rates])
}

// Same, for code that runs outside React
export function getConverter(): Converter {
  return (amount, from, to) => convertWith(useRatesStore.getState().rates, amount, from, to)
}
