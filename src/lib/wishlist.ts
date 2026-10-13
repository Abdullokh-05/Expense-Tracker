import type { WishImportance, WishlistItem } from '@/types'
import type { Converter } from '@/lib/accounts'

export const IMPORTANCE_LEVELS: WishImportance[] = [3, 2, 1]

// Translation key for each importance level
export const importanceKey = (importance: WishImportance) =>
  importance === 3 ? 'wishlist.importanceHigh' : importance === 2 ? 'wishlist.importanceMedium' : 'wishlist.importanceLow'

// Only ordinary web links are kept; anything else (javascript:, data:) is dropped
export function safeLink(link: string | null): string | null {
  const trimmed = link?.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export interface WishProgress {
  item: WishlistItem
  // Price in the base currency; null when its exchange rate is unknown
  priceInBase: number | null
  // How much of the savings is set against this item, in the base currency
  covered: number
}

// Spreads the savings over the wanted items in order (most important first): each item takes
// what it needs from what is left, so the list shows how far down the savings reach.
export function allocateSavings(
  wanted: WishlistItem[],
  savingsInBase: number,
  baseCurrency: string,
  convert: Converter
): WishProgress[] {
  let remaining = Math.max(0, savingsInBase)
  return wanted.map((item) => {
    const priceInBase = convert(item.price, item.currency, baseCurrency)
    const covered = priceInBase === null ? 0 : Math.min(remaining, priceInBase)
    remaining -= covered
    return { item, priceInBase, covered }
  })
}
