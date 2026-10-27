import React, { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Ellipsis, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react'
import type { Category, CategoryKind } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useUiStore } from '@/store/uiStore'
import { confirmedInRange, getCategorySpending, sumByType } from '@/lib/analytics'
import { getCategoryName } from '@/lib/categories'
import {
  daysBetween,
  formatAmount,
  formatCompact,
  formatListAmount,
  formatMonthInSentence,
  formatMonthName,
  formatPeriodLabel,
  getComparisonRange,
  getDateRange,
  MASK,
  moneyParts,
  parseDateString,
  roundMoney,
  todayDate,
} from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { CategoryEditPopUp } from '@/components/categories/CategoryEditPopUp'
import type { HistoryFocus } from '@/components/home/HistorySection'

// Months in the column chart
const CHART_MONTHS = 6
// Categories listed before the rest fold into "Other (n)"
const TOP_CATEGORIES = 7
// Where a limit turns orange
const NEAR_LIMIT = 85
const PLOT_HEIGHT = 128
const PLOT_TOP = 20

// A round step for the chart's grid: at most four lines, at 1, 2, 3 or 5 times a power of ten
function gridStep(max: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(max))
  for (const factor of [0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5, 10]) {
    if (Math.ceil(max / (factor * magnitude)) <= 4) return factor * magnitude
  }
  return 10 * magnitude
}

// Three letters under each column: "Sep", "сен", "Sen"
function chartMonth(date: Date, lang: string): string {
  if (lang.startsWith('ru')) return formatMonthName(date, lang).slice(0, 3)
  const short = formatMonthName(date, lang, 'short').replace('.', '')
  return short.charAt(0).toUpperCase() + short.slice(1)
}

// Stats tab: one month of outcome or income, how it compares, where it went, and the limits
export const StatsPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useCategoryStore((s) => s.categories)
  const budgets = useBudgetStore((s) => s.budgets)
  const masked = useUiStore((s) => s.amountsHidden)
  const lang = i18n.language

  // Home's income and outcome tiles open this tab on their type and month
  const [kind, setKind] = useState<CategoryKind>(() => (searchParams.get('type') === 'income' ? 'income' : 'expense'))
  const [offset, setOffset] = useState(() => Math.min(0, Number(searchParams.get('m')) || 0))
  const [hovered, setHovered] = useState<number | null>(null)
  const [showOther, setShowOther] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const isOutcome = kind === 'expense'

  const range = useMemo(() => getDateRange('month', offset), [offset])
  const month = useMemo(() => confirmedInRange(transactions, range), [transactions, range])
  const total = sumByType(month, kind)
  const income = sumByType(month, 'income')
  const outcome = sumByType(month, 'expense')
  const monthDate = parseDateString(range.from)
  const isCurrent = offset === 0

  const earliest = useMemo(
    () => transactions.reduce<string | null>((min, txn) => (min === null || txn.date < min ? txn.date : min), null),
    [transactions]
  )
  const canGoBack = earliest !== null && earliest < range.from

  // ── Compared with the month before (a month in progress against the same days of it) ──
  const previous = useMemo(
    () => sumByType(confirmedInRange(transactions, getComparisonRange('month', offset)), kind),
    [transactions, offset, kind]
  )
  const previousName = formatMonthInSentence(parseDateString(getDateRange('month', offset - 1).from), lang)
  const change = previous > 0 && !masked ? Math.round((Math.abs(total - previous) / previous) * 100) : null
  const isDown = total < previous
  // Less outcome or more income is good news
  const isGood = isOutcome ? isDown : !isDown

  // ── The column chart: six months ending at this month, or at the one picked if it's older ──
  const lastOffset = offset > -CHART_MONTHS ? 0 : offset
  const columns = useMemo(() => {
    const result: { offset: number; from: string; total: number }[] = []
    for (let o = lastOffset - CHART_MONTHS + 1; o <= lastOffset; o++) {
      const monthRange = getDateRange('month', o)
      // Months before the first entry are left out rather than shown empty
      if (earliest !== null && monthRange.to < earliest && o !== offset) continue
      result.push({ offset: o, from: monthRange.from, total: sumByType(confirmedInRange(transactions, monthRange), kind) })
    }
    return result
  }, [transactions, kind, lastOffset, earliest, offset])
  const max = Math.max(0, ...columns.map((c) => c.total))
  const step = max > 0 ? gridStep(max) : 0
  const top = max > 0 ? Math.ceil(max / step) * step : 1
  const ticks = step ? Array.from({ length: Math.round(top / step) }, (_, i) => (i + 1) * step) : []

  // ── Daily average and what was left over ──
  const today = todayDate()
  const days = daysBetween(range.from, isCurrent && today < range.to ? today : range.to) + 1
  const saved = income - outcome
  const savedSub =
    income > 0
      ? t('stats.ofIncome', { percent: Math.round((Math.abs(saved) / income) * 100) })
      : outcome > 0
        ? t('stats.noIncome')
        : t('stats.nothingYet')

  // ── Categories, biggest first; past the seventh they fold into "Other (n)" ──
  const items = useMemo(() => getCategorySpending(month, categories, t, kind), [month, categories, t, kind])
  const folds = items.length > TOP_CATEGORIES + 1
  const head = folds ? items.slice(0, TOP_CATEGORIES) : items
  const tail = folds ? items.slice(TOP_CATEGORIES) : []
  const biggest = items[0]?.amount ?? 0
  const otherSum = tail.reduce((sum, item) => roundMoney(sum + item.amount), 0)

  // ── Limits (outcome only), the fullest first ──
  const limits = useMemo(
    () =>
      budgets
        .filter((budget) => budget.monthlyLimit > 0)
        .map((budget) => {
          const category = categories.find((c) => c.id === budget.categoryId)
          const spent = month
            .filter((txn) => txn.type === 'expense' && txn.categoryId === budget.categoryId)
            .reduce((sum, txn) => roundMoney(sum + txn.amountInBaseCurrency), 0)
          return { category, limit: budget.monthlyLimit, spent, percent: Math.round((spent / budget.monthlyLimit) * 100) }
        })
        .filter((item): item is typeof item & { category: Category } => Boolean(item.category && !item.category.isArchived))
        .sort((a, b) => b.percent - a.percent),
    [budgets, categories, month]
  )

  const money = (amount: number) => (masked ? MASK : formatListAmount(amount, base, base))
  const totalParts = moneyParts(total, base)
  const totalText = `${totalParts.symbolBefore ? totalParts.symbol : ''}${totalParts.number}`
  const monthName = formatMonthInSentence(monthDate, lang)
  const heroLabel = isOutcome
    ? t(isCurrent ? 'stats.spentSoFar' : 'stats.spent', { month: monthName })
    : t(isCurrent ? 'stats.earnedSoFar' : 'stats.earned', { month: monthName })

  // A category row opens History on Home, narrowed to that category and month
  const openInHistory = (categoryId: string) => {
    const history: HistoryFocus = { categoryId, type: kind, monthOffset: offset }
    navigate('/', { state: { history } })
  }

  const renderRow = (item: (typeof items)[number]) => {
    const known = categories.some((c) => c.id === item.categoryId)
    const content = (
      <>
        <span className="bub" style={{ '--c': item.categoryColor } as React.CSSProperties} aria-hidden="true">
          {item.categoryIcon}
        </span>
        <span className="crow-main">
          <span className="crow-top">
            <span className="crow-name">{item.categoryName}</span>
            <span className={`amt${masked ? ' masked' : ''}`}>{money(item.amount)}</span>
          </span>
          <span className="crow-bot">
            <span className="hbar">
              <span style={{ width: `${biggest ? Math.round((item.amount / biggest) * 1000) / 10 : 0}%` }} />
            </span>
            <span className="crow-pct">{item.percentage}%</span>
          </span>
        </span>
      </>
    )
    const label = `${item.categoryName}: ${masked ? t('home.amountHidden') : formatAmount(item.amount, base)}, ${item.percentage}%`
    return known ? (
      <button key={item.categoryId} type="button" className="crow" aria-label={label} onClick={() => openInHistory(item.categoryId)}>
        {content}
      </button>
    ) : (
      <div key={item.categoryId} className="crow" aria-label={label}>
        {content}
      </div>
    )
  }

  const pickKind = (next: CategoryKind) => {
    setKind(next)
    setShowOther(false)
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-[640px] mx-auto">
      <PageHeader title={t('nav.stats')} />

      <div className="flex flex-col gap-1">
        <SegmentedControl
          label={t('stats.kindGroup')}
          value={kind}
          onChange={pickKind}
          options={[
            { value: 'expense', label: t('home.outcome') },
            { value: 'income', label: t('home.income') },
          ]}
        />
        <div className="mrow mb-0">
          <span className="mrow-label text-ink">{formatPeriodLabel('month', range, lang)}</span>
          <nav className="mrow-nav" aria-label={t('home.monthNav')}>
            <button type="button" className="iconbtn" aria-label={t('home.prevMonth')} disabled={!canGoBack} onClick={() => setOffset(offset - 1)}>
              <ChevronLeft size={20} strokeWidth={1.75} />
            </button>
            <button type="button" className="iconbtn" aria-label={t('home.nextMonth')} disabled={offset >= 0} onClick={() => setOffset(offset + 1)}>
              <ChevronRight size={20} strokeWidth={1.75} />
            </button>
          </nav>
        </div>
      </div>

      <section className="scard" aria-label={heroLabel}>
        <div className="flex flex-col gap-0.5">
          <span className="t-label">{heroLabel}</span>
          <span className="flex items-baseline gap-1.5 flex-wrap">
            <span className={`hero-num${masked ? ' masked' : totalText.length > 13 ? ' xlong' : totalText.length > 11 ? ' long' : ''}`}>
              {masked ? MASK : totalText}
            </span>
            {!masked && !totalParts.symbolBefore && <span className="t-label">{totalParts.symbol}</span>}
          </span>
          {change !== null && (
            <span className={`trend ${isGood ? 'good' : 'bad'}`}>
              {isDown ? <TrendingDown size={16} strokeWidth={1.75} aria-hidden="true" /> : <TrendingUp size={16} strokeWidth={1.75} aria-hidden="true" />}
              <span>{t(isDown ? 'stats.less' : 'stats.more', { percent: change, month: previousName })}</span>
            </span>
          )}
        </div>

        <div className="cchart" role="group" aria-label={isOutcome ? t('stats.chartOut') : t('stats.chartIn')}>
          {ticks.map((value) => (
            <div key={value} className="cgrid" style={{ top: PLOT_TOP + PLOT_HEIGHT - Math.round((value / top) * PLOT_HEIGHT) }}>
              <span>{formatCompact(value, lang)}</span>
            </div>
          ))}
          <div className="ccols">
            {columns.map((column) => {
              const selected = column.offset === offset
              const date = parseDateString(column.from)
              const height = Math.max(1, Math.round((column.total / top) * 1000) / 10)
              return (
                <button
                  key={column.offset}
                  type="button"
                  className={`ccol${selected ? ' on' : ''}`}
                  aria-pressed={selected}
                  aria-label={`${formatMonthName(date, lang)}: ${masked ? t('home.amountHidden') : formatAmount(column.total, base)}`}
                  onClick={() => setOffset(column.offset)}
                  onPointerEnter={() => setHovered(column.offset)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(column.offset)}
                  onBlur={() => setHovered(null)}
                >
                  <span className="ccol-plot">
                    {(selected || hovered === column.offset) && !masked && (
                      <span className="cval" style={{ bottom: `calc(${height}% + 4px)` }}>
                        {formatCompact(column.total, lang)}
                      </span>
                    )}
                    <span className="cbar" style={{ height: `${height}%` }} />
                  </span>
                  <span className="cmon">{chartMonth(date, lang)}</span>
                </button>
              )
            })}
          </div>
          <div className="cbase" />
        </div>
      </section>

      <div className="tiles gap-3">
        <div className="ktile">
          <span className="t-cap">{t('stats.daily')}</span>
          <span className={`ktile-val${masked ? ' masked' : ''}`}>{money(roundMoney(total / Math.max(1, days)))}</span>
          <span className="t-cap">{t('stats.days', { count: days })}</span>
        </div>
        <div className="ktile">
          <span className="t-cap">{saved >= 0 ? t('stats.saved') : t('stats.overspent')}</span>
          <span className={`ktile-val${masked ? ' masked' : ''}`}>{money(Math.abs(saved))}</span>
          <span className="t-cap">{savedSub}</span>
        </div>
      </div>

      <section className="scard gap-2" aria-label={isOutcome ? t('stats.whereOut') : t('stats.whereIn')}>
        <div className="scard-head">
          <h2 className="t-head">{isOutcome ? t('stats.whereOut') : t('stats.whereIn')}</h2>
          {items.length > 0 && <span className="t-cap">{t('stats.share')}</span>}
        </div>
        {items.length === 0 ? (
          <p className="t-sub py-2">{t('stats.emptyMonth')}</p>
        ) : (
          <div className="flex flex-col">
            {head.map(renderRow)}
            {folds && !showOther && (
              <button type="button" className="crow" aria-expanded={false} onClick={() => setShowOther(true)}>
                <span className="bub text-ink-2" aria-hidden="true">
                  <Ellipsis size={18} strokeWidth={1.75} />
                </span>
                <span className="crow-main">
                  <span className="crow-top">
                    <span className="crow-name">{t('stats.other', { count: tail.length })}</span>
                    <span className={`amt${masked ? ' masked' : ''}`}>{money(otherSum)}</span>
                  </span>
                  <span className="crow-bot">
                    <span className="hbar">
                      <span style={{ width: `${biggest ? Math.round((otherSum / biggest) * 1000) / 10 : 0}%` }} />
                    </span>
                    <span className="crow-pct">{total ? Math.round((otherSum / total) * 100) : 0}%</span>
                  </span>
                </span>
                <span className="prow-go" aria-hidden="true">
                  <ChevronRight size={14} strokeWidth={2.25} />
                </span>
              </button>
            )}
            {showOther && tail.map(renderRow)}
            {showOther && (
              <button type="button" className="btn ghost sm self-start -ml-3 mt-1" onClick={() => setShowOther(false)}>
                {t('stats.fewer')}
              </button>
            )}
          </div>
        )}
      </section>

      {isOutcome && (
        <section className="scard gap-2" aria-label={t('stats.limits')}>
          <div className="scard-head">
            <h2 className="t-head">{t('stats.limits')}</h2>
            <button type="button" className="btn ghost sm -my-2 -mr-3" onClick={() => navigate('/settings/categories')}>
              {t('stats.edit')}
            </button>
          </div>
          {limits.length === 0 ? (
            <p className="t-sub py-2">{t('stats.noLimits')}</p>
          ) : (
            limits.map(({ category, limit, spent, percent }) => {
              const over = spent > limit
              const near = !over && percent >= NEAR_LIMIT
              const color = over ? 'var(--danger-text)' : near ? 'var(--warn)' : 'var(--in)'
              const StatusIcon = over ? TriangleAlert : near ? CircleAlert : CircleCheck
              return (
                <button
                  key={category.id}
                  type="button"
                  className="mtr"
                  style={{ '--m': color } as React.CSSProperties}
                  onClick={() => setEditing(category)}
                >
                  <span className="mtr-top">
                    <span className="mtr-name">
                      <span aria-hidden="true">{category.icon}</span>
                      <span>{getCategoryName(category, t)}</span>
                    </span>
                    <span className="t-sub">
                      <span className="amt text-[15px]">{money(spent)}</span> {masked ? '' : t('stats.limitOf', { limit: money(limit) })}
                    </span>
                  </span>
                  <span
                    className="meter"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, percent)}
                    aria-label={getCategoryName(category, t)}
                  >
                    <span style={{ width: `${Math.min(100, percent)}%` }} />
                  </span>
                  <span className="mstat">
                    <StatusIcon size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span>
                      {masked
                        ? `${percent}%`
                        : over
                          ? t('stats.overBy', { amount: money(spent - limit) })
                          : t('stats.used', { percent, left: money(limit - spent) })}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </section>
      )}

      <CategoryEditPopUp isOpen={editing !== null} onClose={() => setEditing(null)} category={editing ?? undefined} kind="expense" />
    </div>
  )
}
