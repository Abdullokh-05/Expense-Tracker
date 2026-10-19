import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import type { Category, CategoryKind } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useBudgetStore } from '@/store/budgetStore'
import { getCategoryKind, getCategoryName, sortCategories } from '@/lib/categories'
import { formatListAmount } from '@/lib/utils'
import { PageHeader, GlassIconButton } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Row, RowGroup } from '@/components/ui/Row'
import { CategorySheet } from '@/components/categories/CategorySheet'

// Settings › Categories and limits: outcome and income categories, each with its monthly limit
export const CategoriesPage: React.FC = () => {
  const { t } = useTranslation()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const categories = useCategoryStore((s) => s.categories)
  const budgets = useBudgetStore((s) => s.budgets)

  const [kind, setKind] = useState<CategoryKind>('expense')
  // undefined = closed, null = adding a new one, otherwise the one being edited
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)
  const [showArchived, setShowArchived] = useState(false)

  const ofKind = sortCategories(categories.filter((c) => getCategoryKind(c) === kind))
  const shown = ofKind.filter((c) => !c.isArchived)
  const archived = ofKind.filter((c) => c.isArchived)

  const renderRow = (category: Category) => {
    const limit = budgets.find((b) => b.categoryId === category.id)?.monthlyLimit ?? 0
    return (
      <Row
        key={category.id}
        icon={category.icon}
        className={`[&_.prow-ico]:bg-fill${category.isArchived ? ' opacity-60' : ''}`}
        title={getCategoryName(category, t)}
        value={limit > 0 ? t('accounts.limitLabel', { amount: formatListAmount(limit, base, base) }) : undefined}
        chevron
        onClick={() => setEditing(category)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-[640px] mx-auto">
      <PageHeader
        title={t('settings.categoriesLimits')}
        back={{ label: t('nav.settings'), to: '/settings' }}
        action={
          <GlassIconButton label={t('categories.add')} onClick={() => setEditing(null)}>
            <Plus size={22} strokeWidth={1.75} />
          </GlassIconButton>
        }
      />

      <SegmentedControl
        label={t('settings.categoriesLimits')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: t('home.outcome') },
          { value: 'income', label: t('home.income') },
        ]}
      />

      <RowGroup>{shown.map(renderRow)}</RowGroup>

      {archived.length > 0 && (
        <RowGroup title={t('accounts.archivedGroup')}>
          {showArchived ? (
            archived.map(renderRow)
          ) : (
            <Row title={t('accounts.showArchived', { count: archived.length })} chevron onClick={() => setShowArchived(true)} />
          )}
        </RowGroup>
      )}

      <CategorySheet
        isOpen={editing !== undefined}
        onClose={() => setEditing(undefined)}
        category={editing ?? undefined}
        kind={editing ? getCategoryKind(editing) : kind}
      />
    </div>
  )
}
