import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useTransactionStore } from '@/store/transactionStore'
import { formatAmount, getDateRange } from '@/lib/utils'
import { ArrowLeft, Edit2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/BottomSheet'
import { toast } from '@/components/ui/Toast'

export const BudgetsPage: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  
  const { settings } = useAppStore()
  const { categories, loadCategories } = useCategoryStore()
  const { budgets, loadBudgets, setBudgetLimit } = useBudgetStore()
  const { transactions, loadTransactions } = useTransactionStore()

  // Modal edit state
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [limitInput, setLimitInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const loadData = useCallback(async () => {
    // Load current month transactions
    const { from, to } = getDateRange('month')
    await loadTransactions({ from, to, status: 'confirmed' })
    await loadCategories()
    await loadBudgets()
  }, [loadTransactions, loadCategories, loadBudgets])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Get current spending for category in base currency for this month
  const getCategorySpend = (categoryId: string) => {
    return transactions
      .filter((txn) => txn.type === 'expense' && txn.categoryId === categoryId)
      .reduce((sum, txn) => sum + txn.amountInBaseCurrency, 0)
  }

  const handleOpenEdit = (categoryId: string, currentLimit?: number) => {
    setEditingCategoryId(categoryId)
    setLimitInput(currentLimit ? currentLimit.toString() : '')
  }

  const handleSaveLimit = async () => {
    if (!editingCategoryId) return
    const parsedLimit = parseFloat(limitInput)
    if (isNaN(parsedLimit) || parsedLimit < 0) {
      toast.error(t('budgets.limitRequired') || 'Введите лимит')
      return
    }

    setIsSaving(true)
    try {
      await setBudgetLimit(editingCategoryId, parsedLimit)
      toast.success(t('settings.saved'))
      setEditingCategoryId(null)
      loadBudgets()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  const activeCategories = categories.filter((c) => !c.isArchived)

  // Total summary of all set budgets
  const totalBudgeted = budgets.reduce((sum, b) => sum + b.monthlyLimit, 0)
  const totalSpentOnBudgeted = activeCategories.reduce((sum, cat) => {
    const budget = budgets.find((b) => b.categoryId === cat.id)
    if (budget && budget.monthlyLimit > 0) {
      return sum + getCategorySpend(cat.id)
    }
    return sum;
  }, 0)
  const overallPercentage = totalBudgeted > 0 ? (totalSpentOnBudgeted / totalBudgeted) * 100 : 0

  return (
    <div className="flex flex-col min-h-full" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          paddingTop: 'max(1.25rem, env(safe-area-inset-top))',
          paddingLeft: '1.25rem',
          paddingRight: '1.25rem',
          paddingBottom: '1rem',
        }}
        className="flex items-center gap-3 shrink-0"
      >
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl transition-colors"
          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-primary)' }}
          aria-label={t('common.back')}
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('budgets.title')}
        </h1>
      </div>

      {/* Hero Summary Card */}
      {totalBudgeted > 0 && (
        <div className="mx-4 mt-4 p-5 rounded-3xl animate-fade-in relative overflow-hidden"
             style={{
               background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
               boxShadow: 'var(--shadow-md)'
             }}>
          <div className="relative z-10 space-y-3">
            <div className="flex justify-between items-center text-xs text-white/60 font-semibold uppercase tracking-wider">
              <span>{t('budgets.monthlyLimit') || 'Общий лимит'}</span>
              <span>{Math.round(overallPercentage)}%</span>
            </div>
            <div className="text-2xl font-bold text-white">
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
            
            <p className="text-[11px] text-white/50">
              {overallPercentage >= 100 
                ? (t('budgets.limitExceeded') || 'Общий бюджет превышен!')
                : (t('budgets.remainingBudget') || 'Осталось до превышения: ') + formatAmount(Math.max(0, totalBudgeted - totalSpentOnBudgeted), settings.baseCurrency)}
            </p>
          </div>
        </div>
      )}

      {/* Categories budgets list */}
      <div className="p-4 space-y-3 flex-1 animate-fade-in">
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
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                       style={{ background: 'var(--color-surface-2)' }}>
                    {cat.icon}
                  </div>
                  <div>
                    <span className="text-sm font-bold block" style={{ color: 'var(--color-text-primary)' }}>
                      {cat.name}
                    </span>
                    {limit > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                            style={{ background: badgeBg, color: badgeText }}>
                        {isExceeded ? (t('budgets.exceededStatus') || 'Превышено') : `${Math.round(percentage)}%`}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  id={`edit-budget-btn-${cat.id}`}
                  onClick={() => handleOpenEdit(cat.id, limit)}
                  className="p-2 rounded-xl transition-all"
                  style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
                  aria-label={t('budgets.setLimit')}
                >
                  <Edit2 size={13} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('budgets.spent')}: </span>
                  <span className="font-semibold block" style={{ color: 'var(--color-text-primary)' }}>
                    {formatAmount(spent, settings.baseCurrency)}
                  </span>
                </div>
                <div className="text-right">
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('budgets.monthlyLimit')}: </span>
                  <span className="font-semibold block" style={{ color: 'var(--color-text-primary)' }}>
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
                        {t('budgets.exceeded') || 'Превышено на'}{' '}
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
            leftIcon={<span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{settings.baseCurrency}</span>}
            autoFocus
          />

          <div className="flex gap-2.5 pt-2">
            <Button variant="ghost" fullWidth onClick={() => setEditingCategoryId(null)}>
              {t('common.cancel')}
            </Button>
            <Button id="save-budget-limit-btn" fullWidth onClick={handleSaveLimit} loading={isSaving}>
              {t('budgets.save') || t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
