import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, ArchiveRestore } from 'lucide-react'
import type { Category, CategoryKind } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useBudgetStore } from '@/store/budgetStore'
import { CATEGORY_COLORS } from '@/lib/constants'
import { getCategoryName, pickCategoryColor } from '@/lib/categories'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'

const ICON_CHOICES: Record<CategoryKind, string[]> = {
  expense: ['🍕', '🛒', '☕', '🚗', '🚌', '🏠', '💡', '🎮', '🎬', '💊', '📱', '👕', '✈️', '🛍️', '📚', '🎁', '🐾', '📦'],
  income: ['💼', '💻', '🎁', '💰', '🏦', '📈', '🏠', '🤝', '🎓', '🛠️', '🪙', '📦'],
}

interface CategorySheetProps {
  isOpen: boolean
  onClose: () => void
  // When set, the sheet edits this category instead of adding a new one
  category?: Category
  // Which list a new category is added to
  kind: CategoryKind
}

export const CategorySheet: React.FC<CategorySheetProps> = ({ isOpen, onClose, category, kind }) => {
  const { t } = useTranslation()
  const { settings } = useAppStore()
  const { categories, addCategory, editCategory } = useCategoryStore()
  const { budgets, setBudgetLimit, removeBudget } = useBudgetStore()

  const [name, setName] = useState('')
  const [icon, setIcon] = useState(ICON_CHOICES[kind][0])
  const [color, setColor] = useState(CATEGORY_COLORS[0])
  const [limit, setLimit] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const budget = budgets.find((b) => b.categoryId === category?.id)
  // Built-in categories show their translated name; it is only stored if the user changes it
  const shownName = category ? getCategoryName(category, t) : ''
  const icons = ICON_CHOICES[kind].includes(icon) ? ICON_CHOICES[kind] : [icon, ...ICON_CHOICES[kind]]

  useEffect(() => {
    if (isOpen) {
      setName(shownName)
      setIcon(category?.icon ?? ICON_CHOICES[kind][0])
      setColor(category?.color ?? pickCategoryColor(categories))
      setLimit(budget?.monthlyLimit ? String(budget.monthlyLimit) : '')
    }
  }, [isOpen, category, kind]) // oxlint-disable-line react-hooks/exhaustive-deps -- reset only when the sheet opens

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('categories.nameRequired'))
      return
    }
    // An empty field or 0 means "no limit"
    const parsedLimit = limit.trim() === '' ? 0 : parseFloat(limit)
    if (isNaN(parsedLimit) || parsedLimit < 0) {
      toast.error(t('budgets.limitRequired'))
      return
    }

    setIsSaving(true)
    try {
      let categoryId = category?.id
      if (category) {
        const renamed = name.trim() !== shownName
        await editCategory(category.id, { icon, color, ...(renamed ? { name: name.trim() } : {}) })
      } else {
        const created = await addCategory({ userId: settings.userId, name: name.trim(), icon, color, kind, isArchived: false })
        categoryId = created.id
      }

      if (kind === 'expense' && categoryId) {
        if (parsedLimit > 0) await setBudgetLimit(categoryId, parsedLimit)
        else if (budget) await removeBudget(budget.id)
      }

      toast.success(t('settings.saved'))
      onClose()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleArchive = async () => {
    if (!category) return
    try {
      await editCategory(category.id, { isArchived: !category.isArchived })
      toast.success(category.isArchived ? t('categories.restored') : t('categories.archived'))
      onClose()
    } catch {
      toast.error(t('common.error'))
    }
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={category ? t('categories.editTitle') : t('categories.newTitle')}
    >
      <div className="space-y-4">
        <Input
          id="category-name-input"
          label={t('categories.name')}
          placeholder={t('categories.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div>
          <label className="text-xs font-semibold text-[var(--color-text-muted)] mb-2 block">{t('categories.icon')}</label>
          <div className="flex flex-wrap gap-2">
            {icons.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setIcon(emoji)}
                aria-pressed={icon === emoji}
                className={`text-xl p-2 rounded-xl border transition-all ${icon === emoji ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]' : 'border-[var(--color-border)]'}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--color-text-muted)] mb-2 block">{t('categories.color')}</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((choice) => (
              <button
                key={choice}
                onClick={() => setColor(choice)}
                className="w-7 h-7 rounded-full transition-transform"
                style={{
                  backgroundColor: choice,
                  transform: color === choice ? 'scale(1.15)' : 'scale(1)',
                  boxShadow: color === choice ? '0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-text-primary)' : 'none',
                }}
                aria-label={choice}
                aria-pressed={color === choice}
              />
            ))}
          </div>
        </div>

        {/* Monthly limit: outcome categories only */}
        {kind === 'expense' && (
          <div>
            <Input
              id="category-limit-input"
              type="number"
              inputMode="decimal"
              label={`${t('budgets.monthlyLimit')} (${settings.baseCurrency})`}
              placeholder="0"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
              {t('budgets.limitHint')}
            </p>
          </div>
        )}

        <div className="pt-1 flex gap-2">
          {category && (
            <Button
              variant="secondary"
              size="lg"
              onClick={handleToggleArchive}
              aria-label={category.isArchived ? t('accounts.restore') : t('categories.archive')}
              title={category.isArchived ? t('accounts.restore') : t('categories.archive')}
            >
              {category.isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
            </Button>
          )}
          <Button id="save-category-btn" fullWidth size="lg" onClick={handleSave} loading={isSaving}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
