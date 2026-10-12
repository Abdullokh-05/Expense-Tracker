import { create } from 'zustand'
import type { RecurringTransaction } from '@/types'
import {
  getRecurringTransactions,
  createRecurringTransaction,
  updateRecurringTransaction,
  deleteRecurringTransaction,
} from '@/db/operations'
import { getCurrentUserId } from '@/store/appStore'
import { advanceByFrequency, todayDate } from '@/lib/utils'

interface RecurringStore {
  recurringTransactions: RecurringTransaction[]
  isLoading: boolean
  loadRecurringTransactions: () => Promise<void>
  addRecurringTransaction: (
    data: Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt' | 'synced'>
  ) => Promise<RecurringTransaction>
  toggleRecurringTransactionActive: (id: string, isActive: boolean) => Promise<void>
  removeRecurringTransaction: (id: string) => Promise<void>
}

export const useRecurringStore = create<RecurringStore>((set, get) => ({
  recurringTransactions: [],
  isLoading: false,

  loadRecurringTransactions: async () => {
    set({ isLoading: true })
    try {
      const recurringTransactions = await getRecurringTransactions(getCurrentUserId())
      set({ recurringTransactions })
    } finally {
      set({ isLoading: false })
    }
  },

  addRecurringTransaction: async (data) => {
    const rt = await createRecurringTransaction(data)
    set((state) => ({
      recurringTransactions: [rt, ...state.recurringTransactions],
    }))
    return rt
  },

  toggleRecurringTransactionActive: async (id, isActive) => {
    const patch: Partial<RecurringTransaction> = { isActive }
    const current = get().recurringTransactions.find((rt) => rt.id === id)
    // Resuming skips the occurrences that fell inside the pause instead of back-filling them
    if (isActive && current) {
      const today = todayDate()
      let nextRunDate = current.nextRunDate
      while (nextRunDate < today) nextRunDate = advanceByFrequency(nextRunDate, current.frequency)
      patch.nextRunDate = nextRunDate
    }

    await updateRecurringTransaction(id, patch)
    set((state) => ({
      recurringTransactions: state.recurringTransactions.map((rt) =>
        rt.id === id ? { ...rt, ...patch, updatedAt: new Date().toISOString() } : rt
      ),
    }))
  },

  removeRecurringTransaction: async (id) => {
    await deleteRecurringTransaction(id)
    set((state) => ({
      recurringTransactions: state.recurringTransactions.filter((rt) => rt.id !== id),
    }))
  },
}))
