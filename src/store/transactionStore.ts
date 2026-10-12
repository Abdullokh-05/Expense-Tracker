import { create } from 'zustand'
import type { Transaction } from '@/types'
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/db/operations'
import { getCurrentUserId } from '@/store/appStore'

interface TransactionStore {
  // Every transaction of the current user, newest first. Pages filter this in memory,
  // so they all see the same data no matter which one loaded it.
  transactions: Transaction[]
  isLoading: boolean
  loadTransactions: () => Promise<void>
  addTransaction: (data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'synced'>) => Promise<Transaction>
  editTransaction: (id: string, patch: Partial<Transaction>) => Promise<void>
  removeTransaction: (id: string) => Promise<void>
}

function sortNewestFirst(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  )
}

let loadSequence = 0

export const useTransactionStore = create<TransactionStore>((set) => ({
  transactions: [],
  isLoading: false,

  loadTransactions: async () => {
    const sequence = ++loadSequence
    set({ isLoading: true })
    try {
      const transactions = await getTransactions(getCurrentUserId())
      // A newer load started while this one was reading; let that one win
      if (sequence === loadSequence) set({ transactions })
    } finally {
      if (sequence === loadSequence) set({ isLoading: false })
    }
  },

  addTransaction: async (data) => {
    const transaction = await createTransaction(data)
    set((state) => ({
      transactions: sortNewestFirst([transaction, ...state.transactions.filter((t) => t.id !== transaction.id)]),
    }))
    return transaction
  },

  editTransaction: async (id, patch) => {
    await updateTransaction(id, patch)
    set((state) => ({
      transactions: sortNewestFirst(
        state.transactions.map((t) =>
          t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
        )
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
