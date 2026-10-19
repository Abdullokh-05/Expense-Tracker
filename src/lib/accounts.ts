import type { Account, Transaction } from '@/types'
import { roundMoney } from '@/lib/utils'

// Converts an amount between currencies at today's rates; null when no rate is known
export type Converter = (amount: number, from: string, to: string) => number | null

// How one transaction changes one account's balance, in that account's currency
function accountDelta(
  txn: Transaction,
  account: Account,
  baseCurrency: string,
  convert: Converter
): number {
  if (txn.status !== 'confirmed') return 0

  // A transaction is normally in its account's currency. Records made before accounts existed
  // may not be; those fall back to the base-currency value they were recorded at.
  const leaving = () => {
    if (txn.currency === account.currency) return txn.amount
    if (account.currency === baseCurrency) return txn.amountInBaseCurrency
    return convert(txn.amountInBaseCurrency, baseCurrency, account.currency) ?? 0
  }

  if (txn.type === 'transfer') {
    let delta = 0
    if (txn.accountId === account.id) delta -= leaving()
    if (txn.toAccountId === account.id) delta += txn.toAmount ?? txn.amount
    return delta
  }

  if (txn.accountId !== account.id) return 0
  return txn.type === 'income' ? leaving() : -leaving()
}

// Current balance of every account, each in its own currency: starting balance plus everything since
export function getAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
  baseCurrency: string,
  convert: Converter
): Record<string, number> {
  const balances: Record<string, number> = {}
  for (const account of accounts) {
    const movement = transactions.reduce(
      (sum, txn) => sum + accountDelta(txn, account, baseCurrency, convert),
      0
    )
    balances[account.id] = roundMoney(account.startingBalance + movement, account.currency)
  }
  return balances
}

// Sum of account balances in the base currency. `complete` is false when an account in a
// foreign currency had to be left out because its exchange rate is unknown.
export function sumBalances(
  accounts: Account[],
  balances: Record<string, number>,
  baseCurrency: string,
  convert: Converter
): { total: number; complete: boolean } {
  let total = 0
  let complete = true
  for (const account of accounts) {
    const inBase = convert(balances[account.id] ?? 0, account.currency, baseCurrency)
    if (inBase === null) complete = false
    else total += inBase
  }
  return { total: roundMoney(total, baseCurrency), complete }
}

// Accounts shown in pickers and lists
export function activeAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => !account.isArchived)
}

// How an account card looks: savings for the wishlist fund, otherwise its type
export type AccountLook = 'card' | 'cash' | 'savings'

export function accountLook(account: Account): AccountLook {
  return account.isWishlistFund ? 'savings' : account.type
}

const LOOK_COLORS: Record<AccountLook, string> = {
  card: '#3F7CC4',
  cash: '#3E9A62',
  savings: '#C08A2E',
}

// The colour that tints an account's card and icon
export function accountColor(account: Account): string {
  return LOOK_COLORS[accountLook(account)]
}
