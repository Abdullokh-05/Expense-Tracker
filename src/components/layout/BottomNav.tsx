import React from 'react'
import { NavLink } from 'react-router-dom'
import { Home, History, MessageSquare, BarChart2, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const NAV_ITEMS = [
  { to: '/', icon: Home, labelKey: 'nav.home', id: 'nav-home' },
  { to: '/history', icon: History, labelKey: 'nav.history', id: 'nav-history' },
  { to: '/ai-chat', icon: MessageSquare, labelKey: 'nav.aiChat', id: 'nav-ai-chat' },
  { to: '/reports', icon: BarChart2, labelKey: 'nav.reports', id: 'nav-reports' },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings', id: 'nav-settings' },
]

export const BottomNav: React.FC = () => {
  const { t } = useTranslation()

  return (
    <nav
      className="bottom-nav"
      aria-label={t('nav.mainLabel')}
    >
      <div className="flex items-stretch w-full">
        {NAV_ITEMS.map(({ to, icon: Icon, labelKey, id }) => (
          <NavLink
            key={to}
            to={to}
            id={id}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] transition-all duration-200 relative ${
                isActive
                  ? 'text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`relative transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                  {/* Active indicator dot */}
                  {isActive && (
                    <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[var(--color-text-primary)]" />
                  )}
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </div>
                <span className={`text-[10px] leading-none transition-all duration-200 ${
                  isActive ? 'font-bold opacity-100' : 'font-medium opacity-70'
                }`}>
                  {t(labelKey)}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
