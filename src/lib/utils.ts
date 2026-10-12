import { v4 as uuidv4 } from 'uuid'

export function generateId(): string {
  return uuidv4()
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function todayDate(): string {
  return new Date().toISOString().split('T')[0]
}

// Format currency amount based on currency code
export function formatAmount(amount: number, currency: string): string {
  const noDecimalCurrencies = ['UZS', 'JPY', 'KRW', 'VND', 'IDR', 'CLP', 'HUF', 'ISK', 'PYG', 'RWF']
  const isNoDecimal = noDecimalCurrencies.includes(currency.toUpperCase())
  
  const formatted = new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    minimumFractionDigits: isNoDecimal ? 0 : 2,
    maximumFractionDigits: isNoDecimal ? 0 : 2,
  }).format(amount)

  const symbols: Record<string, string> = {
    UZS: "so'm",
    USD: '$',
    EUR: '€',
    RUB: '₽',
    GBP: '£',
    KZT: '₸',
    TRY: '₺',
    CNY: '¥',
    AED: 'AED',
  }

  const symbol = symbols[currency.toUpperCase()] ?? currency
  const postfix = ['UZS'].includes(currency.toUpperCase())
  
  return postfix ? `${formatted} ${symbol}` : `${symbol}${formatted}`
}

// Get date range for a given period
export function getDateRange(period: 'today' | 'week' | 'month' | 'year'): { from: string; to: string } {
  const now = new Date()
  const to = todayDate()
  
  switch (period) {
    case 'today':
      return { from: to, to }
    case 'week': {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      return { from: d.toISOString().split('T')[0], to }
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: d.toISOString().split('T')[0], to }
    }
    case 'year': {
      const d = new Date(now.getFullYear(), 0, 1)
      return { from: d.toISOString().split('T')[0], to }
    }
  }
}

// Get previous period date range for comparison
export function getPreviousPeriodRange(period: 'week' | 'month' | 'year'): { from: string; to: string } {
  const now = new Date()
  
  switch (period) {
    case 'week': {
      const to = new Date(now)
      to.setDate(to.getDate() - 7)
      const from = new Date(to)
      from.setDate(from.getDate() - 6)
      return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] }
    }
    case 'month': {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
      return {
        from: prevMonth.toISOString().split('T')[0],
        to: lastDay.toISOString().split('T')[0],
      }
    }
    case 'year': {
      return {
        from: `${now.getFullYear() - 1}-01-01`,
        to: `${now.getFullYear() - 1}-12-31`,
      }
    }
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
export function formatDate(dateStr: string, locale = 'ru-RU'): string {
  const date = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  
  if (dateStr === todayDate()) {
    return locale === 'ru' ? 'Сегодня' : locale === 'uz' ? 'Bugun' : 'Today'
  }
  if (dateStr === yesterday.toISOString().split('T')[0]) {
    return locale === 'ru' ? 'Вчера' : locale === 'uz' ? 'Kecha' : 'Yesterday'
  }
  
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
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
