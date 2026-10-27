import React from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, RotateCcw } from 'lucide-react'
import type { Account, Category, TransactionType } from '@/types'
import { getCategoryKind, getCategoryName, sortCategories } from '@/lib/categories'
import { currencySymbol, sanitizeMoneyInput } from '@/lib/utils'
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

const Group: React.FC<{ legend: string; children: React.ReactNode }> = ({ legend, children }) => (
  <fieldset className="flex flex-col gap-2 border-0 m-0 p-0 min-w-0">
    <legend className="t-label text-ink p-0 mb-2">{legend}</legend>
    {children}
  </fieldset>
)

const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>
    {children}
  </button>
)

// Filter & sort for History. Changes apply as they're made; the button shows how many entries are left.
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
  const { t } = useTranslation()

  const sorts: { key: HistorySort; label: string }[] = [
    { key: 'newest', label: t('filters.newest') },
    { key: 'oldest', label: t('filters.oldest') },
    { key: 'largest', label: t('filters.largest') },
    { key: 'smallest', label: t('filters.smallest') },
  ]
  const periods: { key: HistoryPeriod; label: React.ReactNode }[] = [
    { key: 'all', label: t('filters.allTime') },
    { key: 'month', label: monthLabel },
    {
      key: 'custom',
      label: (
        <>
          <Calendar size={18} strokeWidth={1.75} aria-hidden="true" />
          {t('filters.customRange')}
        </>
      ),
    },
  ]
  // Transfers have no category
  const categoryChoices =
    type === 'transfer'
      ? []
      : sortCategories(categories.filter((c) => !c.parentId && !c.isArchived && (!type || getCategoryKind(c) === type)))
  const accountChoices = accounts.filter((a) => !a.isArchived || a.id === filter.accountId)
  const { symbol } = currencySymbol(baseCurrency)

  return (
    <PopUp
      isOpen={isOpen}
      onClose={onClose}
      title={t('filters.title')}
      subtitle={activeSummary ? `${t('filters.sub')} ${activeSummary}` : t('filters.sub')}
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
      <div className="flex flex-col gap-5">
        <Group legend={t('filters.sort')}>
          <div className="chips">
            {sorts.map(({ key, label }) => (
              <Chip key={key} on={sort === key} onClick={() => onSortChange(key)}>
                {label}
              </Chip>
            ))}
          </div>
        </Group>

        <Group legend={t('filters.period')}>
          <div className="chips">
            {periods.map(({ key, label }) => (
              <Chip key={key} on={filter.period === key} onClick={() => onChange({ period: key })}>
                {label}
              </Chip>
            ))}
          </div>
          {filter.period === 'custom' && (
            <div className="grid grid-cols-2 gap-3 mt-1">
              <label className="field">
                <span className="t-label">{t('filters.from')}</span>
                <span className="input">
                  <input type="date" value={filter.from} max={filter.to || undefined} onChange={(e) => onChange({ from: e.target.value })} />
                </span>
              </label>
              <label className="field">
                <span className="t-label">{t('filters.to')}</span>
                <span className="input">
                  <input type="date" value={filter.to} min={filter.from || undefined} onChange={(e) => onChange({ to: e.target.value })} />
                </span>
              </label>
            </div>
          )}
        </Group>

        {categoryChoices.length > 0 && (
          <Group legend={t('filters.category')}>
            <div className="chips">
              <Chip on={!filter.categoryId} onClick={() => onChange({ categoryId: '' })}>
                {t('filters.anyCategory')}
              </Chip>
              {categoryChoices.map((category) => (
                <Chip key={category.id} on={filter.categoryId === category.id} onClick={() => onChange({ categoryId: category.id })}>
                  <span className="text-[17px] leading-none" aria-hidden="true">{category.icon}</span>
                  {getCategoryName(category, t)}
                </Chip>
              ))}
            </div>
          </Group>
        )}

        {accountChoices.length > 1 && (
          <Group legend={t('filters.account')}>
            <div className="chips">
              <Chip on={!filter.accountId} onClick={() => onChange({ accountId: '' })}>
                {t('filters.anyAccount')}
              </Chip>
              {accountChoices.map((account) => (
                <Chip key={account.id} on={filter.accountId === account.id} onClick={() => onChange({ accountId: account.id })}>
                  {account.name}
                </Chip>
              ))}
            </div>
          </Group>
        )}

        <Group legend={t('filters.amount', { currency: symbol })}>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span className="t-label">{t('filters.minLabel')}</span>
              <span className="input">
                <input inputMode="decimal" placeholder="0" value={filter.min} onChange={(e) => onChange({ min: sanitizeMoneyInput(e.target.value) })} />
              </span>
            </label>
            <label className="field">
              <span className="t-label">{t('filters.maxLabel')}</span>
              <span className="input">
                <input inputMode="decimal" placeholder={t('filters.noLimit')} value={filter.max} onChange={(e) => onChange({ max: sanitizeMoneyInput(e.target.value) })} />
              </span>
            </label>
          </div>
        </Group>
      </div>
    </PopUp>
  )
}
