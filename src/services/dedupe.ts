import { db } from '@/db/schema'
import type { Table } from 'dexie'
import { fromStored } from '@/db/money'
import { addToSyncQueue } from '@/db/operations'
import type { Account, Budget, Category, RecurringTransaction, Transaction, TransactionTemplate } from '@/types'

// Two copies of the app (the home-screen app and Safari, or two phones) each made their own
// built-in categories and starting accounts, with different ids; once synced, both show up.
// This folds each such pair into one:
// - categories with the same name, kind and parent become the one with the most entries
//   (the oldest on a tie); entries, limits, planned payments, templates and subcategories
//   move to it
// - accounts with the same name, type and currency: a copy with no entries and no starting
//   balance is removed (one with money in it is a real account and stays)
// Every change goes to the sync queue, so the server and other devices follow.
export async function mergeDuplicates(userId: string): Promise<number> {
  const now = new Date().toISOString()
  let merged = 0

  const transactions = (await db.transactions.where('userId').equals(userId).toArray()) as Transaction[]
  const uses = new Map<string, number>()
  const count = (id: string | null | undefined) => id && uses.set(id, (uses.get(id) ?? 0) + 1)
  for (const txn of transactions) {
    count(txn.categoryId)
    count(txn.subcategoryId)
    count(txn.accountId)
    count(txn.toAccountId)
  }

  const keeperOf = <T extends { id: string; createdAt: string }>(group: T[]) =>
    [...group].sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.createdAt.localeCompare(b.createdAt))[0]

  // ── Categories: top-level ones first, so subcategories are compared under their merged parent ──
  for (const level of ['top', 'sub'] as const) {
    const categories = (await db.categories.where('userId').equals(userId).toArray()) as Category[]
    const groups = new Map<string, Category[]>()
    for (const category of categories) {
      if ((level === 'top') === Boolean(category.parentId)) continue
      const key = `${category.kind ?? 'expense'}|${category.parentId ?? ''}|${category.name.trim().toLowerCase()}`
      groups.set(key, [...(groups.get(key) ?? []), category])
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const keeper = keeperOf(group)
      for (const dupe of group.filter((c) => c.id !== keeper.id)) {
        await moveCategory(userId, dupe.id, keeper.id, now)
        await db.categories.delete(dupe.id)
        await addToSyncQueue('categories', 'delete', dupe.id, { id: dupe.id })
        merged++
      }
    }
  }

  // ── Accounts ──
  const accounts = (await db.accounts.where('userId').equals(userId).toArray()) as Account[]
  const accountGroups = new Map<string, Account[]>()
  for (const account of accounts) {
    const key = `${account.type}|${account.currency}|${account.name.trim().toLowerCase()}`
    accountGroups.set(key, [...(accountGroups.get(key) ?? []), account])
  }
  for (const group of accountGroups.values()) {
    if (group.length < 2) continue
    const keeper = keeperOf(group)
    for (const dupe of group.filter((a) => a.id !== keeper.id)) {
      if ((uses.get(dupe.id) ?? 0) > 0 || dupe.startingBalance !== 0) continue
      // Planned payments and templates set on the empty copy now use the kept one
      await repoint(db.recurringTransactions, 'recurring_transactions', 'recurringTransactions', userId, (r: RecurringTransaction) => r.accountId === dupe.id, { accountId: keeper.id }, now)
      await repoint(db.templates, 'templates', 'templates', userId, (r: TransactionTemplate) => r.accountId === dupe.id, { accountId: keeper.id }, now)
      // Its roles (default for new entries, wishlist savings) pass to the kept one
      const roles: Partial<Account> = {}
      if (dupe.isDefault && !keeper.isDefault) roles.isDefault = true
      if (dupe.isWishlistFund && !keeper.isWishlistFund) roles.isWishlistFund = true
      if (Object.keys(roles).length > 0) {
        await repoint(db.accounts, 'accounts', 'accounts', userId, (a: Account) => a.id === keeper.id, roles, now)
      }
      await db.accounts.delete(dupe.id)
      await addToSyncQueue('accounts', 'delete', dupe.id, { id: dupe.id })
      merged++
    }
  }

  return merged
}

// Everything that points at one category now points at another
async function moveCategory(userId: string, from: string, to: string, now: string): Promise<void> {
  await repoint(db.transactions, 'transactions', 'transactions', userId, (r: Transaction) => r.categoryId === from, { categoryId: to }, now)
  await repoint(db.transactions, 'transactions', 'transactions', userId, (r: Transaction) => r.subcategoryId === from, { subcategoryId: to }, now)
  await repoint(db.recurringTransactions, 'recurring_transactions', 'recurringTransactions', userId, (r: RecurringTransaction) => r.categoryId === from, { categoryId: to }, now)
  await repoint(db.recurringTransactions, 'recurring_transactions', 'recurringTransactions', userId, (r: RecurringTransaction) => r.subcategoryId === from, { subcategoryId: to }, now)
  await repoint(db.templates, 'templates', 'templates', userId, (r: TransactionTemplate) => r.categoryId === from, { categoryId: to }, now)
  await repoint(db.templates, 'templates', 'templates', userId, (r: TransactionTemplate) => r.subcategoryId === from, { subcategoryId: to }, now)
  await repoint(db.categories, 'categories', null, userId, (r: Category) => r.parentId === from, { parentId: to }, now)
  // A limit moves over unless the kept category already has one
  const budgets = (await db.budgets.where('userId').equals(userId).toArray()) as Budget[]
  const keeperHasLimit = budgets.some((b) => b.categoryId === to)
  for (const budget of budgets.filter((b) => b.categoryId === from)) {
    if (keeperHasLimit) {
      await db.budgets.delete(budget.id)
      await addToSyncQueue('budgets', 'delete', budget.id, { id: budget.id })
    } else {
      await repoint(db.budgets, 'budgets', 'budgets', userId, (b: Budget) => b.id === budget.id, { categoryId: to }, now)
    }
  }
}

type MoneyName = 'transactions' | 'accounts' | 'budgets' | 'recurringTransactions' | 'templates'

// Changes the matching records and queues each one for the server
async function repoint<T extends { id: string; userId: string }>(
  table: Table<T, string>,
  remote: 'transactions' | 'categories' | 'budgets' | 'recurring_transactions' | 'accounts' | 'templates',
  money: MoneyName | null,
  userId: string,
  match: (record: T) => boolean,
  patch: Record<string, unknown>,
  now: string
): Promise<void> {
  const records = await table.where('userId').equals(userId).filter(match).toArray()
  for (const record of records) {
    const next = { ...record, ...patch, updatedAt: now, synced: false } as T
    await table.put(next)
    await addToSyncQueue(remote, 'update', record.id, money ? fromStored(money, next) : next)
  }
}
