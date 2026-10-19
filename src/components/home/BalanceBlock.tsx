import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  Search,
  TrendingDown,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import type { Account } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useAccountStore } from '@/store/accountStore'
import { useConverter } from '@/store/ratesStore'
import { useUiStore } from '@/store/uiStore'
import { activeAccounts, getAccountBalances, sumBalances } from '@/lib/accounts'
import { confirmedInRange, sumByType } from '@/lib/analytics'
import {
  formatListAmount,
  formatMonthName,
  formatPeriodLabel,
  getComparisonRange,
  getDateRange,
  MASK,
  moneyParts,
  parseDateString,
} from '@/lib/utils'
import { CardCarousel } from './CardCarousel'

interface BalanceBlockProps {
  // 0 is this month, -1 the one before, and so on
  monthOffset: number
  onMonthChange: (offset: number) => void
  unreadCount: number
  onOpenNotifications: () => void
  onOpenSearch: () => void
  onOpenProfile: () => void
  onOpenAccount: (account: Account) => void
}

function greetingKey(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'evening'
}

function tileSize(text: string): string {
  return text.length > 12 ? 'xlong' : text.length > 10 ? 'long' : ''
}

// The green block at the top of Home: who you are, your balance and accounts as swipeable
// cards, and the month's income and outcome. It shrinks to one line when scrolled away.
export const BalanceBlock: React.FC<BalanceBlockProps> = ({
  monthOffset,
  onMonthChange,
  unreadCount,
  onOpenNotifications,
  onOpenSearch,
  onOpenProfile,
  onOpenAccount,
}) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const settings = useAppStore((s) => s.settings)
  const transactions = useTransactionStore((s) => s.transactions)
  const allAccounts = useAccountStore((s) => s.accounts)
  const convert = useConverter()
  const masked = useUiStore((s) => s.amountsHidden)
  const toggleMasked = useUiStore((s) => s.toggleAmountsHidden)
  const base = settings.baseCurrency
  const lang = i18n.language

  // ── Balance ──
  // Accounts counted in the total come first, the ones kept apart after them
  const accounts = useMemo(() => {
    const active = activeAccounts(allAccounts)
    return [...active.filter((a) => a.includeInTotal), ...active.filter((a) => !a.includeInTotal)]
  }, [allAccounts])
  const balances = useMemo(
    () => getAccountBalances(accounts, transactions, base, convert),
    [accounts, transactions, base, convert]
  )
  const total = sumBalances(accounts.filter((a) => a.includeInTotal), balances, base, convert)

  // ── The month ──
  const monthRange = useMemo(() => getDateRange('month', monthOffset), [monthOffset])
  const monthTransactions = useMemo(() => confirmedInRange(transactions, monthRange), [transactions, monthRange])
  const income = sumByType(monthTransactions, 'income')
  const outcome = sumByType(monthTransactions, 'expense')
  // A month still in progress is compared with the same days of the one before
  const previous = useMemo(() => {
    const range = getComparisonRange('month', monthOffset)
    const inRange = confirmedInRange(transactions, range)
    return { income: sumByType(inRange, 'income'), outcome: sumByType(inRange, 'expense') }
  }, [transactions, monthOffset])
  const earliest = useMemo(
    () => transactions.reduce<string | null>((min, txn) => (min === null || txn.date < min ? txn.date : min), null),
    [transactions]
  )
  const canGoBack = earliest !== null && earliest < monthRange.from
  const monthLabel = formatPeriodLabel('month', monthRange, lang)
  const previousMonth = parseDateString(getDateRange('month', monthOffset - 1).from)
  const previousName = formatMonthName(previousMonth, lang, lang.startsWith('uz') ? 'long' : 'short')

  const delta = (now: number, before: number) => {
    if (masked || before <= 0) return null
    return { up: now >= before, text: t('home.vsMonth', { percent: Math.round((Math.abs(now - before) / before) * 100), month: previousName }) }
  }
  const tiles = [
    { key: 'income', amount: income, delta: delta(income, previous.income), to: `/breakdown/income?m=${monthOffset}` },
    { key: 'outcome', amount: outcome, delta: delta(outcome, previous.outcome), to: `/breakdown/expense?m=${monthOffset}` },
  ] as const

  // ── Who ──
  const name = settings.displayName?.trim() ?? ''
  const greeting = name ? t(`home.greet_${greetingKey(new Date().getHours())}`) : t('home.welcome')
  const avatar = name ? name[0].toUpperCase() : <UserRound size={20} strokeWidth={1.75} />
  const bellLabel = unreadCount > 0 ? t('home.notificationsNew', { count: unreadCount }) : t('home.notifications')

  // ── The one-line version once the block scrolls away (phones) ──
  const heroRef = useRef<HTMLElement>(null)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const hero = heroRef.current
    if (!hero || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting && entry.boundingClientRect.top < 0), {
      rootMargin: '-72px 0px 0px 0px',
    })
    observer.observe(hero)
    return () => observer.disconnect()
  }, [])
  const totalParts = moneyParts(total.total, base)

  const actions = (
    <div className="hero-actions">
      <button type="button" className="hbtn" aria-label={t('home.search')} onClick={onOpenSearch}>
        <Search size={20} strokeWidth={1.75} />
      </button>
      <button type="button" className="hbtn" aria-label={bellLabel} onClick={onOpenNotifications}>
        <Bell size={20} strokeWidth={1.75} />
        {unreadCount > 0 && <span className="dot" aria-hidden="true" />}
      </button>
    </div>
  )

  return (
    <>
      <section ref={heroRef} className="hero hero-surface" aria-label={t('home.totalBalance')}>
        <div className="hero-top">
          <button type="button" className="avatar" aria-label={t('home.yourProfile')} onClick={onOpenProfile}>
            {avatar}
          </button>
          <div className="greet">
            <span className="greet-hi">{greeting}</span>
            <span className="greet-name">{name || t('home.guest')}</span>
          </div>
          {actions}
        </div>

        <CardCarousel
          accounts={accounts}
          balances={balances}
          total={total}
          baseCurrency={base}
          convert={convert}
          masked={masked}
          onToggleMasked={toggleMasked}
          onOpenAccount={onOpenAccount}
        />

        <div className="flex flex-col gap-3">
          <div className="mrow">
            <span className="mrow-label">{monthLabel}</span>
            <nav className="mrow-nav" aria-label={t('home.monthNav')}>
              <button
                type="button"
                className="iconbtn"
                aria-label={t('home.prevMonth')}
                disabled={!canGoBack}
                onClick={() => onMonthChange(monthOffset - 1)}
              >
                <ChevronLeft size={20} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="iconbtn"
                aria-label={t('home.nextMonth')}
                disabled={monthOffset >= 0}
                onClick={() => onMonthChange(monthOffset + 1)}
              >
                <ChevronRight size={20} strokeWidth={1.75} />
              </button>
            </nav>
          </div>
          <div className="tiles">
            {tiles.map(({ key, amount, delta: change, to }) => {
              const text = formatListAmount(amount, base, base)
              const TrendIcon = change?.up ? TrendingUp : TrendingDown
              return (
                <button key={key} type="button" className="htile" onClick={() => navigate(to)}>
                  <span className="htile-main">
                    <span className={`hdot ${key === 'income' ? 'in' : 'out'}`} aria-hidden="true">
                      {key === 'income' ? <ArrowDownLeft size={18} strokeWidth={1.75} /> : <ArrowUpRight size={18} strokeWidth={1.75} />}
                    </span>
                    <span className="htile-txt">
                      <span className="htile-label">{t(`home.${key}`)}</span>
                      <span className={`tile-amt ${masked ? 'masked' : tileSize(text)}${!masked && amount === 0 ? ' zero' : ''}`}>
                        {masked ? MASK : text}
                      </span>
                    </span>
                  </span>
                  {change && (
                    <span className={`delta ${key === 'income' ? 'in' : 'out'}`}>
                      <TrendIcon size={14} strokeWidth={1.75} aria-hidden="true" />
                      <span>{change.text}</span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <div className={`hero-mini hero-surface${compact ? ' on' : ''}`} aria-hidden={!compact}>
        <button type="button" className="avatar sm" aria-label={t('home.yourProfile')} tabIndex={compact ? 0 : -1} onClick={onOpenProfile}>
          {avatar}
        </button>
        <div className="greet">
          <span className="greet-hi">{t('home.totalBalance')}</span>
          <span className="greet-name">
            {masked ? (
              <span className="masked">{MASK}</span>
            ) : (
              <>
                {totalParts.sign}
                {totalParts.symbolBefore && totalParts.symbol}
                {totalParts.number}
                {!totalParts.symbolBefore && <span className="cur">{totalParts.symbol}</span>}
              </>
            )}
          </span>
        </div>
        <div className="hero-actions">
          <button type="button" className="hbtn" aria-label={t('home.search')} tabIndex={compact ? 0 : -1} onClick={onOpenSearch}>
            <Search size={20} strokeWidth={1.75} />
          </button>
          <button type="button" className="hbtn" aria-label={bellLabel} tabIndex={compact ? 0 : -1} onClick={onOpenNotifications}>
            <Bell size={20} strokeWidth={1.75} />
            {unreadCount > 0 && <span className="dot" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </>
  )
}
