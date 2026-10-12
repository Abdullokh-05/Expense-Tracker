import React, { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useAppStore } from '@/store/appStore'
import { formatAmount, groupByDate, formatDate, getDateRange } from '@/lib/utils'
import { TransactionItem } from '@/components/transactions/TransactionItem'
import { Input } from '@/components/ui/Input'
import { Search, ArrowUpDown, SlidersHorizontal } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/BottomSheet'
import { toast } from '@/components/ui/Toast'

export const HistoryPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const { settings } = useAppStore()
  const { transactions, loadTransactions, removeTransaction } = useTransactionStore()
  const { categories, loadCategories } = useCategoryStore()

  // Filters & State
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState<'all' | 'today' | 'week' | 'month' | 'year' | 'custom'>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [showFiltersPanel, setShowFiltersPanel] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    await loadTransactions()
    await loadCategories()
  }, [loadTransactions, loadCategories])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDelete = async () => {
    if (!deleteTargetId) return
    try {
      await removeTransaction(deleteTargetId)
      toast.success(t('transaction.confirmDelete'))
    } catch {
      toast.error(t('common.error'))
    } finally {
      setDeleteTargetId(null)
    }
  }

  // Frontend filters mapping
  const filteredTransactions = transactions.filter((txn) => {
    if (txn.status !== 'confirmed') return false
    const matchesSearch = !search || (txn.note && txn.note.toLowerCase().includes(search.toLowerCase()))
    const matchesCategory = !selectedCategory || txn.categoryId === selectedCategory
    const matchesType = !selectedType || txn.type === selectedType

    let matchesDate = true
    if (selectedPeriod !== 'all') {
      if (selectedPeriod === 'custom') {
        if (startDate) matchesDate = matchesDate && txn.date >= startDate
        if (endDate) matchesDate = matchesDate && txn.date <= endDate
      } else {
        const { from, to } = getDateRange(selectedPeriod)
        matchesDate = txn.date >= from && txn.date <= to
      }
    }

    let matchesAmount = true
    if (minAmount) {
      matchesAmount = matchesAmount && txn.amountInBaseCurrency >= parseFloat(minAmount)
    }
    if (maxAmount) {
      matchesAmount = matchesAmount && txn.amountInBaseCurrency <= parseFloat(maxAmount)
    }

    return matchesSearch && matchesCategory && matchesType && matchesDate && matchesAmount
  })

  const grouped = groupByDate(filteredTransactions)
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const activeFilterCount = [
    selectedType,
    selectedCategory,
    selectedPeriod !== 'all' ? selectedPeriod : '',
    minAmount,
    maxAmount,
  ].filter(Boolean).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold serif-heading" style={{ color: 'var(--color-text-primary)' }}>
            {t('history.title')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Полная история ваших денежных операций
          </p>
        </div>

        {/* Filter toggle button */}
        <button
          id="history-filter-toggle"
          onClick={() => setShowFiltersPanel(!showFiltersPanel)}
          className="relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all border border-[var(--color-border)]"
          style={{
            background: activeFilterCount > 0 ? 'var(--color-text-primary)' : 'var(--color-surface-2)',
            color: activeFilterCount > 0 ? 'var(--color-surface)' : 'var(--color-text-secondary)',
          }}
        >
          <SlidersHorizontal size={13} />
          {t('history.filters')}
          {activeFilterCount > 0 && (
            <span className="text-[9px] font-bold bg-[var(--color-surface)] text-[var(--color-text-primary)] rounded-full w-4.5 h-4.5 flex items-center justify-center border border-[var(--color-border)]">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Toolbar */}
      <div className="space-y-3">
        {/* Search Input */}
        <Input
          id="search-input"
          placeholder={t('history.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search size={16} />}
        />

        {/* Quick type filter chips */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar py-0.5">
          {['', 'expense', 'income'].map((type) => (
            <button
              key={type || 'all'}
              onClick={() => setSelectedType(type)}
              className="shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 border border-[var(--color-border)]"
              style={{
                background: selectedType === type ? 'var(--color-text-primary)' : 'var(--color-surface-2)',
                color: selectedType === type ? 'var(--color-surface)' : 'var(--color-text-secondary)',
              }}
            >
              {type === '' ? t('history.allTypes') : type === 'expense' ? t('transaction.expense') : t('transaction.income')}
            </button>
          ))}

          {/* Period quick chips */}
          {(['today', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPeriod(selectedPeriod === p ? 'all' : p)}
              className="shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 border border-[var(--color-border)]"
              style={{
                background: selectedPeriod === p ? 'var(--color-text-primary)' : 'var(--color-surface-2)',
                color: selectedPeriod === p ? 'var(--color-surface)' : 'var(--color-text-secondary)',
              }}
            >
              {t(`dashboard.${p}`)}
            </button>
          ))}
        </div>

        {/* Advanced Filters Panel */}
        {showFiltersPanel && (
          <div
            className="p-4 rounded-2xl space-y-4 animate-fade-in"
            style={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                {t('history.filters')}
              </span>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setSelectedType('')
                    setSelectedCategory('')
                    setSelectedPeriod('all')
                    setMinAmount('')
                    setMaxAmount('')
                    setStartDate('')
                    setEndDate('')
                  }}
                  className="text-xs font-semibold"
                  style={{ color: 'var(--color-expense)' }}
                >
                  {t('common.cancel')} ({activeFilterCount})
                </button>
              )}
            </div>

            {/* Category select */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input-base text-xs"
            >
              <option value="">{t('history.allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>

            {/* Period selector */}
            <div className="grid grid-cols-3 gap-1.5">
              {(['all', 'today', 'week', 'month', 'year', 'custom'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPeriod(p)}
                  className="py-1.5 rounded-lg text-xs font-semibold transition-all border border-[var(--color-border)]"
                  style={{
                    background: selectedPeriod === p ? 'var(--color-text-primary)' : 'var(--color-surface)',
                    color: selectedPeriod === p ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                  }}
                >
                  {p === 'all' ? t('history.allTypes') : p === 'custom' ? 'Custom' : t(`dashboard.${p}`) || p}
                </button>
              ))}
            </div>

            {/* Custom date range */}
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
                placeholder={`Min (${settings.baseCurrency})`}
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="input-base text-xs flex-1"
              />
              <input
                type="number"
                placeholder={`Max (${settings.baseCurrency})`}
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="input-base text-xs flex-1"
              />
            </div>
          </div>
        )}
      </div>

      {/* List Container */}
      <div className="pt-2">
        {sortedDates.length === 0 ? (
          <div className="card p-10 flex flex-col items-center justify-center text-center animate-fade-in" style={{ background: 'var(--color-surface)' }}>
            <div className="w-12 h-12 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center text-xl mb-3">
              🔍
            </div>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              {t('history.noResults')}
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('history.noResultsHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between text-[10px] px-1" style={{ color: 'var(--color-text-muted)' }}>
              <span className="flex items-center gap-1 font-semibold uppercase tracking-wider">
                <ArrowUpDown size={10} />
                {t('history.swipeHint')}
              </span>
              <span className="font-semibold uppercase tracking-wider">
                {filteredTransactions.length} {t('history.transactions') || 'операций'}
              </span>
            </div>
            
            {sortedDates.map((date, dateIdx) => (
              <div key={date} className="animate-fade-in space-y-2.5" style={{ animationDelay: `${dateIdx * 30}ms` }}>
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                    {formatDate(date, i18n.language)}
                  </span>
                  <span className="text-xs font-medium amount-display" style={{ color: 'var(--color-text-muted)' }}>
                    −{formatAmount(
                      grouped[date]
                        .filter((txnItem) => txnItem.type === 'expense')
                        .reduce((accSum, txnItem) => accSum + txnItem.amountInBaseCurrency, 0),
                      settings.baseCurrency
                    )}
                  </span>
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
                        onEdit={() => toast.info(t('transaction.editTitle'))}
                        onDelete={(id: string) => setDeleteTargetId(id)}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleDelete}
        title={t('transaction.confirmDelete')}
        description={t('transaction.deleteWarning')}
        confirmLabel={t('transaction.delete')}
        cancelLabel={t('transaction.cancel')}
        danger
      />
    </div>
  )
}
