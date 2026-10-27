import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Bookmark,
  Calendar,
  CalendarDays,
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
import { BottomSheet, ConfirmDialog } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { toast } from '@/components/ui/Toast'
import { AccountIcon } from '@/components/accounts/AccountCard'
import { CategoryEditPopUp } from '@/components/categories/CategoryEditPopUp'
import { TransferCards } from '@/components/transactions/TransferCards'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useRecurringStore } from '@/store/recurringStore'
import { useAccountStore } from '@/store/accountStore'
import { useTemplateStore } from '@/store/templateStore'
import { useUiStore } from '@/store/uiStore'
import { useConverter, useRatesStore } from '@/store/ratesStore'
import { suggestCategory } from '@/db/operations'
import { frequentCategories, getCategoryKind, getCategoryName, subcategoriesOf } from '@/lib/categories'
import { accountColor, accountLook, accountTypeLabel, getAccountBalances, paymentMethodOf } from '@/lib/accounts'
import { formatRateLine } from '@/lib/rates'
import { useWideScreen } from '@/lib/useWideScreen'
import {
  addDays,
  advanceByFrequency,
  formatAmount,
  formatDayLabel,
  formatShortDate,
  MASK,
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
// How long a finger rests on a category before it opens for editing
const LONG_PRESS_MS = 500

// The sheet's screens: the form, and the lists its rows open (like pages pushed on top)
type View = 'form' | 'category' | 'account' | 'date' | 'repeat' | 'templates'
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

// One row of the form: an icon, a name, what's chosen and an arrow
const FormRow: React.FC<{
  icon: React.ReactNode
  title: string
  value?: React.ReactNode
  required?: boolean
  onClick: () => void
}> = ({ icon, title, value, required, onClick }) => (
  <button type="button" className="frow" onClick={onClick}>
    {icon}
    <span className="frow-title">{title}</span>
    <span className={`frow-val${required ? ' req' : ''}`}>{value}</span>
    <ChevronRight size={18} strokeWidth={2} className="frow-go" aria-hidden="true" />
  </button>
)

// A category's round icon in its colour
const CategoryIcon: React.FC<{ category?: Category; color?: string; small?: boolean }> = ({ category, color, small }) =>
  category ? (
    <span className={`cico${small ? ' sm' : ''}`} style={{ '--c': color ?? category.color } as React.CSSProperties} aria-hidden="true">
      {category.icon}
    </span>
  ) : (
    <span className={`cico unset${small ? ' sm' : ''}`} aria-hidden="true">?</span>
  )

// Add or edit an entry. The form reads top to bottom: the type, the amount, then rows for the
// account, category, date and repeat, and the note. A row opens its list inside the sheet;
// picking returns to the form. The keypad shows while the amount is being typed. Transfers
// move money between two accounts, converting when their currencies differ.
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

  const transactions = useTransactionStore((s) => s.transactions)
  const masked = useUiStore((s) => s.amountsHidden)
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
  // The keypad is up while an amount is being typed; a row tapped puts it away
  const [keypadOn, setKeypadOn] = useState(true)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState('')
  const [view, setView] = useState<View>('form')
  // In the category list: the category whose subcategories are showing
  const [subParentId, setSubParentId] = useState<string | null>(null)
  const [date, setDate] = useState(todayDate())
  const [note, setNote] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
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
  const bodyRef = useRef<HTMLDivElement>(null)

  // An archived account or category stays selectable on the transaction that already uses it.
  // Accounts counted in the total come first, as on Home.
  const accounts = useMemo(() => {
    const usable = allAccounts.filter(
      (a) => !a.isArchived || a.id === transaction?.accountId || a.id === transaction?.toAccountId
    )
    return [...usable.filter((a) => a.includeInTotal), ...usable.filter((a) => !a.includeInTotal)]
  }, [allAccounts, transaction?.accountId, transaction?.toAccountId])
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
      // A new entry starts with its amount; an edit shows the whole form
      setKeypadOn(!transaction)
      setSelectedCategoryId(transaction?.categoryId ?? prefilledCategory ?? '')
      setSelectedSubcategoryId(transaction?.subcategoryId ?? '')
      setView('form')
      setSubParentId(null)
      setDate(transaction?.date ?? todayDate())
      setNote(transaction?.note ?? '')
      setConfirmingDelete(false)
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
    if (subParentId && !categories.some((c) => c.id === subParentId)) setSubParentId(null)
  }, [categories, selectedCategoryId, selectedSubcategoryId, subParentId])

  // Each screen starts at its top
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [view, subParentId])

  const account = accounts.find((a) => a.id === accountId)
  const toAccount = accounts.find((a) => a.id === toAccountId)

  // Every account's balance as it stands without this entry (an edited transfer would
  // otherwise count twice in "after")
  const balances = useMemo(
    () => getAccountBalances(accounts, transactions.filter((txn) => txn.id !== transaction?.id), settings.baseCurrency, convert),
    [accounts, transactions, transaction?.id, settings.baseCurrency, convert]
  )
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
    setFocus('amount')
    setSubParentId(null)
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
      setKeypadOn(true)
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
      // The category list opens so one can be picked
      openView('category')
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

  // ── Moving between the form and its lists ──
  const openView = (next: View) => {
    setKeypadOn(false)
    setManagingTemplates(false)
    // The category list opens on the picked category's subcategories, if it has any
    if (next === 'category') {
      const picked = categories.find((c) => c.id === selectedCategoryId)
      setSubParentId(picked && subcategoriesOf(categories, picked.id).length > 0 ? picked.id : null)
    }
    setView(next)
  }
  const backToForm = () => {
    setView('form')
    setSubParentId(null)
  }
  // From a category's subcategories, back goes to all categories first
  const goBack = () => (view === 'category' && subParentId ? setSubParentId(null) : backToForm())

  // ── Picking a category: one with subcategories opens them first ──
  const pickCategory = (categoryId: string, subcategoryId = '') => {
    setSelectedCategoryId(categoryId)
    setSelectedSubcategoryId(subcategoryId)
    backToForm()
  }

  const tapCategory = (category: Category) => {
    if (subcategoriesOf(categories, category.id).length > 0) {
      setSubParentId(category.id)
      if (view !== 'category') setView('category')
    } else pickCategory(category.id)
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
    // Scrolling the list isn't a press
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

  // ── The keypad types into the amount, or into "Gets" when that is focused ──
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

  // In keyboard mode the amount field is focused as the sheet opens
  useEffect(() => {
    if (isOpen && typed && !isEditing) setTimeout(() => amountInputRef.current?.focus(), 50)
  }, [isOpen, typed, isEditing])

  const close = () => onClose()
  // Settings › Categories (or the category's own page); what was typed here is left behind on purpose
  const manageCategories = (categoryId?: string) => {
    onClose()
    navigate(categoryId ? `/settings/categories/${categoryId}` : '/settings/categories')
  }

  // ── What shows ──
  const amountText = showTyped(amount, i18n.language)
  const sign = !amount || isTransfer ? '' : type === 'income' ? '+' : '−'
  const amountColor = !amount ? 'var(--ink-2)' : type === 'income' ? 'var(--in)' : type === 'expense' ? 'var(--danger-text)' : 'var(--ink)'
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
  const repeatLabel = isRecurring ? `${t(`transaction.${frequency}`)} · ${autoCreate ? t('add.auto') : t('add.ask')}` : t('add.off')
  const nextDate = advanceByFrequency(date, frequency)
  const typeLabel = (tx: TransactionType) =>
    tx === 'expense' ? t('transaction.expense') : tx === 'income' ? t('transaction.income') : t('transaction.transfer')
  const saveLabel = isTransfer && !isEditing ? t('transaction.transfer') : t('common.save')
  const formKind: CategoryKind = type === 'income' ? 'income' : 'expense'
  const typeTemplates = templates.filter((tpl) => tpl.type === type)
  const pickedCategory = categories.find((c) => c.id === selectedCategoryId)
  const pickedSub = selectedSubcategoryId ? categories.find((c) => c.id === selectedSubcategoryId) : undefined
  const subParent = subParentId ? categories.find((c) => c.id === subParentId) : undefined
  const categoryTitle = type === 'income' ? t('transaction.incomeSource') : t('transaction.category')
  const viewTitle: Record<View, string> = {
    form: isEditing ? t('add.editEntry') : t('add.newEntry'),
    category: subParent ? getCategoryName(subParent, t) : categoryTitle,
    account: t('transaction.account'),
    date: t('add.date'),
    repeat: t('add.repeat'),
    templates: t('transaction.templates'),
  }

  // ── The top bar: close or back, the screen's name, and one action ──
  const headAction =
    view === 'form' ? (
      isEditing ? (
        <button type="button" className="iconbtn filled danger" aria-label={t('transaction.delete')} onClick={() => setConfirmingDelete(true)}>
          <Trash2 size={18} strokeWidth={1.75} />
        </button>
      ) : !isTransfer ? (
        <button type="button" className="hpill" onClick={() => openView('templates')}>
          {t('transaction.templates')}
        </button>
      ) : (
        <span className="hpill-space" />
      )
    ) : view === 'category' ? (
      <button type="button" className="iconbtn filled" aria-label={t('common.edit')} title={t('common.edit')} onClick={() => manageCategories(subParent?.id)}>
        <Pencil size={18} strokeWidth={1.75} />
      </button>
    ) : view === 'templates' && typeTemplates.length > 0 ? (
      <button
        type="button"
        className={`iconbtn filled${managingTemplates ? ' on' : ''}`}
        aria-label={managingTemplates ? t('common.done') : t('common.edit')}
        aria-pressed={managingTemplates}
        onClick={() => setManagingTemplates(!managingTemplates)}
      >
        {managingTemplates ? <Check size={20} strokeWidth={2.25} /> : <Pencil size={18} strokeWidth={1.75} />}
      </button>
    ) : (
      <span className="hpill-space" />
    )

  const head = (
    <div className="sheet-head">
      {view === 'form' ? (
        <button type="button" className="iconbtn filled" aria-label={t('common.close')} onClick={close}>
          <X size={20} strokeWidth={1.75} />
        </button>
      ) : (
        <button type="button" className="iconbtn filled" aria-label={t('common.back')} onClick={goBack}>
          <ChevronLeft size={22} strokeWidth={2} />
        </button>
      )}
      <h2 className="sheet-title">{viewTitle[view]}</h2>
      {headAction}
    </div>
  )

  // ── The form ──
  const amountBlock = (
    <div
      className={`amt-block${keypadOn && focus === 'amount' && !typed ? ' active' : ''}`}
      aria-live="polite"
      onClick={() => {
        setFocus('amount')
        setKeypadOn(true)
      }}
    >
      <span className="cur-pill">{currency}</span>
      <span className="amt-main">
        {typed ? (
          <input
            ref={amountInputRef}
            className="amt-input"
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="0"
            aria-label={t('transaction.amount')}
            value={amount}
            style={{ color: amountColor }}
            onChange={(e) => setAmount(cleanAmountInput(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
          />
        ) : (
          <>
            <span className={`money-xl ${sizeClass(amountText)}`} style={{ color: amountColor }}>
              {sign}
              {amountText}
            </span>
            {keypadOn && focus === 'amount' && <span className="caret" aria-hidden="true" />}
          </>
        )}
      </span>
    </div>
  )

  const amountNote =
    conversion === null ? (
      <div className="amt-sub err">{t('transaction.rateUnavailable')}</div>
    ) : crossCurrency ? (
      <div className="amt-sub">
        {hasValidAmount && receivedAmount
          ? t('add.rateUsed', { rate: pairRate(currency, toAccount!.currency, receivedAmount / parsedAmount) })
          : (() => {
              const live = convert(1, currency, toAccount!.currency)
              return live ? t('add.rateDefault', { rate: pairRate(currency, toAccount!.currency, live) }) : t('transaction.receivedAmountRequired')
            })()}
      </div>
    ) : conversion ? (
      <div className="amt-sub">{conversion}</div>
    ) : null

  // In the TO card when the currencies differ: what arrives, typed or at today's rate
  const receivedSlot = crossCurrency ? (
    typed ? (
      <span className="tcard-recv">
        <span>{t('add.receives')}</span>
        <input
          inputMode="decimal"
          value={toAmount}
          placeholder={convertedToAmount === null ? '' : String(roundMoney(convertedToAmount))}
          aria-label={t('add.received')}
          onChange={(e) => setToAmount(cleanAmountInput(e.target.value))}
        />
      </span>
    ) : (
      <button
        type="button"
        className={`tcard-recv${keypadOn && focus === 'received' ? ' focus' : ''}`}
        aria-label={`${t('add.received')}: ${receivedAmount === null ? '—' : formatAmount(receivedAmount, toAccount!.currency)}`}
        aria-pressed={keypadOn && focus === 'received'}
        onClick={(e) => {
          e.stopPropagation()
          setFocus(focus === 'received' && keypadOn ? 'amount' : 'received')
          setKeypadOn(true)
        }}
      >
        <span>{t('add.receives')}</span>
        <span className="num">
          {toAmount
            ? formatAmount(parseAmount(toAmount), toAccount!.currency)
            : convertedToAmount === null
              ? '—'
              : formatAmount(convertedToAmount, toAccount!.currency)}
        </span>
        {keypadOn && focus === 'received' ? <span className="caret h-4" aria-hidden="true" /> : <Pencil size={12} strokeWidth={2} aria-hidden="true" />}
      </button>
    )
  ) : undefined

  const form = (
    <>
      <div className="fpad">
        <SegmentedControl<TransactionType>
          label={t('add.typeGroup')}
          value={type}
          onChange={handleTypeChange}
          options={(['expense', 'income', 'transfer'] as TransactionType[]).map((tx) => ({ value: tx, label: typeLabel(tx) }))}
        />
      </div>
      <div className="fpad">
        {amountBlock}
        {amountNote}
      </div>

      {isTransfer && (
        <TransferCards
          accounts={accounts}
          fromId={accountId}
          toId={toAccountId}
          onFromChange={pickFrom}
          onToChange={(id) => {
            setToAccountId(id)
            setToAmount('')
          }}
          onSwap={() => {
            setAccountId(toAccountId)
            setToAccountId(accountId)
            setToAmount('')
            setFocus('amount')
          }}
          balances={balances}
          amount={hasValidAmount ? parsedAmount : null}
          received={hasValidAmount ? receivedAmount : null}
          masked={masked}
          receivedSlot={receivedSlot}
        />
      )}

      <section className="fsec">
        <h3 className="t-over fsec-title">{t('add.general')}</h3>
        <div className="fgroup">
          {!isTransfer && (
            <FormRow
              icon={
                <span className="fico tone" style={{ '--c': account ? accountColor(account) : undefined } as React.CSSProperties}>
                  {account ? <AccountIcon account={account} size={17} /> : '?'}
                </span>
              }
              title={t('transaction.account')}
              value={account?.name ?? t('add.required')}
              required={!account}
              onClick={() => openView('account')}
            />
          )}
          {!isTransfer && (
            <FormRow
              icon={<CategoryIcon category={pickedSub ?? pickedCategory} color={pickedCategory?.color} />}
              title={categoryTitle}
              value={
                pickedCategory
                  ? categoryLabel(pickedCategory.id, pickedSub?.id)
                  : suggestedCat
                    ? t('add.suggestion', { name: getCategoryName(suggestedCat, t) })
                    : t('add.required')
              }
              required={!pickedCategory && !suggestedCat}
              onClick={() => openView('category')}
            />
          )}
          <FormRow
            icon={
              <span className="fico">
                <CalendarDays size={18} strokeWidth={1.75} />
              </span>
            }
            title={t('add.date')}
            value={dateLabel}
            onClick={() => openView('date')}
          />
          {!isTransfer && !isEditing && (
            <FormRow
              icon={
                <span className="fico">
                  <Repeat size={18} strokeWidth={1.75} />
                </span>
              }
              title={t('add.repeat')}
              value={repeatLabel}
              onClick={() => openView('repeat')}
            />
          )}
        </div>
      </section>

      <section className="fsec">
        <h3 className="t-over fsec-title">{t('add.moreDetail')}</h3>
        <div className="fgroup">
          <label className="frow note">
            <span className="fico">
              <StickyNote size={18} strokeWidth={1.75} />
            </span>
            <input
              value={note}
              placeholder={t('add.addNote')}
              aria-label={t('transaction.note')}
              maxLength={120}
              onFocus={() => setKeypadOn(false)}
              onChange={(e) => handleNoteChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
          </label>
          {!isTransfer && suggestedCat && suggestedCat.id !== selectedCategoryId && (
            <button type="button" className="frow sug" onClick={() => tapCategory(suggestedCat)}>
              <CategoryIcon category={suggestedCat} small />
              <span className="frow-title">{t('add.useSuggestion', { name: getCategoryName(suggestedCat, t) })}</span>
            </button>
          )}
          {!isTransfer && !isEditing && (
            <div className="frow">
              <span className="fico">
                <Bookmark size={18} strokeWidth={1.75} />
              </span>
              <span className="frow-title">{t('add.keepAsTemplate')}</span>
              <Switch checked={saveAsTemplate} onChange={setSaveAsTemplate} label={t('add.keepAsTemplate')} />
            </div>
          )}
          {!isTransfer && isEditing && (
            <button type="button" className="frow" onClick={handleSaveTemplateFromEdit}>
              <span className="fico">
                <Bookmark size={18} strokeWidth={1.75} />
              </span>
              <span className="frow-title text-accent-text font-semibold">{t('add.saveTemplate')}</span>
            </button>
          )}
        </div>
      </section>
    </>
  )

  // ── The lists the rows open ──
  const check = <Check size={20} strokeWidth={2.25} className="frow-check" aria-hidden="true" />

  // The most used categories of this type lately, as a row of round icons
  const frequent = useMemo(
    () => (isOpen && !isTransfer ? frequentCategories(categories, transactions, type as CategoryKind, 4) : []),
    [isOpen, isTransfer, categories, transactions, type]
  )

  const categoryRow = (category: Category, parentColor?: string, onTap?: () => void, label?: string) => {
    const isParent = !category.parentId
    const subs = isParent ? subcategoriesOf(categories, category.id) : []
    const on = isParent
      ? selectedCategoryId === category.id && (!selectedSubcategoryId || subs.length > 0)
      : selectedSubcategoryId === category.id
    return (
      <button
        key={category.id}
        type="button"
        className="frow"
        aria-current={on || undefined}
        {...longPress(() => setCategoryForm(isParent ? { category } : { category, parent: categories.find((c) => c.id === category.parentId) }))}
        onClick={afterPress(onTap ?? (() => tapCategory(category)))}
      >
        <CategoryIcon category={category} color={parentColor} />
        <span className="frow-title">{label ?? getCategoryName(category, t)}</span>
        {subs.length > 0 && !onTap ? (
          <>
            <span className="frow-val">{subs.length}</span>
            <ChevronRight size={18} strokeWidth={2} className="frow-go" aria-hidden="true" />
          </>
        ) : (
          on && check
        )}
      </button>
    )
  }

  const categoryView = subParent ? (
    <>
      <section className="fsec first">
        <div className="fgroup">
          {categoryRow(subParent, undefined, () => pickCategory(subParent.id), t('add.justCategory', { name: getCategoryName(subParent, t) }))}
        </div>
      </section>
      <section className="fsec">
        <h3 className="t-over fsec-title">{t('catEdit.subsTitle')}</h3>
        <div className="fgroup">
          {subcategoriesOf(categories, subParent.id).map((sub) => categoryRow(sub, subParent.color, () => pickCategory(subParent.id, sub.id)))}
          <button type="button" className="frow add" onClick={() => setCategoryForm({ parent: subParent })}>
            <span className="cico add" aria-hidden="true">
              <Plus size={18} strokeWidth={2.25} />
            </span>
            <span className="frow-title">{t('add.newSub')}</span>
          </button>
        </div>
      </section>
    </>
  ) : (
    <>
      {frequent.length > 0 && (
        <section className="fsec first">
          <h3 className="t-over fsec-title">{t('add.mostFrequent')}</h3>
          <div className="fgroup freq">
            {frequent.map((category) => (
              <button
                key={category.id}
                type="button"
                className="freq-item"
                {...longPress(() => setCategoryForm({ category }))}
                onClick={afterPress(() => tapCategory(category))}
              >
                <CategoryIcon category={category} />
                <span className="freq-name">{getCategoryName(category, t)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section className={`fsec${frequent.length > 0 ? '' : ' first'}`}>
        <h3 className="t-over fsec-title">{t('add.allCategories')}</h3>
        <div className="fgroup">
          {shownCategories.map((category) => categoryRow(category))}
          <button type="button" className="frow add" onClick={() => setCategoryForm({})}>
            <span className="cico add" aria-hidden="true">
              <Plus size={18} strokeWidth={2.25} />
            </span>
            <span className="frow-title">{t('categories.newTitle')}</span>
          </button>
        </div>
        <p className="fsec-cap">{t('add.holdToEdit')}</p>
      </section>
    </>
  )

  const accountView = (
    <section className="fsec first">
      <div className="fgroup">
        {accounts.map((item) => {
          const on = item.id === accountId
          return (
            <button
              key={item.id}
              type="button"
              className="frow tall"
              aria-current={on || undefined}
              onClick={() => {
                setAccountId(item.id)
                backToForm()
              }}
            >
              <span className="fico tone" style={{ '--c': accountColor(item) } as React.CSSProperties}>
                <AccountIcon account={item} size={17} />
              </span>
              <span className="frow-main">
                <span className="frow-title">{item.name}</span>
                <span className="frow-sub">
                  {accountTypeLabel(accountLook(item), t)} · {masked ? MASK : formatAmount(balances[item.id] ?? 0, item.currency)}
                </span>
              </span>
              {on && check}
            </button>
          )
        })}
      </div>
    </section>
  )

  const dateView = (
    <section className="fsec first">
      <div className="fgroup">
        {[0, -1, -2, -3].map((back) => {
          const day = addDays(today, back)
          return (
            <button
              key={day}
              type="button"
              className="frow"
              aria-current={date === day || undefined}
              onClick={() => {
                setDate(day)
                backToForm()
              }}
            >
              <span className="frow-title">{formatDayLabel(day, i18n.language)}</span>
              {date === day && check}
            </button>
          )
        })}
        <label className="frow">
          <span className="fico">
            <Calendar size={18} strokeWidth={1.75} />
          </span>
          <span className="frow-title">{t('add.anotherDay')}</span>
          <input
            type="date"
            className="frow-date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
      </div>
    </section>
  )

  const repeatView = (
    <section className="fsec first">
      <div className="fgroup">
        <div className="frow">
          <span className="fico">
            <Repeat size={18} strokeWidth={1.75} />
          </span>
          <span className="frow-title">{t('add.repeat')}</span>
          <Switch checked={isRecurring} onChange={setIsRecurring} label={t('add.repeat')} />
        </div>
        {isRecurring && (
          <div className="frow col">
            <span className="t-label">{t('add.howOften')}</span>
            <SegmentedControl<RecurringFrequency>
              label={t('add.howOften')}
              value={frequency}
              onChange={setFrequency}
              options={(['weekly', 'monthly', 'yearly'] as RecurringFrequency[]).map((f) => ({ value: f, label: t(`transaction.${f}`) }))}
            />
            <span className="t-label">{t('add.whenDue')}</span>
            <SegmentedControl<'auto' | 'ask'>
              label={t('add.whenDue')}
              value={autoCreate ? 'auto' : 'ask'}
              onChange={(next) => setAutoCreate(next === 'auto')}
              options={[
                { value: 'auto', label: t('add.addForMe') },
                { value: 'ask', label: t('add.askFirst') },
              ]}
            />
          </div>
        )}
      </div>
      {isRecurring && (
        <p className="fsec-cap">{t(autoCreate ? 'add.nextAuto' : 'add.nextAsk', { date: formatDayLabel(nextDate, i18n.language) })}</p>
      )}
    </section>
  )

  const templatesView =
    typeTemplates.length > 0 ? (
      <section className="fsec first">
        <div className="fgroup">
          {typeTemplates.map((template) => {
            const category = categories.find((c) => c.id === template.categoryId)
            const sub = template.subcategoryId ? categories.find((c) => c.id === template.subcategoryId) : undefined
            const tplAccount = allAccounts.find((a) => a.id === template.accountId)
            const name = template.note || categoryLabel(template.categoryId, template.subcategoryId ?? undefined)
            return (
              <button
                key={template.id}
                type="button"
                className="frow tall"
                aria-label={managingTemplates ? t('add.removeTemplate', { name }) : t('add.useTemplate', { name })}
                onClick={() => handleTemplateTap(template)}
              >
                {managingTemplates ? (
                  <span className="cico del" aria-hidden="true">
                    <Trash2 size={16} strokeWidth={2} />
                  </span>
                ) : (
                  <CategoryIcon category={sub ?? category} color={category?.color} />
                )}
                <span className="frow-main">
                  <span className="frow-title">{name}</span>
                  {tplAccount && <span className="frow-sub">{tplAccount.name}</span>}
                </span>
                <span className="frow-val num">{formatAmount(template.amount, tplAccount?.currency ?? base)}</span>
              </button>
            )
          })}
        </div>
        <p className="fsec-cap">{managingTemplates ? t('add.templatesRemoveHint') : t('add.templatesHint')}</p>
      </section>
    ) : (
      <div className="fempty">
        <span className="fempty-ico">
          <Bookmark size={24} strokeWidth={1.75} />
        </span>
        <span className="t-sub">{t('add.noTemplates')}</span>
      </div>
    )

  const views: Record<View, React.ReactNode> = {
    form,
    category: categoryView,
    account: accountView,
    date: dateView,
    repeat: repeatView,
    templates: templatesView,
  }

  // ── The bottom: the keypad while typing an amount, otherwise one Save button ──
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
      <Button className="fill" size="lg" onClick={handleSave} disabled={!hasValidAmount} loading={isLoading}>
        {saveLabel}
      </Button>
    </div>
  )
  const dock = view === 'form' ? <div className="dock">{!typed && keypadOn ? keypad : saveRow}</div> : undefined

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={close}
        label={viewTitle[view]}
        className={`add-sheet${typed ? ' typed' : ''}`}
        bodyClassName="add-body"
        header={head}
        footer={dock}
      >
        <div
          ref={bodyRef}
          className="add-scroll"
          // Scrolling the form puts the keypad away, as a phone keyboard would
          onTouchMove={() => keypadOn && view === 'form' && setKeypadOn(false)}
        >
          {views[view]}
        </div>
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

      <ConfirmDialog
        isOpen={isOpen && confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={handleDelete}
        title={t(`add.deleteTitle_${type}`)}
        description={t('add.deleteText')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('add.keep')}
        danger
      />
    </>
  )
}
