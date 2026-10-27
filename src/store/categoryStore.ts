import { create } from 'zustand'
import type { Category } from '@/types'
import {
  getCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  deleteCategoryMovingEntries,
  deleteSubcategory,
  seedDefaultCategories,
} from '@/db/operations'
import { findOtherCategory, getCategoryKind, otherCategorySeed, sortCategories } from '@/lib/categories'
import { getCurrentUserId } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useRecurringStore } from '@/store/recurringStore'
import { useTemplateStore } from '@/store/templateStore'

interface CategoryStore {
  categories: Category[]
  isLoading: boolean
  loadCategories: () => Promise<void>
  addCategory: (data: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'synced'>) => Promise<Category>
  editCategory: (id: string, patch: Partial<Category>) => Promise<void>
  archiveCategoryById: (id: string) => Promise<void>
  reorderCategories: (orderedIds: string[]) => Promise<void>
  // Removes a subcategory; its entries stay on the parent
  removeSubcategory: (id: string) => Promise<void>
  // Removes a category, its subcategories and limit; its entries move to "Other" of its kind
  removeCategory: (id: string) => Promise<void>
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
    // Subcategories wear their parent's colour
    const children = patch.color ? get().categories.filter((c) => c.parentId === id && c.color !== patch.color) : []
    await updateCategory(id, patch)
    await Promise.all(children.map((child) => updateCategory(child.id, { color: patch.color })))
    const now = new Date().toISOString()
    set((state) => ({
      categories: state.categories.map((c) =>
        c.id === id
          ? { ...c, ...patch, updatedAt: now }
          : children.some((child) => child.id === c.id)
            ? { ...c, color: patch.color!, updatedAt: now }
            : c
      ),
    }))
  },

  removeSubcategory: async (id) => {
    await deleteSubcategory(getCurrentUserId(), id)
    await Promise.all([get().loadCategories(), useTransactionStore.getState().loadTransactions()])
  },

  removeCategory: async (id) => {
    const category = get().categories.find((c) => c.id === id)
    if (!category) return
    const kind = getCategoryKind(category)
    // "Other" takes the entries; if the user has lost it, it comes back first
    const other =
      findOtherCategory(get().categories, kind) ??
      (await get().addCategory({ ...otherCategorySeed(kind), userId: getCurrentUserId(), kind, isDefault: true }))
    await deleteCategoryMovingEntries(getCurrentUserId(), id, other.id)
    await Promise.all([
      get().loadCategories(),
      useTransactionStore.getState().loadTransactions(),
      useBudgetStore.getState().loadBudgets(),
      useRecurringStore.getState().loadRecurringTransactions(),
      useTemplateStore.getState().loadTemplates(),
    ])
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
