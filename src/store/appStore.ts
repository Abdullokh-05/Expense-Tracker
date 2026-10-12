import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings, AppLanguage, AppTheme } from '@/types'
import { GUEST_USER_ID } from '@/lib/constants'
import i18n from '@/lib/i18n'

const DEFAULT_SETTINGS: AppSettings = {
  userId: GUEST_USER_ID,
  baseCurrency: 'UZS',
  language: 'ru',
  theme: 'system',
  aiEnabled: true,
  notifyReminderEnabled: false,
  notifyReminderTime: '21:00',
  notifySummaryDailyEnabled: false,
  notifySummaryWeeklyEnabled: false,
  notifyBudgetAlertEnabled: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  onboardingCompleted: false,
  recurringAutoCreate: true,
}

interface AppStore {
  settings: AppSettings
  isOnline: boolean
  setSettings: (settings: Partial<AppSettings>) => void
  setCurrency: (currency: string) => void
  setLanguage: (language: AppLanguage) => void
  setTheme: (theme: AppTheme) => void
  setAIEnabled: (enabled: boolean) => void
  setOnboardingCompleted: (completed: boolean) => void
  setUserId: (userId: string) => void
  setOnline: (online: boolean) => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      isOnline: navigator.onLine,

      setSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),

      setCurrency: (currency) =>
        set((state) => ({ settings: { ...state.settings, baseCurrency: currency } })),

      setLanguage: (language) => {
        i18n.changeLanguage(language)
        set((state) => ({ settings: { ...state.settings, language } }))
      },

      setTheme: (theme) =>
        set((state) => ({ settings: { ...state.settings, theme } })),

      setAIEnabled: (aiEnabled) =>
        set((state) => ({ settings: { ...state.settings, aiEnabled } })),

      setOnboardingCompleted: (onboardingCompleted) =>
        set((state) => ({ settings: { ...state.settings, onboardingCompleted } })),

      setUserId: (userId) =>
        set((state) => ({ settings: { ...state.settings, userId } })),

      setOnline: (isOnline) => set({ isOnline }),
    }),
    {
      name: 'xarajat-app-settings',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
)
