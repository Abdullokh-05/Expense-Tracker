import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useAppStore } from '@/store/appStore'
import {
  daysBetween,
  formatAmount,
  formatCompact,
  formatPeriodLabel,
  getComparisonRange,
  getDateRange,
  percentageChange,
  todayDate,
} from '@/lib/utils'
import { confirmedInRange, getCategorySpending, getSpendingTrend, sumByType } from '@/lib/analytics'
import { getCategoryName } from '@/lib/categories'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { ChevronLeft, ChevronRight, Lightbulb, TrendingUp } from 'lucide-react'

type ReportPeriod = 'week' | 'month' | 'year'

const tooltipStyle = {
  background: 'var(--color-surface)',
  border: '1.5px solid var(--color-border)',
  borderRadius: '12px',
}
const tooltipTextStyle = { color: 'var(--color-text-primary)' }

export const ReportsPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { settings } = useAppStore()
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useCategoryStore((s) => s.categories)

  const [period, setPeriod] = useState<ReportPeriod>('month')
  // 0 is the current period, -1 the previous one, and so on back in time
  const [offset, setOffset] = useState(0)

  const range = useMemo(() => getDateRange(period, offset), [period, offset])

  const periodTransactions = useMemo(() => confirmedInRange(transactions, range), [transactions, range])
  const totalSpent = sumByType(periodTransactions, 'expense')

  const previousSpent = useMemo(
    () => sumByType(confirmedInRange(transactions, getComparisonRange(period, offset)), 'expense'),
    [transactions, period, offset]
  )
  const change = percentageChange(totalSpent, previousSpent)

  const catData = useMemo(
    () => getCategorySpending(periodTransactions, categories, t),
    [periodTransactions, categories, t]
  )
  const trendData = useMemo(
    () => getSpendingTrend(periodTransactions, period, range, i18n.language),
    [periodTransactions, period, range, i18n.language]
  )

  // Facts for the summary card, all computed from the transactions above
  const topCategory = catData[0]
  const largestExpense = periodTransactions
    .filter((txn) => txn.type === 'expense')
    .reduce<(typeof periodTransactions)[number] | null>(
      (max, txn) => (!max || txn.amountInBaseCurrency > max.amountInBaseCurrency ? txn : max),
      null
    )
  const today = todayDate()
  const lastCountedDay = today < range.to ? today : range.to
  const dailyAverage = totalSpent / Math.max(1, daysBetween(range.from, lastCountedDay) + 1)

  const largestExpenseName = largestExpense
    ? largestExpense.note || getCategoryName(categories.find((c) => c.id === largestExpense.categoryId), t)
    : ''

  const formatBase = (value: unknown) =>
    formatAmount(typeof value === 'number' ? value : 0, settings.baseCurrency)

  return (
    <div className="space-y-6">

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold serif-heading" style={{ color: 'var(--color-text-primary)' }}>
            {t('reports.title')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('reports.subtitle')}
          </p>
        </div>

        {/* Period Selection */}
        <div className="flex p-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] shrink-0 sm:w-auto">
          {(['week', 'month', 'year'] as ReportPeriod[]).map((p) => (
            <button
              key={p}
              id={`report-period-${p}`}
              onClick={() => { setPeriod(p); setOffset(0) }}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                period === p ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'
              }`}
            >
              {t(`reports.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {/* ── PERIOD NAVIGATION: step back through earlier weeks / months / years ── */}
      <div className="flex items-center justify-between gap-3">
        <button
          id="report-period-prev"
          onClick={() => setOffset(offset - 1)}
          className="p-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          aria-label={t('reports.previousPeriod')}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold text-center" style={{ color: 'var(--color-text-primary)' }}>
          {formatPeriodLabel(period, range, i18n.language)}
        </span>
        <button
          id="report-period-next"
          onClick={() => setOffset(offset + 1)}
          disabled={offset >= 0}
          className="p-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-30 disabled:cursor-default"
          aria-label={t('reports.nextPeriod')}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* ── GRID LAYOUT: CHARTS & SUMMARY SIDE BY SIDE ON DESKTOP ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Left Columns (Charts) */}
        <div className="lg:col-span-7 space-y-6">

          {/* Total stats card */}
          <div className="card p-5 flex items-center justify-between gap-3" style={{ background: 'var(--color-surface)' }}>
            <div className="min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider block" style={{ color: 'var(--color-text-secondary)' }}>
                {t('dashboard.totalExpenses')}
              </span>
              <span className="text-3xl font-bold mt-1 block amount-display" style={{ color: 'var(--color-expense)' }}>
                {formatAmount(totalSpent, settings.baseCurrency)}
              </span>
              {change !== null && (
                <span
                  className="text-xs font-semibold mt-1.5 block"
                  style={{ color: change > 0 ? 'var(--color-expense)' : 'var(--color-income)' }}
                  title={offset === 0 && period !== 'week' ? t('reports.changeHint') : undefined}
                >
                  {t('reports.changeVsPrevious', { change: `${change > 0 ? '+' : '−'}${Math.abs(change)}%` })}
                </span>
              )}
            </div>
            <button
              id="go-to-budgets-btn"
              onClick={() => navigate('/budgets')}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all shrink-0"
              style={{ background: 'var(--color-surface-2)', border: '1.5px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              <TrendingUp size={14} className="text-[var(--color-income)]" />
              {t('budgets.title')}
            </button>
          </div>

          {/* Categories Pie Chart Card */}
          {catData.length > 0 ? (
            <div className="card p-5 space-y-4" style={{ background: 'var(--color-surface)' }}>
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                {t('reports.byCategory')}
              </h3>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={catData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={catData.length > 1 ? 3 : 0}
                      dataKey="amount"
                      nameKey="categoryName"
                      stroke="none"
                    >
                      {catData.map((entry) => (
                        <Cell key={entry.categoryId} fill={entry.categoryColor} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => [formatBase(value), String(name)]}
                      contentStyle={tooltipStyle}
                      itemStyle={tooltipTextStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="card p-10 text-center" style={{ background: 'var(--color-surface)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t('reports.noData')}
              </p>
            </div>
          )}

          {/* Spending over time: a bar per day, or per month in the year view */}
          {totalSpent > 0 && (
            <div className="card p-5 space-y-4" style={{ background: 'var(--color-surface)' }}>
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                {t('reports.byTime')}
              </h3>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <XAxis dataKey="label" stroke="var(--color-text-muted)" fontSize={10} tickLine={false} />
                    <YAxis
                      stroke="var(--color-text-muted)"
                      fontSize={10}
                      tickLine={false}
                      width={48}
                      tickFormatter={(value: number) => formatCompact(value, i18n.language)}
                    />
                    <Tooltip
                      formatter={(value: unknown) => [formatBase(value), t('dashboard.totalExpenses')]}
                      contentStyle={tooltipStyle}
                      itemStyle={tooltipTextStyle}
                      labelStyle={tooltipTextStyle}
                      cursor={{ fill: 'var(--color-surface-2)' }}
                    />
                    <Bar dataKey="amount" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>

        {/* Right Column (Summary & Legends List) */}
        <div className="lg:col-span-5 space-y-6">

          {/* Summary card: plain facts computed from this period's transactions */}
          <div className="card p-5 space-y-3 relative overflow-hidden"
               style={{
                 background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                 borderColor: 'rgba(255,255,255,0.1)',
                 boxShadow: 'var(--shadow-md)'
               }}>
            <div className="flex items-center gap-2">
              <Lightbulb size={16} className="text-indigo-200" />
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-200">
                {t('reports.summary')}
              </span>
            </div>
            {topCategory && largestExpense ? (
              <ul className="text-xs text-white/90 leading-relaxed font-medium space-y-1.5">
                <li>
                  {t('reports.insightTop', { category: topCategory.categoryName, percent: topCategory.percentage })}
                </li>
                <li>
                  {t('reports.insightDailyAverage', { amount: formatAmount(dailyAverage, settings.baseCurrency) })}
                </li>
                <li>
                  {t('reports.insightLargest', {
                    name: largestExpenseName,
                    amount: formatAmount(largestExpense.amountInBaseCurrency, settings.baseCurrency),
                  })}
                </li>
              </ul>
            ) : (
              <p className="text-xs text-white/90 leading-relaxed font-medium">{t('reports.noData')}</p>
            )}
          </div>

          {/* Legends list */}
          {catData.length > 0 && (
            <div className="card p-5 space-y-3" style={{ background: 'var(--color-surface)' }}>
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                {t('reports.distribution')}
              </h4>
              <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                {catData.map((item) => (
                  <div key={item.categoryId} className="flex items-center justify-between text-xs py-1 border-b border-[var(--color-border)]/50 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.categoryColor }}
                      />
                      <span className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{item.categoryName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span style={{ color: 'var(--color-text-muted)' }}>{item.percentage}%</span>
                      <span className="font-bold amount-display" style={{ color: 'var(--color-text-primary)' }}>
                        {formatAmount(item.amount, settings.baseCurrency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  )
}
