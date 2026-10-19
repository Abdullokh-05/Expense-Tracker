import type { CustomRate } from '@/types'
import { currencySymbol, formatAmount } from '@/lib/utils'
import { SUPPORTED_CURRENCIES } from '@/lib/constants'

// Rates are a USD-based table: 1 USD = table[X] units of X. Any pair converts through it.
export type RateTable = Record<string, number>

// The live table with the user's own rates laid over it. A rate the user set always wins.
export function withCustomRates(live: RateTable | null, custom: CustomRate[] | undefined): RateTable | null {
  if (!custom?.length) return live
  const table: RateTable = { ...(live ?? {}) }
  for (const { code, quote, rate } of custom) {
    if (code === quote || !(rate > 0)) continue
    if (!table[quote]) {
      // Without live rates the table starts from the user's own: the quote currency is the pivot
      if (live) continue
      table[quote] = 1
    }
    table[code] = table[quote] / rate
  }
  return table
}

// How many units of `to` one unit of `from` is worth, or null when either rate is unknown
export function rateBetween(table: RateTable | null, from: string, to: string): number | null {
  if (from === to) return 1
  const fromRate = table?.[from]
  const toRate = table?.[to]
  return fromRate && toRate ? toRate / fromRate : null
}

// The user's own rate for a currency against the main one, if they set one
export function findCustomRate(custom: CustomRate[] | undefined, code: string, base: string): CustomRate | undefined {
  return custom?.find((item) => item.code === code && item.quote === base)
}

// How many of `code` to show so the rate reads well: "1 $ = 12 600 soʻm", but
// "100 000 soʻm = $7.94" rather than "1 soʻm = $0.00"
export function rateUnit(rate: number): number {
  let unit = 1
  while (rate * unit < 1 && unit < 1e9) unit *= 10
  return unit
}

function groupDigits(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

// "1 $ = 12 600 soʻm"
export function formatRateLine(code: string, base: string, rate: number): string {
  const unit = rateUnit(rate)
  return `${groupDigits(unit)} ${currencySymbol(code).symbol} = ${formatAmount(rate * unit, base)}`
}

// The amount of `code` a rate is typed for, written out: "1", "100 000"
export function formatRateUnit(rate: number): string {
  return groupDigits(rateUnit(rate))
}

// "US dollar" in the UI language; the browser may not know Uzbek names, so English fills in
export function currencyName(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'currency' }).of(code)
    if (name && name !== code) return name.charAt(0).toUpperCase() + name.slice(1)
  } catch {
    // An unknown locale falls through to the English name
  }
  return SUPPORTED_CURRENCIES.find((c) => c.code === code)?.name ?? code
}
