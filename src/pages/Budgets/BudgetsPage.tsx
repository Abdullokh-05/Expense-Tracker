import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useTransactionStore } from '@/store/transactionStore'
import { formatAmount, formatPeriodLabel, getDateRange } from '@/lib/utils'
import { confirmedInRange } from '@/lib/analytics'
import { getCategoryName } from '@/lib/categories'
import { Edit2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/BottomSheet'
import { toast } from '@/components/ui/Toast'

export const BudgetsPage: React.FC = () => {
  const { t, i18n } = useTranslation()

  const { settings } = useAppStore()
  const categories = useCategoryStore((s) => s.categories)
  const { budgets, setBudgetLimit, removeBudget } = useBudgetStore()
  const transactions = useTransactionStore((s) => s.transactions)

  // Modal edit state
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [limitInput, setLimitInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Budgets are monthly: they are measured against the current calendar month
  const monthRange = getDateRange('month')
  const monthTransactions = confirmedInRange(transactions, monthRange)

  // Get current spending for category in base currency for this month
  const getCategorySpend = (categoryId: string) => {
    return monthTransactions
      .filter((txn) => txn.type === 'expense' && txn.categoryId === categoryId)
      .reduce((sum, txn) => sum + txn.amountInBaseCurrency, 0)
  }

  const handleOpenEdit = (categoryId: string, currentLimit?: number) => {
    setEditingCategoryId(categoryId)
    setLimitInput(currentLimit ? currentLimit.toString() : '')
  }

  const handleSaveLimit = async () => {
    if (!editingCategoryId) return
    // An empty field or 0 means "no limit": the budget is removed
    const parsedLimit = limitInput.trim() === '' ? 0 : parseFloat(limitInput)
    if (isNaN(parsedLimit) || parsedLimit < 0) {
      toast.error(t('budgets.limitRequired'))
      return
    }

    setIsSaving(true)
    try {
      const existing = budgets.find((b) => b.categoryId === editingCategoryId)
      if (parsedLimit > 0) {
        await setBudgetLimit(editingCategoryId, parsedLimit)
      } else if (existing) {
        await removeBudget(existing.id)
      }
      toast.success(t('settings.saved'))
      setEditingCategoryId(null)
    } catch {
      toast.error(t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  const activeCategories = categories.filter((c) => !c.isArchived)

  // Total summary of all set budgets
  const budgetedCategories = activeCategories.filter((cat) =>
    budgets.some((b) => b.categoryId === cat.id && b.monthlyLimit > 0)
  )
  const totalBudgeted = budgetedCategories.reduce(
    (sum, cat) => sum + (budgets.find((b) => b.categoryId === cat.id)?.monthlyLimit ?? 0),
    0
  )
  const totalSpentOnBudgeted = budgetedCategories.reduce((sum, cat) => sum + getCategorySpend(cat.id), 0)
  const overallPercentage = totalBudgeted > 0 ? (totalSpentOnBudgeted / totalBudgeted) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-bold serif-heading" style={{ color: 'var(--color-text-primary)' }}>
          {t('budgets.title')}
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('budgets.subtitle', { period: formatPeriodLabel('month', monthRange, i18n.language) })}
        </p>
      </div>

      {/* Hero Summary Card */}
      {totalBudgeted > 0 && (
        <div className="p-5 rounded-3xl animate-fade-in relative overflow-hidden"
             style={{
               background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
               boxShadow: 'var(--shadow-md)'
             }}>
          <div className="relative z-10 space-y-3">
            <div className="flex justify-between items-center text-xs text-white/60 font-semibold uppercase tracking-wider">
              <span>{t('budgets.totalLimit')}</span>
              <span>{Math.round(overallPercentage)}%</span>
            </div>
            <div className="text-2xl font-bold text-white amount-display">
              {formatAmount(totalSpentOnBudgeted, settings.baseCurrency)} / {formatAmount(totalBudgeted, settings.baseCurrency)}
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(overallPercentage, 100)}%`,
                  background: overallPercentage >= 90 ? 'var(--color-expense)' : overallPercentage >= 75 ? 'var(--color-warning)' : 'var(--color-income)'
                }}
              />
            </div>

            <p className="text-[11px] text-white/60">
              {overallPercentage >= 100
                ? t('budgets.limitExceeded')
                : t('budgets.remainingBudget', {
                    amount: formatAmount(totalBudgeted - totalSpentOnBudgeted, settings.baseCurrency),
                  })}
            </p>
          </div>
        </div>
      )}

      {/* Categories budgets list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
        {activeCategories.map((cat, idx) => {
          const budget = budgets.find((b) => b.categoryId === cat.id)
          const limit = budget?.monthlyLimit ?? 0
          const spent = getCategorySpend(cat.id)
          const percentage = limit > 0 ? (spent / limit) * 100 : 0

          // Color indicator logic
          let progressColor = 'var(--color-income)'
          let badgeBg = 'color-mix(in srgb, var(--color-income) 10%, transparent)'
          let badgeText = 'var(--color-income)'

          if (percentage >= 100) {
            progressColor = 'var(--color-expense)'
            badgeBg = 'color-mix(in srgb, var(--color-expense) 10%, transparent)'
            badgeText = 'var(--color-expense)'
          } else if (percentage >= 80) {
            progressColor = 'var(--color-warning)'
            badgeBg = 'color-mix(in srgb, var(--color-warning) 10%, transparent)'
            badgeText = 'var(--color-warning)'
          }

          const isExceeded = spent > limit && limit > 0

          return (
            <div
              key={cat.id}
              className="card p-4 space-y-3 animate-fade-in"
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                       style={{ background: 'var(--color-surface-2)' }}>
                    {cat.icon}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-bold block truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {getCategoryName(cat, t)}
                    </span>
                    {limit > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                            style={{ background: badgeBg, color: badgeText }}>
                        {isExceeded ? t('budgets.exceededStatus') : `${Math.round(percentage)}%`}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  id={`edit-budget-btn-${cat.id}`}
                  onClick={() => handleOpenEdit(cat.id, limit)}
                  className="p-2 rounded-xl transition-all shrink-0"
                  style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
                  aria-label={t('budgets.setLimit')}
                >
                  <Edit2 size={13} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('budgets.spent')}: </span>
                  <span className="font-semibold block amount-display" style={{ color: 'var(--color-text-primary)' }}>
                    {formatAmount(spent, settings.baseCurrency)}
                  </span>
                </div>
                <div className="text-right">
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('budgets.monthlyLimit')}: </span>
                  <span className="font-semibold block amount-display" style={{ color: 'var(--color-text-primary)' }}>
                    {limit > 0 ? formatAmount(limit, settings.baseCurrency) : t('budgets.noLimit')}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              {limit > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                    <div
                      style={{
                        width: `${Math.min(percentage, 100)}%`,
                        background: progressColor
                      }}
                      className="h-full rounded-full transition-all duration-300"
                    />
                  </div>

                  {isExceeded && (
                    <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: 'var(--color-expense)' }}>
                      <AlertTriangle size={11} />
                      <span>
                        {t('budgets.exceeded')}{' '}
                        {formatAmount(spent - limit, settings.baseCurrency)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Edit limit modal */}
      <Modal
        isOpen={editingCategoryId !== null}
        onClose={() => setEditingCategoryId(null)}
        title={t('budgets.setLimit')}
      >
        <div className="space-y-4">
          <Input
            id="budget-limit-input"
            type="number"
            inputMode="decimal"
            label={t('budgets.monthlyLimit')}
            placeholder="0"
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            leftIcon={<span style={{ color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>{settings.baseCurrency}</span>}
            className="pl-14"
            autoFocus
          />
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {t('budgets.limitHint')}
          </p>

          <div className="flex gap-2.5 pt-2">
            <Button variant="ghost" fullWidth onClick={() => setEditingCategoryId(null)}>
              {t('common.cancel')}
            </Button>
            <Button id="save-budget-limit-btn" fullWidth onClick={handleSaveLimit} loading={isSaving}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
