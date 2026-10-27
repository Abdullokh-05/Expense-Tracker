import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, GripVertical, Plus } from 'lucide-react'
import type { Category, CategoryKind } from '@/types'
import { useCategoryStore } from '@/store/categoryStore'
import { useTransactionStore } from '@/store/transactionStore'
import { frequentCategories, getCategoryKind, getCategoryName, sortCategories, subcategoriesOf, topLevelCategories } from '@/lib/categories'
import { reordered, useSortable } from '@/lib/useSortable'
import { PageHeader } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { toast } from '@/components/ui/Toast'
import { CategoryEditPopUp } from '@/components/categories/CategoryEditPopUp'

// A category's round icon in its colour
export const CategoryBubble: React.FC<{ category: Category; color?: string; size?: 'sm' | 'lg' }> = ({ category, color, size }) => (
  <span className={`cico${size ? ` ${size}` : ''}`} style={{ '--c': color ?? category.color } as React.CSSProperties} aria-hidden="true">
    {category.icon}
  </span>
)

// Settings › Categories: the most used ones, then every category in the order of the add
// screen. A category opens its own page (subcategories, limit, edit); Edit turns on the
// handles that reorder the list.
export const CategoriesPage: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const categories = useCategoryStore((s) => s.categories)
  const reorderCategories = useCategoryStore((s) => s.reorderCategories)
  const transactions = useTransactionStore((s) => s.transactions)

  const [kind, setKind] = useState<CategoryKind>('expense')
  const [sorting, setSorting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const ofKind = (k: CategoryKind) => sortCategories(topLevelCategories(categories).filter((c) => getCategoryKind(c) === k))
  const shown = ofKind(kind).filter((c) => !c.isArchived)
  const archived = ofKind(kind).filter((c) => c.isArchived)
  const frequent = frequentCategories(categories, transactions, kind, 4)

  const save = async (ids: string[]) => {
    try {
      await reorderCategories(ids)
    } catch {
      toast.error(t('common.error'))
    }
  }
  const { listRef, dragIndex, handleProps } = useSortable(shown.length, (from, to) => save(reordered(shown, from, to)))
  const open = (category: Category) => navigate(`/settings/categories/${category.id}`)

  return (
    <div className="flex flex-col gap-5 w-full max-w-[640px] mx-auto">
      <PageHeader
        title={t('categories.title')}
        back={{ label: t('nav.settings'), to: '/settings' }}
        action={
          <button type="button" className="hpill glassy" aria-pressed={sorting} onClick={() => setSorting(!sorting)}>
            {sorting ? t('common.done') : t('common.edit')}
          </button>
        }
      />

      <SegmentedControl
        label={t('catPage.typeGroup')}
        value={kind}
        onChange={(next) => {
          setKind(next)
          setShowArchived(false)
        }}
        options={[
          { value: 'expense', label: t('home.outcome') },
          { value: 'income', label: t('home.income') },
        ]}
      />

      {frequent.length > 0 && !sorting && (
        <section className="flex flex-col gap-2">
          <h2 className="t-over px-4">{t('add.mostFrequent')}</h2>
          <div className="fgroup freq">
            {frequent.map((category) => (
              <button key={category.id} type="button" className="freq-item" onClick={() => open(category)}>
                <CategoryBubble category={category} />
                <span className="freq-name">{getCategoryName(category, t)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2" aria-label={kind === 'expense' ? t('catPage.outList') : t('catPage.inList')}>
        <h2 className="t-over px-4">{t('add.allCategories')}</h2>
        <div ref={listRef} className={`fgroup${dragIndex !== null ? ' sorting' : ''}`}>
          {shown.map((category, index) => {
            const name = getCategoryName(category, t)
            const subs = subcategoriesOf(categories, category.id).length
            return (
              <div key={category.id} data-sortable="" className={`frow sortable${dragIndex === index ? ' lifted' : ''}`}>
                <button type="button" className="frow-hit" aria-label={name} onClick={() => open(category)}>
                  <CategoryBubble category={category} />
                  <span className="frow-title">{name}</span>
                  {subs > 0 && <span className="frow-val">{subs}</span>}
                  {!sorting && <ChevronRight size={18} strokeWidth={2} className="frow-go" aria-hidden="true" />}
                </button>
                {sorting && (
                  <button type="button" className="drag" aria-label={t('catPage.move', { name, position: index + 1, count: shown.length })} {...handleProps(index)}>
                    <GripVertical size={20} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            )
          })}
          <button type="button" className="frow add" onClick={() => setAdding(true)}>
            <span className="cico add" aria-hidden="true">
              <Plus size={18} strokeWidth={2.25} />
            </span>
            <span className="frow-title">{t('categories.newTitle')}</span>
          </button>
        </div>
        <p className="fsec-cap">{sorting ? t('catPage.dragHint') : t('catPage.orderHint', { edit: t('common.edit') })}</p>
      </section>

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="t-over px-4">{t('accounts.archivedGroup')}</h2>
          <div className="fgroup">
            {showArchived ? (
              archived.map((category) => (
                <button key={category.id} type="button" className="frow opacity-70" onClick={() => open(category)}>
                  <CategoryBubble category={category} />
                  <span className="frow-title">{getCategoryName(category, t)}</span>
                  <ChevronRight size={18} strokeWidth={2} className="frow-go" aria-hidden="true" />
                </button>
              ))
            ) : (
              <button type="button" className="frow" onClick={() => setShowArchived(true)}>
                <span className="frow-title">{t('accounts.showArchived', { count: archived.length })}</span>
                <ChevronRight size={18} strokeWidth={2} className="frow-go" aria-hidden="true" />
              </button>
            )}
          </div>
        </section>
      )}

      <CategoryEditPopUp isOpen={adding} onClose={() => setAdding(false)} kind={kind} onCreated={open} />
    </div>
  )
}
