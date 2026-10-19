import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ListFilter, Plus, Receipt, SearchX, X } from 'lucide-react'
import type { DateRange, Transaction, TransactionType } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useAccountStore } from '@/store/accountStore'
import { useUiStore } from '@/store/uiStore'
import { getCategoryName } from '@/lib/categories'
import { formatListAmount, formatShortDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { HistoryList } from './HistoryList'
import { HistoryFilters } from './HistoryFilters'
import { EMPTY_FILTER, filterHistory, sortHistory } from './historyFilter'
import type { HistoryFilter, HistorySort } from './historyFilter'

// Stats opens Home on one category of one month (a row in "Where it went")
export interface HistoryFocus {
  categoryId: string
  type: 'expense' | 'income'
  monthOffset: number
}

interface HistorySectionProps {
  // The month picked in the balance block; the "month" period filters to it
  monthRange: DateRange
  monthLabel: string
  onEdit: (transaction: Transaction) => void
  onDelete: (id: string) => void
  // Opened from Stats: start on that category, for the month picked
  focus?: HistoryFocus
}

// Rows shown before "Show more"
const PAGE_SIZE = 30

// History on Home: the type chips and the filter button, chips for the filters that are on,
// then the entries by day
export const HistorySection: React.FC<HistorySectionProps> = ({ monthRange, monthLabel, onEdit, onDelete, focus }) => {
  const { t, i18n } = useTranslation()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useCategoryStore((s) => s.categories)
  const accounts = useAccountStore((s) => s.accounts)
  const masked = useUiStore((s) => s.amountsHidden)
  const openAddSheet = useUiStore((s) => s.openAddSheet)

  const [type, setType] = useState<TransactionType | ''>(focus?.type ?? '')
  const [filter, setFilter] = useState<HistoryFilter>(
    focus ? { ...EMPTY_FILTER, categoryId: focus.categoryId, period: 'month' } : EMPTY_FILTER
  )
  const [sort, setSort] = useState<HistorySort>('newest')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const changeFilter = (patch: Partial<HistoryFilter>) => {
    setFilter((current) => ({ ...current, ...patch }))
    setVisibleCount(PAGE_SIZE)
  }
  const resetFilters = () => {
    setFilter(EMPTY_FILTER)
    setSort('newest')
    setVisibleCount(PAGE_SIZE)
  }

  const results = useMemo(
    () => sortHistory(filterHistory(transactions, type, filter, monthRange), sort),
    [transactions, type, filter, monthRange, sort]
  )
  const visible = results.slice(0, visibleCount)
  const confirmedCount = useMemo(() => transactions.filter((txn) => txn.status === 'confirmed').length, [transactions])

  // ── Chips for the filters that are on; each one's × turns it off ──
  const tokens: { key: string; label: string; clear: () => void }[] = []
  if (filter.period === 'month') tokens.push({ key: 'period', label: monthLabel, clear: () => changeFilter({ period: 'all' }) })
  if (filter.period === 'custom' && (filter.from || filter.to)) {
    const label =
      filter.from && filter.to
        ? `${formatShortDate(filter.from, i18n.language)} – ${formatShortDate(filter.to, i18n.language)}`
        : filter.from
          ? t('filters.sinceDate', { date: formatShortDate(filter.from, i18n.language) })
          : t('filters.untilDate', { date: formatShortDate(filter.to, i18n.language) })
    tokens.push({ key: 'period', label, clear: () => changeFilter({ period: 'all', from: '', to: '' }) })
  }
  const category = categories.find((c) => c.id === filter.categoryId)
  if (category) {
    tokens.push({ key: 'category', label: `${category.icon} ${getCategoryName(category, t)}`, clear: () => changeFilter({ categoryId: '' }) })
  }
  const account = accounts.find((a) => a.id === filter.accountId)
  if (account) tokens.push({ key: 'account', label: account.name, clear: () => changeFilter({ accountId: '' }) })
  if (filter.min || filter.max) {
    const show = (text: string) => {
      const value = parseFloat(text.replace(/\s/g, '').replace(',', '.'))
      return isNaN(value) ? text : formatListAmount(value, base, base)
    }
    const label =
      filter.min && filter.max
        ? `${show(filter.min)} – ${show(filter.max)}`
        : filter.min
          ? t('filters.fromAmount', { amount: show(filter.min) })
          : t('filters.upToAmount', { amount: show(filter.max) })
    tokens.push({ key: 'amount', label, clear: () => changeFilter({ min: '', max: '' }) })
  }
  const activeSummary =
    tokens.length === 1
      ? t('filters.oneOn', { name: tokens[0].label })
      : tokens.length > 1
        ? t('filters.manyOn', { count: tokens.length })
        : null

  const typeChips: { key: TransactionType | ''; label: string }[] = [
    { key: '', label: t('home.all') },
    { key: 'expense', label: t('home.outcome') },
    { key: 'income', label: t('home.income') },
    { key: 'transfer', label: t('home.transfers') },
  ]

  // A line under the bar once it sticks to the top (phones)
  const barRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    let frame = 0
    const check = () => {
      frame = 0
      const top = parseFloat(getComputedStyle(bar).top)
      setStuck(!isNaN(top) && bar.getBoundingClientRect().top <= top + 0.5 && window.scrollY > 0)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  // Coming from Stats, the list is what was asked for: bring it into view
  useEffect(() => {
    if (focus) barRef.current?.scrollIntoView({ block: 'start' })
  }, []) // oxlint-disable-line react-hooks/exhaustive-deps

  const byDay = sort === 'newest' || sort === 'oldest'

  return (
    <section aria-label={t('home.history')} className="flex flex-col">
      {/* Nothing to narrow down before the first entry */}
      <div ref={barRef} className={`hist-bar${stuck ? ' stuck' : ''}`} hidden={confirmedCount === 0}>
        <div className="filter-row">
          <div className="chips one" role="group" aria-label={t('home.typeGroup')}>
            {typeChips.map(({ key, label }) => (
              <button
                key={key || 'all'}
                type="button"
                className={`chip${type === key ? ' on' : ''}`}
                aria-pressed={type === key}
                onClick={() => {
                  setType(key)
                  setVisibleCount(PAGE_SIZE)
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`sqbtn${tokens.length > 0 ? ' on' : ''}`}
            aria-label={tokens.length > 0 ? t('home.filtersOn', { count: tokens.length }) : t('home.filterSort')}
            onClick={() => setFiltersOpen(true)}
          >
            <ListFilter size={20} strokeWidth={1.75} />
            {tokens.length > 0 && <span className="count" aria-hidden="true">{tokens.length}</span>}
          </button>
        </div>
        {tokens.length > 0 && (
          <div className="tokens">
            {tokens.map((token) => (
              <button
                key={token.key}
                type="button"
                className="token"
                aria-label={t('home.removeFilter', { name: token.label })}
                onClick={token.clear}
              >
                <span>{token.label}</span>
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            ))}
            <span className="t-cap">{t('home.entries', { count: results.length })}</span>
          </div>
        )}
      </div>

      {confirmedCount === 0 ? (
        <div className="card empty mt-3">
          <span className="empty-ico">
            <Receipt size={24} strokeWidth={1.75} />
          </span>
          <h3 className="t-head">{t('home.emptyTitle')}</h3>
          <p className="t-sub max-w-[272px]">{t('home.emptyText')}</p>
          <Button variant="tinted" onClick={() => openAddSheet()}>
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            {t('home.addFirst')}
          </Button>
          <Link to="/accounts" className="text-[15px] text-accent-text underline underline-offset-[3px] mt-1">
            {t('home.setBalances')}
          </Link>
        </div>
      ) : results.length === 0 ? (
        <div className="empty">
          <span className="empty-ico">
            <SearchX size={24} strokeWidth={1.75} />
          </span>
          <h3 className="t-head">{t('home.noMatches')}</h3>
          <p className="t-sub">{t('home.noMatchesHint')}</p>
          {(tokens.length > 0 || type) && (
            <Button
              variant="tinted"
              onClick={() => {
                resetFilters()
                setType('')
              }}
            >
              {t('filters.reset')}
            </Button>
          )}
        </div>
      ) : (
        <>
          <HistoryList
            transactions={visible}
            byDay={byDay}
            totalsFrom={results}
            categories={categories}
            accounts={accounts}
            baseCurrency={base}
            masked={masked}
            onEdit={onEdit}
            onDelete={onDelete}
          />
          {results.length > visibleCount && (
            <button type="button" className="more mt-4" onClick={() => setVisibleCount(visibleCount + PAGE_SIZE)}>
              {t('home.showMore', { count: Math.min(PAGE_SIZE, results.length - visibleCount) })}
              <span className="t-cap">· {t('home.shownOf', { shown: visibleCount, count: results.length })}</span>
            </button>
          )}
        </>
      )}

      <HistoryFilters
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filter={filter}
        onChange={changeFilter}
        sort={sort}
        onSortChange={(next) => {
          setSort(next)
          setVisibleCount(PAGE_SIZE)
        }}
        onReset={resetFilters}
        type={type}
        monthLabel={monthLabel}
        activeSummary={activeSummary}
        resultCount={results.length}
        categories={categories}
        accounts={accounts}
        baseCurrency={base}
      />
    </section>
  )
}
