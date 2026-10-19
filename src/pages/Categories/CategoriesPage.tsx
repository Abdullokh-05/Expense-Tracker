import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVertical, Plus } from 'lucide-react'
import type { Category, CategoryKind } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useBudgetStore } from '@/store/budgetStore'
import { getCategoryKind, getCategoryName, sortCategories } from '@/lib/categories'
import { currencySymbol, formatListAmount } from '@/lib/utils'
import { PageHeader, GlassIconButton } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Button } from '@/components/ui/Button'
import { Row } from '@/components/ui/Row'
import { toast } from '@/components/ui/Toast'
import { CategoryEditPopUp } from '@/components/categories/CategoryEditPopUp'

// Settings › Categories and limits. The order here is the order on the add screen: hold the
// handle and drag, or focus it and use the arrow keys.
export const CategoriesPage: React.FC = () => {
  const { t } = useTranslation()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const categories = useCategoryStore((s) => s.categories)
  const reorderCategories = useCategoryStore((s) => s.reorderCategories)
  const budgets = useBudgetStore((s) => s.budgets)

  const [kind, setKind] = useState<CategoryKind>('expense')
  // undefined = closed, null = adding a new one, otherwise the one being edited
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)
  const [showArchived, setShowArchived] = useState(false)

  const ofKind = (k: CategoryKind) => sortCategories(categories.filter((c) => getCategoryKind(c) === k))
  const shown = ofKind(kind).filter((c) => !c.isArchived)
  const archived = ofKind(kind).filter((c) => c.isArchived)
  const countOf = (k: CategoryKind) => ofKind(k).filter((c) => !c.isArchived).length

  // ── Reordering ──
  const listRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ index: number; startY: number; rowHeight: number; target: number } | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const save = async (ids: string[]) => {
    try {
      await reorderCategories(ids)
    } catch {
      toast.error(t('common.error'))
    }
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= shown.length || to === from) return
    const ids = shown.map((c) => c.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    save(ids)
  }

  const rows = () => [...(listRef.current?.children ?? [])] as HTMLElement[]

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const row = rows()[index]
    if (!row) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { index, startY: e.clientY, rowHeight: row.getBoundingClientRect().height, target: index }
    setDragIndex(index)
  }

  const targetAt = (clientY: number) => {
    const d = drag.current!
    return Math.max(0, Math.min(shown.length - 1, d.index + Math.round((clientY - d.startY) / d.rowHeight)))
  }

  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.startY
    const target = targetAt(e.clientY)
    d.target = target
    // The dragged row follows the finger; the ones it passes step aside
    rows().forEach((row, i) => {
      if (i === d.index) row.style.transform = `translateY(${dy}px)`
      else if (i > d.index && i <= target) row.style.transform = `translateY(${-d.rowHeight}px)`
      else if (i < d.index && i >= target) row.style.transform = `translateY(${d.rowHeight}px)`
      else row.style.transform = ''
    })
  }

  // Where the finger lifts decides the place, even if no move came in between
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const target = e.type === 'pointerup' ? targetAt(e.clientY) : d.index
    drag.current = null
    setDragIndex(null)
    rows().forEach((row) => (row.style.transform = ''))
    move(d.index, target)
  }

  const limitText = (category: Category) => {
    const limit = budgets.find((b) => b.categoryId === category.id)?.monthlyLimit ?? 0
    return limit > 0 ? t('catPage.limit', { amount: formatListAmount(limit, base, base), currency: currencySymbol(base).symbol }) : undefined
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-[640px] mx-auto">
      <PageHeader
        title={t('categories.title')}
        back={{ label: t('nav.settings'), to: '/settings' }}
        action={
          <GlassIconButton label={t('categories.newTitle')} onClick={() => setEditing(null)}>
            <Plus size={22} strokeWidth={1.75} />
          </GlassIconButton>
        }
      />

      <SegmentedControl
        label={t('catPage.typeGroup')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: `${t('home.outcome')} · ${countOf('expense')}` },
          { value: 'income', label: `${t('home.income')} · ${countOf('income')}` },
        ]}
      />

      <section className="flex flex-col gap-2" aria-label={kind === 'expense' ? t('catPage.outList') : t('catPage.inList')}>
        <div ref={listRef} className={`sgroup cat-list${dragIndex !== null ? ' sorting' : ''}`}>
          {shown.map((category, index) => {
            const name = getCategoryName(category, t)
            const limit = limitText(category)
            return (
              <div key={category.id} className={`prow cat-row${dragIndex === index ? ' lifted' : ''}`}>
                <button
                  type="button"
                  className="cat-open"
                  aria-label={`${name}${limit ? `, ${limit}` : ''}, ${t('categories.edit')}`}
                  onClick={() => setEditing(category)}
                >
                  <span className="bub" style={{ '--c': category.color } as React.CSSProperties} aria-hidden="true">
                    {category.icon}
                  </span>
                  <span className="prow-main">
                    <span className="prow-title">
                      <span>{name}</span>
                    </span>
                    {limit && <span className="prow-sub">{limit}</span>}
                  </span>
                </button>
                <button
                  type="button"
                  className="drag"
                  aria-label={t('catPage.move', { name, position: index + 1, count: shown.length })}
                  onPointerDown={(e) => startDrag(e, index)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault()
                      move(index, index + (e.key === 'ArrowUp' ? -1 : 1))
                    }
                  }}
                >
                  <GripVertical size={20} strokeWidth={1.75} />
                </button>
              </div>
            )
          })}
        </div>
        <p className="sgroup-cap">{kind === 'expense' ? t('catPage.noteOut') : t('catPage.noteIn')}</p>
      </section>

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="t-over px-1">{t('accounts.archivedGroup')}</h2>
          <div className="sgroup">
            {showArchived ? (
              archived.map((category) => (
                <Row
                  key={category.id}
                  icon={category.icon}
                  className="[&_.prow-ico]:bg-fill opacity-70"
                  title={getCategoryName(category, t)}
                  chevron
                  onClick={() => setEditing(category)}
                />
              ))
            ) : (
              <Row title={t('accounts.showArchived', { count: archived.length })} chevron onClick={() => setShowArchived(true)} />
            )}
          </div>
        </section>
      )}

      <Button variant="tinted" fullWidth onClick={() => setEditing(null)}>
        <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
        {t('categories.newTitle')}
      </Button>

      <CategoryEditPopUp
        isOpen={editing !== undefined}
        onClose={() => setEditing(undefined)}
        category={editing ?? undefined}
        kind={editing ? getCategoryKind(editing) : kind}
      />
    </div>
  )
}
