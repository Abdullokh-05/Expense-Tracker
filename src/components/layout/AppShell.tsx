import React, { useEffect } from 'react'
import { Outlet, useLocation, NavLink } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { ToastContainer } from '@/components/ui/Toast'
import { IOSInstallPrompt } from './IOSInstallPrompt'
import { useAppStore } from '@/store/appStore'
import { applyTheme, isDarkTheme } from '@/lib/theme'
import { WifiOff, Home, History, MessageSquare, BarChart2, Settings, Sun, Moon, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppTheme } from '@/types'

export const AppShell: React.FC = () => {
  const isOnline = useAppStore((s) => s.isOnline)
  const { settings, setTheme } = useAppStore()
  const { t } = useTranslation()
  const location = useLocation()
  const isOnboarding = location.pathname === '/onboarding'

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  // What is on screen right now ("system" resolves to the OS setting), so the toggle
  // always flips what the user actually sees
  const isDark = isDarkTheme(settings.theme)

  const toggleTheme = () => {
    const nextTheme: AppTheme = isDark ? 'light' : 'dark'
    setTheme(nextTheme)
    applyTheme(nextTheme)
  }

  const NAV_ITEMS = [
    { to: '/', icon: Home, labelKey: 'nav.home' },
    { to: '/history', icon: History, labelKey: 'nav.history' },
    { to: '/ai-chat', icon: MessageSquare, labelKey: 'nav.aiChat' },
    { to: '/reports', icon: BarChart2, labelKey: 'nav.reports' },
    { to: '/budgets', icon: Sparkles, labelKey: 'budgets.title' },
    { to: '/settings', icon: Settings, labelKey: 'nav.settings' },
  ]

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] transition-colors duration-200 flex flex-col lg:flex-row">

      {/* ── DESKTOP SIDEBAR ── */}
      {!isOnboarding && (
        <aside className="hidden lg:flex flex-col w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] h-screen sticky top-0 p-6 flex-shrink-0 justify-between">
          <div className="space-y-8">
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-2">
              <span className="text-2xl">💸</span>
              <span className="serif-heading text-2xl font-bold tracking-tight">
                Xarajat
              </span>
            </div>

            {/* Links */}
            <nav className="flex flex-col gap-1.5" aria-label={t('nav.sidebarLabel')}>
              {NAV_ITEMS.map(({ to, icon: Icon, labelKey }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                      isActive
                        ? 'bg-[var(--color-surface-2)] text-[var(--color-text-primary)] shadow-sm border-[var(--color-border)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]/50 border-transparent'
                    }`
                  }
                >
                  <Icon size={18} />
                  <span>{t(labelKey)}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Theme switcher */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-between gap-2 px-3 py-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <span className="flex items-center gap-2">
              {isDark ? <Moon size={16} /> : <Sun size={16} />}
              <span>{isDark ? t('settings.darkTheme') : t('settings.lightTheme')}</span>
            </span>
            <span className="text-[10px] uppercase opacity-60">{t('common.toggle')}</span>
          </button>
        </aside>
      )}

      {/* ── MOBILE / TABLET HEADER ── */}
      {!isOnboarding && (
        <header className="lg:hidden flex items-center justify-between px-5 py-4 bg-[var(--color-surface)] border-b border-[var(--color-border)] sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <span className="text-xl">💸</span>
            <span className="serif-heading text-xl font-bold tracking-tight">
              Xarajat
            </span>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label={t('settings.toggleTheme')}
          >
            {isDark ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </header>
      )}

      {/* ── MAIN CONTENT CONTAINER ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Offline indicator */}
        {!isOnline && !isOnboarding && (
          <div
            className="sticky top-0 lg:top-0 z-50 flex items-center gap-2 px-5 py-2.5 text-xs font-semibold"
            style={{
              background: 'color-mix(in srgb, var(--color-warning) 12%, var(--color-surface))',
              borderBottom: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
              color: 'var(--color-warning)',
            }}
          >
            <WifiOff size={13} />
            <span>{t('common.offlineHint')}</span>
          </div>
        )}

        <main className="flex-1 w-full max-w-[1300px] mx-auto px-4 py-6 md:px-8 lg:py-10 pb-28 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* ── BOTTOM NAV (Mobile / Tablet only) ── */}
      {!isOnboarding && (
        <div className="lg:hidden">
          <BottomNav />
        </div>
      )}

      {/* Toast notifications */}
      <ToastContainer />

      {/* iOS Install Prompt */}
      {!isOnboarding && <IOSInstallPrompt />}
    </div>
  )
}
