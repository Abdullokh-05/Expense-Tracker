import { useCategoryStore } from '@/store/categoryStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useRecurringStore } from '@/store/recurringStore'

// Re-read everything from IndexedDB for the current user: on startup, and after anything that
// rewrites data behind the stores' backs (sign-in, restore from backup, currency conversion).
export async function reloadAllData(): Promise<void> {
  await Promise.all([
    useCategoryStore.getState().loadCategories(),
    useTransactionStore.getState().loadTransactions(),
    useBudgetStore.getState().loadBudgets(),
    useRecurringStore.getState().loadRecurringTransactions(),
  ])
}
