import { create } from 'zustand'
import type { WishlistItem } from '@/types'
import {
  getWishlistItems,
  createWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
} from '@/db/operations'
import { getCurrentUserId } from '@/store/appStore'

interface WishlistStore {
  items: WishlistItem[]
  isLoading: boolean
  loadItems: () => Promise<void>
  addItem: (data: Omit<WishlistItem, 'id' | 'createdAt' | 'updatedAt' | 'synced'>) => Promise<WishlistItem>
  editItem: (id: string, patch: Partial<WishlistItem>) => Promise<void>
  removeItem: (id: string) => Promise<void>
}

// Most important first; among equals, the one wanted longest
function sortByImportance(items: WishlistItem[]): WishlistItem[] {
  return [...items].sort(
    (a, b) => b.importance - a.importance || a.createdAt.localeCompare(b.createdAt)
  )
}

export const useWishlistStore = create<WishlistStore>((set) => ({
  items: [],
  isLoading: false,

  loadItems: async () => {
    set({ isLoading: true })
    try {
      const items = sortByImportance(await getWishlistItems(getCurrentUserId()))
      set({ items })
    } finally {
      set({ isLoading: false })
    }
  },

  addItem: async (data) => {
    const item = await createWishlistItem(data)
    set((state) => ({ items: sortByImportance([...state.items, item]) }))
    return item
  },

  editItem: async (id, patch) => {
    await updateWishlistItem(id, patch)
    set((state) => ({
      items: sortByImportance(
        state.items.map((item) =>
          item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
        )
      ),
    }))
  },

  removeItem: async (id) => {
    await deleteWishlistItem(id)
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
  },
}))
