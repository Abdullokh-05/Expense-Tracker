import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, TrendingUp, TrendingDown, ArrowRight, Wallet } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { formatAmount, getDateRange, groupByDate, formatDate } from '@/lib/utils'
import { confirmedInRange, getCategorySpending, sumByType } from '@/lib/analytics'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'
import { TransactionItem } from '@/components/transactions/TransactionItem'
import { useTransactionActions } from '@/components/transactions/useTransactionActions'

type DashboardPeriod = 'today' | 'week' | 'month'

// Categories listed in the breakdown before the rest are folded into one line
const BREAKDOWN_LIMIT = 6

export const DashboardPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { settings } = useAppStore()
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useCategoryStore((s) => s.categories)
  const { onEdit, onDelete, dialogs } = useTransactionActions()

  const [period, setPeriod] = useState<DashboardPeriod>('month')
  const [showAddSheet, setShowAddSheet] = useState(false)

  // Handle deep link: /add?quick=true
  useEffect(() => {
    const isQuick = searchParams.get('quick') === 'true'
    if (isQuick) setShowAddSheet(true)
  }, [searchParams])

  const periodTransactions = useMemo(
    () => confirmedInRange(transactions, getDateRange(period)),
    [transactions, period]
  )

  const totalExpenses = sumByType(periodTransactions, 'expense')
  const totalIncome = sumByType(periodTransactions, 'income')
  const balance = totalIncome - totalExpenses

  const breakdown = useMemo(
    () => getCategorySpending(periodTransactions, categories, t),
    [periodTransactions, categories, t]
  )
  const topCategories = breakdown.slice(0, BREAKDOWN_LIMIT)
  const otherCategories = breakdown.slice(BREAKDOWN_LIMIT)
  const otherAmount = otherCategories.reduce((sum, item) => sum + item.amount, 0)

  // Show up to 8 recent operations on desktop
  const recentTransactions = periodTransactions.slice(0, 8)
  const grouped = groupByDate(recentTransactions)
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const PERIODS: { key: DashboardPeriod; label: string }[] = [
    { key: 'today', label: t('dashboard.today') },
    { key: 'week', label: t('dashboard.week') },
    { key: 'month', label: t('dashboard.month') },
  ]

  return (
    <div className="space-y-6">

      {/* ── HEADER TITLE BLOCK ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold serif-heading" style={{ color: 'var(--color-text-primary)' }}>
            {t('dashboard.title')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('dashboard.subtitle')}
          </p>
        </div>

        {/* Quick actions for wide screens */}
        <div className="hidden sm:flex items-center gap-3">
          <div className="flex p-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  period === key
                    ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddSheet(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors bg-[var(--color-accent)] text-[var(--color-bg)] hover:opacity-90"
          >
            <Plus size={16} />
            <span>{t('dashboard.addTransaction')}</span>
          </button>
        </div>
      </div>

      {/* Period selection for mobile screens only */}
      <div className="flex sm:hidden p-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold text-center transition-all ${
              period === key
                ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── GRID: KEY STATS (Balance, Expenses, Income) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Balance Card */}
        <div className="card p-5 relative overflow-hidden" style={{ background: 'var(--color-surface)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">
              {t('dashboard.balance')}
            </span>
            <span className="text-[10px] font-bold bg-[var(--color-surface-2)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-full px-2.5 py-0.5">
              {settings.baseCurrency}
            </span>
          </div>
          <div className="text-2xl font-bold amount-display" style={{ color: balance >= 0 ? 'var(--color-income)' : 'var(--color-expense)' }}>
            {balance >= 0 ? '+' : ''}{formatAmount(balance, settings.baseCurrency)}
          </div>
        </div>

        {/* Expenses Card */}
        <div className="card p-5 relative overflow-hidden" style={{ background: 'var(--color-surface)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">
              {t('dashboard.totalExpenses')}
            </span>
            <div className="w-7 h-7 rounded-lg bg-[var(--color-expense)]/10 flex items-center justify-center text-[var(--color-expense)]">
              <TrendingDown size={14} />
            </div>
          </div>
          <div className="text-2xl font-bold amount-display" style={{ color: 'var(--color-expense)' }}>
            −{formatAmount(totalExpenses, settings.baseCurrency)}
          </div>
        </div>

        {/* Income Card */}
        <div className="card p-5 relative overflow-hidden" style={{ background: 'var(--color-surface)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">
              {t('dashboard.totalIncome')}
            </span>
            <div className="w-7 h-7 rounded-lg bg-[var(--color-income)]/10 flex items-center justify-center text-[var(--color-income)]">
              <TrendingUp size={14} />
            </div>
          </div>
          <div className="text-2xl font-bold amount-display" style={{ color: 'var(--color-income)' }}>
            +{formatAmount(totalIncome, settings.baseCurrency)}
          </div>
        </div>

      </div>

      {/* ── RESPONSIVE BODY GRID: BREAKDOWN & RECENT OPERATIONS SIDE BY SIDE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Left Side: where the money went in the selected period */}
        <div className="lg:col-span-7 space-y-4">
          <div className="card p-5 min-h-[250px] flex flex-col justify-between gap-4" style={{ background: 'var(--color-surface)' }}>
            <div className="space-y-4">
              <h3 className="text-lg font-bold serif-heading">{t('dashboard.breakdownTitle')}</h3>

              {breakdown.length === 0 ? (
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  {t('dashboard.breakdownEmpty')}
                </p>
              ) : (
                <div className="space-y-3.5">
                  {topCategories.map((item) => (
                    <div key={item.categoryId} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base leading-none shrink-0">{item.categoryIcon}</span>
                          <span className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                            {item.categoryName}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.percentage}%</span>
                          <span className="font-bold amount-display" style={{ color: 'var(--color-text-primary)' }}>
                            {formatAmount(item.amount, settings.baseCurrency)}
                          </span>
                        </div>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${totalExpenses > 0 ? (item.amount / totalExpenses) * 100 : 0}%`,
                            background: item.categoryColor,
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  {otherCategories.length > 0 && (
                    <div className="flex items-center justify-between text-xs pt-1" style={{ color: 'var(--color-text-muted)' }}>
                      <span>{t('dashboard.breakdownMore', { count: otherCategories.length })}</span>
                      <span className="font-semibold amount-display">{formatAmount(otherAmount, settings.baseCurrency)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[var(--color-border)] flex items-center justify-end">
              <button
                onClick={() => navigate('/reports')}
                className="flex items-center gap-1 text-xs font-bold text-[var(--color-text-primary)] hover:underline"
              >
                <span>{t('dashboard.openReports')}</span>
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Recent Transactions List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
              {t('dashboard.recentTransactions')}
            </h2>
            {transactions.length > 0 && (
              <button
                onClick={() => navigate('/history')}
                className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors font-medium"
              >
                {t('common.viewAll')} <ArrowRight size={12} />
              </button>
            )}
          </div>

          {recentTransactions.length === 0 ? (
            <div className="card p-8 flex flex-col items-center justify-center text-center animate-fade-in" style={{ background: 'var(--color-surface)' }}>
              <div className="w-12 h-12 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center text-xl mb-3">
                <Wallet size={20} className="text-[var(--color-text-muted)]" />
              </div>
              <p className="text-xs font-semibold text-[var(--color-text-secondary)]">
                {t('dashboard.noTransactions')}
              </p>
              <button
                onClick={() => setShowAddSheet(true)}
                className="mt-4 px-3 py-1.5 bg-[var(--color-accent)] text-[var(--color-bg)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                {t('dashboard.addExpense')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedDates.map((date, dateIdx) => {
                const dayExpenses = sumByType(grouped[date], 'expense')
                return (
                  <div key={date} style={{ animationDelay: `${dateIdx * 40}ms` }} className="animate-fade-in space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                        {formatDate(date, i18n.language)}
                      </span>
                      {dayExpenses > 0 && (
                        <span className="text-xs text-[var(--color-text-muted)] font-medium amount-display">
                          −{formatAmount(dayExpenses, settings.baseCurrency)}
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {grouped[date].map((txn) => {
                        const cat = categories.find((cItem) => cItem.id === txn.categoryId)
                        return (
                          <TransactionItem
                            key={txn.id}
                            transaction={txn}
                            category={cat}
                            baseCurrency={settings.baseCurrency}
                            onEdit={onEdit}
                            onDelete={onDelete}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* Floating Action Button (Mobile/Tablet only) */}
      <button
        id="fab-add-transaction"
        onClick={() => setShowAddSheet(true)}
        className="fab sm:hidden fixed z-30"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom) + 5rem)',
          right: '1.25rem',
        }}
        aria-label={t('dashboard.addExpense')}
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      <AddTransactionSheet
        isOpen={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        prefilledCategory={searchParams.get('category') ?? undefined}
        prefilledType={searchParams.get('type') === 'income' ? 'income' : 'expense'}
      />

      {dialogs}
    </div>
  )
}
