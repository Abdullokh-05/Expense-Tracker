import { v4 as uuidv4 } from 'uuid'
import i18n from '@/lib/i18n'
import type { RecurringFrequency } from '@/types'

export function generateId(): string {
  return uuidv4()
}

export function nowISO(): string {
  return new Date().toISOString()
}

// =====================
// Calendar dates
// =====================
// Transaction dates are local calendar days stored as YYYY-MM-DD. Never derive them with
// toISOString(): it converts to UTC first and shifts the day for anyone not on Greenwich time.

export function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function todayDate(): string {
  return toDateString(new Date())
}

export function addDays(dateStr: string, days: number): string {
  const date = parseDateString(dateStr)
  date.setDate(date.getDate() + days)
  return toDateString(date)
}

// Same day of the month N months away, clamped to the month's last day (Jan 31 + 1 → Feb 28)
export function addMonths(dateStr: string, months: number): string {
  const date = parseDateString(dateStr)
  const day = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(day, lastDay))
  return toDateString(date)
}

export function daysBetween(from: string, to: string): number {
  const ms = parseDateString(to).getTime() - parseDateString(from).getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

// Next occurrence of a recurring transaction
export function advanceByFrequency(dateStr: string, frequency: RecurringFrequency): string {
  switch (frequency) {
    case 'weekly':
      return addDays(dateStr, 7)
    case 'monthly':
      return addMonths(dateStr, 1)
    case 'yearly':
      return addMonths(dateStr, 12)
  }
}

// =====================
// Date names
// =====================
// Browsers ship little or no Uzbek date data (Chrome prints "2026 M10 10"), so Uzbek month
// and weekday names are spelled out here; other languages use the browser's own.
const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
]
// Not just the first three letters: iyun and iyul would both become "iyu"
const UZ_MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek']
const UZ_WEEKDAYS_SHORT = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan']
const UZ_WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba']

const isUzbek = (locale: string) => locale.toLowerCase().startsWith('uz')
// English dates in the British order the design uses: "Monday, 12 October", "18 Oct"
const dateLocale = (locale: string) => (locale === 'en' ? 'en-GB' : locale)

export function formatMonthName(date: Date, locale: string, style: 'long' | 'short' = 'long'): string {
  if (isUzbek(locale)) {
    return (style === 'short' ? UZ_MONTHS_SHORT : UZ_MONTHS)[date.getMonth()]
  }
  return date.toLocaleDateString(locale, { month: style })
}

export function formatWeekdayShort(date: Date, locale: string): string {
  if (isUzbek(locale)) return UZ_WEEKDAYS_SHORT[date.getDay()]
  return date.toLocaleDateString(locale, { weekday: 'short' })
}

// "6 окт." / "6 Oct" / "6-okt"
function formatDayMonth(date: Date, locale: string): string {
  if (isUzbek(locale)) return `${date.getDate()}-${formatMonthName(date, locale, 'short')}`
  return date.toLocaleDateString(dateLocale(locale), { day: 'numeric', month: 'short' })
}

// "10 октября 2026 г." / "10 October 2026" / "10-oktabr, 2026"
function formatFullDate(date: Date, locale: string): string {
  if (isUzbek(locale)) return `${date.getDate()}-${formatMonthName(date, locale)}, ${date.getFullYear()}`
  return date.toLocaleDateString(dateLocale(locale), { day: 'numeric', month: 'long', year: 'numeric' })
}

// =====================
// Money
// =====================
const NO_DECIMAL_CURRENCIES = ['UZS', 'JPY', 'KRW', 'VND', 'IDR', 'CLP', 'HUF', 'ISK', 'PYG', 'RWF']

export function currencyDecimals(currency: string): number {
  return NO_DECIMAL_CURRENCIES.includes(currency.toUpperCase()) ? 0 : 2
}

// Round to the smallest unit the currency is displayed in
export function roundMoney(amount: number, currency: string): number {
  const factor = 10 ** currencyDecimals(currency)
  return Math.round(amount * factor) / factor
}

// Parses what was typed into a money field: spaces, a comma for decimals and a minus are fine
export function parseMoneyInput(text: string): number | null {
  // \s covers the non-breaking spaces amounts are shown with
  const cleaned = text.replace(/\s/g, '').replace('−', '-').replace(',', '.')
  if (cleaned === '' || cleaned === '-') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

// What hidden amounts show instead of the number
export const MASK = '••• •••'

const NBSP = ' '

// Symbols written before the number; any other currency is written after it (14 821 433 soʻm)
const PREFIX_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
  TRY: '₺',
}

const SUFFIX_SYMBOLS: Record<string, string> = {
  RUB: '₽',
  KZT: '₸',
}

export function currencySymbol(currency: string, locale = i18n.language): { symbol: string; before: boolean } {
  const code = currency.toUpperCase()
  if (code in PREFIX_SYMBOLS) return { symbol: PREFIX_SYMBOLS[code], before: true }
  if (code === 'UZS') return { symbol: locale.startsWith('ru') ? 'сум' : 'soʻm', before: false }
  return { symbol: SUFFIX_SYMBOLS[code] ?? code, before: false }
}

// The number alone: thousands split by non-breaking spaces, the decimal mark of the language
// (452.30 in English, 452,30 in Russian and Uzbek). Always positive.
export function formatNumber(amount: number, currency: string, locale = i18n.language): string {
  const decimals = currencyDecimals(currency)
  const [whole, fraction] = roundMoney(Math.abs(amount), currency).toFixed(decimals).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  if (!fraction) return grouped
  return grouped + (locale.startsWith('en') ? '.' : ',') + fraction
}

export interface MoneyParts {
  // A true minus (−) or a plus, or nothing
  sign: string
  number: string
  symbol: string
  symbolBefore: boolean
}

// Pieces of an amount, for layouts that size the number and the currency differently
export function moneyParts(
  amount: number,
  currency: string,
  { signed = false, locale = i18n.language }: { signed?: boolean; locale?: string } = {}
): MoneyParts {
  const number = formatNumber(amount, currency, locale)
  const isZero = roundMoney(Math.abs(amount), currency) === 0
  const sign = isZero ? '' : amount < 0 ? '−' : signed ? '+' : ''
  const { symbol, before } = currencySymbol(currency, locale)
  return { sign, number, symbol, symbolBefore: before }
}

interface FormatOptions {
  // Show "+" on positive amounts too
  signed?: boolean
  // Leave the currency out (lists in the main currency read better without it)
  symbol?: boolean
  locale?: string
}

// −14 821 433 soʻm, −$452.30, +1 900 000
export function formatAmount(amount: number, currency: string, options: FormatOptions = {}): string {
  const { signed = false, symbol: withSymbol = true, locale = i18n.language } = options
  const parts = moneyParts(amount, currency, { signed, locale })
  if (!withSymbol) return parts.sign + parts.number
  // The sign goes before the symbol: −$5.00, not $−5.00
  return parts.symbolBefore
    ? `${parts.sign}${parts.symbol}${parts.number}`
    : `${parts.sign}${parts.number}${NBSP}${parts.symbol}`
}

// In lists the main currency goes without its symbol; other currencies keep theirs
export function formatListAmount(
  amount: number,
  currency: string,
  baseCurrency: string,
  signed = false
): string {
  return formatAmount(amount, currency, { signed, symbol: currency !== baseCurrency || currency in PREFIX_SYMBOLS })
}

const COMPACT_UNITS: Record<'en' | 'ru' | 'uz', [string, string, string]> = {
  en: ['K', 'M', 'B'],
  ru: [' тыс.', ' млн', ' млрд'],
  uz: [' ming', ' mln', ' mlrd'],
}

// Short form for chart labels: 5 200 000 → "5.2M" / "5,2 млн" / "5,2 mln"
export function formatCompact(amount: number, locale = i18n.language): string {
  const lang = locale.startsWith('ru') ? 'ru' : isUzbek(locale) ? 'uz' : 'en'
  const sign = amount < 0 ? '−' : ''
  const abs = Math.abs(amount)
  const steps: [number, number][] = [[1e9, 2], [1e6, 1], [1e3, 0]]
  for (const [size, unit] of steps) {
    if (abs >= size) {
      const value = Math.round((abs / size) * 10) / 10
      const text = String(value).replace('.', lang === 'en' ? '.' : ',')
      return `${sign}${text}${COMPACT_UNITS[lang][unit]}`
    }
  }
  return sign + String(Math.round(abs))
}

// =====================
// Periods
// =====================
export type RangePeriod = 'today' | 'week' | 'month' | 'year'

// Get date range for a given period. offset 0 is the current period, -1 the one before it, etc.
// "week" is a rolling 7 days ending today; "month" and "year" are whole calendar periods.
export function getDateRange(period: RangePeriod, offset = 0): { from: string; to: string } {
  const now = new Date()
  const today = todayDate()

  switch (period) {
    case 'today': {
      const day = addDays(today, offset)
      return { from: day, to: day }
    }
    case 'week': {
      const to = addDays(today, offset * 7)
      return { from: addDays(to, -6), to }
    }
    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
      const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
      return { from: toDateString(first), to: toDateString(last) }
    }
    case 'year': {
      const year = now.getFullYear() + offset
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    }
  }
}

// Range to compare a period against. A period still in progress is compared with the same
// number of days of the previous one, so the 12th of the month isn't judged against a full month.
export function getComparisonRange(period: RangePeriod, offset = 0): { from: string; to: string } {
  const previous = getDateRange(period, offset - 1)
  if (offset !== 0 || period === 'today' || period === 'week') return previous

  const elapsedDays = daysBetween(getDateRange(period, 0).from, todayDate())
  const sameDay = addDays(previous.from, elapsedDays)
  return { from: previous.from, to: sameDay < previous.to ? sameDay : previous.to }
}

// Human label for a period: "Октябрь 2026", "6 окт. – 12 окт.", "2026"
export function formatPeriodLabel(
  period: RangePeriod,
  range: { from: string; to: string },
  locale = i18n.language
): string {
  const from = parseDateString(range.from)
  switch (period) {
    case 'today':
      return formatDate(range.from, locale)
    case 'week':
      return `${formatDayMonth(from, locale)} – ${formatDayMonth(parseDateString(range.to), locale)}`
    case 'month': {
      const label = isUzbek(locale)
        ? `${formatMonthName(from, locale)} ${from.getFullYear()}`
        : from.toLocaleDateString(locale, { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '') // "октябрь 2026 г."
      return label.charAt(0).toUpperCase() + label.slice(1)
    }
    case 'year':
      return String(from.getFullYear())
  }
}

// Group transactions by date
export function groupByDate<T extends { date: string }>(items: T[]): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const date = item.date
    if (!acc[date]) acc[date] = []
    acc[date].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

// Format date for display
export function formatDate(dateStr: string, locale = i18n.language): string {
  const today = todayDate()
  if (dateStr === today) return i18n.t('common.today')
  if (dateStr === addDays(today, -1)) return i18n.t('common.yesterday')

  return formatFullDate(parseDateString(dateStr), locale)
}

// History day headings: "Today", "Yesterday", "Monday, 12 October" (the year only when it isn't this one)
export function formatDayLabel(dateStr: string, locale = i18n.language): string {
  const today = todayDate()
  if (dateStr === today) return i18n.t('common.today')
  if (dateStr === addDays(today, -1)) return i18n.t('common.yesterday')

  const date = parseDateString(dateStr)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  if (isUzbek(locale)) {
    const weekday = UZ_WEEKDAYS[date.getDay()]
    const day = `${date.getDate()}-${formatMonthName(date, locale)}`
    return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${day}${sameYear ? '' : `, ${date.getFullYear()}`}`
  }
  // Built from two parts so every language gets the comma: "Monday, 12 October"
  const weekday = date.toLocaleDateString(dateLocale(locale), { weekday: 'long' })
  const day = date.toLocaleDateString(dateLocale(locale), {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${day}`
}

// "18 Oct" / "18 окт." / "18-okt"
export function formatShortDate(dateStr: string, locale = i18n.language): string {
  return formatDayMonth(parseDateString(dateStr), locale)
}

// Calculate percentage change
export function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

// Clamp a number between min and max
export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max)
}

// Debounce utility
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}
