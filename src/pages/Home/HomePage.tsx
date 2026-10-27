import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, ChevronRight, Repeat, Search, UserRound } from 'lucide-react'
import type { Account } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useAccountStore } from '@/store/accountStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useRecurringStore } from '@/store/recurringStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useUiStore } from '@/store/uiStore'
import { useConverter } from '@/store/ratesStore'
import { formatAmount, formatListAmount, formatLongDate, formatPeriodLabel, getDateRange, greetingKey, MASK, todayDate } from '@/lib/utils'
import { useWideScreen } from '@/lib/useWideScreen'
import { activeAccounts, getAccountBalances, sumBalances } from '@/lib/accounts'
import { getUpcomingNet, getUpcomingPayments } from '@/lib/upcoming'
import { buildNotifications, countUnread } from '@/lib/notifications'
import { BalanceBlock } from '@/components/home/BalanceBlock'
import { HistorySection } from '@/components/home/HistorySection'
import type { HistoryFocus } from '@/components/home/HistorySection'
import { NotificationsPopUp } from '@/components/home/NotificationsPopUp'
import { UpcomingPopUp } from '@/components/home/UpcomingPopUp'
import { AttentionCards } from '@/components/home/AttentionCards'
import { SearchOverlay } from '@/components/home/SearchOverlay'
import { ProfilePopUp } from '@/components/home/ProfilePopUp'
import { AccountSettingsPopUp } from '@/components/accounts/AccountSettingsPopUp'
import { useTransactionActions } from '@/components/transactions/useTransactionActions'

type Panel = 'search' | 'notifications' | 'upcoming' | 'profile'

export const HomePage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useCategoryStore((s) => s.categories)
  const allAccounts = useAccountStore((s) => s.accounts)
  const budgets = useBudgetStore((s) => s.budgets)
  const recurring = useRecurringStore((s) => s.recurringTransactions)
  const readIds = useNotificationStore((s) => s.readIds)
  const masked = useUiStore((s) => s.amountsHidden)
  const settings = useAppStore((s) => s.settings)
  const wide = useWideScreen()
  const convert = useConverter()
  const { onEdit, onDelete, dialogs } = useTransactionActions()

  // 0 is this month, -1 the one before, and so on back in time
  // Stats opens Home on one category and month; that's used once, then forgotten so a reload
  // shows the usual Home
  const location = useLocation()
  const navigate = useNavigate()
  const focus = (location.state as { history?: HistoryFocus } | null)?.history
  useEffect(() => {
    if (focus) navigate(location.pathname, { replace: true, state: null })
  }, []) // oxlint-disable-line react-hooks/exhaustive-deps
  const [monthOffset, setMonthOffset] = useState(focus?.monthOffset ?? 0)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const closePanel = () => setPanel(null)

  const monthRange = useMemo(() => getDateRange('month', monthOffset), [monthOffset])
  const monthLabel = formatPeriodLabel('month', monthRange, i18n.language)

  // ── Recurring payments still due before this month ends, and the balance they leave ──
  const accounts = useMemo(() => activeAccounts(allAccounts), [allAccounts])
  const total = useMemo(() => {
    const balances = getAccountBalances(accounts, transactions, base, convert)
    return sumBalances(accounts.filter((a) => a.includeInTotal), balances, base, convert).total
  }, [accounts, transactions, base, convert])
  const monthEnd = getDateRange('month').to
  const upcoming = useMemo(
    () => getUpcomingPayments(recurring, monthEnd, base, convert),
    [recurring, monthEnd, base, convert]
  )
  const upcomingNet = getUpcomingNet(upcoming, allAccounts)
  const expectedBalance = total + upcomingNet

  // ── The bell ──
  const limitAlerts = useAppStore((s) => s.settings.notifyBudgetAlertEnabled)
  const reminders = useAppStore((s) => s.settings.notifyPaymentsEnabled !== false)
  const notifications = useMemo(
    () => buildNotifications(transactions, budgets, recurring, { limits: limitAlerts, reminders }),
    [transactions, budgets, recurring, limitAlerts, reminders]
  )
  const unreadCount = countUnread(notifications, readIds)

  // ── On a computer: greeting and date, the title, then search, the bell and the profile ──
  const name = settings.displayName?.trim() ?? ''
  const today = new Date()
  const entryCount = transactions.filter((txn) => txn.status === 'confirmed').length

  return (
    <div className="grid grid-cols-1 gap-6 w-full max-w-[640px] mx-auto lg:max-w-none lg:grid-cols-12 lg:items-start">
      {wide && (
        <header className="lg:col-span-12 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="t-sub">
              {name ? t(`home.greet_${greetingKey(today.getHours())}`) : t('home.welcome')}
              {` · ${formatLongDate(todayDate(), i18n.language)}`}
            </span>
            <h1 className="t-large text-ink">{t('nav.home')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="iconbtn filled" aria-label={t('home.search')} onClick={() => setPanel('search')}>
              <Search size={20} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="iconbtn filled"
              aria-label={unreadCount > 0 ? t('home.notificationsNew', { count: unreadCount }) : t('home.notifications')}
              onClick={() => setPanel('notifications')}
            >
              <Bell size={20} strokeWidth={1.75} />
              {unreadCount > 0 && <span className="dot" aria-hidden="true" />}
            </button>
            <button type="button" className="acct" onClick={() => setPanel('profile')}>
              <span className="avatar sm" aria-hidden="true">
                {name ? name[0].toUpperCase() : <UserRound size={18} strokeWidth={1.75} />}
              </span>
              <span className="flex flex-col">
                <span className="t-strong leading-tight">{name || t('home.guest')}</span>
                <span className="t-cap">{t('home.guestMode')}</span>
              </span>
            </button>
          </div>
        </header>
      )}
      <div className="flex flex-col gap-4 lg:col-span-5">
        <BalanceBlock
          monthOffset={monthOffset}
          onMonthChange={setMonthOffset}
          unreadCount={unreadCount}
          onOpenNotifications={() => setPanel('notifications')}
          onOpenSearch={() => setPanel('search')}
          onOpenProfile={() => setPanel('profile')}
          onOpenAccount={setAccount}
        />

        {/* Payments to mark paid and entries without a category, until they're done */}
        <AttentionCards onEdit={onEdit} />

        {/* Recurring payments still due this month */}
        {monthOffset === 0 && upcoming.length > 0 && (
          <button type="button" className="card fc" onClick={() => setPanel('upcoming')}>
            <span className="fc-ico" aria-hidden="true">
              <Repeat size={18} strokeWidth={1.75} />
            </span>
            <span className="flex flex-col flex-1 min-w-0">
              <span className="t-strong">
                {t('home.paymentsDue', { count: upcoming.length })}
                {/* the dot wraps with the amount, never left at the end of a line */}
                {upcomingNet !== 0 && (
                  <span className="num"> · {masked ? MASK : formatListAmount(upcomingNet, base, base, true)}</span>
                )}
              </span>
              <span className="t-sub">
                {t('home.monthEnd', { amount: masked ? MASK : formatAmount(expectedBalance, base) })}
              </span>
            </span>
            <ChevronRight size={18} strokeWidth={1.75} className="text-ink-2 shrink-0" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="lg:col-span-7 lg:bg-surface lg:rounded-card lg:shadow-2 lg:p-6 lg:[--gutter:24px] lg:[--row-bg:var(--surface)]">
        {wide && (
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h2 className="t-title-2 text-ink">{t('home.history')}</h2>
            <span className="t-cap">{t('home.entries', { count: entryCount })}</span>
          </div>
        )}
        <HistorySection monthRange={monthRange} monthLabel={monthLabel} onEdit={onEdit} onDelete={onDelete} focus={focus} />
      </div>

      <NotificationsPopUp
        isOpen={panel === 'notifications'}
        onClose={closePanel}
        notifications={notifications}
        onEditTransaction={onEdit}
      />
      <UpcomingPopUp
        isOpen={panel === 'upcoming'}
        onClose={closePanel}
        upcoming={upcoming}
        categories={categories}
        accounts={allAccounts}
        baseCurrency={base}
        net={upcomingNet}
        expectedBalance={expectedBalance}
        masked={masked}
      />
      <SearchOverlay isOpen={panel === 'search'} onClose={closePanel} onEdit={onEdit} />
      <ProfilePopUp isOpen={panel === 'profile'} onClose={closePanel} />
      <AccountSettingsPopUp accountId={account?.id ?? null} onClose={() => setAccount(null)} />

      {dialogs}
    </div>
  )
}
