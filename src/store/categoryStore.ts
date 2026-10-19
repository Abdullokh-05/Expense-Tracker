import { create } from 'zustand'
import type { Category } from '@/types'
import {
  getCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  seedDefaultCategories,
} from '@/db/operations'
import { sortCategories } from '@/lib/categories'
import { getCurrentUserId } from '@/store/appStore'

interface CategoryStore {
  categories: Category[]
  isLoading: boolean
  loadCategories: () => Promise<void>
  addCategory: (data: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'synced'>) => Promise<Category>
  editCategory: (id: string, patch: Partial<Category>) => Promise<void>
  archiveCategoryById: (id: string) => Promise<void>
  reorderCategories: (orderedIds: string[]) => Promise<void>
  seedDefaults: () => Promise<void>
  getActiveCategories: () => Category[]
}

export const useCategoryStore = create<CategoryStore>((set, get) => ({
  categories: [],
  isLoading: false,

  loadCategories: async () => {
    set({ isLoading: true })
    try {
      const categories = sortCategories(await getCategories(getCurrentUserId()))
      set({ categories })
    } finally {
      set({ isLoading: false })
    }
  },

  addCategory: async (data) => {
    const category = await createCategory(data)
    set((state) => ({ categories: sortCategories([...state.categories, category]) }))
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

  // Saves a new order for one list (outcome or income): the first id gets 0. The list
  // reorders on screen straight away; the database catches up after.
  reorderCategories: async (orderedIds) => {
    const changed = orderedIds.filter((id, index) => get().categories.find((c) => c.id === id)?.sortOrder !== index)
    const now = new Date().toISOString()
    set((state) => ({
      categories: sortCategories(
        state.categories.map((c) =>
          orderedIds.includes(c.id) ? { ...c, sortOrder: orderedIds.indexOf(c.id), updatedAt: now } : c
        )
      ),
    }))
    try {
      await Promise.all(changed.map((id) => updateCategory(id, { sortOrder: orderedIds.indexOf(id) })))
    } catch (error) {
      await get().loadCategories()
      throw error
    }
  },

  seedDefaults: async () => {
    await seedDefaultCategories(getCurrentUserId())
    await get().loadCategories()
  },

  getActiveCategories: () => get().categories.filter((c) => !c.isArchived),
}))
