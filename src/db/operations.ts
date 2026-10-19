import { db } from './schema'
import type {
  Transaction,
  Category,
  Budget,
  RecurringTransaction,
  Account,
  WishlistItem,
  TransactionTemplate,
  AppSettings,
  SyncQueueItem,
  SyncOperation,
  SyncTable,
} from '@/types'
import { DEFAULT_CATEGORIES, DEFAULT_INCOME_CATEGORIES, LEGACY_CATEGORY_COLORS } from '@/lib/constants'
import { generateId, nowISO, todayDate } from '@/lib/utils'

// =====================
// Settings
// =====================
export async function getSettings(userId = 'guest'): Promise<AppSettings | null> {
  return (await db.settings.get(userId)) ?? null
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put(settings)
}

export async function updateSettings(userId: string, patch: Partial<AppSettings>): Promise<void> {
  await db.settings.update(userId, patch)
}

// =====================
// Categories
// =====================
export async function getCategories(userId = 'guest'): Promise<Category[]> {
  return db.categories.where('userId').equals(userId).toArray()
}

export async function getCategoryById(id: string): Promise<Category | undefined> {
  return db.categories.get(id)
}

export async function createCategory(data: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'synced'>): Promise<Category> {
  const now = nowISO()
  const category: Category = {
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    synced: false,
  }
  await db.categories.add(category)
  await addToSyncQueue('categories', 'create', category.id, category)
  return category
}

export async function updateCategory(id: string, patch: Partial<Category>): Promise<void> {
  const updated = { ...patch, updatedAt: nowISO(), synced: false }
  await db.categories.update(id, updated)
  const full = await db.categories.get(id)
  if (full) await addToSyncQueue('categories', 'update', id, full)
}

export async function archiveCategory(id: string): Promise<void> {
  await updateCategory(id, { isArchived: true })
}

export async function seedDefaultCategories(userId: string): Promise<void> {
  const existing = await db.categories.where('userId').equals(userId).count()
  if (existing > 0) return
  const now = nowISO()
  const defaults: Category[] = DEFAULT_CATEGORIES.map((c) => ({
    ...c,
    id: generateId(),
    userId,
    kind: 'expense',
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    synced: false,
  }))
  await db.categories.bulkAdd(defaults)
}

// =====================
// Accounts
// =====================
export async function getAccounts(userId = 'guest'): Promise<Account[]> {
  const accounts = await db.accounts.where('userId').equals(userId).toArray()
  return accounts.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export async function createAccount(data: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'synced'>): Promise<Account> {
  const now = nowISO()
  const account: Account = { ...data, id: generateId(), createdAt: now, updatedAt: now, synced: false }
  await db.accounts.add(account)
  await addToSyncQueue('accounts', 'create', account.id, account)
  return account
}

export async function updateAccount(id: string, patch: Partial<Account>): Promise<void> {
  await db.accounts.update(id, { ...patch, updatedAt: nowISO(), synced: false })
  const full = await db.accounts.get(id)
  if (full) await addToSyncQueue('accounts', 'update', id, full)
}

// =====================
// Wishlist
// =====================
export async function getWishlistItems(userId = 'guest'): Promise<WishlistItem[]> {
  return db.wishlistItems.where('userId').equals(userId).toArray()
}

export async function createWishlistItem(
  data: Omit<WishlistItem, 'id' | 'createdAt' | 'updatedAt' | 'synced'>
): Promise<WishlistItem> {
  const now = nowISO()
  const item: WishlistItem = { ...data, id: generateId(), createdAt: now, updatedAt: now, synced: false }
  await db.wishlistItems.add(item)
  await addToSyncQueue('wishlist_items', 'create', item.id, item)
  return item
}

export async function updateWishlistItem(id: string, patch: Partial<WishlistItem>): Promise<void> {
  await db.wishlistItems.update(id, { ...patch, updatedAt: nowISO(), synced: false })
  const full = await db.wishlistItems.get(id)
  if (full) await addToSyncQueue('wishlist_items', 'update', id, full)
}

export async function deleteWishlistItem(id: string): Promise<void> {
  await db.wishlistItems.delete(id)
  await addToSyncQueue('wishlist_items', 'delete', id, { id })
}

// =====================
// Templates
// =====================
export async function getTemplates(userId = 'guest'): Promise<TransactionTemplate[]> {
  const templates = await db.templates.where('userId').equals(userId).toArray()
  return templates.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export async function createTemplate(
  data: Omit<TransactionTemplate, 'id' | 'createdAt' | 'updatedAt' | 'synced'>
): Promise<TransactionTemplate> {
  const now = nowISO()
  const template: TransactionTemplate = { ...data, id: generateId(), createdAt: now, updatedAt: now, synced: false }
  await db.templates.add(template)
  await addToSyncQueue('templates', 'create', template.id, template)
  return template
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.templates.delete(id)
  await addToSyncQueue('templates', 'delete', id, { id })
}

// =====================
// Defaults and upgrades
// =====================
// Makes sure the user has what every screen assumes: income categories, at least one account,
// and an account on every transaction. Safe to run on each start: it only fills what is missing,
// which is how data from before accounts existed (or from an old backup) gets brought up to date.
export async function ensureDefaults(
  userId: string,
  baseCurrency: string,
  accountNames: { cash: string; card: string }
): Promise<void> {
  const now = nowISO()

  const categories = await db.categories.where('userId').equals(userId).toArray()
  if (!categories.some((c) => c.kind === 'income')) {
    await db.categories.bulkAdd(
      DEFAULT_INCOME_CATEGORIES.map((c) => ({
        ...c,
        id: generateId(),
        userId,
        kind: 'income' as const,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
        synced: false,
      }))
    )
  }

  // Built-in categories still in the bright colours they were first made with take the
  // calmer ones; a colour the user picked is left alone
  for (const category of categories) {
    const calmer = category.isDefault ? LEGACY_CATEGORY_COLORS[category.color.toLowerCase()] : undefined
    if (calmer) await updateCategory(category.id, { color: calmer })
  }

  let accounts = await getAccounts(userId)
  if (accounts.length === 0) {
    const base = { userId, currency: baseCurrency, startingBalance: 0, includeInTotal: true, isWishlistFund: false, isArchived: false }
    // Created one after the other so their order (card first) is stable
    await createAccount({ ...base, name: accountNames.card, type: 'card' })
    await createAccount({ ...base, name: accountNames.cash, type: 'cash' })
    accounts = await getAccounts(userId)
  }

  const cash = accounts.find((a) => a.type === 'cash' && !a.isArchived)
  const fallback = accounts.find((a) => a.type === 'card' && !a.isArchived) ?? accounts.find((a) => !a.isArchived) ?? accounts[0]

  await db.transactions
    .where('userId')
    .equals(userId)
    .filter((txn) => !txn.accountId)
    .modify((txn) => {
      txn.accountId = (txn.paymentMethod === 'cash' ? cash : undefined)?.id ?? fallback.id
      txn.toAccountId = null
      txn.toAmount = null
    })

  await db.recurringTransactions
    .where('userId')
    .equals(userId)
    .filter((rt) => !rt.accountId)
    .modify({ accountId: fallback.id })
}

// =====================
// Transactions
// =====================
export async function getTransactions(userId = 'guest', filters?: {
  categoryId?: string
  type?: Transaction['type']
  from?: string
  to?: string
  status?: 'confirmed' | 'pending' | 'skipped'
}): Promise<Transaction[]> {
  let results = await db.transactions.where('userId').equals(userId).toArray()
  // Newest day first; within a day, the most recently added first
  results.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))

  if (filters?.categoryId) results = results.filter(t => t.categoryId === filters.categoryId)
  if (filters?.type) results = results.filter(t => t.type === filters.type)
  if (filters?.status) results = results.filter(t => t.status === filters.status)
  if (filters?.from) results = results.filter(t => t.date >= filters.from!)
  if (filters?.to) results = results.filter(t => t.date <= filters.to!)

  return results
}

export async function getTransactionById(id: string): Promise<Transaction | undefined> {
  return db.transactions.get(id)
}

export async function createTransaction(
  data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'synced'>
): Promise<Transaction> {
  const now = nowISO()
  const transaction: Transaction = {
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    synced: false,
  }
  await db.transactions.add(transaction)
  await addToSyncQueue('transactions', 'create', transaction.id, transaction)
  return transaction
}

export async function updateTransaction(id: string, patch: Partial<Transaction>): Promise<void> {
  const updated = { ...patch, updatedAt: nowISO(), synced: false }
  await db.transactions.update(id, updated)
  const full = await db.transactions.get(id)
  if (full) await addToSyncQueue('transactions', 'update', id, full)
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id)
  await addToSyncQueue('transactions', 'delete', id, { id })
}

export async function getPendingTransactions(userId = 'guest'): Promise<Transaction[]> {
  return db.transactions
    .where('userId').equals(userId)
    .filter(t => t.status === 'pending')
    .toArray()
}

// =====================
// Budgets
// =====================
export async function getBudgets(userId = 'guest'): Promise<Budget[]> {
  return db.budgets.where('userId').equals(userId).toArray()
}

export async function getBudgetByCategoryId(userId: string, categoryId: string): Promise<Budget | undefined> {
  const results = await db.budgets
    .where('userId').equals(userId)
    .filter(b => b.categoryId === categoryId)
    .toArray()
  return results[0]
}

export async function upsertBudget(data: Omit<Budget, 'id' | 'createdAt' | 'updatedAt' | 'synced'>): Promise<Budget> {
  const existing = await getBudgetByCategoryId(data.userId, data.categoryId)
  if (existing) {
    await db.budgets.update(existing.id, { ...data, updatedAt: nowISO(), synced: false })
    const updated = (await db.budgets.get(existing.id))!
    await addToSyncQueue('budgets', 'update', existing.id, updated)
    return updated
  }
  const now = nowISO()
  const budget: Budget = { ...data, id: generateId(), createdAt: now, updatedAt: now, synced: false }
  await db.budgets.add(budget)
  await addToSyncQueue('budgets', 'create', budget.id, budget)
  return budget
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id)
  await addToSyncQueue('budgets', 'delete', id, { id })
}

// =====================
// Recurring Transactions
// =====================
export async function getRecurringTransactions(userId = 'guest'): Promise<RecurringTransaction[]> {
  return db.recurringTransactions.where('userId').equals(userId).toArray()
}

export async function createRecurringTransaction(
  data: Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt' | 'synced'>
): Promise<RecurringTransaction> {
  const now = nowISO()
  const rt: RecurringTransaction = { ...data, id: generateId(), createdAt: now, updatedAt: now, synced: false }
  await db.recurringTransactions.add(rt)
  await addToSyncQueue('recurring_transactions', 'create', rt.id, rt)
  return rt
}

export async function updateRecurringTransaction(id: string, patch: Partial<RecurringTransaction>): Promise<void> {
  await db.recurringTransactions.update(id, { ...patch, updatedAt: nowISO(), synced: false })
  const full = await db.recurringTransactions.get(id)
  if (full) await addToSyncQueue('recurring_transactions', 'update', id, full)
}

export async function deleteRecurringTransaction(id: string): Promise<void> {
  await db.recurringTransactions.delete(id)
  await addToSyncQueue('recurring_transactions', 'delete', id, { id })
}

// =====================
// Sync Queue
// =====================
export async function addToSyncQueue(
  table: SyncTable,
  operation: SyncOperation,
  recordId: string,
  payload: any
): Promise<void> {
  const item: SyncQueueItem = {
    id: generateId(),
    table,
    operation,
    recordId,
    payload,
    createdAt: nowISO(),
    retries: 0,
  }
  await db.syncQueue.add(item)
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  return db.syncQueue.orderBy('createdAt').toArray()
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  await db.syncQueue.delete(id)
}

export async function incrementSyncQueueRetry(id: string): Promise<void> {
  const item = await db.syncQueue.get(id)
  if (item) await db.syncQueue.update(id, { retries: item.retries + 1 })
}

// =====================
// Analytics helpers
// =====================
export async function getSpendingByDateRange(
  userId: string,
  from: string,
  to: string
): Promise<Transaction[]> {
  return getTransactions(userId, { from, to, status: 'confirmed' })
}

export async function getTodayTotal(userId: string, type: Transaction['type'] = 'expense'): Promise<number> {
  const today = todayDate()
  const txns = await getTransactions(userId, { from: today, to: today, type, status: 'confirmed' })
  return txns.reduce((sum, t) => sum + t.amountInBaseCurrency, 0)
}

// Auto-suggest category based on note text
export async function suggestCategory(userId: string, noteText: string): Promise<Category | null> {
  if (!noteText.trim()) return null
  const allTxns = await db.transactions
    .where('userId').equals(userId)
    .filter(t => t.note !== null && t.categoryId !== null)
    .toArray()
  const lower = noteText.toLowerCase()
  const matches: Record<string, number> = {}
  for (const t of allTxns) {
    if (!t.note || !t.categoryId) continue
    const words = t.note.toLowerCase().split(/\s+/)
    const inputWords = lower.split(/\s+/)
    const overlap = words.filter(w => inputWords.some(iw => w.includes(iw) || iw.includes(w))).length
    if (overlap > 0) {
      matches[t.categoryId] = (matches[t.categoryId] ?? 0) + overlap
    }
  }
  if (Object.keys(matches).length === 0) return null
  const topId = Object.entries(matches).sort((a, b) => b[1] - a[1])[0][0]
  return (await db.categories.get(topId)) ?? null
}
