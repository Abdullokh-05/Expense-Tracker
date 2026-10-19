import { create } from 'zustand'
import type { TransactionType } from '@/types'
import { useAppStore } from '@/store/appStore'

// What the add-entry sheet should start with when it opens
interface AddRequest {
  type?: TransactionType
  categoryId?: string
}

interface UiStore {
  // The add-entry sheet is shared by the whole app (the tab bar's + opens it); null when closed
  addRequest: AddRequest | null
  openAddSheet: (request?: AddRequest) => void
  closeAddSheet: () => void
  // The eye on the Total balance card: every amount shows as ••• ••• while this is on
  amountsHidden: boolean
  toggleAmountsHidden: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  addRequest: null,
  openAddSheet: (request = {}) => set({ addRequest: request }),
  closeAddSheet: () => set({ addRequest: null }),
  // Settings › Appearance can start every session with amounts hidden
  amountsHidden: Boolean(useAppStore.getState().settings.hideAmountsOnOpen),
  toggleAmountsHidden: () => set((state) => ({ amountsHidden: !state.amountsHidden })),
}))
