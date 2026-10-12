import { create } from 'zustand'
import type { Category } from '@/types'
import {
  getCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  seedDefaultCategories,
} from '@/db/operations'
import { GUEST_USER_ID } from '@/lib/constants'

interface CategoryStore {
  categories: Category[]
  isLoading: boolean
  userId: string
  loadCategories: () => Promise<void>
  addCategory: (data: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'synced'>) => Promise<Category>
  editCategory: (id: string, patch: Partial<Category>) => Promise<void>
  archiveCategoryById: (id: string) => Promise<void>
  seedDefaults: () => Promise<void>
  setUserId: (id: string) => void
  getActiveCategories: () => Category[]
}

export const useCategoryStore = create<CategoryStore>((set, get) => ({
  categories: [],
  isLoading: false,
  userId: GUEST_USER_ID,

  setUserId: (userId) => set({ userId }),

  loadCategories: async () => {
    set({ isLoading: true })
    try {
      const categories = await getCategories(get().userId)
      set({ categories })
    } finally {
      set({ isLoading: false })
    }
  },

  addCategory: async (data) => {
    const category = await createCategory(data)
    set((state) => ({ categories: [...state.categories, category] }))
    return category
  },

  editCategory: async (id, patch) => {
    await updateCategory(id, patch)
    set((state) => ({
      categories: state.categories.map((c) =>
        c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c
      ),
    }))
  },

  archiveCategoryById: async (id) => {
    await archiveCategory(id)
    set((state) => ({
      categories: state.categories.map((c) =>
        c.id === id ? { ...c, isArchived: true, updatedAt: new Date().toISOString() } : c
      ),
    }))
  },

  seedDefaults: async () => {
    await seedDefaultCategories(get().userId)
    await get().loadCategories()
  },

  getActiveCategories: () => get().categories.filter((c) => !c.isArchived),
}))
