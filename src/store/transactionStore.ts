import { create } from 'zustand'
import type { Transaction } from '@/types'
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/db/operations'
import { GUEST_USER_ID } from '@/lib/constants'

interface TransactionStore {
  transactions: Transaction[]
  isLoading: boolean
  userId: string
  loadTransactions: (filters?: Parameters<typeof getTransactions>[1]) => Promise<void>
  addTransaction: (data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'synced'>) => Promise<Transaction>
  editTransaction: (id: string, patch: Partial<Transaction>) => Promise<void>
  removeTransaction: (id: string) => Promise<void>
  setUserId: (id: string) => void
}

export const useTransactionStore = create<TransactionStore>((set, get) => ({
  transactions: [],
  isLoading: false,
  userId: GUEST_USER_ID,

  setUserId: (userId) => set({ userId }),

  loadTransactions: async (filters) => {
    set({ isLoading: true })
    try {
      const transactions = await getTransactions(get().userId, filters)
      set({ transactions })
    } finally {
      set({ isLoading: false })
    }
  },

  addTransaction: async (data) => {
    const transaction = await createTransaction(data)
    set((state) => ({ transactions: [transaction, ...state.transactions] }))
    return transaction
  },

  editTransaction: async (id, patch) => {
    await updateTransaction(id, patch)
    set((state) => ({
      transactions: state.transactions.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
      ),
    }))
  },

  removeTransaction: async (id) => {
    await deleteTransaction(id)
    set((state) => ({
      transactions: state.transactions.filter((t) => t.id !== id),
    }))
  },
}))
