import React, { useEffect } from 'react'
import { Outlet, useLocation, useSearchParams, NavLink } from 'react-router-dom'
import { TabBar } from './TabBar'
import { ToastContainer } from '@/components/ui/Toast'
import { IOSInstallPrompt } from './IOSInstallPrompt'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'
import { useAppStore } from '@/store/appStore'
import { useUiStore } from '@/store/uiStore'
import { applyTheme, isDarkTheme } from '@/lib/theme'
import { WifiOff, House, ChartColumn, Gift, Settings2, Sun, Moon, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppTheme } from '@/types'

export const AppShell: React.FC = () => {
  const isOnline = useAppStore((s) => s.isOnline)
  const { settings, setTheme } = useAppStore()
  const { addRequest, openAddSheet, closeAddSheet } = useUiStore()
  const { t } = useTranslation()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const isOnboarding = location.pathname === '/onboarding'

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  // Deep link from the home-screen shortcut: /add → /?quick=true opens the add sheet
  useEffect(() => {
    if (searchParams.get('quick') !== 'true') return
    openAddSheet({
      type: searchParams.get('type') === 'income' ? 'income' : 'expense',
      categoryId: searchParams.get('category') ?? undefined,
    })
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, openAddSheet])

  // What is on screen right now ("system" resolves to the OS setting), so the toggle
  // always flips what the user actually sees
  const isDark = isDarkTheme(settings.theme)

  const toggleTheme = () => {
    const nextTheme: AppTheme = isDark ? 'light' : 'dark'
    setTheme(nextTheme)
    applyTheme(nextTheme)
  }

  const NAV_ITEMS = [
    { to: '/', icon: House, labelKey: 'nav.home' },
    { to: '/stats', icon: ChartColumn, labelKey: 'nav.stats' },
    { to: '/wishlist', icon: Gift, labelKey: 'nav.wishlist' },
    { to: '/settings', icon: Settings2, labelKey: 'nav.settings' },
  ]

  return (
    <div className="min-h-dvh bg-bg text-ink flex flex-col lg:flex-row">

      {/* ── DESKTOP SIDEBAR (restyled with the desktop layouts) ── */}
      {!isOnboarding && (
        <aside className="hidden lg:flex flex-col w-64 bg-surface border-r border-line h-dvh sticky top-0 p-6 flex-shrink-0 justify-between">
          <div className="space-y-8">
            <div className="flex items-center gap-2.5 px-2">
              <span className="text-2xl">💸</span>
              <span className="t-head">Xarajat</span>
            </div>

            <button type="button" className="btn primary wide" onClick={() => openAddSheet()}>
              <Plus size={18} /> {t('nav.addEntry')}
            </button>

            <nav className="flex flex-col gap-1" aria-label={t('nav.sidebarLabel')}>
              {NAV_ITEMS.map(({ to, icon: Icon, labelKey }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 min-h-[44px] px-3 rounded-ctl text-[16px] font-medium transition-colors ${
                      isActive ? 'bg-accent-soft text-accent-text font-semibold' : 'text-ink hover:bg-fill'
                    }`
                  }
                >
                  <Icon size={20} strokeWidth={1.75} />
                  <span>{t(labelKey)}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          <button type="button" onClick={toggleTheme} className="btn secondary wide justify-between">
            <span className="flex items-center gap-2">
              {isDark ? <Moon size={16} /> : <Sun size={16} />}
              <span>{isDark ? t('settings.darkTheme') : t('settings.lightTheme')}</span>
            </span>
          </button>
        </aside>
      )}

      {/* ── MAIN CONTENT CONTAINER ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Offline indicator */}
        {!isOnline && !isOnboarding && (
          <div
            className="sticky top-0 z-50 flex items-center gap-2 px-4 py-2.5 t-cap bg-warn-soft text-warn"
            style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}
          >
            <WifiOff size={13} />
            <span>{t('common.offlineHint')}</span>
          </div>
        )}

        {/* Bottom padding keeps the last content clear of the floating tab bar */}
        <main className="flex-1 w-full max-w-[1300px] mx-auto px-4 md:px-8 pt-[max(16px,env(safe-area-inset-top))] pb-[calc(104px+env(safe-area-inset-bottom))] lg:pt-10 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {!isOnboarding && <TabBar />}

      {/* The add-entry sheet, shared by the tab bar's + and every "add" button */}
      <AddTransactionSheet
        isOpen={addRequest !== null}
        onClose={closeAddSheet}
        prefilledType={addRequest?.type ?? 'expense'}
        prefilledCategory={addRequest?.categoryId}
      />

      {/* Toast notifications */}
      <ToastContainer />

      {/* iOS Install Prompt */}
      {!isOnboarding && <IOSInstallPrompt />}
    </div>
  )
}
