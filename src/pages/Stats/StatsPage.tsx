import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Ellipsis,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  X,
} from 'lucide-react'
import type { Category, CategoryKind, Transaction } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useAccountStore } from '@/store/accountStore'
import { useUiStore } from '@/store/uiStore'
import { confirmedInRange, getCategorySpending, getPeriodBuckets, getSubcategorySpending, sumByType } from '@/lib/analytics'
import type { PeriodBucket } from '@/lib/analytics'
import { getCategoryName } from '@/lib/categories'
import {
  daysBetween,
  formatAmount,
  formatCompact,
  formatListAmount,
  formatLongDate,
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
import { HistoryList } from '@/components/home/HistoryList'
import { useTransactionActions } from '@/components/transactions/useTransactionActions'
import type { HistoryFocus } from '@/components/home/HistorySection'

// Outcome, income, or both side by side
type StatsKind = CategoryKind | 'all'
// One bar per day of a month, or per month of a year
type Unit = 'day' | 'month'

// Categories listed before the rest fold into "Other (n)"
const TOP_CATEGORIES = 7
// Where a limit turns orange
const NEAR_LIMIT = 85
const PLOT_HEIGHT = 128
const PLOT_TOP = 20
// Width of one day's slot; past what fits, the chart scrolls sideways
const DAY_SLOT = { single: 12, pair: 18 }
// Entries listed under a picked bar before "Show all"
const ENTRY_PREVIEW = 6

// A round step for the chart's grid: at most four lines, at 1, 2, 3 or 5 times a power of ten
// (amounts below one work too: 0.1, 0.2…)
function gridStep(max: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(max))
  for (const factor of [0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5, 10]) {
    if (Math.ceil(max / (factor * magnitude)) <= 4) return factor * magnitude
  }
  return 10 * magnitude
}

// Three letters under each month: "Sep", "сен", "Sen"
function chartMonth(date: Date, lang: string): string {
  if (lang.startsWith('ru')) return formatMonthName(date, lang).slice(0, 3)
  const short = formatMonthName(date, lang, 'short').replace('.', '')
  return short.charAt(0).toUpperCase() + short.slice(1)
}

// How many months a date is from this month (0 = this month, -1 = last month)
function monthOffsetOf(date: string): number {
  const now = parseDateString(todayDate())
  const then = parseDateString(date)
  return (then.getFullYear() - now.getFullYear()) * 12 + then.getMonth() - now.getMonth()
}

// Stats tab: a month by day or a year by month, of outcome, income or both; tap a bar for
// that day or month, then where the money went and the limits
export const StatsPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useCategoryStore((s) => s.categories)
  const budgets = useBudgetStore((s) => s.budgets)
  const accounts = useAccountStore((s) => s.accounts)
  const masked = useUiStore((s) => s.amountsHidden)
  const { onEdit, onDelete, dialogs } = useTransactionActions()
  const lang = i18n.language

  // Home's income and outcome tiles open this tab on their type and month
  const [kind, setKind] = useState<StatsKind>(() => (searchParams.get('type') === 'income' ? 'income' : 'expense'))
  const [unit, setUnit] = useState<Unit>('day')
  // Months back in the day view, years back in the month view
  const [offset, setOffset] = useState(() => Math.min(0, Number(searchParams.get('m')) || 0))
  // The bar tapped: a day ("2026-10-14") or a month ("2026-10")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [allEntries, setAllEntries] = useState(false)
  const [showOther, setShowOther] = useState<Record<CategoryKind, boolean>>({ expense: false, income: false })
  // Categories opened to show their subcategories
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set())
  const [editing, setEditing] = useState<Category | null>(null)
  const toggleCategory = (id: string) =>
    setOpenCategories((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const isAll = kind === 'all'
  const today = todayDate()
  const range = useMemo(() => getDateRange(unit === 'day' ? 'month' : 'year', offset), [unit, offset])
  const period = useMemo(() => confirmedInRange(transactions, range), [transactions, range])
  const buckets = useMemo(() => getPeriodBuckets(transactions, range, unit), [transactions, range, unit])
  const selected = buckets.find((bucket) => bucket.key === selectedKey) ?? null

  // Everything below the chart looks at the picked day or month, or the whole period
  const scope = useMemo(
    () => (selected ? period.filter((txn) => txn.date >= selected.from && txn.date <= selected.to) : period),
    [period, selected]
  )

  const income = sumByType(period, 'income')
  const outcome = sumByType(period, 'expense')
  const net = roundMoney(income - outcome)
  const total = isAll ? net : sumByType(period, kind)
  const isCurrent = offset === 0

  const earliest = useMemo(
    () => transactions.reduce<string | null>((min, txn) => (min === null || txn.date < min ? txn.date : min), null),
    [transactions]
  )
  const canGoBack = earliest !== null && earliest < range.from

  const go = (next: number) => {
    setOffset(next)
    setSelectedKey(null)
    setAllEntries(false)
  }

  // Day ⇄ Month keeps the place: a year's view of this month's year, a month's view of the
  // month picked (or of this month, or December of a past year)
  // The month the day view was on, so going to the year and back returns to it
  const lastMonth = useRef<string | null>(null)
  const pickUnit = (next: Unit) => {
    if (next === unit) return
    const now = parseDateString(today)
    if (next === 'month') {
      lastMonth.current = range.from
      setOffset(parseDateString(range.from).getFullYear() - now.getFullYear())
    } else {
      const remembered = lastMonth.current && lastMonth.current.slice(0, 4) === range.from.slice(0, 4) ? lastMonth.current : null
      const month = selected ? selected.from : remembered ?? (range.to > today ? today : range.to)
      setOffset(Math.min(0, monthOffsetOf(month)))
    }
    setUnit(next)
    setSelectedKey(null)
    setAllEntries(false)
  }

  const pickKind = (next: StatsKind) => {
    setKind(next)
    setShowOther({ expense: false, income: false })
  }

  // ── Compared with the month before (a month in progress against the same days of it) ──
  const previous = useMemo(
    () => (unit === 'day' && !isAll ? sumByType(confirmedInRange(transactions, getComparisonRange('month', offset)), kind) : 0),
    [transactions, offset, kind, unit, isAll]
  )
  const previousName = formatMonthInSentence(parseDateString(getDateRange('month', offset - 1).from), lang)
  const change = unit === 'day' && !isAll && previous > 0 && !masked ? Math.round((Math.abs(total - previous) / previous) * 100) : null
  const isDown = total < previous
  // Less outcome or more income is good news
  const isGood = kind === 'expense' ? isDown : !isDown

  // ── The chart: one scale for every bar (both bars of a pair too) ──
  const barValue = (bucket: PeriodBucket) => (kind === 'income' ? bucket.income : bucket.outcome)
  const max = Math.max(0, ...buckets.map((b) => (isAll ? Math.max(b.income, b.outcome) : barValue(b))))
  const step = max > 0 ? gridStep(max) : 0
  const top = max > 0 ? Math.ceil(max / step) * step : 1
  const ticks = step ? Array.from({ length: Math.round(top / step) }, (_, i) => Number(((i + 1) * step).toPrecision(12))) : []
  const slot = unit === 'day' ? (isAll ? DAY_SLOT.pair : DAY_SLOT.single) : 0
  const heightOf = (value: number) => (value > 0 ? Math.max(1.5, Math.round((value / top) * 1000) / 10) : 0)

  const bucketLabel = (bucket: PeriodBucket) =>
    unit === 'day' ? formatLongDate(bucket.from, lang) : formatPeriodLabel('month', { from: bucket.from, to: bucket.to }, lang)
  const axisLabel = (bucket: PeriodBucket) => {
    if (unit === 'month') return chartMonth(parseDateString(bucket.from), lang)
    const day = Number(bucket.key.slice(8))
    return day === 1 || day % 5 === 0 ? String(day) : ''
  }

  // The chart opens on the picked bar, else on today, else on the period's end
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    const target = el.querySelector<HTMLElement>('.scol.on') ?? el.querySelector<HTMLElement>('.scol.today')
    el.scrollLeft = target ? target.offsetLeft - el.clientWidth + target.offsetWidth * 4 : el.scrollWidth
  }, [range, unit, kind]) // oxlint-disable-line react-hooks/exhaustive-deps -- only when the period changes

  // ── Daily average and what was left over ──
  const days = daysBetween(range.from, isCurrent && today < range.to ? today : range.to) + 1
  const perDay = isAll ? outcome : total
  const savedSub =
    income > 0
      ? t('stats.ofIncome', { percent: Math.round((Math.abs(net) / income) * 100) })
      : outcome > 0
        ? t('stats.noIncome')
        : t('stats.nothingYet')

  // ── Limits (monthly, so in the day view; outcome only), the fullest first ──
  const limits = useMemo(
    () =>
      budgets
        .filter((budget) => budget.monthlyLimit > 0)
        .map((budget) => {
          const category = categories.find((c) => c.id === budget.categoryId)
          const spent = period
            .filter((txn) => txn.type === 'expense' && txn.categoryId === budget.categoryId)
            .reduce((sum, txn) => roundMoney(sum + txn.amountInBaseCurrency), 0)
          return { category, limit: budget.monthlyLimit, spent, percent: Math.round((spent / budget.monthlyLimit) * 100) }
        })
        .filter((item): item is typeof item & { category: Category } => Boolean(item.category && !item.category.isArchived))
        .sort((a, b) => b.percent - a.percent),
    [budgets, categories, period]
  )

  const money = (amount: number) => (masked ? MASK : formatListAmount(amount, base, base))
  const signed = (amount: number) => (masked ? MASK : formatListAmount(amount, base, base, true))
  const totalParts = moneyParts(total, base, { signed: isAll })
  const totalText = `${totalParts.sign}${totalParts.symbolBefore ? totalParts.symbol : ''}${totalParts.number}`
  const periodLabel = formatPeriodLabel(unit === 'day' ? 'month' : 'year', range, lang)
  const monthName = formatMonthInSentence(parseDateString(range.from), lang)
  const heroLabel = isAll
    ? t('stats.netFor', { period: periodLabel })
    : unit === 'month'
      ? t(kind === 'expense' ? 'stats.spentFor' : 'stats.earnedFor', { period: periodLabel })
      : kind === 'expense'
        ? t(isCurrent ? 'stats.spentSoFar' : 'stats.spent', { month: monthName })
        : t(isCurrent ? 'stats.earnedSoFar' : 'stats.earned', { month: monthName })

  // A category row opens History on Home, narrowed to that category and to the month picked
  // (or this one, or the period's last)
  const openInHistory = (categoryId: string, type: CategoryKind) => {
    const month = selected ? selected.from : range.to > today ? today : range.to
    const history: HistoryFocus = { categoryId, type, monthOffset: Math.min(0, monthOffsetOf(month)) }
    navigate('/', { state: { history } })
  }

  // ── "Where it went" (and, with both, "Where it came from") ──
  const sections: CategoryKind[] = isAll ? ['expense', 'income'] : [kind]

  const renderBreakdown = (type: CategoryKind) => {
    const items = getCategorySpending(scope, categories, t, type)
    const sectionTotal = sumByType(scope, type)
    const folds = items.length > TOP_CATEGORIES + 1
    const head = folds ? items.slice(0, TOP_CATEGORIES) : items
    const tail = folds ? items.slice(TOP_CATEGORIES) : []
    const biggest = items[0]?.amount ?? 0
    const otherSum = tail.reduce((sum, item) => roundMoney(sum + item.amount), 0)
    const title = type === 'expense' ? t('stats.whereOut') : t('stats.whereIn')

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

      // A category with subcategories opens in place to show how it splits; the split ends
      // with a way to its entries in History
      if (known && categories.some((c) => c.parentId === item.categoryId)) {
        const isOpen = openCategories.has(item.categoryId)
        const subs = isOpen ? getSubcategorySpending(scope, categories, t, item.categoryId, type) : []
        return (
          <React.Fragment key={item.categoryId}>
            <button
              type="button"
              className="crow"
              aria-expanded={isOpen}
              aria-label={`${label}. ${t(isOpen ? 'stats.hideSubs' : 'stats.showSubs')}`}
              onClick={() => toggleCategory(item.categoryId)}
            >
              {content}
              <span className={`crow-chev${isOpen ? ' open' : ''}`} aria-hidden="true">
                <ChevronDown size={16} strokeWidth={2} />
              </span>
            </button>
            {isOpen && (
              <div className="crow-subs">
                {subs.map((sub) => (
                  <div
                    key={sub.id || 'none'}
                    className="crow sub"
                    role="group"
                    aria-label={`${sub.name}: ${masked ? t('home.amountHidden') : formatAmount(sub.amount, base)}, ${sub.percentage}%`}
                  >
                    <span className="bub" style={{ '--c': item.categoryColor } as React.CSSProperties} aria-hidden="true">
                      {sub.icon}
                    </span>
                    <span className="crow-main">
                      <span className="crow-top">
                        <span className="crow-name">{sub.name}</span>
                        <span className={`amt${masked ? ' masked' : ''}`}>{money(sub.amount)}</span>
                      </span>
                      <span className="crow-bot">
                        <span className="hbar">
                          <span style={{ width: `${item.amount ? Math.round((sub.amount / item.amount) * 1000) / 10 : 0}%` }} />
                        </span>
                        <span className="crow-pct">{sub.percentage}%</span>
                      </span>
                    </span>
                  </div>
                ))}
                <button type="button" className="btn ghost sm self-start ml-[44px]" onClick={() => openInHistory(item.categoryId, type)}>
                  {t('stats.showEntries')}
                  <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            )}
          </React.Fragment>
        )
      }

      return known ? (
        <button key={item.categoryId} type="button" className="crow" aria-label={label} onClick={() => openInHistory(item.categoryId, type)}>
          {content}
        </button>
      ) : (
        <div key={item.categoryId} className="crow" aria-label={label}>
          {content}
        </div>
      )
    }

    return (
      <section key={type} className="scard gap-2" aria-label={title}>
        <div className="scard-head">
          <div className="flex flex-col min-w-0">
            <h2 className="t-head">{title}</h2>
            {selected && <span className="t-cap">{bucketLabel(selected)}</span>}
          </div>
          {items.length > 0 && <span className="t-cap">{t('stats.share')}</span>}
        </div>
        {items.length === 0 ? (
          <p className="t-sub py-2">{selected ? t('stats.emptyPicked') : t('stats.emptyPeriod')}</p>
        ) : (
          <div className="flex flex-col">
            {head.map(renderRow)}
            {folds && !showOther[type] && (
              <button type="button" className="crow" aria-expanded={false} onClick={() => setShowOther({ ...showOther, [type]: true })}>
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
                    <span className="crow-pct">{sectionTotal ? Math.round((otherSum / sectionTotal) * 100) : 0}%</span>
                  </span>
                </span>
                <span className="prow-go" aria-hidden="true">
                  <ChevronRight size={14} strokeWidth={2.25} />
                </span>
              </button>
            )}
            {showOther[type] && tail.map(renderRow)}
            {showOther[type] && (
              <button type="button" className="btn ghost sm self-start -ml-3 mt-1" onClick={() => setShowOther({ ...showOther, [type]: false })}>
                {t('stats.fewer')}
              </button>
            )}
          </div>
        )}
      </section>
    )
  }

  // ── The bar picked: its income, outcome and net, and its entries ──
  const pickedEntries: Transaction[] = selected ? scope.filter((txn) => txn.type !== 'transfer') : []
  const pickedIncome = selected?.income ?? 0
  const pickedOutcome = selected?.outcome ?? 0
  const pickedNet = roundMoney(pickedIncome - pickedOutcome)
  const shownEntries = allEntries ? pickedEntries : pickedEntries.slice(0, ENTRY_PREVIEW)

  const toggleBucket = (bucket: PeriodBucket) => {
    setSelectedKey(selectedKey === bucket.key ? null : bucket.key)
    setAllEntries(false)
  }

  // Income, outcome and net, one per row so long amounts keep their room; net in green or red
  const summaryRows = (inSum: number, outSum: number, netSum: number, className: string) => (
    <dl className={className}>
      <div className="srow">
        <dt>{t('home.income')}</dt>
        <dd className={`amt${masked ? ' masked' : inSum > 0 ? ' text-in' : ''}`}>{inSum > 0 ? signed(inSum) : money(0)}</dd>
      </div>
      <div className="srow">
        <dt>{t('home.outcome')}</dt>
        <dd className={`amt${masked ? ' masked' : ''}`}>{outSum > 0 ? signed(-outSum) : money(0)}</dd>
      </div>
      <div className="srow net">
        <dt>{t('stats.net')}</dt>
        <dd
          className={`amt${masked ? ' masked' : ''}`}
          style={masked || netSum === 0 ? undefined : { color: netSum > 0 ? 'var(--in)' : 'var(--danger-text)' }}
        >
          {signed(netSum)}
        </dd>
      </div>
    </dl>
  )

  const chartLabel = isAll
    ? t(unit === 'day' ? 'stats.chartAllDays' : 'stats.chartAllMonths')
    : kind === 'expense'
      ? t(unit === 'day' ? 'stats.chartOutDays' : 'stats.chartOut')
      : t(unit === 'day' ? 'stats.chartInDays' : 'stats.chartIn')

  return (
    <div className="flex flex-col gap-4 w-full max-w-[640px] mx-auto">
      <PageHeader title={t('nav.stats')} />

      <div className="flex flex-col gap-2">
        <SegmentedControl<StatsKind>
          label={t('stats.kindGroup')}
          value={kind}
          onChange={pickKind}
          options={[
            { value: 'expense', label: t('home.outcome') },
            { value: 'income', label: t('home.income') },
            { value: 'all', label: t('stats.both') },
          ]}
        />
        {/* ‹ October 2026 ›, then Day | Month */}
        <div className="srange">
          <nav className="srange-nav" aria-label={unit === 'day' ? t('home.monthNav') : t('stats.yearNav')}>
            <button
              type="button"
              className="iconbtn"
              aria-label={unit === 'day' ? t('home.prevMonth') : t('stats.prevYear')}
              disabled={!canGoBack}
              onClick={() => go(offset - 1)}
            >
              <ChevronLeft size={20} strokeWidth={1.75} />
            </button>
            <span className="srange-label" aria-live="polite">{periodLabel}</span>
            <button
              type="button"
              className="iconbtn"
              aria-label={unit === 'day' ? t('home.nextMonth') : t('stats.nextYear')}
              disabled={offset >= 0}
              onClick={() => go(offset + 1)}
            >
              <ChevronRight size={20} strokeWidth={1.75} />
            </button>
          </nav>
          <SegmentedControl<Unit>
            label={t('stats.unitGroup')}
            fill={false}
            value={unit}
            onChange={pickUnit}
            options={[
              { value: 'day', label: t('stats.byDay') },
              { value: 'month', label: t('stats.byMonth') },
            ]}
          />
        </div>
      </div>

      <section className="scard" aria-label={heroLabel}>
        <div className="flex flex-col gap-0.5">
          <span className="t-label">{heroLabel}</span>
          <span className="flex items-baseline gap-1.5 flex-wrap">
            <span
              className={`hero-num${masked ? ' masked' : totalText.length > 13 ? ' xlong' : totalText.length > 11 ? ' long' : ''}`}
              style={isAll && !masked && total !== 0 ? { color: total > 0 ? 'var(--in)' : 'var(--danger-text)' } : undefined}
            >
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

        {isAll && (
          <div className="slegend" aria-hidden="true">
            <span><i className="in" />{t('home.income')}</span>
            <span><i className="out" />{t('home.outcome')}</span>
          </div>
        )}

        <div className={`schart${selected ? ' picking' : ''}`} role="group" aria-label={chartLabel}>
          {ticks.map((value) => (
            <span key={value} className="saxis" style={{ top: PLOT_TOP + PLOT_HEIGHT - Math.round((value / top) * PLOT_HEIGHT) - 8 }}>
              {formatCompact(value, lang, { tight: true })}
            </span>
          ))}
          <div ref={scrollRef} className="schart-scroll">
            <div className="schart-plot" style={slot ? { minWidth: buckets.length * slot } : undefined}>
              {ticks.map((value) => (
                <div key={value} className="sgrid" style={{ top: PLOT_TOP + PLOT_HEIGHT - Math.round((value / top) * PLOT_HEIGHT) }} />
              ))}
              <div className="sbase" />
              <div className="scols">
                {buckets.map((bucket) => {
                  const on = bucket.key === selectedKey
                  const isToday = unit === 'day' ? bucket.key === today : bucket.key === today.slice(0, 7)
                  const value = barValue(bucket)
                  const amounts = masked
                    ? t('home.amountHidden')
                    : isAll
                      ? `${t('home.income')} ${formatAmount(bucket.income, base)}, ${t('home.outcome')} ${formatAmount(bucket.outcome, base)}`
                      : formatAmount(value, base)
                  return (
                    <button
                      key={bucket.key}
                      type="button"
                      className={`scol${on ? ' on' : ''}${isToday ? ' today' : ''}`}
                      aria-pressed={on}
                      aria-label={`${bucketLabel(bucket)}: ${amounts}`}
                      onClick={() => toggleBucket(bucket)}
                    >
                      <span className="scol-plot">
                        {on && !masked && !isAll && value > 0 && (
                          <span className="cval" style={{ bottom: `calc(${heightOf(value)}% + 4px)` }}>
                            {formatCompact(value, lang, { tight: true })}
                          </span>
                        )}
                        {isAll ? (
                          <>
                            <span className="sbar in" style={{ height: `${heightOf(bucket.income)}%` }} />
                            <span className="sbar out" style={{ height: `${heightOf(bucket.outcome)}%` }} />
                          </>
                        ) : (
                          <span className="sbar" style={{ height: `${heightOf(value)}%` }} />
                        )}
                      </span>
                      <span className="scol-label">{axisLabel(bucket)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The bar picked: its day or month on its own */}
      {selected && (
        <section className="scard gap-3 picked" aria-label={bucketLabel(selected)}>
          <div className="scard-head">
            <h2 className="t-head">{bucketLabel(selected)}</h2>
            <button type="button" className="iconbtn -my-2 -mr-2" aria-label={t('stats.wholePeriod')} title={t('stats.wholePeriod')} onClick={() => setSelectedKey(null)}>
              <X size={20} strokeWidth={1.75} />
            </button>
          </div>
          {summaryRows(pickedIncome, pickedOutcome, pickedNet, 'srows flat')}
          {unit === 'month' && (
            <button type="button" className="btn tinted sm self-start" onClick={() => pickUnit('day')}>
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
              {t('stats.byDays')}
            </button>
          )}
          {pickedEntries.length === 0 ? (
            <p className="t-sub">{t('stats.emptyPicked')}</p>
          ) : (
            <>
              <HistoryList
                transactions={shownEntries}
                byDay={unit === 'month'}
                totalsFrom={pickedEntries}
                categories={categories}
                accounts={accounts}
                baseCurrency={base}
                masked={masked}
                onEdit={onEdit}
                onDelete={onDelete}
              />
              {pickedEntries.length > ENTRY_PREVIEW && (
                <button type="button" className="btn ghost sm self-start -ml-3" onClick={() => setAllEntries(!allEntries)}>
                  {allEntries ? t('stats.fewer') : t('stats.allEntries', { count: pickedEntries.length })}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {isAll && summaryRows(income, outcome, net, 'srows ktile')}

      <div className="tiles gap-3">
        <div className="ktile">
          <span className="t-cap">{isAll ? t('stats.dailyOut') : t('stats.daily')}</span>
          <span className={`ktile-val${masked ? ' masked' : ''}`}>{money(roundMoney(perDay / Math.max(1, days)))}</span>
          <span className="t-cap">{t('stats.days', { count: days })}</span>
        </div>
        <div className="ktile">
          <span className="t-cap">{net >= 0 ? t('stats.saved') : t('stats.overspent')}</span>
          <span className={`ktile-val${masked ? ' masked' : ''}`}>{money(Math.abs(net))}</span>
          <span className="t-cap">{savedSub}</span>
        </div>
      </div>

      {sections.map(renderBreakdown)}

      {unit === 'day' && kind !== 'income' && (
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
      {dialogs}
    </div>
  )
}
