import { create } from 'zustand'
import type { Account } from '@/types'
import { getAccounts, createAccount, updateAccount } from '@/db/operations'
import { getCurrentUserId } from '@/store/appStore'

interface AccountStore {
  accounts: Account[]
  isLoading: boolean
  loadAccounts: () => Promise<void>
  addAccount: (data: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'synced'>) => Promise<Account>
  editAccount: (id: string, patch: Partial<Account>) => Promise<void>
  setWishlistFund: (id: string | null) => Promise<void>
}

export const useAccountStore = create<AccountStore>((set, get) => ({
  accounts: [],
  isLoading: false,

  loadAccounts: async () => {
    set({ isLoading: true })
    try {
      const accounts = await getAccounts(getCurrentUserId())
      set({ accounts })
    } finally {
      set({ isLoading: false })
    }
  },

  addAccount: async (data) => {
    const account = await createAccount(data)
    set((state) => ({ accounts: [...state.accounts, account] }))
    if (account.isWishlistFund) await get().setWishlistFund(account.id)
    return account
  },

  editAccount: async (id, patch) => {
    await updateAccount(id, patch)
    set((state) => ({
      accounts: state.accounts.map((a) =>
        a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a
      ),
    }))
  },

  // Only one account at a time holds the wishlist savings; null clears it
  setWishlistFund: async (id) => {
    for (const account of get().accounts) {
      const shouldBeFund = account.id === id
      if (account.isWishlistFund !== shouldBeFund) {
        await get().editAccount(account.id, { isWishlistFund: shouldBeFund })
      }
    }
  },
}))
