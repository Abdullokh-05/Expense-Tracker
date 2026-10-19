import React, { useEffect } from 'react'
import { Outlet, useLocation, useSearchParams, NavLink } from 'react-router-dom'
import { TabBar } from './TabBar'
import { ToastContainer } from '@/components/ui/Toast'
import { IOSInstallPrompt } from './IOSInstallPrompt'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'
import { useAppStore } from '@/store/appStore'
import { useUiStore } from '@/store/uiStore'
import { applyTheme } from '@/lib/theme'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { WifiOff, House, ChartColumn, Gift, Settings2, Sun, Moon, Monitor, Plus, Leaf } from 'lucide-react'
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

  const changeTheme = (theme: AppTheme) => {
    setTheme(theme)
    applyTheme(theme)
  }

  // N opens a new entry on a computer, unless something is being typed
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || isOnboarding) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      e.preventDefault()
      openAddSheet()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openAddSheet, isOnboarding])

  const NAV_ITEMS = [
    { to: '/', icon: House, labelKey: 'nav.home', matches: (p: string) => p === '/' || p.startsWith('/accounts') },
    { to: '/stats', icon: ChartColumn, labelKey: 'nav.stats', matches: (p: string) => p.startsWith('/stats') },
    { to: '/wishlist', icon: Gift, labelKey: 'nav.wishlist', matches: (p: string) => p.startsWith('/wishlist') },
    { to: '/settings', icon: Settings2, labelKey: 'nav.settings', matches: (p: string) => p.startsWith('/settings') },
  ]

  return (
    <div className="desk min-h-dvh text-ink flex flex-col lg:flex-row">

      {/* ── DESKTOP SIDEBAR: floating glass over the pine wash ── */}
      {!isOnboarding && (
        <aside className="side hidden lg:flex" aria-label={t('nav.sidebarLabel')}>
          <div className="wordmark">
            <span className="mark" aria-hidden="true">
              <Leaf size={18} strokeWidth={1.75} />
            </span>
            <span>Xarajat</span>
          </div>

          <button type="button" className="btn primary lg wide justify-between" onClick={() => openAddSheet()}>
            <span className="flex items-center gap-2">
              <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
              {t('nav.newEntry')}
            </span>
            <kbd className="kbd" aria-hidden="true">N</kbd>
          </button>

          <nav className="nav">
            {NAV_ITEMS.map(({ to, icon: Icon, labelKey, matches }) => {
              const on = matches(location.pathname)
              return (
                <NavLink key={to} to={to} className={`nav-item${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
                  <Icon size={20} strokeWidth={on ? 2.1 : 1.75} aria-hidden="true" />
                  <span>{t(labelKey)}</span>
                </NavLink>
              )
            })}
          </nav>

          <div className="side-foot">
            <SegmentedControl<AppTheme>
              label={t('settings.theme')}
              value={settings.theme}
              onChange={changeTheme}
              options={[
                { value: 'light', label: <Sun size={18} strokeWidth={1.75} aria-label={t('settings.themeLight')} /> },
                { value: 'dark', label: <Moon size={18} strokeWidth={1.75} aria-label={t('settings.themeDark')} /> },
                { value: 'system', label: <Monitor size={18} strokeWidth={1.75} aria-label={t('sets.auto')} /> },
              ]}
            />
          </div>
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
