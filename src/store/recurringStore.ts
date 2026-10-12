import { create } from 'zustand'
import type { RecurringTransaction } from '@/types'
import {
  getRecurringTransactions,
  createRecurringTransaction,
  updateRecurringTransaction,
  deleteRecurringTransaction,
} from '@/db/operations'
import { GUEST_USER_ID } from '@/lib/constants'

interface RecurringStore {
  recurringTransactions: RecurringTransaction[]
  isLoading: boolean
  userId: string
  loadRecurringTransactions: () => Promise<void>
  addRecurringTransaction: (
    data: Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt' | 'synced'>
  ) => Promise<RecurringTransaction>
  toggleRecurringTransactionActive: (id: string, isActive: boolean) => Promise<void>
  removeRecurringTransaction: (id: string) => Promise<void>
  setUserId: (id: string) => void
}

export const useRecurringStore = create<RecurringStore>((set, get) => ({
  recurringTransactions: [],
  isLoading: false,
  userId: GUEST_USER_ID,

  setUserId: (userId) => set({ userId }),

  loadRecurringTransactions: async () => {
    set({ isLoading: true })
    try {
      const recurringTransactions = await getRecurringTransactions(get().userId)
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
    await updateRecurringTransaction(id, { isActive })
    set((state) => ({
      recurringTransactions: state.recurringTransactions.map((rt) =>
        rt.id === id ? { ...rt, isActive, updatedAt: new Date().toISOString() } : rt
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
