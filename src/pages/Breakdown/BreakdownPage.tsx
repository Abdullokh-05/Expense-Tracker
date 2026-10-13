import React, { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useBudgetStore } from '@/store/budgetStore'
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
import { BudgetLimitModal } from '@/components/budgets/BudgetLimitModal'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Lightbulb, Pencil } from 'lucide-react'
import type { Category } from '@/types'

const tooltipStyle = {
  background: 'var(--color-surface)',
  border: '1.5px solid var(--color-border)',
  borderRadius: '12px',
}
const tooltipTextStyle = { color: 'var(--color-text-primary)' }

// Green while there is room, amber close to the limit, red once it is passed
function limitColor(percentage: number): string {
  if (percentage >= 100) return 'var(--color-expense)'
  if (percentage >= 80) return 'var(--color-warning)'
  return 'var(--color-income)'
}

// Where the month's outcome went, or where its income came from, by category
export const BreakdownPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const { settings } = useAppStore()
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useCategoryStore((s) => s.categories)
  const budgets = useBudgetStore((s) => s.budgets)

  const type = params.type === 'income' ? 'income' : 'expense'
  const isExpense = type === 'expense'

  // 0 is the current month, -1 the previous one; starts on the month the home screen was showing
  const [offset, setOffset] = useState(() => Math.min(0, Number(searchParams.get('m')) || 0))
  const [limitCategory, setLimitCategory] = useState<Category | null>(null)

  const range = useMemo(() => getDateRange('month', offset), [offset])
  const monthTransactions = useMemo(() => confirmedInRange(transactions, range), [transactions, range])
  const total = sumByType(monthTransactions, type)

  const previousTotal = useMemo(
    () => sumByType(confirmedInRange(transactions, getComparisonRange('month', offset)), type),
    [transactions, offset, type]
  )
  const change = percentageChange(total, previousTotal)

  const items = useMemo(
    () => getCategorySpending(monthTransactions, categories, t, type),
    [monthTransactions, categories, t, type]
  )
  const trendData = useMemo(
    () => getSpendingTrend(monthTransactions, 'month', range, i18n.language, type),
    [monthTransactions, range, i18n.language, type]
  )

  // Monthly limits only apply to outcome
  const limitFor = (categoryId: string) =>
    isExpense ? budgets.find((b) => b.categoryId === categoryId)?.monthlyLimit ?? 0 : 0
  const limited = items.filter((item) => limitFor(item.categoryId) > 0)
  const totalLimit = isExpense ? budgets.reduce((sum, b) => sum + b.monthlyLimit, 0) : 0
  const spentOnLimited = limited.reduce((sum, item) => sum + item.amount, 0)
  const overallPercentage = totalLimit > 0 ? (spentOnLimited / totalLimit) * 100 : 0

  // Facts for the summary card, all computed from the transactions above
  const topItem = items[0]
  const largest = monthTransactions
    .filter((txn) => txn.type === type)
    .reduce<(typeof monthTransactions)[number] | null>(
      (max, txn) => (!max || txn.amountInBaseCurrency > max.amountInBaseCurrency ? txn : max),
      null
    )
  const today = todayDate()
  const lastCountedDay = today < range.to ? today : range.to
  const dailyAverage = total / Math.max(1, daysBetween(range.from, lastCountedDay) + 1)
  const largestName = largest
    ? largest.note || getCategoryName(categories.find((c) => c.id === largest.categoryId), t)
    : ''

  const formatBase = (value: unknown) =>
    formatAmount(typeof value === 'number' ? value : 0, settings.baseCurrency)
  const accentColor = isExpense ? 'var(--color-expense)' : 'var(--color-income)'
  // Spending more is bad news, earning more is good news
  const changeIsGood = change !== null && (isExpense ? change <= 0 : change >= 0)

  return (
    <div className="space-y-6">

      {/* ── HEADER ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-2xl md:text-3xl font-bold serif-heading" style={{ color: 'var(--color-text-primary)' }}>
          {isExpense ? t('breakdown.outcomeTitle') : t('breakdown.incomeTitle')}
        </h1>
      </div>

      {/* ── MONTH NAVIGATION ── */}
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
          {formatPeriodLabel('month', range, i18n.language)}
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Left column: total and charts */}
        <div className="lg:col-span-7 space-y-6">

          <div className="card p-5" style={{ background: 'var(--color-surface)' }}>
            <span className="text-xs font-semibold uppercase tracking-wider block" style={{ color: 'var(--color-text-secondary)' }}>
              {isExpense ? t('home.outcome') : t('home.income')}
            </span>
            <span id="breakdown-total" className="text-3xl font-bold mt-1 block amount-display" style={{ color: accentColor }}>
              {formatAmount(total, settings.baseCurrency)}
            </span>
            {change !== null && (
              <span
                className="text-xs font-semibold mt-1.5 block"
                style={{ color: changeIsGood ? 'var(--color-income)' : 'var(--color-expense)' }}
                title={offset === 0 ? t('reports.changeHint') : undefined}
              >
                {t('reports.changeVsPrevious', { change: `${change > 0 ? '+' : '−'}${Math.abs(change)}%` })}
              </span>
            )}

            {/* All monthly limits together */}
            {totalLimit > 0 && (
              <div className="mt-4 pt-4 border-t border-[var(--color-border)] space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{t('budgets.totalLimit')}</span>
                  <span className="amount-display" style={{ color: 'var(--color-text-muted)' }}>
                    {formatAmount(spentOnLimited, settings.baseCurrency)} / {formatAmount(totalLimit, settings.baseCurrency)}
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min(overallPercentage, 100)}%`, background: limitColor(overallPercentage) }}
                  />
                </div>
              </div>
            )}
          </div>

          {items.length > 0 ? (
            <div className="card p-5 space-y-4" style={{ background: 'var(--color-surface)' }}>
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                {isExpense ? t('reports.byCategory') : t('breakdown.bySource')}
              </h3>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={items}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={items.length > 1 ? 3 : 0}
                      dataKey="amount"
                      nameKey="categoryName"
                      stroke="none"
                    >
                      {items.map((entry) => (
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

          {/* Day by day through the month */}
          {total > 0 && (
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
                      formatter={(value: unknown) => [formatBase(value), isExpense ? t('home.outcome') : t('home.income')]}
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

        {/* Right column: summary and the category list */}
        <div className="lg:col-span-5 space-y-6">

          {/* Summary card: plain facts computed from this month's transactions */}
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
            {topItem && largest ? (
              <ul className="text-xs text-white/90 leading-relaxed font-medium space-y-1.5">
                <li>
                  {t(isExpense ? 'reports.insightTop' : 'breakdown.insightIncomeTop', {
                    category: topItem.categoryName,
                    percent: topItem.percentage,
                  })}
                </li>
                {isExpense && (
                  <li>
                    {t('reports.insightDailyAverage', { amount: formatAmount(dailyAverage, settings.baseCurrency) })}
                  </li>
                )}
                <li>
                  {t(isExpense ? 'reports.insightLargest' : 'breakdown.insightIncomeLargest', {
                    name: largestName,
                    amount: formatAmount(largest.amountInBaseCurrency, settings.baseCurrency),
                  })}
                </li>
              </ul>
            ) : (
              <p className="text-xs text-white/90 leading-relaxed font-medium">{t('reports.noData')}</p>
            )}
          </div>

          {/* Category list; outcome categories also show their monthly limit */}
          {items.length > 0 && (
            <div className="card p-5 space-y-3" style={{ background: 'var(--color-surface)' }}>
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                {isExpense ? t('reports.distribution') : t('breakdown.sources')}
              </h4>
              <div className="space-y-3.5">
                {items.map((item) => {
                  const category = categories.find((c) => c.id === item.categoryId)
                  const limit = limitFor(item.categoryId)
                  const percentageOfLimit = limit > 0 ? (item.amount / limit) * 100 : 0
                  return (
                    <div key={item.categoryId} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.categoryColor }} />
                          <span className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{item.categoryName}</span>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span style={{ color: 'var(--color-text-muted)' }}>{item.percentage}%</span>
                          <span className="font-bold amount-display" style={{ color: 'var(--color-text-primary)' }}>
                            {formatAmount(item.amount, settings.baseCurrency)}
                          </span>
                          {isExpense && category && (
                            <button
                              onClick={() => setLimitCategory(category)}
                              className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
                              aria-label={`${t('budgets.setLimit')}: ${item.categoryName}`}
                              title={t('budgets.setLimit')}
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {limit > 0 && (
                        <>
                          <div className="progress-track">
                            <div
                              className="progress-fill"
                              style={{ width: `${Math.min(percentageOfLimit, 100)}%`, background: limitColor(percentageOfLimit) }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                            <span>{t('breakdown.ofLimit', { percent: Math.round(percentageOfLimit), limit: formatAmount(limit, settings.baseCurrency) })}</span>
                            {item.amount > limit && (
                              <span className="flex items-center gap-1 font-bold" style={{ color: 'var(--color-expense)' }}>
                                <AlertTriangle size={10} />
                                {t('budgets.exceeded')} {formatAmount(item.amount - limit, settings.baseCurrency)}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
              {isExpense && (
                <p className="text-[11px] pt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {t('breakdown.limitHint')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <BudgetLimitModal category={limitCategory} onClose={() => setLimitCategory(null)} />
    </div>
  )
}
