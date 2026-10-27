import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, GripVertical, Plus } from 'lucide-react'
import type { Category, CategoryKind } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useBudgetStore } from '@/store/budgetStore'
import { getCategoryKind, getCategoryName, sortCategories, subcategoriesOf, topLevelCategories } from '@/lib/categories'
import { currencySymbol, formatListAmount } from '@/lib/utils'
import { PageHeader, GlassIconButton } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Button } from '@/components/ui/Button'
import { Row } from '@/components/ui/Row'
import { toast } from '@/components/ui/Toast'
import { CategoryEditPopUp } from '@/components/categories/CategoryEditPopUp'

// ── Drag to reorder one list: hold the handle and drag, or focus it and use the arrow keys ──
// Items are the list's children marked data-sortable; they can differ in height (a category
// with its subcategories open is taller), so places are worked out from where each one sits.
function useSortable(count: number, onMove: (from: number, to: number) => void) {
  const listRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ index: number; startY: number; rects: DOMRect[]; target: number } | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const items = () => [...(listRef.current?.children ?? [])].filter((el) => (el as HTMLElement).dataset.sortable !== undefined) as HTMLElement[]

  const targetAt = (clientY: number) => {
    const d = drag.current!
    const own = d.rects[d.index]
    // The dragged item's middle, where the finger has taken it
    const middle = own.top + own.height / 2 + (clientY - d.startY)
    let target = d.index
    d.rects.forEach((rect, i) => {
      const itsMiddle = rect.top + rect.height / 2
      if (i > d.index && middle > itsMiddle) target = Math.max(target, i)
      if (i < d.index && middle < itsMiddle) target = Math.min(target, i)
    })
    return target
  }

  const start = (e: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const rects = items().map((el) => el.getBoundingClientRect())
    if (!rects[index]) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { index, startY: e.clientY, rects, target: index }
    setDragIndex(index)
  }

  const moveTo = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.startY
    const target = targetAt(e.clientY)
    d.target = target
    // The dragged item follows the finger; the ones it passes step aside by its height
    const step = d.rects[d.index].height
    items().forEach((el, i) => {
      if (i === d.index) el.style.transform = `translateY(${dy}px)`
      else if (i > d.index && i <= target) el.style.transform = `translateY(${-step}px)`
      else if (i < d.index && i >= target) el.style.transform = `translateY(${step}px)`
      else el.style.transform = ''
    })
  }

  // Where the finger lifts decides the place, even if no move came in between
  const end = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const target = e.type === 'pointerup' ? targetAt(e.clientY) : d.index
    drag.current = null
    setDragIndex(null)
    items().forEach((el) => (el.style.transform = ''))
    if (target !== d.index) onMove(d.index, target)
  }

  const handleProps = (index: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => start(e, index),
    onPointerMove: moveTo,
    onPointerUp: end,
    onPointerCancel: end,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      const to = index + (e.key === 'ArrowUp' ? -1 : 1)
      if (to >= 0 && to < count) onMove(index, to)
    },
  })

  return { listRef, dragIndex, handleProps }
}

const reordered = (list: Category[], from: number, to: number) => {
  const ids = list.map((c) => c.id)
  const [moved] = ids.splice(from, 1)
  ids.splice(to, 0, moved)
  return ids
}

// A category's subcategories, under it and indented; they reorder among themselves
const SubList: React.FC<{
  parent: Category
  subs: Category[]
  onSave: (ids: string[]) => void
  onEdit: (sub: Category) => void
}> = ({ parent, subs, onSave, onEdit }) => {
  const { t } = useTranslation()
  const { listRef, dragIndex, handleProps } = useSortable(subs.length, (from, to) => onSave(reordered(subs, from, to)))
  return (
    <div ref={listRef} className={`cat-subs${dragIndex !== null ? ' sorting' : ''}`} role="list" aria-label={t('catPage.subsOf', { name: getCategoryName(parent, t) })}>
      {subs.map((sub, index) => {
        const name = getCategoryName(sub, t)
        return (
          <div key={sub.id} data-sortable="" role="listitem" className={`prow cat-row sub${dragIndex === index ? ' lifted' : ''}`}>
            <button type="button" className="cat-open" aria-label={`${name}, ${t('catEdit.editSubTitle')}`} onClick={() => onEdit(sub)}>
              <span className="bub" style={{ '--c': parent.color } as React.CSSProperties} aria-hidden="true">
                {sub.icon}
              </span>
              <span className="prow-main">
                <span className="prow-title">
                  <span>{name}</span>
                </span>
              </span>
            </button>
            <button type="button" className="drag" aria-label={t('catPage.move', { name, position: index + 1, count: subs.length })} {...handleProps(index)}>
              <GripVertical size={20} strokeWidth={1.75} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// Settings › Categories and limits. The order here is the order on the add screen.
export const CategoriesPage: React.FC = () => {
  const { t } = useTranslation()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const categories = useCategoryStore((s) => s.categories)
  const reorderCategories = useCategoryStore((s) => s.reorderCategories)
  const budgets = useBudgetStore((s) => s.budgets)

  const [kind, setKind] = useState<CategoryKind>('expense')
  // undefined = closed; otherwise the category (none: a new one) and, for a subcategory, its parent
  const [editing, setEditing] = useState<{ category?: Category; parent?: Category } | undefined>(undefined)
  const [showArchived, setShowArchived] = useState(false)
  // Categories whose subcategories are showing
  const [open, setOpen] = useState<Set<string>>(() => new Set())

  const ofKind = (k: CategoryKind) => sortCategories(topLevelCategories(categories).filter((c) => getCategoryKind(c) === k))
  const shown = ofKind(kind).filter((c) => !c.isArchived)
  const archived = ofKind(kind).filter((c) => c.isArchived)
  const countOf = (k: CategoryKind) => ofKind(k).filter((c) => !c.isArchived).length

  const save = async (ids: string[]) => {
    try {
      await reorderCategories(ids)
    } catch {
      toast.error(t('common.error'))
    }
  }
  const { listRef, dragIndex, handleProps } = useSortable(shown.length, (from, to) => save(reordered(shown, from, to)))

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

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
          <GlassIconButton label={t('categories.newTitle')} onClick={() => setEditing({})}>
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
            const subs = subcategoriesOf(categories, category.id)
            const expanded = subs.length > 0 && open.has(category.id)
            return (
              <div key={category.id} data-sortable="" className={`cat-block${dragIndex === index ? ' lifted' : ''}`}>
                <div className="prow cat-row">
                  <button
                    type="button"
                    className="cat-open"
                    aria-label={`${name}${limit ? `, ${limit}` : ''}, ${t('categories.edit')}`}
                    onClick={() => setEditing({ category })}
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
                  {subs.length > 0 && (
                    <button
                      type="button"
                      className={`cat-expand${expanded ? ' open' : ''}`}
                      aria-expanded={expanded}
                      aria-label={t(expanded ? 'catPage.hideSubs' : 'catPage.showSubs', { name, count: subs.length })}
                      onClick={() => toggle(category.id)}
                    >
                      <span className="num">{subs.length}</span>
                      <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" className="drag" aria-label={t('catPage.move', { name, position: index + 1, count: shown.length })} {...handleProps(index)}>
                    <GripVertical size={20} strokeWidth={1.75} />
                  </button>
                </div>
                {expanded && (
                  <SubList parent={category} subs={subs} onSave={save} onEdit={(sub) => setEditing({ category: sub, parent: category })} />
                )}
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
                  onClick={() => setEditing({ category })}
                />
              ))
            ) : (
              <Row title={t('accounts.showArchived', { count: archived.length })} chevron onClick={() => setShowArchived(true)} />
            )}
          </div>
        </section>
      )}

      <Button variant="tinted" fullWidth onClick={() => setEditing({})}>
        <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
        {t('categories.newTitle')}
      </Button>

      <CategoryEditPopUp
        isOpen={editing !== undefined}
        onClose={() => setEditing(undefined)}
        category={editing?.category}
        parent={editing?.parent}
        kind={editing?.category ? getCategoryKind(editing.category) : kind}
      />
    </div>
  )
}
