import { create } from 'zustand'
import type { Budget } from '@/types'
import { getBudgets, upsertBudget, deleteBudget } from '@/db/operations'
import { GUEST_USER_ID } from '@/lib/constants'

interface BudgetStore {
  budgets: Budget[]
  isLoading: boolean
  userId: string
  loadBudgets: () => Promise<void>
  setBudgetLimit: (categoryId: string, limit: number) => Promise<Budget>
  removeBudget: (id: string) => Promise<void>
  setUserId: (id: string) => void
}

export const useBudgetStore = create<BudgetStore>((set, get) => ({
  budgets: [],
  isLoading: false,
  userId: GUEST_USER_ID,

  setUserId: (userId) => set({ userId }),

  loadBudgets: async () => {
    set({ isLoading: true })
    try {
      const budgets = await getBudgets(get().userId)
      set({ budgets })
    } finally {
      set({ isLoading: false })
    }
  },

  setBudgetLimit: async (categoryId, limit) => {
    const budget = await upsertBudget({
      userId: get().userId,
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
