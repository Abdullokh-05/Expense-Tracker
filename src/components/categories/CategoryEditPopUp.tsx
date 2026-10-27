import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, ArchiveRestore, Ellipsis, Gauge, Trash2 } from 'lucide-react'
import type { Category, CategoryKind } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useTransactionStore } from '@/store/transactionStore'
import { CATEGORY_COLORS, CATEGORY_EMOJIS } from '@/lib/constants'
import { findOtherCategory, getCategoryName, isOtherCategory, pickCategoryColor } from '@/lib/categories'
import { confirmedInRange } from '@/lib/analytics'
import { currencySymbol, formatListAmount, formatNumber, getDateRange, parseMoneyInput, sanitizeMoneyInput, roundMoney } from '@/lib/utils'
import { PopUp } from '@/components/ui/PopUp'
import { ConfirmDialog } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { toast } from '@/components/ui/Toast'

// The emoji row shows these first; "More" opens every icon
const QUICK_ICONS: Record<CategoryKind, string[]> = {
  expense: ['🍕', '🛒', '☕', '🍽️', '🚗', '🚕', '⛽', '🏠', '💡', '📱', '🎮', '🎬', '💊', '👕', '✈️', '🛍️', '📚', '🎁', '🐾', '📦'],
  income: ['💼', '💻', '🎁', '💰', '🏦', '📈', '🪙', '💸', '🤝', '🎓', '🛠️', '📦'],
}

interface CategoryEditPopUpProps {
  isOpen: boolean
  onClose: () => void
  // Edits this category; without it a new one is added to `kind`
  category?: Category
  kind: CategoryKind
  // Set for a subcategory: the category it belongs to (adding or editing one)
  parent?: Category
  // Called with a category just added (the add sheet picks it straight away)
  onCreated?: (category: Category) => void
}

// One category: name, icon, colour and (for outcome) a monthly limit; its subcategories are
// on the category's own page.
// A subcategory has only a name and an icon: it wears its parent's colour, and the parent's
// limit already counts it. Saved with Save.
export const CategoryEditPopUp: React.FC<CategoryEditPopUpProps> = ({ isOpen, onClose, category, kind, parent: parentProp, onCreated }) => {
  const { t } = useTranslation()
  const settings = useAppStore((s) => s.settings)
  const { categories, addCategory, editCategory, removeCategory, removeSubcategory } = useCategoryStore()
  const { budgets, setBudgetLimit, removeBudget } = useBudgetStore()
  const transactions = useTransactionStore((s) => s.transactions)
  const base = settings.baseCurrency

  const parent = parentProp ?? categories.find((c) => c.id === category?.parentId)
  const isSub = Boolean(parent)
  const budget = isSub ? undefined : budgets.find((b) => b.categoryId === category?.id)
  // Built-in categories show their translated name; it's only stored if the user changes it
  const shownName = category ? getCategoryName(category, t) : ''
  // The category or subcategory waiting for "Delete" to be confirmed
  const [deleting, setDeleting] = useState<Category | null>(null)

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState('')
  const [limitOn, setLimitOn] = useState(false)
  const [limit, setLimit] = useState('')
  const [allIcons, setAllIcons] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setName(shownName)
    setIcon(category?.icon ?? QUICK_ICONS[kind][0])
    setColor(parent?.color ?? category?.color ?? pickCategoryColor(categories))
    setLimitOn(Boolean(budget?.monthlyLimit))
    setLimit(budget?.monthlyLimit ? formatNumber(budget.monthlyLimit, settings.baseCurrency) : '')
    setAllIcons(false)
    setDeleting(null)
  }, [isOpen, category, kind]) // oxlint-disable-line react-hooks/exhaustive-deps -- reset only when it opens

  // The chosen icon can sit far along the row: bring it into view when the pop-up opens
  const iconRowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isOpen) return
    const row = iconRowRef.current
    const chosen = row?.querySelector<HTMLElement>('.emo-btn.on')
    if (row && chosen) row.scrollLeft = chosen.offsetLeft - row.clientWidth / 2 + chosen.offsetWidth / 2
  }, [isOpen, icon])

  // This month so far, for the line under the limit
  const month = useMemo(() => {
    if (!category) return { count: 0, spent: 0 }
    // A category's entries include its subcategories' (they keep the parent as categoryId)
    const inMonth = confirmedInRange(transactions, getDateRange('month')).filter((txn) =>
      isSub ? txn.subcategoryId === category.id : txn.categoryId === category.id
    )
    return { count: inMonth.length, spent: inMonth.reduce((sum, txn) => roundMoney(sum + txn.amountInBaseCurrency), 0) }
  }, [category, transactions, isSub])

  // The current icon and colour stay offered even when they aren't in the usual sets
  const quickIcons = QUICK_ICONS[kind].includes(icon) || !icon ? QUICK_ICONS[kind] : [icon, ...QUICK_ICONS[kind]]
  const iconChoices = allIcons ? [...new Set([...quickIcons, ...CATEGORY_EMOJIS])] : quickIcons
  const palette: { color: string; key?: string }[] = CATEGORY_COLORS.some((c) => c.color.toLowerCase() === color.toLowerCase())
    ? [...CATEGORY_COLORS]
    : [{ color }, ...CATEGORY_COLORS]

  const parsedLimit = limitOn ? parseMoneyInput(limit) : 0
  const limitLine =
    category && limitOn && parsedLimit && parsedLimit > 0
      ? month.spent > parsedLimit
        ? t('catEdit.overLine', { spent: formatListAmount(month.spent, base, base), over: formatListAmount(month.spent - parsedLimit, base, base) })
        : t('catEdit.leftLine', { spent: formatListAmount(month.spent, base, base), left: formatListAmount(parsedLimit - month.spent, base, base) })
      : null

  const save = async () => {
    if (!name.trim()) {
      toast.error(t('categories.nameRequired'))
      return
    }
    if (limitOn && (parsedLimit === null || parsedLimit <= 0)) {
      toast.error(t('budgets.limitRequired'))
      return
    }
    setSaving(true)
    try {
      let categoryId = category?.id
      if (category) {
        const renamed = name.trim() !== shownName
        await editCategory(category.id, { icon, ...(isSub ? {} : { color }), ...(renamed ? { name: name.trim() } : {}) })
      } else {
        const created = await addCategory({
          userId: settings.userId,
          name: name.trim(),
          icon,
          color: parent?.color ?? color,
          kind,
          isArchived: false,
          ...(parent ? { parentId: parent.id } : {}),
        })
        categoryId = created.id
        onCreated?.(created)
      }
      // Limits are for outcome only, and set on the parent (it counts its subcategories)
      if (kind === 'expense' && categoryId && !isSub) {
        if (limitOn && parsedLimit) await setBudgetLimit(categoryId, parsedLimit)
        else if (budget) await removeBudget(budget.id)
      }
      toast.success(category ? t('settings.saved') : t('categories.added'))
      onClose()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  // Archived categories keep their entries; they just leave the add screen
  const toggleArchive = async () => {
    if (!category) return
    try {
      await editCategory(category.id, { isArchived: !category.isArchived })
      toast.success(category.isArchived ? t('categories.restored') : t('categories.archived'))
      onClose()
    } catch {
      toast.error(t('common.error'))
    }
  }

  // ── Deleting: a subcategory's entries stay on its parent, a category's go to "Other" ──
  const entriesOf = (target: Category) =>
    transactions.filter((txn) => (target.parentId ? txn.subcategoryId === target.id : txn.categoryId === target.id)).length
  const other = findOtherCategory(categories, kind)
  const otherName = other ? getCategoryName(other, t) : t(kind === 'expense' ? 'categories.other' : 'categories.otherIncome')
  const deletingSub = Boolean(deleting?.parentId)
  const deletingCount = deleting ? entriesOf(deleting) : 0
  const ownerName = parent ? getCategoryName(parent, t) : shownName
  const deleteText = !deleting
    ? ''
    : deletingSub
      ? deletingCount > 0
        ? t('catEdit.deleteSubMove', { count: deletingCount, parent: ownerName })
        : t('catEdit.deleteNoEntries')
      : [
          deletingCount > 0 ? t('catEdit.deleteMove', { count: deletingCount, other: otherName }) : t('catEdit.deleteNoEntries'),
          t('catEdit.deleteAlso'),
        ].join(' ')

  const confirmDelete = async () => {
    const target = deleting
    if (!target) return
    try {
      if (target.parentId) {
        await removeSubcategory(target.id)
        toast.success(t('catEdit.subDeleted'))
        onClose()
      } else {
        await removeCategory(target.id)
        toast.success(t('catEdit.deleted'))
        onClose()
      }
    } catch {
      toast.error(t('common.error'))
    }
  }

  const kindLabel = kind === 'expense' ? t('home.outcome') : t('home.income')
  const headSub = isSub
    ? category
      ? `${ownerName} · ${t('catEdit.entriesThisMonth', { count: month.count })}`
      : t('catEdit.subOf', { parent: ownerName })
    : category
      ? `${kindLabel} · ${t('catEdit.entriesThisMonth', { count: month.count })}`
      : kindLabel
  const title = category
    ? t(isSub ? 'catEdit.editSubTitle' : 'categories.editTitle')
    : t(isSub ? 'catEdit.newSubTitle' : 'categories.newTitle')

  return (
    <PopUp
      isOpen={isOpen}
      onClose={onClose}
      label={title}
      header={
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="bub shrink-0 w-12 h-12 text-2xl rounded-[14px]"
            style={{ '--c': color } as React.CSSProperties}
            aria-hidden="true"
          >
            {icon}
          </span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <h2 className="pop-title">{name.trim() || (category ? shownName : title)}</h2>
            <p className="pop-sub text-[14px]">{headSub}</p>
          </div>
        </div>
      }
      footer={
        <Button size="lg" fullWidth onClick={save} disabled={!name.trim()} loading={saving}>
          {t('common.save')}
        </Button>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label className="field">
          <span className="field-label">{t('categories.name')}</span>
          <span className="input">
            <input value={name} maxLength={24} placeholder={t('categories.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
          </span>
        </label>

        <div className="field">
          <span className="field-label" id="category-icon-label">{t('categories.icon')}</span>
          <div
            ref={iconRowRef}
            className={`emo-pick${allIcons ? '' : ' one'}`}
            role="radiogroup"
            aria-labelledby="category-icon-label"
          >
            {iconChoices.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="radio"
                aria-checked={icon === emoji}
                aria-label={emoji}
                className={`emo-btn${icon === emoji ? ' on' : ''}`}
                onClick={() => setIcon(emoji)}
              >
                {emoji}
              </button>
            ))}
            {!allIcons && (
              <button type="button" className="emo-btn text-ink-2" aria-label={t('catEdit.moreIcons')} onClick={() => setAllIcons(true)}>
                <Ellipsis size={20} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>

        {!isSub && (
        <div className="field">
          <span className="field-label" id="category-colour-label">{t('accounts.colour')}</span>
          <div className="swatches" role="radiogroup" aria-labelledby="category-colour-label">
            {palette.map((option) => (
              <button
                key={option.color}
                type="button"
                role="radio"
                aria-checked={color.toLowerCase() === option.color.toLowerCase()}
                aria-label={option.key ? t(`colors.${option.key}`) : t('catEdit.currentColour')}
                className={`swatch${color.toLowerCase() === option.color.toLowerCase() ? ' on' : ''}`}
                style={{ '--c': option.color } as React.CSSProperties}
                onClick={() => setColor(option.color)}
              />
            ))}
          </div>
        </div>
        )}

        {kind === 'expense' && !isSub && (
          <div className="pbox">
            <div className="prow">
              <span className="prow-ico" aria-hidden="true">
                <Gauge size={18} strokeWidth={1.75} />
              </span>
              <span className="prow-main">
                <span className="prow-title">
                  <span>{t('budgets.monthlyLimit')}</span>
                </span>
                <span className="prow-sub">{t('catEdit.limitSub')}</span>
              </span>
              <Switch checked={limitOn} onChange={setLimitOn} label={t('budgets.monthlyLimit')} />
            </div>
            {limitOn && (
              <div className="pbox-exp">
                <span className="input">
                  <input
                    inputMode="decimal"
                    value={limit}
                    autoFocus={!budget}
                    aria-label={t('catEdit.limitAmount', { currency: currencySymbol(base).symbol })}
                    onChange={(e) => setLimit(sanitizeMoneyInput(e.target.value))}
                  />
                  <span className="suffix" aria-hidden="true">{currencySymbol(base).symbol}</span>
                </span>
                {limitLine && <span className="t-cap">{limitLine}</span>}
              </div>
            )}
          </div>
        )}

        {category && (
          <div className="flex flex-wrap justify-center gap-x-2">
            {!isSub && (
              <button type="button" className="btn ghost text-danger-text" onClick={toggleArchive}>
                {category.isArchived ? <ArchiveRestore size={18} strokeWidth={1.75} aria-hidden="true" /> : <Archive size={18} strokeWidth={1.75} aria-hidden="true" />}
                {category.isArchived ? t('catEdit.restore') : t('catEdit.archive')}
              </button>
            )}
            {/* "Other" is where deleted categories' entries go, so the last one can't be deleted */}
            {(!isOtherCategory(category) || categories.filter((c) => c.kind === category.kind && isOtherCategory(c)).length > 1) && (
              <button type="button" className="btn ghost text-danger-text" onClick={() => setDeleting(category)}>
                <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
                {t(isSub ? 'catEdit.deleteSubButton' : 'catEdit.delete')}
              </button>
            )}
          </div>
        )}
      </form>

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t('catEdit.deleteTitle', { name: deleting ? getCategoryName(deleting, t) : '' })}
        description={deleteText}
        confirmLabel={!deletingSub && deletingCount > 0 ? t('catEdit.deleteMoveConfirm', { other: otherName }) : t('common.delete')}
        danger
      />
    </PopUp>
  )
}
