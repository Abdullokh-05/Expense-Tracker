import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Banknote,
  CreditCard,
  Search,
  SlidersHorizontal,
  Wallet,
  AlertTriangle,
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useAccountStore } from '@/store/accountStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useConverter } from '@/store/ratesStore'
import { formatAmount, formatDate, formatPeriodLabel, getDateRange, groupByDate } from '@/lib/utils'
import { confirmedInRange, sumByType } from '@/lib/analytics'
import { activeAccounts, getAccountBalances, sumBalances } from '@/lib/accounts'
import { getCategoryKind, getCategoryName } from '@/lib/categories'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'
import { TransactionItem } from '@/components/transactions/TransactionItem'
import { useTransactionActions } from '@/components/transactions/useTransactionActions'
import { Input } from '@/components/ui/Input'
import type { TransactionType } from '@/types'

type HistoryPeriod = 'all' | 'month' | 'custom'
type HistorySort = 'newest' | 'oldest' | 'largest' | 'smallest'

// History rows shown before "Show more"
const PAGE_SIZE = 30

export const HomePage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { settings } = useAppStore()
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useCategoryStore((s) => s.categories)
  const allAccounts = useAccountStore((s) => s.accounts)
  const editAccount = useAccountStore((s) => s.editAccount)
  const budgets = useBudgetStore((s) => s.budgets)
  const convert = useConverter()
  const { onEdit, onDelete, dialogs } = useTransactionActions()

  const [showAddSheet, setShowAddSheet] = useState(false)
  const [showAccounts, setShowAccounts] = useState(false)
  // 0 is the current month, -1 the previous one, and so on back in time
  const [monthOffset, setMonthOffset] = useState(0)

  // History filters
  const [search, setSearch] = useState('')
  const [selectedType, setSelectedType] = useState<TransactionType | ''>('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedAccount, setSelectedAccount] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState<HistoryPeriod>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [sort, setSort] = useState<HistorySort>('newest')
  const [showFiltersPanel, setShowFiltersPanel] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Handle deep link: /add?quick=true
  useEffect(() => {
    const isQuick = searchParams.get('quick') === 'true'
    if (isQuick) setShowAddSheet(true)
  }, [searchParams])

  // ── Balance ──
  const accounts = activeAccounts(allAccounts)
  const balances = useMemo(
    () => getAccountBalances(accounts, transactions, settings.baseCurrency, convert),
    [accounts, transactions, settings.baseCurrency, convert]
  )
  const counted = accounts.filter((a) => a.includeInTotal)
  const total = sumBalances(counted, balances, settings.baseCurrency, convert)

  // ── Income and outcome of the selected month ──
  const monthRange = useMemo(() => getDateRange('month', monthOffset), [monthOffset])
  const monthTransactions = useMemo(
    () => confirmedInRange(transactions, monthRange),
    [transactions, monthRange]
  )
  const monthIncome = sumByType(monthTransactions, 'income')
  const monthOutcome = sumByType(monthTransactions, 'expense')

  // Categories that went over their monthly limit in the selected month
  const limitsExceeded = budgets.filter((budget) => {
    if (budget.monthlyLimit <= 0) return false
    const spent = monthTransactions
      .filter((txn) => txn.type === 'expense' && txn.categoryId === budget.categoryId)
      .reduce((sum, txn) => sum + txn.amountInBaseCurrency, 0)
    return spent > budget.monthlyLimit
  }).length

  // ── History ──
  const query = search.trim().toLowerCase()
  const filteredTransactions = transactions.filter((txn) => {
    if (txn.status !== 'confirmed') return false
    if (selectedType && txn.type !== selectedType) return false
    if (selectedCategory && txn.categoryId !== selectedCategory) return false
    // A transfer belongs to both of its accounts
    if (selectedAccount && txn.accountId !== selectedAccount && txn.toAccountId !== selectedAccount) return false

    if (selectedPeriod === 'month' && (txn.date < monthRange.from || txn.date > monthRange.to)) return false
    if (selectedPeriod === 'custom') {
      if (startDate && txn.date < startDate) return false
      if (endDate && txn.date > endDate) return false
    }

    if (minAmount && txn.amountInBaseCurrency < parseFloat(minAmount)) return false
    if (maxAmount && txn.amountInBaseCurrency > parseFloat(maxAmount)) return false

    if (!query) return true
    // Search looks at the note and at the category name, since many entries have no note
    const categoryName = getCategoryName(categories.find((c) => c.id === txn.categoryId), t)
    return (txn.note ?? '').toLowerCase().includes(query) || categoryName.toLowerCase().includes(query)
  })

  // The store keeps transactions newest first
  const sortedTransactions =
    sort === 'newest'
      ? filteredTransactions
      : sort === 'oldest'
        ? [...filteredTransactions].reverse()
        : [...filteredTransactions].sort((a, b) =>
            sort === 'largest'
              ? b.amountInBaseCurrency - a.amountInBaseCurrency
              : a.amountInBaseCurrency - b.amountInBaseCurrency
          )
  const visibleTransactions = sortedTransactions.slice(0, visibleCount)

  // Day headings only make sense when the list is in date order
  const groupedByDay = sort === 'newest' || sort === 'oldest'
  const grouped = groupByDate(visibleTransactions)
  const dayKeys = groupedByDay
    ? Object.keys(grouped).sort((a, b) => (sort === 'newest' ? b.localeCompare(a) : a.localeCompare(b)))
    : []

  const activeFilterCount = [
    selectedCategory,
    selectedAccount,
    selectedPeriod !== 'all' ? selectedPeriod : '',
    minAmount,
    maxAmount,
  ].filter(Boolean).length

  const resetFilters = () => {
    setSelectedCategory('')
    setSelectedAccount('')
    setSelectedPeriod('all')
    setStartDate('')
    setEndDate('')
    setMinAmount('')
    setMaxAmount('')
  }

  const monthLabel = formatPeriodLabel('month', monthRange, i18n.language)
  const periodLabel = (p: HistoryPeriod) =>
    p === 'all' ? t('history.allTime') : p === 'month' ? monthLabel : t('history.customPeriod')

  const typeChips: { key: TransactionType | ''; label: string }[] = [
    { key: '', label: t('history.allTypes') },
    { key: 'expense', label: t('home.outcome') },
    { key: 'income', label: t('home.income') },
    { key: 'transfer', label: t('home.transfers') },
  ]

  const renderRow = (txn: (typeof transactions)[number]) => (
    <TransactionItem
      key={txn.id}
      transaction={txn}
      category={categories.find((c) => c.id === txn.categoryId)}
      accounts={allAccounts}
      baseCurrency={settings.baseCurrency}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  )

  return (
    <div className="space-y-6">

      {/* Title and add button: wide screens only. Phones use the floating button. */}
      <div className="hidden sm:flex items-center justify-between gap-4">
        <h1 className="text-3xl md:text-4xl font-bold serif-heading" style={{ color: 'var(--color-text-primary)' }}>
          {t('home.title')}
        </h1>
        <button
          onClick={() => setShowAddSheet(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors bg-[var(--color-accent)] text-[var(--color-bg)] hover:opacity-90"
        >
          <Plus size={16} />
          <span>{t('home.addTransaction')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ── SUMMARY CARD: balance on top, the month's income and outcome below ── */}
        <div className="lg:col-span-5 card" style={{ background: 'var(--color-surface)' }}>

          <button
            id="balance-toggle"
            onClick={() => setShowAccounts(!showAccounts)}
            aria-expanded={showAccounts}
            className="w-full text-left p-5 pb-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">
                {t('home.balance')}
                {counted.length < accounts.length && (
                  <span className="normal-case tracking-normal font-medium">
                    {' · '}{t('home.accountsCounted', { counted: counted.length, total: accounts.length })}
                  </span>
                )}
              </span>
              <ChevronDown
                size={16}
                className="text-[var(--color-text-muted)]"
                style={{ transform: showAccounts ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
              />
            </div>
            <div className="text-3xl font-bold amount-display mt-1" style={{ color: 'var(--color-text-primary)' }}>
              {formatAmount(total.total, settings.baseCurrency)}
            </div>
            {!total.complete && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-warning)' }}>
                {t('home.rateMissing')}
              </p>
            )}
          </button>

          {/* Accounts: each balance, and whether it counts towards the total above */}
          {showAccounts && (
            <div className="px-5 pb-4 space-y-1 animate-fade-in">
              {accounts.map((account) => {
                const balance = balances[account.id] ?? 0
                const inBase = account.currency === settings.baseCurrency
                  ? null
                  : convert(balance, account.currency, settings.baseCurrency)
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between gap-3 py-2"
                    style={{ opacity: account.includeInTotal ? 1 : 0.55 }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-2)] flex items-center justify-center shrink-0 text-[var(--color-text-secondary)]">
                        {account.type === 'cash' ? <Banknote size={15} /> : <CreditCard size={15} />}
                      </div>
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {account.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold amount-display" style={{ color: 'var(--color-text-primary)' }}>
                          {formatAmount(balance, account.currency)}
                        </div>
                        {inBase !== null && (
                          <div className="text-[10px] amount-display" style={{ color: 'var(--color-text-muted)' }}>
                            ≈ {formatAmount(inBase, settings.baseCurrency)}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => editAccount(account.id, { includeInTotal: !account.includeInTotal })}
                        className="p-2 rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                        aria-pressed={account.includeInTotal}
                        aria-label={t(account.includeInTotal ? 'home.excludeAccount' : 'home.includeAccount', { name: account.name })}
                        title={t(account.includeInTotal ? 'home.excludeAccount' : 'home.includeAccount', { name: account.name })}
                      >
                        {account.includeInTotal ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    </div>
                  </div>
                )
              })}
              <button
                onClick={() => navigate('/accounts')}
                className="text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:underline pt-1"
              >
                {t('home.manageAccounts')}
              </button>
            </div>
          )}

          {/* Month switcher */}
          <div className="border-t border-[var(--color-border)] px-5 pt-3 flex items-center justify-between">
            <button
              id="month-prev"
              onClick={() => setMonthOffset(monthOffset - 1)}
              className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
              aria-label={t('reports.previousPeriod')}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{monthLabel}</span>
            <button
              id="month-next"
              onClick={() => setMonthOffset(monthOffset + 1)}
              disabled={monthOffset >= 0}
              className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors disabled:opacity-30 disabled:cursor-default"
              aria-label={t('reports.nextPeriod')}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Income and outcome: each opens its breakdown by category */}
          <div className="grid grid-cols-2 gap-3 p-5 pt-3">
            <button
              id="income-card"
              onClick={() => navigate(`/breakdown/income?m=${monthOffset}`)}
              className="text-left rounded-xl p-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-[var(--color-text-muted)] transition-colors"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text-muted)]">
                <span>{t('home.income')}</span>
                <ChevronRight size={13} />
              </div>
              <div className="text-base sm:text-lg font-bold amount-display mt-0.5" style={{ color: 'var(--color-income)' }}>
                +{formatAmount(monthIncome, settings.baseCurrency)}
              </div>
            </button>
            <button
              id="outcome-card"
              onClick={() => navigate(`/breakdown/expense?m=${monthOffset}`)}
              className="text-left rounded-xl p-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-[var(--color-text-muted)] transition-colors"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text-muted)]">
                <span>{t('home.outcome')}</span>
                <ChevronRight size={13} />
              </div>
              <div className="text-base sm:text-lg font-bold amount-display mt-0.5" style={{ color: 'var(--color-expense)' }}>
                −{formatAmount(monthOutcome, settings.baseCurrency)}
              </div>
              {limitsExceeded > 0 && (
                <div className="flex items-center gap-1 text-[10px] font-bold mt-1" style={{ color: 'var(--color-warning)' }}>
                  <AlertTriangle size={10} />
                  <span>{t('home.limitsExceeded', { count: limitsExceeded })}</span>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* ── HISTORY ── */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
              {t('home.history')}
            </h2>
            <div className="flex items-center gap-2">
              <select
                id="history-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as HistorySort)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)]"
                aria-label={t('home.sort')}
              >
                <option value="newest">{t('home.sortNewest')}</option>
                <option value="oldest">{t('home.sortOldest')}</option>
                <option value="largest">{t('home.sortLargest')}</option>
                <option value="smallest">{t('home.sortSmallest')}</option>
              </select>
              <button
                id="history-filter-toggle"
                onClick={() => setShowFiltersPanel(!showFiltersPanel)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border border-[var(--color-border)]"
                style={{
                  background: activeFilterCount > 0 ? 'var(--color-text-primary)' : 'var(--color-surface-2)',
                  color: activeFilterCount > 0 ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                }}
              >
                <SlidersHorizontal size={13} />
                {t('history.filters')}
                {activeFilterCount > 0 && <span>({activeFilterCount})</span>}
              </button>
            </div>
          </div>

          <Input
            id="search-input"
            placeholder={t('history.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={16} />}
          />

          {/* Quick type filter chips */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar py-0.5">
            {typeChips.map(({ key, label }) => (
              <button
                key={key || 'all'}
                onClick={() => setSelectedType(key)}
                className="shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 border border-[var(--color-border)]"
                style={{
                  background: selectedType === key ? 'var(--color-text-primary)' : 'var(--color-surface-2)',
                  color: selectedType === key ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Advanced Filters Panel */}
          {showFiltersPanel && (
            <div
              className="p-4 rounded-2xl space-y-3 animate-fade-in"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="input-base text-xs"
                  aria-label={t('transaction.category')}
                >
                  <option value="">{t('history.allCategories')}</option>
                  {categories
                    .filter((c) => !selectedType || selectedType === 'transfer' || getCategoryKind(c) === selectedType)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {getCategoryName(c, t)}
                      </option>
                    ))}
                </select>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="input-base text-xs"
                  aria-label={t('transaction.account')}
                >
                  <option value="">{t('home.allAccounts')}</option>
                  {allAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Period selector */}
              <div className="grid grid-cols-3 gap-1.5">
                {(['all', 'month', 'custom'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setSelectedPeriod(p)}
                    className="py-1.5 px-1 rounded-lg text-xs font-semibold transition-all border border-[var(--color-border)] truncate"
                    style={{
                      background: selectedPeriod === p ? 'var(--color-text-primary)' : 'var(--color-surface)',
                      color: selectedPeriod === p ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {periodLabel(p)}
                  </button>
                ))}
              </div>

              {selectedPeriod === 'custom' && (
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input-base text-xs flex-1"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input-base text-xs flex-1"
                  />
                </div>
              )}

              {/* Amount range */}
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder={`${t('history.minAmount')} (${settings.baseCurrency})`}
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  className="input-base text-xs flex-1"
                />
                <input
                  type="number"
                  placeholder={`${t('history.maxAmount')} (${settings.baseCurrency})`}
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  className="input-base text-xs flex-1"
                />
              </div>

              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="text-xs font-semibold" style={{ color: 'var(--color-expense)' }}>
                  {t('history.resetFilters')} ({activeFilterCount})
                </button>
              )}
            </div>
          )}

          {/* List */}
          {sortedTransactions.length === 0 ? (
            <div className="card p-8 flex flex-col items-center justify-center text-center animate-fade-in" style={{ background: 'var(--color-surface)' }}>
              <div className="w-12 h-12 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center mb-3">
                <Wallet size={20} className="text-[var(--color-text-muted)]" />
              </div>
              <p className="text-xs font-semibold text-[var(--color-text-secondary)]">
                {transactions.length === 0 ? t('dashboard.noTransactions') : t('history.noResults')}
              </p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {transactions.length === 0 ? t('dashboard.noTransactionsHint') : t('history.noResultsHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedByDay ? (
                dayKeys.map((date) => {
                  const dayExpenses = sumByType(grouped[date], 'expense')
                  const dayIncome = sumByType(grouped[date], 'income')
                  return (
                    <div key={date} className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                          {formatDate(date, i18n.language)}
                        </span>
                        <span className="text-xs font-medium amount-display" style={{ color: 'var(--color-text-muted)' }}>
                          {dayExpenses > 0
                            ? `−${formatAmount(dayExpenses, settings.baseCurrency)}`
                            : dayIncome > 0 ? `+${formatAmount(dayIncome, settings.baseCurrency)}` : ''}
                        </span>
                      </div>
                      <div className="space-y-2">{grouped[date].map(renderRow)}</div>
                    </div>
                  )
                })
              ) : (
                <div className="space-y-2">{visibleTransactions.map(renderRow)}</div>
              )}

              {sortedTransactions.length > visibleCount && (
                <button
                  onClick={() => setVisibleCount(visibleCount + PAGE_SIZE)}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  {t('home.showMore', { count: sortedTransactions.length - visibleCount })}
                </button>
              )}
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
        aria-label={t('home.addTransaction')}
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
