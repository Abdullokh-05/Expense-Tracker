// Every amount has at most two decimal places, whatever the currency (23,67 soʻm, $4.50).
// The database keeps amounts as whole hundredths ("tiyin": 23,67 is stored as 2367), so what
// is saved never picks up floating-point noise; the app works with them as ordinary numbers.

export const MONEY_DECIMALS = 2
const SCALE = 10 ** MONEY_DECIMALS

// 23.67 → 2367. toPrecision first, so 1.005 (really 1.00499999…) rounds to 101 as written,
// and halves round away from zero for negative amounts too.
export function toMinorUnits(amount: number): number {
  const scaled = Number((Math.abs(amount) * SCALE).toPrecision(15))
  const minor = Math.round(scaled)
  return amount < 0 ? -minor : minor
}

// 2367 → 23.67
export function fromMinorUnits(minor: number): number {
  return minor / SCALE
}

// An amount rounded to whole hundredths: 0.1 + 0.2 → 0.3
export function roundMoney(amount: number): number {
  return fromMinorUnits(toMinorUnits(amount))
}

// Sums amounts without floating-point drift
export function sumMoney(amounts: Iterable<number>): number {
  let minor = 0
  for (const amount of amounts) minor += toMinorUnits(amount)
  return fromMinorUnits(minor)
}

// Cleans what is being typed into an amount field: digits and one decimal separator (a dot
// or a comma, kept as a dot), at most two digits after it. Extra separators and extra decimal
// digits are dropped, so they can't be typed. A leading minus is kept only when allowed.
export function sanitizeMoneyInput(text: string, { allowNegative = false } = {}): string {
  // \s covers the non-breaking spaces amounts are shown with
  let compact = text.replace(/\s/g, '').replace('−', '-')
  // A pasted "1,000,000.50" or "1.000.000,50": there one mark only groups thousands and the
  // other is the decimal one. Anything else ("23.6," while typing) keeps the first mark.
  if (/^-?\d{1,3}(,\d{3})+\.\d*$/.test(compact)) compact = compact.split(',').join('')
  else if (/^-?\d{1,3}(\.\d{3})+,\d*$/.test(compact)) compact = compact.split('.').join('')
  const negative = allowNegative && compact.startsWith('-')
  let whole = ''
  let fraction: string | null = null
  for (const char of compact) {
    if (char >= '0' && char <= '9') {
      if (fraction === null) whole += char
      else if (fraction.length < MONEY_DECIMALS) fraction += char
    } else if ((char === '.' || char === ',') && fraction === null) {
      fraction = ''
    }
  }
  const number = fraction === null ? whole : `${whole || '0'}.${fraction}`
  return (negative ? '-' : '') + number
}

// The amount in a money field, or null while it's empty or just a minus.
// Accepts what sanitizeMoneyInput gives and what people type: "23.67", "23,67", "1 000 000,50".
export function parseMoneyInput(text: string, { allowNegative = true } = {}): number | null {
  const cleaned = sanitizeMoneyInput(text, { allowNegative })
  if (cleaned === '' || cleaned === '-') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? roundMoney(value) : null
}
