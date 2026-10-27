import React, { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Gauge, GripVertical, Plus } from 'lucide-react'
import type { Category } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useTransactionStore } from '@/store/transactionStore'
import { getCategoryKind, getCategoryName, subcategoriesOf } from '@/lib/categories'
import { confirmedInRange } from '@/lib/analytics'
import { reordered, useSortable } from '@/lib/useSortable'
import { formatListAmount, getDateRange } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { toast } from '@/components/ui/Toast'
import { CategoryEditPopUp } from '@/components/categories/CategoryEditPopUp'
import { CategoryBubble } from './CategoriesPage'

// Settings › Categories › one category: the category itself, its monthly limit and its
// subcategories. Tapping any of them opens it for editing; the handles reorder the
// subcategories.
export const CategoryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const categories = useCategoryStore((s) => s.categories)
  const reorderCategories = useCategoryStore((s) => s.reorderCategories)
  const budgets = useBudgetStore((s) => s.budgets)
  const transactions = useTransactionStore((s) => s.transactions)
  // undefined = closed; otherwise the category or subcategory to edit (null: a new subcategory)
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)

  const category = categories.find((c) => c.id === id && !c.parentId)
  const subs = category ? subcategoriesOf(categories, category.id) : []
  const save = async (ids: string[]) => {
    try {
      await reorderCategories(ids)
    } catch {
      toast.error(t('common.error'))
    }
  }
  const { listRef, dragIndex, handleProps } = useSortable(subs.length, (from, to) => save(reordered(subs, from, to)))

  // This month: how many entries and how much, by subcategory too
  const month = useMemo(() => {
    const spent = new Map<string, number>()
    let count = 0
    for (const txn of confirmedInRange(transactions, getDateRange('month'))) {
      if (!category || txn.categoryId !== category.id) continue
      count += 1
      spent.set(category.id, (spent.get(category.id) ?? 0) + txn.amountInBaseCurrency)
      if (txn.subcategoryId) spent.set(txn.subcategoryId, (spent.get(txn.subcategoryId) ?? 0) + txn.amountInBaseCurrency)
    }
    return { count, spent }
  }, [transactions, category])

  // Deleted (or never there): back to the list
  if (!category) return <Navigate to="/settings/categories" replace />

  const kind = getCategoryKind(category)
  const name = getCategoryName(category, t)
  const limit = budgets.find((b) => b.categoryId === category.id)?.monthlyLimit ?? 0
  const money = (value: number) => formatListAmount(value, base, base)

  return (
    <div className="flex flex-col gap-5 w-full max-w-[640px] mx-auto">
      <PageHeader
        title={name}
        back={{ label: t('categories.title'), to: '/settings/categories' }}
        action={
          <button type="button" className="hpill glassy" onClick={() => setEditing(category)}>
            {t('common.edit')}
          </button>
        }
      />

      <div className="fgroup">
        <button type="button" className="frow tall" onClick={() => setEditing(category)}>
          <CategoryBubble category={category} />
          <span className="frow-main">
            <span className="frow-title">{name}</span>
            <span className="frow-sub">
              {t('catEdit.entriesThisMonth', { count: month.count })}
            </span>
          </span>
          <span className="frow-val num">{money(month.spent.get(category.id) ?? 0)}</span>
        </button>
        {kind === 'expense' && (
          <button type="button" className="frow" onClick={() => setEditing(category)}>
            <span className="fico">
              <Gauge size={18} strokeWidth={1.75} />
            </span>
            <span className="frow-title">{t('budgets.monthlyLimit')}</span>
            <span className="frow-val num">{limit > 0 ? money(limit) : t('add.off')}</span>
            <ChevronRight size={18} strokeWidth={2} className="frow-go" aria-hidden="true" />
          </button>
        )}
      </div>

      {!category.isArchived && (
        <section className="flex flex-col gap-2">
          <h2 className="t-over px-4">{t('catEdit.subsTitle')}</h2>
          <div ref={listRef} className="fgroup" role="list" aria-label={t('catPage.subsOf', { name })}>
            {subs.map((sub, index) => {
              const subName = getCategoryName(sub, t)
              return (
                <div key={sub.id} data-sortable="" role="listitem" className={`frow sortable${dragIndex === index ? ' lifted' : ''}`}>
                  <button type="button" className="frow-hit" aria-label={`${subName}, ${t('catEdit.editSubTitle')}`} onClick={() => setEditing(sub)}>
                    <CategoryBubble category={sub} color={category.color} />
                    <span className="frow-title">{subName}</span>
                    {month.spent.get(sub.id) ? <span className="frow-val num">{money(month.spent.get(sub.id)!)}</span> : null}
                  </button>
                  {subs.length > 1 && (
                    <button type="button" className="drag" aria-label={t('catPage.move', { name: subName, position: index + 1, count: subs.length })} {...handleProps(index)}>
                      <GripVertical size={20} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              )
            })}
            <button type="button" className="frow add" onClick={() => setEditing(null)}>
              <span className="cico add" aria-hidden="true">
                <Plus size={18} strokeWidth={2.25} />
              </span>
              <span className="frow-title">{t('catEdit.addSub')}</span>
            </button>
          </div>
          {subs.length === 0 && <p className="fsec-cap">{t('catEdit.subsHint')}</p>}
        </section>
      )}

      <CategoryEditPopUp
        isOpen={editing !== undefined}
        onClose={() => setEditing(undefined)}
        category={editing ?? undefined}
        parent={editing === null || editing?.parentId ? category : undefined}
        kind={kind}
      />
    </div>
  )
}
