import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownUp, CalendarDays, Check, ChevronLeft, ChevronRight, LayoutGrid, RotateCcw, Wallet } from 'lucide-react'
import type { Account, Category, TransactionType } from '@/types'
import { getCategoryKind, getCategoryName, sortCategories, subcategoriesOf } from '@/lib/categories'
import { currencySymbol, formatShortDate, sanitizeMoneyInput } from '@/lib/utils'
import { PopUp } from '@/components/ui/PopUp'
import { Button } from '@/components/ui/Button'
import type { HistoryFilter, HistoryPeriod, HistorySort } from './historyFilter'

interface HistoryFiltersProps {
  isOpen: boolean
  onClose: () => void
  filter: HistoryFilter
  onChange: (patch: Partial<HistoryFilter>) => void
  sort: HistorySort
  onSortChange: (sort: HistorySort) => void
  onReset: () => void
  // The type chip that is on decides which categories are offered
  type: TransactionType | ''
  // "October 2026": the month picked in the balance block
  monthLabel: string
  // A sentence naming the filters that are on, or null
  activeSummary: string | null
  resultCount: number
  categories: Category[]
  accounts: Account[]
  baseCurrency: string
}

// The list a row opens in place of the main page
type Page = 'main' | 'sort' | 'period' | 'category' | 'account'

// Filter & sort for History: one row per filter showing what's chosen; a row opens its choices
// in the same pop-up. Changes apply as they're made; the button shows how many entries are left.
export const HistoryFilters: React.FC<HistoryFiltersProps> = ({
  isOpen,
  onClose,
  filter,
  onChange,
  sort,
  onSortChange,
  onReset,
  type,
  monthLabel,
  activeSummary,
  resultCount,
  categories,
  accounts,
  baseCurrency,
}) => {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState<Page>('main')
  useEffect(() => {
    if (isOpen) setPage('main')
  }, [isOpen])

  const sorts: { key: HistorySort; label: string }[] = [
    { key: 'newest', label: t('filters.newest') },
    { key: 'oldest', label: t('filters.oldest') },
    { key: 'largest', label: t('filters.largest') },
    { key: 'smallest', label: t('filters.smallest') },
  ]
  const periods: { key: HistoryPeriod; label: string }[] = [
    { key: 'all', label: t('filters.allTime') },
    { key: 'month', label: monthLabel },
    { key: 'custom', label: t('filters.customRange') },
  ]
  // Transfers have no category
  const categoryChoices =
    type === 'transfer'
      ? []
      : sortCategories(categories.filter((c) => !c.parentId && !c.isArchived && (!type || getCategoryKind(c) === type)))
  const accountChoices = accounts.filter((a) => !a.isArchived || a.id === filter.accountId)
  const { symbol } = currencySymbol(baseCurrency)

  const picked = categories.find((c) => c.id === filter.categoryId)
  const pickedParent = picked?.parentId ? categories.find((c) => c.id === picked.parentId) : undefined
  const categoryValue = picked
    ? pickedParent
      ? `${getCategoryName(pickedParent, t)} › ${getCategoryName(picked, t)}`
      : getCategoryName(picked, t)
    : t('filters.anyCategory')
  const periodValue =
    filter.period === 'custom'
      ? [filter.from && formatShortDate(filter.from, i18n.language), filter.to && formatShortDate(filter.to, i18n.language)].filter(Boolean).join(' – ') ||
        t('filters.customRange')
      : periods.find((p) => p.key === filter.period)!.label

  const check = <Check size={20} strokeWidth={2.25} className="frow-check" aria-hidden="true" />
  const go = <ChevronRight size={18} strokeWidth={2} className="frow-go" aria-hidden="true" />
  // Picking from a list goes back to the main page
  const choose = (apply: () => void) => () => {
    apply()
    setPage('main')
  }

  const row = (key: Page, icon: React.ReactNode, title: string, value: string, on: boolean) => (
    <button type="button" className="frow" onClick={() => setPage(key)}>
      <span className="fico">{icon}</span>
      <span className="frow-title">{title}</span>
      <span className={`frow-val${on ? ' on' : ''}`}>{value}</span>
      {go}
    </button>
  )

  const main = (
    <>
      <div className="fgroup">
        {row('sort', <ArrowDownUp size={18} strokeWidth={1.75} />, t('filters.sort'), sorts.find((s) => s.key === sort)!.label, sort !== 'newest')}
        {row('period', <CalendarDays size={18} strokeWidth={1.75} />, t('filters.period'), periodValue, filter.period !== 'all')}
        {categoryChoices.length > 0 &&
          row('category', <LayoutGrid size={18} strokeWidth={1.75} />, t('filters.category'), categoryValue, Boolean(filter.categoryId))}
        {accountChoices.length > 1 &&
          row(
            'account',
            <Wallet size={18} strokeWidth={1.75} />,
            t('filters.account'),
            accounts.find((a) => a.id === filter.accountId)?.name ?? t('filters.anyAccount'),
            Boolean(filter.accountId)
          )}
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="t-over px-4">{t('filters.amount', { currency: symbol })}</h3>
        <div className="fgroup">
          <label className="frow">
            <span className="frow-title">{t('filters.minLabel')}</span>
            <input
              className="frow-input"
              inputMode="decimal"
              placeholder="0"
              value={filter.min}
              onChange={(e) => onChange({ min: sanitizeMoneyInput(e.target.value) })}
            />
          </label>
          <label className="frow">
            <span className="frow-title">{t('filters.maxLabel')}</span>
            <input
              className="frow-input"
              inputMode="decimal"
              placeholder={t('filters.noLimit')}
              value={filter.max}
              onChange={(e) => onChange({ max: sanitizeMoneyInput(e.target.value) })}
            />
          </label>
        </div>
      </section>
    </>
  )

  const pages: Record<Exclude<Page, 'main'>, React.ReactNode> = {
    sort: (
      <div className="fgroup">
        {sorts.map(({ key, label }) => (
          <button key={key} type="button" className="frow" aria-current={sort === key || undefined} onClick={choose(() => onSortChange(key))}>
            <span className="frow-title">{label}</span>
            {sort === key && check}
          </button>
        ))}
      </div>
    ),
    period: (
      <>
        <div className="fgroup">
          {periods.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className="frow"
              aria-current={filter.period === key || undefined}
              // A custom range stays open so its dates can be set
              onClick={key === 'custom' ? () => onChange({ period: key }) : choose(() => onChange({ period: key }))}
            >
              <span className="frow-title">{label}</span>
              {filter.period === key && check}
            </button>
          ))}
        </div>
        {filter.period === 'custom' && (
          <div className="fgroup">
            <label className="frow">
              <span className="frow-title">{t('filters.from')}</span>
              <input type="date" className="frow-date" value={filter.from} max={filter.to || undefined} onChange={(e) => onChange({ from: e.target.value })} />
            </label>
            <label className="frow">
              <span className="frow-title">{t('filters.to')}</span>
              <input type="date" className="frow-date" value={filter.to} min={filter.from || undefined} onChange={(e) => onChange({ to: e.target.value })} />
            </label>
          </div>
        )}
      </>
    ),
    // A category, or one of its subcategories under it
    category: (
      <div className="fgroup">
        <button type="button" className="frow" aria-current={!filter.categoryId || undefined} onClick={choose(() => onChange({ categoryId: '' }))}>
          <span className="frow-title">{t('filters.anyCategory')}</span>
          {!filter.categoryId && check}
        </button>
        {categoryChoices.flatMap((category) => [
          <button
            key={category.id}
            type="button"
            className="frow"
            aria-current={filter.categoryId === category.id || undefined}
            onClick={choose(() => onChange({ categoryId: category.id }))}
          >
            <span className="cico" style={{ '--c': category.color } as React.CSSProperties} aria-hidden="true">
              {category.icon}
            </span>
            <span className="frow-title">{getCategoryName(category, t)}</span>
            {filter.categoryId === category.id && check}
          </button>,
          ...subcategoriesOf(categories, category.id).map((sub) => (
            <button
              key={sub.id}
              type="button"
              className="frow sub"
              aria-current={filter.categoryId === sub.id || undefined}
              onClick={choose(() => onChange({ categoryId: sub.id }))}
            >
              <span className="cico sm" style={{ '--c': category.color } as React.CSSProperties} aria-hidden="true">
                {sub.icon}
              </span>
              <span className="frow-title">{getCategoryName(sub, t)}</span>
              {filter.categoryId === sub.id && check}
            </button>
          )),
        ])}
      </div>
    ),
    account: (
      <div className="fgroup">
        <button type="button" className="frow" aria-current={!filter.accountId || undefined} onClick={choose(() => onChange({ accountId: '' }))}>
          <span className="frow-title">{t('filters.anyAccount')}</span>
          {!filter.accountId && check}
        </button>
        {accountChoices.map((account) => (
          <button
            key={account.id}
            type="button"
            className="frow"
            aria-current={filter.accountId === account.id || undefined}
            onClick={choose(() => onChange({ accountId: account.id }))}
          >
            <span className="frow-title">{account.name}</span>
            {filter.accountId === account.id && check}
          </button>
        ))}
      </div>
    ),
  }

  const pageTitle: Record<Page, string> = {
    main: t('filters.title'),
    sort: t('filters.sort'),
    period: t('filters.period'),
    category: t('filters.category'),
    account: t('filters.account'),
  }

  return (
    <PopUp
      isOpen={isOpen}
      onClose={onClose}
      title={pageTitle[page]}
      header={
        page !== 'main' && (
          <button type="button" className="pop-back" onClick={() => setPage('main')}>
            <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
            {t('filters.title')}
          </button>
        )
      }
      subtitle={page === 'main' ? (activeSummary ? `${t('filters.sub')} ${activeSummary}` : t('filters.sub')) : undefined}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onReset}>
            <RotateCcw size={18} strokeWidth={1.75} aria-hidden="true" />
            {t('filters.reset')}
          </Button>
          <Button size="lg" fullWidth onClick={onClose}>
            {t('filters.show', { count: resultCount })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">{page === 'main' ? main : pages[page]}</div>
    </PopUp>
  )
}
