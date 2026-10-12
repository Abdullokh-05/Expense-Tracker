import { create } from 'zustand'
import type { Budget } from '@/types'
import { getBudgets, upsertBudget, deleteBudget } from '@/db/operations'
import { getCurrentUserId } from '@/store/appStore'

interface BudgetStore {
  budgets: Budget[]
  isLoading: boolean
  loadBudgets: () => Promise<void>
  setBudgetLimit: (categoryId: string, limit: number) => Promise<Budget>
  removeBudget: (id: string) => Promise<void>
}

export const useBudgetStore = create<BudgetStore>((set) => ({
  budgets: [],
  isLoading: false,

  loadBudgets: async () => {
    set({ isLoading: true })
    try {
      const budgets = await getBudgets(getCurrentUserId())
      set({ budgets })
    } finally {
      set({ isLoading: false })
    }
  },

  setBudgetLimit: async (categoryId, limit) => {
    const budget = await upsertBudget({
      userId: getCurrentUserId(),
      categoryId,
      monthlyLimit: limit,
      period: 'monthly',
    })

    // Update local state
    set((state) => {
      const exists = state.budgets.some((b) => b.categoryId === categoryId)
      const updatedBudgets = exists
        ? state.budgets.map((b) => (b.categoryId === categoryId ? budget : b))
        : [...state.budgets, budget]
      return { budgets: updatedBudgets }
    })

    return budget
  },

  removeBudget: async (id) => {
    await deleteBudget(id)
    set((state) => ({
      budgets: state.budgets.filter((b) => b.id !== id),
    }))
  },
}))
