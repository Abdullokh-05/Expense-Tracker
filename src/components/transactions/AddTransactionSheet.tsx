import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  ArrowUpDown,
  Bookmark,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Delete,
  Pencil,
  Plus,
  Repeat,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import type { Category, CategoryKind, RecurringFrequency, Transaction, TransactionTemplate, TransactionType } from '@/types'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { toast } from '@/components/ui/Toast'
import { AccountIcon } from '@/components/accounts/AccountCard'
import { CategoryEditPopUp } from '@/components/categories/CategoryEditPopUp'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useRecurringStore } from '@/store/recurringStore'
import { useAccountStore } from '@/store/accountStore'
import { useTemplateStore } from '@/store/templateStore'
import { useConverter, useRatesStore } from '@/store/ratesStore'
import { suggestCategory } from '@/db/operations'
import { getCategoryKind, getCategoryName, subcategoriesOf } from '@/lib/categories'
import { paymentMethodOf } from '@/lib/accounts'
import { formatRateLine } from '@/lib/rates'
import { useWideScreen } from '@/lib/useWideScreen'
import {
  addDays,
  advanceByFrequency,
  currencySymbol,
  formatAmount,
  formatDayLabel,
  formatShortDate,
  MONEY_DECIMALS,
  parseMoneyInput,
  roundMoney,
  sanitizeMoneyInput,
  todayDate,
} from '@/lib/utils'

interface AddTransactionSheetProps {
  isOpen: boolean
  onClose: () => void
  // When set, the sheet edits this transaction instead of adding a new one
  transaction?: Transaction
  prefilledCategory?: string
  prefilledType?: TransactionType
  onSaved?: () => void
}

// The account picked last time is offered first next time
const LAST_ACCOUNT_KEY = 'xarajat-last-account'
// Longest amount the keypad takes, in digits
const MAX_DIGITS = 12
// How long a finger rests on a category chip before it opens for editing
const LONG_PRESS_MS = 500

// What takes the keypad's place while one of the extras is open
type Panel = 'account' | 'date' | 'repeat' | 'templates' | 'confirm'
type Field = 'amount' | 'received'
// The category form opened over the sheet: a new category, a new subcategory or an edit
type CategoryForm = { category?: Category; parent?: Category }

// NaN while nothing is typed
const parseAmount = (text: string) => parseMoneyInput(text, { allowNegative: false }) ?? NaN
// Typed amounts keep a dot for decimals whatever the language shows; a comma works too, only
// one of them is taken, and no more than two digits after it
const cleanAmountInput = (text: string) => sanitizeMoneyInput(text)

// "45 000" or "2,99" as the amount is being typed, keeping a trailing decimal mark
function showTyped(raw: string, locale: string): string {
  if (!raw) return '0'
  const [whole, fraction] = raw.split('.')
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return fraction === undefined ? grouped : grouped + (locale.startsWith('en') ? '.' : ',') + fraction
}

function sizeClass(text: string): string {
  return text.length > 13 ? 'xlong' : text.length > 10 ? 'long' : ''
}

// Add or edit an entry, top to bottom: the type, the amount, one row of categories, small
// chips for the rest (account, date, note, repeat, template) and the keypad. A normal entry
// is an amount, a category and Save. Transfers move money between two accounts, converting
// when their currencies differ.
export const AddTransactionSheet: React.FC<AddTransactionSheetProps> = ({
  isOpen,
  onClose,
  transaction,
  prefilledCategory,
  prefilledType = 'expense',
  onSaved,
}) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { settings } = useAppStore()
  const isEditing = Boolean(transaction)
  // Wide screens type with a real keyboard, so they get a dialog without the keypad
  const wide = useWideScreen()
  // Phones use the keypad unless Settings asks for the phone's own keyboard
  const typed = wide || settings.amountInput === 'keyboard'

  const categories = useCategoryStore((s) => s.categories)
  const allAccounts = useAccountStore((s) => s.accounts)
  const loadRates = useRatesStore((s) => s.loadRates)
  const convert = useConverter()

  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const editTransaction = useTransactionStore((s) => s.editTransaction)
  const removeTransaction = useTransactionStore((s) => s.removeTransaction)
  const addRecurringTransaction = useRecurringStore((s) => s.addRecurringTransaction)
  const removeRecurringTransaction = useRecurringStore((s) => s.removeRecurringTransaction)
  const { templates, addTemplate, removeTemplate } = useTemplateStore()

  const [type, setType] = useState<TransactionType>(prefilledType)
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  // Typed only when the two accounts of a transfer are in different currencies
  const [toAmount, setToAmount] = useState('')
  const [focus, setFocus] = useState<Field>('amount')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState('')
  // The category whose subcategories the strip is showing, if any
  const [stripParentId, setStripParentId] = useState<string | null>(null)
  const [date, setDate] = useState(todayDate())
  const [note, setNote] = useState('')
  // The note field stays out of the way until its chip is tapped
  const [noteOpen, setNoteOpen] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [categoryForm, setCategoryForm] = useState<CategoryForm | undefined>(undefined)

  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [autoCreate, setAutoCreate] = useState(true)

  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  // While on, tapping a template removes it instead of using it
  const [managingTemplates, setManagingTemplates] = useState(false)

  const [suggestedCat, setSuggestedCat] = useState<Category | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  // Synchronous guard: a double tap fires twice before isLoading has re-rendered
  const isSaving = useRef(false)
  const amountInputRef = useRef<HTMLInputElement>(null)
  const noteInputRef = useRef<HTMLInputElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  // An archived account or category stays selectable on the transaction that already uses it.
  // Accounts counted in the total come first, as on Home.
  const usable = allAccounts.filter(
    (a) => !a.isArchived || a.id === transaction?.accountId || a.id === transaction?.toAccountId
  )
  const accounts = [...usable.filter((a) => a.includeInTotal), ...usable.filter((a) => !a.includeInTotal)]
  const isTransfer = type === 'transfer'
  // In the order set in Settings › Categories
  const shownCategories = categories.filter(
    (c) => !c.parentId && getCategoryKind(c) === type && (!c.isArchived || c.id === transaction?.categoryId)
  )

  useEffect(() => {
    if (isOpen) {
      const active = allAccounts.filter((a) => !a.isArchived)
      const remembered = localStorage.getItem(LAST_ACCOUNT_KEY)
      // The account marked "default for new entries" wins over the one used last time
      const firstAccount =
        transaction?.accountId ??
        active.find((a) => a.isDefault)?.id ??
        active.find((a) => a.id === remembered)?.id ??
        active[0]?.id ??
        ''

      setType(transaction?.type ?? prefilledType)
      setAmount(transaction ? String(transaction.amount) : '')
      setAccountId(firstAccount)
      // A transfer goes to the first other account counted in the total, if there is one
      const others = active.filter((a) => a.id !== firstAccount)
      setToAccountId(transaction?.toAccountId ?? (others.find((a) => a.includeInTotal) ?? others[0])?.id ?? '')
      setToAmount(transaction?.toAmount != null ? String(transaction.toAmount) : '')
      setFocus('amount')
      setSelectedCategoryId(transaction?.categoryId ?? prefilledCategory ?? '')
      setSelectedSubcategoryId(transaction?.subcategoryId ?? '')
      setStripParentId(null)
      setDate(transaction?.date ?? todayDate())
      setNote(transaction?.note ?? '')
      setNoteOpen(false)
      setPanel(null)
      setCategoryForm(undefined)
      setIsRecurring(false)
      setFrequency('monthly')
      setAutoCreate(true)
      setSaveAsTemplate(false)
      setManagingTemplates(false)
      setSuggestedCat(null)
      // Foreign-currency accounts need rates; fetch them if this session hasn't yet
      if (!useRatesStore.getState().rates) loadRates()
    }
    // Deliberately not re-run when the account list changes: that would wipe what was typed
  }, [isOpen, transaction, prefilledType, prefilledCategory]) // oxlint-disable-line react-hooks/exhaustive-deps

  // A category deleted while the sheet is open (long-press › Delete) is no longer picked
  useEffect(() => {
    if (selectedCategoryId && !categories.some((c) => c.id === selectedCategoryId)) {
      setSelectedCategoryId('')
      setSelectedSubcategoryId('')
    } else if (selectedSubcategoryId && !categories.some((c) => c.id === selectedSubcategoryId)) {
      setSelectedSubcategoryId('')
    }
    if (stripParentId && !categories.some((c) => c.id === stripParentId)) setStripParentId(null)
  }, [categories, selectedCategoryId, selectedSubcategoryId, stripParentId])

  const account = accounts.find((a) => a.id === accountId)
  const toAccount = accounts.find((a) => a.id === toAccountId)
  const currency = account?.currency ?? settings.baseCurrency
  const base = settings.baseCurrency

  // Rate from the account's currency to the base currency. Saving needs a real one: recording
  // a foreign amount at a made-up rate of 1 would silently corrupt every total. Editing
  // without changing the currency keeps the rate the transaction was recorded at.
  const rate: number | null =
    currency === base
      ? 1
      : transaction && transaction.currency === currency
        ? transaction.exchangeRate
        : convert(1, currency, base)

  const parsedAmount = parseAmount(amount)
  const hasValidAmount = !isNaN(parsedAmount) && parsedAmount > 0

  // What arrives in the receiving account of a transfer: the same amount, or when the
  // currencies differ, what was typed, falling back to today's rate
  const crossCurrency = isTransfer && Boolean(toAccount) && toAccount!.currency !== currency
  const convertedToAmount =
    crossCurrency && hasValidAmount ? convert(parsedAmount, currency, toAccount!.currency) : null
  const typedToAmount = parseAmount(toAmount)
  const receivedAmount: number | null = !crossCurrency
    ? parsedAmount
    : !isNaN(typedToAmount) && typedToAmount > 0
      ? typedToAmount
      : convertedToAmount === null
        ? null
        : roundMoney(convertedToAmount)

  const handleTypeChange = (next: TransactionType) => {
    setType(next)
    setPanel(null)
    setFocus('amount')
    setStripParentId(null)
    // A category belongs to one kind; don't carry an expense category over to an income
    const current = categories.find((c) => c.id === selectedCategoryId)
    if (current && getCategoryKind(current) !== next) {
      setSelectedCategoryId('')
      setSelectedSubcategoryId('')
    }
    setSuggestedCat(null)
    if (next === 'transfer') {
      setIsRecurring(false)
      // The account picked for spending may also be the transfer's destination: move the destination
      if (accountId === toAccountId) setToAccountId(accounts.find((a) => a.id !== accountId && !a.isArchived)?.id ?? '')
    }
  }

  // Picking the account money goes to as the one it leaves swaps the two
  const pickFrom = (id: string) => {
    if (id === toAccountId) setToAccountId(accountId)
    setAccountId(id)
    setToAmount('')
  }

  const handleNoteChange = async (value: string) => {
    setNote(value)
    // Settings › Adding entries can turn the suggestion off
    if (value.trim().length > 2 && !isTransfer && settings.suggestCategory !== false) {
      const suggested = await suggestCategory(settings.userId, value)
      const top = suggested?.parentId ? categories.find((c) => c.id === suggested.parentId) ?? null : suggested
      setSuggestedCat(top && getCategoryKind(top) === type ? top : null)
    } else {
      setSuggestedCat(null)
    }
  }

  // "Saved · −45 000 soʻm · Transport", with Undo for something just added
  const announce = (saved: { amount: number; currency: string; type: TransactionType; what: string }, undo?: () => void) => {
    const signed = saved.type === 'expense' ? -saved.amount : saved.amount
    const message = `${undo ? t('add.saved') : t('add.updated')} · ${formatAmount(signed, saved.currency, { signed: saved.type === 'income' })} · ${saved.what}`
    if (undo) toast.success(message, { label: t('add.undo'), onClick: undo })
    else toast.success(message)
  }

  // "Машина › Бензин" for a category picked with one of its subcategories
  const categoryLabel = (categoryId: string, subcategoryId?: string) => {
    const name = getCategoryName(categories.find((c) => c.id === categoryId), t)
    const sub = subcategoryId ? categories.find((c) => c.id === subcategoryId) : undefined
    return sub ? `${name} › ${getCategoryName(sub, t)}` : name
  }

  const handleSave = async () => {
    if (isSaving.current) return
    // Nothing picked but the note suggested one: that one
    const finalCategoryId = selectedCategoryId || suggestedCat?.id || ''
    const finalSubcategoryId = selectedCategoryId ? selectedSubcategoryId : ''

    if (!hasValidAmount) {
      toast.error(t('transaction.amountRequired'))
      return
    }
    if (!account) {
      toast.error(t('transaction.accountRequired'))
      return
    }
    if (isTransfer) {
      if (!toAccount || toAccount.id === account.id) {
        toast.error(t('transaction.transferAccountsRequired'))
        return
      }
      if (receivedAmount === null) {
        toast.error(t('transaction.receivedAmountRequired'))
        return
      }
    } else if (!finalCategoryId) {
      toast.error(t('transaction.categoryRequired'))
      stripRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
      return
    }
    if (rate === null) {
      toast.error(t('transaction.rateUnavailable'))
      return
    }

    isSaving.current = true
    setIsLoading(true)
    try {
      const fields = {
        type,
        amount: parsedAmount,
        currency,
        amountInBaseCurrency: roundMoney(parsedAmount * rate),
        exchangeRate: rate,
        categoryId: isTransfer ? null : finalCategoryId,
        subcategoryId: isTransfer ? null : finalSubcategoryId || null,
        accountId: account.id,
        toAccountId: isTransfer ? toAccount!.id : null,
        toAmount: isTransfer ? receivedAmount : null,
        date,
        note: note.trim() || null,
        noteOriginal: note.trim() || null,
        paymentMethod: paymentMethodOf(account),
      }
      const what = isTransfer ? `${account.name} → ${toAccount!.name}` : categoryLabel(finalCategoryId, finalSubcategoryId)

      if (transaction) {
        await editTransaction(transaction.id, fields)
        announce({ amount: parsedAmount, currency, type, what })
      } else {
        let recurringTransactionId: string | null = null

        if (isRecurring && type !== 'transfer') {
          const rt = await addRecurringTransaction({
            userId: settings.userId,
            type,
            amount: parsedAmount,
            currency,
            categoryId: finalCategoryId,
            subcategoryId: finalSubcategoryId || null,
            accountId: account.id,
            note: note.trim() || null,
            frequency,
            nextRunDate: advanceByFrequency(date, frequency),
            autoCreate,
            isActive: true,
          })
          recurringTransactionId = rt.id
        }

        const created = await addTransaction({
          ...fields,
          userId: settings.userId,
          status: 'confirmed',
          noteLanguage: null,
          translationConfidence: null,
          recurringTransactionId,
        })
        localStorage.setItem(LAST_ACCOUNT_KEY, account.id)
        if (saveAsTemplate && type !== 'transfer') await saveTemplate(finalCategoryId, finalSubcategoryId)
        // Undo takes back the entry and the repeat it started
        announce({ amount: parsedAmount, currency, type, what }, () => {
          removeTransaction(created.id)
          if (recurringTransactionId) removeRecurringTransaction(recurringTransactionId)
        })
      }

      onSaved?.()
      onClose()
    } catch {
      toast.error(t('common.error'))
    } finally {
      isSaving.current = false
      setIsLoading(false)
    }
  }

  // Keeps the entry as it is filled in now, for one-tap reuse later
  const saveTemplate = async (categoryId: string, subcategoryId: string) => {
    if (type === 'transfer' || !account) return
    await addTemplate({
      userId: settings.userId,
      type,
      amount: parsedAmount,
      categoryId,
      subcategoryId: subcategoryId || null,
      accountId: account.id,
      note: note.trim() || null,
    })
  }

  const handleSaveTemplateFromEdit = async () => {
    if (!hasValidAmount || !selectedCategoryId) {
      toast.error(t('transaction.amountRequired'))
      return
    }
    try {
      await saveTemplate(selectedCategoryId, selectedSubcategoryId)
      toast.success(t('transaction.templateSaved'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  // One tap on a template records it for today, from the account it was saved with
  const handleUseTemplate = async (template: TransactionTemplate) => {
    if (isSaving.current) return
    const templateAccount = allAccounts.find((a) => a.id === template.accountId && !a.isArchived)
    if (!templateAccount) {
      toast.error(t('transaction.templateAccountMissing'))
      return
    }
    const templateRate = convert(1, templateAccount.currency, base)
    if (templateRate === null) {
      toast.error(t('transaction.rateUnavailable'))
      return
    }

    isSaving.current = true
    setIsLoading(true)
    try {
      const created = await addTransaction({
        userId: settings.userId,
        type: template.type,
        status: 'confirmed',
        amount: template.amount,
        currency: templateAccount.currency,
        amountInBaseCurrency: roundMoney(template.amount * templateRate),
        exchangeRate: templateRate,
        categoryId: template.categoryId,
        subcategoryId: template.subcategoryId ?? null,
        accountId: templateAccount.id,
        toAccountId: null,
        toAmount: null,
        date: todayDate(),
        note: template.note,
        noteOriginal: template.note,
        noteLanguage: null,
        translationConfidence: null,
        paymentMethod: paymentMethodOf(templateAccount),
        recurringTransactionId: null,
      })
      announce(
        {
          amount: template.amount,
          currency: templateAccount.currency,
          type: template.type,
          what: template.note || categoryLabel(template.categoryId, template.subcategoryId ?? undefined),
        },
        () => removeTransaction(created.id)
      )
      onSaved?.()
      onClose()
    } catch {
      toast.error(t('common.error'))
    } finally {
      isSaving.current = false
      setIsLoading(false)
    }
  }

  const handleTemplateTap = async (template: TransactionTemplate) => {
    if (!managingTemplates) return handleUseTemplate(template)
    try {
      await removeTemplate(template.id)
    } catch {
      toast.error(t('common.error'))
    }
  }

  const handleDelete = async () => {
    if (!transaction) return
    try {
      await removeTransaction(transaction.id)
      toast.success(t('transaction.deleted'))
      onSaved?.()
      onClose()
    } catch {
      toast.error(t('common.error'))
    }
  }

  // ── Picking a category: one with subcategories opens them in the strip first ──
  const pickCategory = (categoryId: string, subcategoryId = '') => {
    setSelectedCategoryId(categoryId)
    setSelectedSubcategoryId(subcategoryId)
    setStripParentId(null)
  }

  const tapCategory = (category: Category) => {
    if (subcategoriesOf(categories, category.id).length > 0) setStripParentId(category.id)
    else pickCategory(category.id)
  }

  // A long press (or a right click) opens the category for editing instead of picking it
  const pressTimer = useRef<number | null>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const pressFired = useRef(false)
  const cancelPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
    pressTimer.current = null
  }
  const longPress = (open: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      pressFired.current = false
      pressStart.current = { x: e.clientX, y: e.clientY }
      cancelPress()
      pressTimer.current = window.setTimeout(() => {
        pressFired.current = true
        pressTimer.current = null
        open()
      }, LONG_PRESS_MS)
    },
    // Scrolling the strip isn't a press
    onPointerMove: (e: React.PointerEvent) => {
      const start = pressStart.current
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancelPress()
    },
    onPointerUp: cancelPress,
    onPointerLeave: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      cancelPress()
      pressFired.current = true
      open()
    },
  })
  // The click that ends a long press doesn't also pick the category
  const afterPress = (action: () => void) => () => {
    if (pressFired.current) {
      pressFired.current = false
      return
    }
    action()
  }

  // ── The keypad types into the amount, or into "Amount received" when that is focused ──
  const field: Field = crossCurrency && focus === 'received' ? 'received' : 'amount'
  const press = (key: string) => {
    const current = field === 'received' ? toAmount : amount
    let next = current
    if (key === 'back') next = current.slice(0, -1)
    else if (key === '.') {
      if (current.includes('.')) return
      next = (current || '0') + '.'
    } else if (key === '000') {
      if (!current || current.includes('.')) return
      next = current + '000'
    } else {
      // Two digits at most after the decimal mark
      if (current.includes('.') && current.split('.')[1].length >= MONEY_DECIMALS) return
      next = current === '0' ? key : current + key
    }
    if (next.replace('.', '').length > MAX_DIGITS) return
    if (field === 'received') setToAmount(next)
    else setAmount(next)
  }

  // The picked category (or the strip's first chip after switching) is brought into view
  useEffect(() => {
    if (!isOpen) return
    const frame = requestAnimationFrame(() => {
      const row = stripRef.current
      if (!row) return
      const chosen = row.querySelector<HTMLElement>('.cchip.on')
      if (!chosen) {
        row.scrollLeft = 0
        return
      }
      const left = chosen.offsetLeft - row.offsetLeft
      // Only when it's cut off by the faded edge
      const hidden = left - row.scrollLeft < 0 || left - row.scrollLeft + chosen.offsetWidth > row.clientWidth - 32
      if (hidden) row.scrollLeft = left - 16
    })
    return () => cancelAnimationFrame(frame)
  }, [isOpen, selectedCategoryId, stripParentId, type])

  // In keyboard mode the amount field is focused as the sheet opens
  useEffect(() => {
    if (isOpen && typed && !isEditing) setTimeout(() => amountInputRef.current?.focus(), 50)
  }, [isOpen, typed, isEditing])

  const close = () => onClose()
  const togglePanel = (next: Panel) => setPanel(panel === next ? null : next)
  const toggleNote = () => {
    if (noteOpen && !note) {
      setNoteOpen(false)
      return
    }
    setNoteOpen(true)
    setPanel(null)
    setTimeout(() => noteInputRef.current?.focus(), 30)
  }
  // Settings › Categories; what was typed here is left behind on purpose
  const manageCategories = () => {
    onClose()
    navigate('/settings/categories')
  }

  // ── What shows ──
  const symbol = currencySymbol(currency)
  const amountText = showTyped(amount, i18n.language)
  const amountColor = !amount ? 'var(--ink-2)' : type === 'income' ? 'var(--in)' : 'var(--ink)'
  const conversion =
    currency !== base
      ? rate === null
        ? null
        : `${hasValidAmount ? `≈ ${formatAmount(parsedAmount * rate, base)} · ` : ''}${formatRateLine(currency, base, rate)}`
      : ''
  // A transfer's rate reads per one unit of the currency that isn't the main one: "1 $ = 12 600 soʻm".
  // `perFrom` is how much of `to` one unit of `from` buys.
  const pairRate = (from: string, to: string, perFrom: number) =>
    from === base ? formatRateLine(to, from, 1 / perFrom) : formatRateLine(from, to, perFrom)

  const today = todayDate()
  const dateLabel =
    date === today ? t('common.today') : date === addDays(today, -1) ? t('common.yesterday') : formatShortDate(date, i18n.language)
  const repeatLabel = isRecurring
    ? `${t(`transaction.${frequency}`)} · ${autoCreate ? t('add.auto') : t('add.ask')}`
    : t('add.repeat')
  const nextDate = advanceByFrequency(date, frequency)
  const typeLabel = (tx: TransactionType) =>
    tx === 'expense' ? t('transaction.expense') : tx === 'income' ? t('transaction.income') : t('transaction.transfer')
  const saveLabel = isTransfer && !isEditing ? t('transaction.transfer') : t('common.save')
  const formKind: CategoryKind = type === 'income' ? 'income' : 'expense'
  const noteShown = noteOpen || Boolean(note)
  const typeTemplates = templates.filter((tpl) => tpl.type === type)

  // ── Pieces ──
  const head = (
    <div className="sheet-head">
      <SegmentedControl<TransactionType>
        label={t('add.typeGroup')}
        fill={false}
        value={type}
        onChange={handleTypeChange}
        options={(['expense', 'income', 'transfer'] as TransactionType[]).map((tx) => ({ value: tx, label: typeLabel(tx) }))}
      />
      <div className="flex items-center">
        {isEditing && (
          <button type="button" className="iconbtn danger" aria-label={t('transaction.delete')} onClick={() => setPanel('confirm')}>
            <Trash2 size={20} strokeWidth={1.75} />
          </button>
        )}
        <button type="button" className="iconbtn" aria-label={t('common.close')} onClick={close}>
          <X size={20} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )

  // One row of categories, in the order from Settings; past the last one "+ New" and "Manage"
  const stripParent = stripParentId ? categories.find((c) => c.id === stripParentId) : undefined
  const strip = stripParent ? (
    <div ref={stripRef} className="cstrip" role="group" aria-label={t('catPage.subsOf', { name: getCategoryName(stripParent, t) })}>
      <button type="button" className="cchip back" onClick={() => setStripParentId(null)}>
        <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        {t('add.back')}
      </button>
      <button
        type="button"
        className={`cchip${selectedCategoryId === stripParent.id && !selectedSubcategoryId ? ' on' : ''}`}
        aria-pressed={selectedCategoryId === stripParent.id && !selectedSubcategoryId}
        onClick={() => pickCategory(stripParent.id)}
      >
        <span className="emo" aria-hidden="true">{stripParent.icon}</span>
        {t('add.justCategory', { name: getCategoryName(stripParent, t) })}
      </button>
      {subcategoriesOf(categories, stripParent.id).map((sub) => {
        const on = selectedSubcategoryId === sub.id
        return (
          <button
            key={sub.id}
            type="button"
            className={`cchip${on ? ' on' : ''}`}
            aria-pressed={on}
            {...longPress(() => setCategoryForm({ category: sub, parent: stripParent }))}
            onClick={afterPress(() => pickCategory(stripParent.id, sub.id))}
          >
            <span className="emo" aria-hidden="true">{sub.icon}</span>
            {getCategoryName(sub, t)}
          </button>
        )
      })}
      <button type="button" className="cchip add" onClick={() => setCategoryForm({ parent: stripParent })}>
        <Plus size={18} strokeWidth={2} aria-hidden="true" />
        {t('add.newSub')}
      </button>
    </div>
  ) : (
    <div ref={stripRef} className="cstrip" role="group" aria-label={type === 'income' ? t('transaction.incomeSource') : t('transaction.category')}>
      {shownCategories.map((category) => {
        const on = category.id === selectedCategoryId
        const suggested = !on && !selectedCategoryId && suggestedCat?.id === category.id
        const hasSubs = categories.some((c) => c.parentId === category.id)
        const sub = on && selectedSubcategoryId ? categories.find((c) => c.id === selectedSubcategoryId) : undefined
        return (
          <button
            key={category.id}
            type="button"
            className={`cchip${on ? ' on' : ''}${suggested ? ' sug' : ''}`}
            aria-pressed={on}
            aria-haspopup={hasSubs || undefined}
            {...longPress(() => setCategoryForm({ category }))}
            onClick={afterPress(() => tapCategory(category))}
          >
            <span className="emo" aria-hidden="true">{sub?.icon ?? category.icon}</span>
            {sub ? `${getCategoryName(category, t)} › ${getCategoryName(sub, t)}` : getCategoryName(category, t)}
            {hasSubs && <ChevronRight size={14} strokeWidth={2.25} className="cchip-more" aria-hidden="true" />}
          </button>
        )
      })}
      <button type="button" className="cchip add" onClick={() => setCategoryForm({})}>
        <Plus size={18} strokeWidth={2} aria-hidden="true" />
        {t('add.newCategory')}
      </button>
      <button type="button" className="strip-link" onClick={manageCategories}>
        {t('add.manage')}
      </button>
    </div>
  )

  // Small chips for everything else; each opens only when tapped
  const extras = (
    <div className="extras" role="group" aria-label={t('add.details')}>
      <button
        type="button"
        className={`xchip xchip-acct${panel === 'account' ? ' open' : ''}`}
        aria-expanded={panel === 'account'}
        aria-label={
          isTransfer
            ? `${t('transaction.fromAccount')}: ${account?.name ?? '—'}, ${t('transaction.toAccount')}: ${toAccount?.name ?? '—'}`
            : `${t('transaction.account')}: ${account?.name ?? '—'}`
        }
        onClick={() => togglePanel('account')}
      >
        {account && <AccountIcon account={account} size={16} />}
        <span className="xchip-text">{account?.name ?? '—'}</span>
        {isTransfer && (
          <>
            <ArrowRight size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
            <span className="xchip-text">{toAccount?.name ?? '—'}</span>
          </>
        )}
      </button>
      <button
        type="button"
        className={`xchip${date !== today ? ' on' : ''}${panel === 'date' ? ' open' : ''}`}
        aria-expanded={panel === 'date'}
        aria-label={`${t('add.date')}: ${dateLabel}`}
        title={t('add.date')}
        onClick={() => togglePanel('date')}
      >
        <Calendar size={18} strokeWidth={1.75} aria-hidden="true" />
        {date !== today && <span className="xchip-text">{dateLabel}</span>}
      </button>
      <button
        type="button"
        className={`xchip${note ? ' on' : ''}${noteShown && !note ? ' open' : ''}`}
        aria-expanded={noteShown}
        aria-label={t('transaction.note')}
        title={t('transaction.note')}
        onClick={toggleNote}
      >
        <StickyNote size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {!isTransfer && !isEditing && (
        <button
          type="button"
          className={`xchip${isRecurring ? ' on' : ''}${panel === 'repeat' ? ' open' : ''}`}
          aria-expanded={panel === 'repeat'}
          aria-label={repeatLabel}
          title={t('add.repeat')}
          onClick={() => togglePanel('repeat')}
        >
          <Repeat size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
      {!isTransfer && (
        <button
          type="button"
          className={`xchip${!isEditing && saveAsTemplate ? ' on' : ''}${panel === 'templates' ? ' open' : ''}`}
          aria-expanded={panel === 'templates'}
          aria-label={t('transaction.templates')}
          title={t('transaction.templates')}
          onClick={() => togglePanel('templates')}
        >
          <Bookmark size={18} strokeWidth={1.75} aria-hidden="true" fill={!isEditing && saveAsTemplate ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  )

  const accountChips = (selectedId: string, onPick: (id: string) => void, disabledId?: string) =>
    accounts.map((item) => {
      const on = item.id === selectedId
      return (
        <button
          key={item.id}
          type="button"
          className={`acc-chip${on ? ' on' : ''}`}
          aria-pressed={on}
          disabled={item.id === disabledId}
          onClick={() => onPick(item.id)}
        >
          <AccountIcon account={item} size={18} />
          {item.name}
          {item.currency !== base && <span className="code">{item.currency}</span>}
        </button>
      )
    })

  const done = <Button variant="ghost" onClick={() => setPanel(null)}>{t('common.done')}</Button>

  const panels: Record<Panel, React.ReactNode> = {
    account: isTransfer ? (
      <>
        <div className="panel-head">
          <span className="t-head">{t('transaction.fromAccount')}</span>
          {done}
        </div>
        <div className="acc-wrap" role="group" aria-label={t('transaction.fromAccount')}>
          {accountChips(accountId, pickFrom)}
        </div>
        <div className="panel-head">
          <span className="t-head">{t('transaction.toAccount')}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!toAccountId}
            onClick={() => {
              setAccountId(toAccountId)
              setToAccountId(accountId)
              setToAmount('')
              setFocus('amount')
            }}
          >
            <ArrowUpDown size={18} strokeWidth={1.75} aria-hidden="true" />
            {t('add.swap')}
          </Button>
        </div>
        <div className="acc-wrap" role="group" aria-label={t('transaction.toAccount')}>
          {accountChips(toAccountId, setToAccountId, accountId)}
        </div>
        {accounts.length < 2 && <p className="t-sub">{t('add.secondAccount')}</p>}
      </>
    ) : (
      <>
        <div className="panel-head">
          <span className="t-head">{t('transaction.account')}</span>
          {done}
        </div>
        <div className="acc-wrap" role="group" aria-label={t('transaction.account')}>
          {accountChips(accountId, (id) => {
            setAccountId(id)
            setPanel(null)
          })}
        </div>
      </>
    ),
    date: (
      <>
        <div className="panel-head">
          <span className="t-head">{t('add.date')}</span>
          {done}
        </div>
        <div className="chips">
          {[0, -1, -2].map((back) => {
            const day = addDays(today, back)
            return (
              <button key={day} type="button" className={`chip${date === day ? ' on' : ''}`} aria-pressed={date === day} onClick={() => setDate(day)}>
                {formatDayLabel(day, i18n.language)}
              </button>
            )
          })}
        </div>
        <label className="field">
          <span className="t-label">{t('add.anotherDay')}</span>
          <span className="input">
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </span>
        </label>
      </>
    ),
    repeat: (
      <>
        <div className="panel-head">
          <span className="flex items-center gap-3">
            <Switch checked={isRecurring} onChange={setIsRecurring} label={t('add.repeat')} />
            <span className="t-head">{t('add.repeat')}</span>
          </span>
          {done}
        </div>
        <div className={`opt${isRecurring ? '' : ' opacity-40'}`}>
          <span className="t-label">{t('add.howOften')}</span>
          <SegmentedControl<RecurringFrequency>
            label={t('add.howOften')}
            value={frequency}
            onChange={(next) => {
              setFrequency(next)
              setIsRecurring(true)
            }}
            options={(['weekly', 'monthly', 'yearly'] as RecurringFrequency[]).map((f) => ({ value: f, label: t(`transaction.${f}`) }))}
          />
        </div>
        <div className={`opt${isRecurring ? '' : ' opacity-40'}`}>
          <span className="t-label">{t('add.whenDue')}</span>
          <SegmentedControl<'auto' | 'ask'>
            label={t('add.whenDue')}
            value={autoCreate ? 'auto' : 'ask'}
            onChange={(next) => {
              setAutoCreate(next === 'auto')
              setIsRecurring(true)
            }}
            options={[
              { value: 'auto', label: t('add.addForMe') },
              { value: 'ask', label: t('add.askFirst') },
            ]}
          />
        </div>
        <span className={`t-cap${isRecurring ? '' : ' opacity-40'}`}>
          {t(autoCreate ? 'add.nextAuto' : 'add.nextAsk', { date: formatDayLabel(nextDate, i18n.language) })}
        </span>
      </>
    ),
    templates: (
      <>
        <div className="panel-head">
          <span className="t-head">{t('transaction.templates')}</span>
          {done}
        </div>
        {isEditing ? (
          <Button variant="tinted" className="self-start" onClick={handleSaveTemplateFromEdit}>
            <Bookmark size={18} strokeWidth={1.75} aria-hidden="true" />
            {t('add.saveTemplate')}
          </Button>
        ) : (
          <label className="flex items-center justify-between gap-3 min-h-[44px]">
            <span className="t-body text-ink">{t('add.keepAsTemplate')}</span>
            <Switch checked={saveAsTemplate} onChange={setSaveAsTemplate} label={t('add.keepAsTemplate')} />
          </label>
        )}
        {!isEditing &&
          (typeTemplates.length > 0 ? (
            <>
              <span className="t-cap">{t('add.templatesHint')}</span>
              <div className="acc-wrap" role="group" aria-label={t('transaction.templates')}>
                {typeTemplates.map((template) => {
                  const category = categories.find((c) => c.id === template.categoryId)
                  const sub = template.subcategoryId ? categories.find((c) => c.id === template.subcategoryId) : undefined
                  const tplAccount = allAccounts.find((a) => a.id === template.accountId)
                  const name = template.note || categoryLabel(template.categoryId, template.subcategoryId ?? undefined)
                  return (
                    <button
                      key={template.id}
                      type="button"
                      className={`tpl${managingTemplates ? ' del' : ''}`}
                      aria-label={managingTemplates ? t('add.removeTemplate', { name }) : t('add.useTemplate', { name })}
                      onClick={() => handleTemplateTap(template)}
                    >
                      <span className="emo" aria-hidden="true">{sub?.icon ?? category?.icon ?? '📦'}</span>
                      <span>{name}</span>
                      <span className="num">{showTyped(String(template.amount), i18n.language)}{tplAccount && tplAccount.currency !== base ? ` ${tplAccount.currency}` : ''}</span>
                      {managingTemplates && (
                        <span className="tpl-x" aria-hidden="true">
                          <X size={12} strokeWidth={2.5} />
                        </span>
                      )}
                    </button>
                  )
                })}
                <button type="button" className="tpl ghost" aria-pressed={managingTemplates} onClick={() => setManagingTemplates(!managingTemplates)}>
                  {managingTemplates ? t('common.done') : t('transaction.manageTemplates')}
                </button>
              </div>
            </>
          ) : (
            <span className="t-cap">{t('add.noTemplates')}</span>
          ))}
      </>
    ),
    confirm: (
      <div className="flex flex-col justify-center gap-6 flex-1">
        <div className="flex flex-col gap-1 text-center">
          <span className="t-head">{t(`add.deleteTitle_${type}`)}</span>
          <span className="t-sub">{t('add.deleteText')}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setPanel(null)}>{t('add.keep')}</Button>
          <Button variant="danger" onClick={handleDelete}>{t('common.delete')}</Button>
        </div>
      </div>
    ),
  }

  const keys = ['1', '2', '3', 'back', '4', '5', '6', '7', '8', '9', '000', '0', '.']
  const keypad = (
    <div className="keys">
      {keys.map((key) => {
        const isBack = key === 'back'
        return (
          <button
            key={key}
            type="button"
            className={`key${isBack || key === '000' || key === '.' ? ' fn' : ''}`}
            aria-label={isBack ? t('add.deleteKey') : key === '.' ? t('add.decimal') : key}
            onClick={() => press(key)}
          >
            {isBack ? <Delete size={22} strokeWidth={1.75} /> : key === '.' ? (i18n.language.startsWith('en') ? '.' : ',') : key}
          </button>
        )
      })}
      <button type="button" className="key save" disabled={!hasValidAmount || isLoading} aria-label={saveLabel} onClick={handleSave}>
        <Check size={22} strokeWidth={2} aria-hidden="true" />
        <span>{saveLabel}</span>
      </button>
    </div>
  )
  const saveRow = (
    <div className="save-row">
      {wide && (
        <Button variant="secondary" onClick={close}>
          {t('common.cancel')}
        </Button>
      )}
      <Button className="fill" onClick={handleSave} disabled={!hasValidAmount} loading={isLoading}>
        {saveLabel}
      </Button>
    </div>
  )

  // An open extra takes the keypad's place, so the sheet keeps its height; with a keyboard
  // it sits above the Save row
  const dock = (
    <div className="dock">
      {panel && <div className={`panel${typed ? ' typed' : ''}`}>{panels[panel]}</div>}
      {(!panel || typed) && (typed ? saveRow : keypad)}
    </div>
  )

  const amountRow = (value: string, onTyped: (text: string) => void, active: boolean) =>
    typed ? (
      <input
        ref={active ? amountInputRef : undefined}
        className="amt-input"
        inputMode="decimal"
        enterKeyHint="done"
        placeholder="0"
        aria-label={t('transaction.amount')}
        value={value}
        // As wide as what is typed, so the currency stays next to the number
        style={{ color: amountColor, width: `${Math.max(1, value.length) + 0.4}ch` }}
        onChange={(e) => onTyped(cleanAmountInput(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
        }}
      />
    ) : (
      <>
        <span className={`money-xl ${sizeClass(amountText)}`} style={{ color: amountColor }}>{amountText}</span>
        {focus === 'amount' && <span className="caret" aria-hidden="true" />}
      </>
    )

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={close}
        label={isEditing ? t('add.editEntry') : t('add.newEntry')}
        className={`add-sheet${typed ? ' typed' : ''}`}
        bodyClassName="add-body"
        header={head}
        footer={dock}
      >
        <div className="entry">
          <div className="entry-amt" aria-live="polite" onClick={() => setFocus('amount')}>
            {symbol.before && <span className="money-xl cur-pre">{symbol.symbol}</span>}
            {amountRow(amount, setAmount, true)}
            {!symbol.before && <span className="cur">{symbol.symbol}</span>}
          </div>
          {conversion === null ? (
            <div className="entry-sub err">{t('transaction.rateUnavailable')}</div>
          ) : (
            conversion && <div className="entry-sub">{conversion}</div>
          )}
          {/* A transfer between currencies: what arrives, typed or at today's rate */}
          {crossCurrency && (
            <div className="recv">
              <span className="t-label shrink-0">{t('add.received')}</span>
              {typed ? (
                <span className="input recv-input">
                  <input
                    inputMode="decimal"
                    value={toAmount}
                    placeholder={convertedToAmount === null ? '' : String(roundMoney(convertedToAmount))}
                    aria-label={t('add.received')}
                    onChange={(e) => setToAmount(cleanAmountInput(e.target.value))}
                  />
                  <span className="suffix" aria-hidden="true">{toAccount!.currency}</span>
                </span>
              ) : (
                <button type="button" className={`input recv-input justify-end${focus === 'received' ? ' focus' : ''}`} onClick={() => setFocus('received')}>
                  <span className="amt text-[16px]" style={{ color: toAmount ? 'var(--ink)' : 'var(--ink-2)' }}>
                    {toAmount
                      ? formatAmount(parseAmount(toAmount), toAccount!.currency)
                      : convertedToAmount === null
                        ? '—'
                        : formatAmount(convertedToAmount, toAccount!.currency)}
                  </span>
                  {focus === 'received' && <span className="caret h-5" aria-hidden="true" />}
                </button>
              )}
            </div>
          )}
          {crossCurrency && (
            <div className="entry-sub">
              {hasValidAmount && receivedAmount
                ? t('add.rateUsed', { rate: pairRate(currency, toAccount!.currency, receivedAmount / parsedAmount) })
                : (() => {
                    const live = convert(1, currency, toAccount!.currency)
                    return live ? t('add.rateDefault', { rate: pairRate(currency, toAccount!.currency, live) }) : t('transaction.receivedAmountRequired')
                  })()}
            </div>
          )}
        </div>

        {!isTransfer && strip}
        {extras}

        {noteShown && (
          <label className="note-row">
            <Pencil size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
            <input
              ref={noteInputRef}
              value={note}
              placeholder={t('add.addNote')}
              aria-label={t('transaction.note')}
              maxLength={120}
              onChange={(e) => handleNoteChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
              }}
            />
            {!isTransfer && suggestedCat && suggestedCat.id !== selectedCategoryId && (
              <button
                type="button"
                className="suggest"
                aria-label={t('add.useSuggestion', { name: getCategoryName(suggestedCat, t) })}
                onClick={() => tapCategory(suggestedCat)}
              >
                <span aria-hidden="true">{suggestedCat.icon}</span>
                <span>{t('add.suggestion', { name: getCategoryName(suggestedCat, t) })}</span>
              </button>
            )}
          </label>
        )}
      </BottomSheet>

      {/* A new category (or subcategory) is picked as soon as it's saved; the amount and the
          rest of the sheet stay as they were */}
      <CategoryEditPopUp
        isOpen={isOpen && categoryForm !== undefined}
        onClose={() => setCategoryForm(undefined)}
        category={categoryForm?.category}
        parent={categoryForm?.parent}
        kind={categoryForm?.parent ? getCategoryKind(categoryForm.parent) : categoryForm?.category ? getCategoryKind(categoryForm.category) : formKind}
        onCreated={(created) => (created.parentId ? pickCategory(created.parentId, created.id) : pickCategory(created.id))}
      />
    </>
  )
}
