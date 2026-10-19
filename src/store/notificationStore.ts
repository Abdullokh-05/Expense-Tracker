import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Notifications already seen. Ids describe the event (see lib/notifications.ts), so a
// limit crossed again next month is new again.
const MAX_READ_IDS = 300

interface NotificationStore {
  readIds: string[]
  markRead: (ids: string[]) => void
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      readIds: [],
      markRead: (ids) =>
        set((state) => {
          const fresh = ids.filter((id) => !state.readIds.includes(id))
          if (fresh.length === 0) return state
          return { readIds: [...state.readIds, ...fresh].slice(-MAX_READ_IDS) }
        }),
    }),
    { name: 'xarajat-notifications' }
  )
)
