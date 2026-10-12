import i18n from '@/lib/i18n'
import { ensureDefaults } from '@/db/operations'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useRecurringStore } from '@/store/recurringStore'
import { useAccountStore } from '@/store/accountStore'
import { useWishlistStore } from '@/store/wishlistStore'

let queue: Promise<void> = Promise.resolve()

// Re-read everything from IndexedDB for the current user: on startup, and after anything that
// rewrites data behind the stores' backs (sign-in, restore from backup, currency conversion).
// Missing defaults (accounts, income categories) are filled in first. Calls run one after
// another: two at once (React StrictMode runs effects twice) would both create the defaults.
export function reloadAllData(): Promise<void> {
  queue = queue.catch(() => undefined).then(reload)
  return queue
}

async function reload(): Promise<void> {
  const { userId, baseCurrency } = useAppStore.getState().settings
  await ensureDefaults(userId, baseCurrency, {
    cash: i18n.t('accounts.defaultCash'),
    card: i18n.t('accounts.defaultCard'),
  })

  await Promise.all([
    useCategoryStore.getState().loadCategories(),
    useTransactionStore.getState().loadTransactions(),
    useBudgetStore.getState().loadBudgets(),
    useRecurringStore.getState().loadRecurringTransactions(),
    useAccountStore.getState().loadAccounts(),
    useWishlistStore.getState().loadItems(),
  ])
}
