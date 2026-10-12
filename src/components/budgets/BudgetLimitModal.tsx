import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Category } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useBudgetStore } from '@/store/budgetStore'
import { getCategoryName } from '@/lib/categories'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/BottomSheet'
import { toast } from '@/components/ui/Toast'

interface BudgetLimitModalProps {
  // The expense category whose monthly limit is being set; null keeps the modal closed
  category: Category | null
  onClose: () => void
}

export const BudgetLimitModal: React.FC<BudgetLimitModalProps> = ({ category, onClose }) => {
  const { t } = useTranslation()
  const { settings } = useAppStore()
  const { budgets, setBudgetLimit, removeBudget } = useBudgetStore()
  const [limitInput, setLimitInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const existing = budgets.find((b) => b.categoryId === category?.id)

  useEffect(() => {
    if (category) setLimitInput(existing?.monthlyLimit ? String(existing.monthlyLimit) : '')
  }, [category]) // oxlint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!category) return
    // An empty field or 0 means "no limit": the budget is removed
    const parsedLimit = limitInput.trim() === '' ? 0 : parseFloat(limitInput)
    if (isNaN(parsedLimit) || parsedLimit < 0) {
      toast.error(t('budgets.limitRequired'))
      return
    }

    setIsSaving(true)
    try {
      if (parsedLimit > 0) {
        await setBudgetLimit(category.id, parsedLimit)
      } else if (existing) {
        await removeBudget(existing.id)
      }
      toast.success(t('settings.saved'))
      onClose()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={category !== null}
      onClose={onClose}
      title={category ? `${t('budgets.setLimit')} · ${getCategoryName(category, t)}` : undefined}
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
          <Button variant="ghost" fullWidth onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button id="save-budget-limit-btn" fullWidth onClick={handleSave} loading={isSaving}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
