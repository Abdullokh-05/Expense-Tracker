import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChartColumn, Gift, House, Plus, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '@/store/uiStore'

interface Tab {
  to: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  labelKey: string
  // Pages that belong to this tab, e.g. Accounts is opened from Home
  matches: (path: string) => boolean
}

const TABS: Tab[] = [
  { to: '/', icon: House, labelKey: 'nav.home', matches: (p) => p === '/' || p.startsWith('/accounts') },
  { to: '/stats', icon: ChartColumn, labelKey: 'nav.stats', matches: (p) => p.startsWith('/stats') || p.startsWith('/breakdown') },
  { to: '/wishlist', icon: Gift, labelKey: 'nav.wishlist', matches: (p) => p.startsWith('/wishlist') },
  { to: '/settings', icon: Settings2, labelKey: 'nav.settings', matches: (p) => p.startsWith('/settings') },
]

// Floating glass capsule: Home · Stats · + · Wishlist · Settings. Content scrolls under it.
export const TabBar: React.FC = () => {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const openAddSheet = useUiStore((s) => s.openAddSheet)

  const renderTab = ({ to, icon: Icon, labelKey, matches }: Tab) => {
    const active = matches(pathname)
    return (
      <Link
        key={to}
        to={to}
        id={`tab-${labelKey.split('.')[1]}`}
        className={`tab${active ? ' on' : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <Icon size={22} strokeWidth={active ? 2.1 : 1.75} />
        <span>{t(labelKey)}</span>
      </Link>
    )
  }

  return (
    <nav className="tabbar lg:hidden" aria-label={t('nav.mainLabel')}>
      {TABS.slice(0, 2).map(renderTab)}
      <button
        id="tab-add"
        type="button"
        className="tab-add"
        onClick={() => openAddSheet()}
        aria-label={t('nav.addEntry')}
      >
        <Plus size={24} strokeWidth={2} />
      </button>
      {TABS.slice(2).map(renderTab)}
    </nav>
  )
}
