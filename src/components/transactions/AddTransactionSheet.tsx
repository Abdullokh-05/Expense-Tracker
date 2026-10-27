import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpDown, Bookmark, Calendar, Check, Delete, LayoutGrid, Pencil, Repeat, Trash2, X } from 'lucide-react'
import type { Category, RecurringFrequency, Transaction, TransactionTemplate, TransactionType } from '@/types'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { toast } from '@/components/ui/Toast'
import { AccountIcon } from '@/components/accounts/AccountCard'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useRecurringStore } from '@/store/recurringStore'
import { useAccountStore } from '@/store/accountStore'
import { useTemplateStore } from '@/store/templateStore'
import { useConverter, useRatesStore } from '@/store/ratesStore'
import { suggestCategory } from '@/db/operations'
import { getCategoryKind, getCategoryName } from '@/lib/categories'
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
// Categories shown before "All N"
const TOP_CATEGORIES = 7
// Longest amount the keypad takes, in digits
const MAX_DIGITS = 12

type Panel = 'date' | 'repeat' | 'cats' | 'confirm'
type Field = 'amount' | 'received'

// NaN while nothing is typed
const parseAmount = (text: string) => parseMoneyInput(text, { allowNegative: false }) ?? NaN
// Typed amounts keep a dot for decimals whatever the language shows; a comma works too, only
// one of them is taken, and no more than two digits after it
const cleanAmountInput = (text: string) => sanitizeMoneyInput(text)

// "45 000" or "2,99" as the amount is being typed, keeping a trailing decimal mark
function showTyped(raw: string, locale: string): string {
  if (!raw) return '0'
  const [whole, fraction] = raw.split('.')
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return fraction === undefined ? grouped : grouped + (locale.startsWith('en') ? '.' : ',') + fraction
}

function sizeClass(text: string): string {
  return text.length > 13 ? 'xlong' : text.length > 10 ? 'long' : ''
}

// A category tile is narrow: its longest word decides how small the name gets, so a word
// like "Развлечения" stays whole instead of losing its last letter to the next line
function nameSizeClass(name: string): string {
  const longest = Math.max(...name.split(/\s+/).map((word) => word.length))
  return longest > 10 ? ' xlong' : longest > 8 ? ' long' : ''
}

// Add or edit an entry: type an amount, then one tap on a category saves it. Transfers move
// money between two accounts, converting when their currencies differ.
export const AddTransactionSheet: React.FC<AddTransactionSheetProps> = ({
  isOpen,
  onClose,
  transaction,
  prefilledCategory,
  prefilledType = 'expense',
  onSaved,
}) => {
  const { t, i18n } = useTranslation()
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
  const [date, setDate] = useState(todayDate())
  const [note, setNote] = useState('')
  const [panel, setPanel] = useState<Panel | null>(null)

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

  // An archived account or category stays selectable on the transaction that already uses it.
  // Accounts counted in the total come first, as on Home.
  const usable = allAccounts.filter(
    (a) => !a.isArchived || a.id === transaction?.accountId || a.id === transaction?.toAccountId
  )
  const accounts = [...usable.filter((a) => a.includeInTotal), ...usable.filter((a) => !a.includeInTotal)]
  const isTransfer = type === 'transfer'
  const shownCategories = categories.filter(
    (c) => getCategoryKind(c) === type && (!c.isArchived || c.id === transaction?.categoryId)
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
      setDate(transaction?.date ?? todayDate())
      setNote(transaction?.note ?? '')
      setPanel(null)
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
    // A category belongs to one kind; don't carry an expense category over to an income
    const current = categories.find((c) => c.id === selectedCategoryId)
    if (current && getCategoryKind(current) !== next) setSelectedCategoryId('')
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
      setSuggestedCat(suggested && getCategoryKind(suggested) === type ? suggested : null)
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

  const handleSave = async (catId?: string) => {
    if (isSaving.current) return
    const finalCategoryId = catId || selectedCategoryId

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
        accountId: account.id,
        toAccountId: isTransfer ? toAccount!.id : null,
        toAmount: isTransfer ? receivedAmount : null,
        date,
        note: note.trim() || null,
        noteOriginal: note.trim() || null,
        paymentMethod: paymentMethodOf(account),
      }
      const what = isTransfer
        ? `${account.name} → ${toAccount!.name}`
        : getCategoryName(categories.find((c) => c.id === finalCategoryId), t)

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
        if (saveAsTemplate && type !== 'transfer') await saveTemplate(finalCategoryId)
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
  const saveTemplate = async (categoryId: string) => {
    if (type === 'transfer' || !account) return
    await addTemplate({
      userId: settings.userId,
      type,
      amount: parsedAmount,
      categoryId,
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
      await saveTemplate(selectedCategoryId)
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
          what: template.note || getCategoryName(categories.find((c) => c.id === template.categoryId), t),
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

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategoryId(categoryId)
    if (panel === 'cats') setPanel(null)
    // Quick add: amount, then one tap on a category saves. Editing waits for the Save button.
    if (!isEditing && hasValidAmount) handleSave(categoryId)
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

  // The chosen account can sit off to the side of its row: bring it into view
  useEffect(() => {
    if (!isOpen) return
    const frame = requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>('.add-sheet .accs').forEach((row) => {
        const chosen = row.querySelector<HTMLElement>('.acc-chip.on')
        if (!chosen) return
        const left = chosen.offsetLeft - row.offsetLeft
        // Only when it's cut off by the faded edge
        const hidden = left - row.scrollLeft < 0 || left - row.scrollLeft + chosen.offsetWidth > row.clientWidth - 32
        if (hidden) row.scrollLeft = left - 16
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [isOpen, accountId, toAccountId, type])

  // In keyboard mode the amount field is focused as the sheet opens
  useEffect(() => {
    if (isOpen && typed && !isEditing) setTimeout(() => amountInputRef.current?.focus(), 50)
  }, [isOpen, typed, isEditing])

  const close = () => onClose()

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
  const goHint = !isEditing && hasValidAmount && !isTransfer
  // A transfer's rate reads per one unit of the currency that isn't the main one: "1 $ = 12 600 soʻm".
  // `perFrom` is how much of `to` one unit of `from` buys.
  const pairRate = (from: string, to: string, perFrom: number) =>
    from === base ? formatRateLine(to, from, 1 / perFrom) : formatRateLine(from, to, perFrom)

  // Seven categories, then "All N"; a chosen one from further down takes the last place
  const folds = shownCategories.length > TOP_CATEGORIES + 1
  let topCategories = folds && !wide ? shownCategories.slice(0, TOP_CATEGORIES) : shownCategories
  const selected = shownCategories.find((c) => c.id === selectedCategoryId)
  if (selected && !topCategories.includes(selected)) topCategories = [...topCategories.slice(0, TOP_CATEGORIES - 1), selected]

  const dateLabel =
    date === todayDate() ? t('common.today') : date === addDays(todayDate(), -1) ? t('common.yesterday') : formatShortDate(date, i18n.language)
  const repeatLabel = isRecurring
    ? `${t(`transaction.${frequency}`)} · ${autoCreate ? t('add.auto') : t('add.ask')}`
    : t('add.repeat')
  const nextDate = advanceByFrequency(date, frequency)
  const typeLabel = (tx: TransactionType) =>
    tx === 'expense' ? t('transaction.expense') : tx === 'income' ? t('transaction.income') : t('transaction.transfer')
  const saveLabel = isTransfer && !isEditing ? t('transaction.transfer') : t('common.save')

  const renderCategory = (category: Category) => {
    const on = category.id === selectedCategoryId
    const suggested = !on && suggestedCat?.id === category.id
    return (
      <button
        key={category.id}
        type="button"
        className={`cat${on ? ' on' : ''}${suggested ? ' sug' : ''}`}
        aria-pressed={on}
        onClick={() => handleCategorySelect(category.id)}
      >
        <span className="bub" style={{ '--c': category.color } as React.CSSProperties} aria-hidden="true">
          {category.icon}
        </span>
        <span className={`cat-name${nameSizeClass(getCategoryName(category, t))}`}>{getCategoryName(category, t)}</span>
      </button>
    )
  }

  const accountChips = (selectedId: string, onPick: (id: string) => void, disabledId?: string, withIcons = true) =>
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
          {withIcons && <AccountIcon account={item} size={18} />}
          {item.name}
          {item.currency !== base && <span className="code">{item.currency}</span>}
        </button>
      )
    })

  // ── Pieces ──
  const head = (
    <>
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
    </>
  )

  const pills = (compact: boolean) => (
    <>
      <button type="button" className={`dpill${panel === 'date' ? ' open' : date !== todayDate() ? ' on' : ''}`} onClick={() => setPanel(panel === 'date' ? null : 'date')}>
        <Calendar size={18} strokeWidth={1.75} aria-hidden="true" />
        {dateLabel}
      </button>
      {!isTransfer && !isEditing && (
        <button
          type="button"
          className={`dpill${compact ? ' icon' : ''}${panel === 'repeat' ? ' open' : isRecurring ? ' on' : ''}`}
          aria-label={compact ? repeatLabel : undefined}
          aria-pressed={isRecurring}
          onClick={() => setPanel(panel === 'repeat' ? null : 'repeat')}
        >
          <Repeat size={18} strokeWidth={1.75} aria-hidden="true" />
          {!compact && repeatLabel}
        </button>
      )}
      {!isTransfer && (
        <button
          type="button"
          className={`dpill${compact ? ' icon' : ''}${!isEditing && saveAsTemplate ? ' on' : ''}`}
          aria-label={compact ? (isEditing ? t('add.saveTemplate') : t('add.template')) : undefined}
          aria-pressed={isEditing ? undefined : saveAsTemplate}
          onClick={() => (isEditing ? handleSaveTemplateFromEdit() : setSaveAsTemplate(!saveAsTemplate))}
        >
          <Bookmark size={18} strokeWidth={1.75} aria-hidden="true" fill={!isEditing && saveAsTemplate ? 'currentColor' : 'none'} />
          {!compact && (isEditing ? t('add.saveTemplate') : t('add.template'))}
        </button>
      )}
    </>
  )

  const panels: Record<Panel, React.ReactNode> = {
    date: (
      <div className="panel">
        <div className="panel-head">
          <span className="t-head">{t('add.date')}</span>
          <Button variant="ghost" onClick={() => setPanel(null)}>{t('common.done')}</Button>
        </div>
        <div className="chips">
          {[0, -1, -2].map((back) => {
            const day = addDays(todayDate(), back)
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
      </div>
    ),
    repeat: (
      <div className="panel gap-2">
        <div className="panel-head">
          <span className="flex items-center gap-3">
            <Switch checked={isRecurring} onChange={setIsRecurring} label={t('add.repeat')} />
            <span className="t-head">{t('add.repeat')}</span>
          </span>
          <Button variant="ghost" onClick={() => setPanel(null)}>{t('common.done')}</Button>
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
      </div>
    ),
    cats: (
      <div className="panel gap-2 h-[216px] min-h-0">
        <div className="panel-head">
          <span className="t-head">{t('add.allCategories')}</span>
          <Button variant="ghost" onClick={() => setPanel(null)}>{t('common.done')}</Button>
        </div>
        <div className="cats p-0 overflow-y-auto">{shownCategories.map(renderCategory)}</div>
      </div>
    ),
    confirm: (
      <div className="panel justify-center gap-6">
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
  const dock = (
    <div className="dock">
      {panel ? (
        panels[panel]
      ) : typed ? (
        <div className="save-row">
          {wide ? pills(false) : pills(true)}
          {wide && (
            <>
              <span className="grow" />
              <Button variant="secondary" onClick={close}>
                {t('common.cancel')}
              </Button>
            </>
          )}
          <Button
            className={wide ? undefined : 'fill'}
            onClick={() => handleSave(selectedCategoryId || suggestedCat?.id)}
            disabled={!hasValidAmount}
            loading={isLoading}
          >
            {saveLabel}
          </Button>
        </div>
      ) : (
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
          <button
            type="button"
            className="key save"
            disabled={!hasValidAmount || isLoading}
            aria-label={saveLabel}
            onClick={() => handleSave()}
          >
            <Check size={22} strokeWidth={2} aria-hidden="true" />
            <span>{saveLabel}</span>
          </button>
        </div>
      )}
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
          if (e.key === 'Enter') handleSave(selectedCategoryId || suggestedCat?.id)
        }}
      />
    ) : (
      <>
        <span className={`money-xl ${sizeClass(amountText)}`} style={{ color: amountColor }}>{amountText}</span>
        {focus === 'amount' && <span className="caret" aria-hidden="true" />}
      </>
    )

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={close}
      label={isEditing ? t('add.editEntry') : t('add.newEntry')}
      className={`add-sheet${typed ? ' typed' : ''}`}
      bodyClassName="add-body"
      header={head}
      footer={dock}
    >
      {/* Templates: one tap records one for today */}
      {!isEditing && !isTransfer && templates.some((tpl) => tpl.type === type) && (
        <div className="tpls" role="group" aria-label={t('transaction.templates')}>
          {templates
            .filter((tpl) => tpl.type === type)
            .map((template) => {
              const category = categories.find((c) => c.id === template.categoryId)
              const tplAccount = allAccounts.find((a) => a.id === template.accountId)
              const name = template.note || getCategoryName(category, t)
              return (
                <button
                  key={template.id}
                  type="button"
                  className={`tpl${managingTemplates ? ' del' : ''}`}
                  aria-label={managingTemplates ? t('add.removeTemplate', { name }) : t('add.useTemplate', { name })}
                  onClick={() => handleTemplateTap(template)}
                >
                  <span className="emo" aria-hidden="true">{category?.icon ?? '📦'}</span>
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
      )}

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
        <label className="note-row">
          <Pencil size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          <input
            value={note}
            placeholder={t('add.addNote')}
            aria-label={t('transaction.note')}
            maxLength={120}
            onChange={(e) => handleNoteChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && typed) handleSave(selectedCategoryId || suggestedCat?.id)
            }}
          />
          {!isTransfer && suggestedCat && suggestedCat.id !== selectedCategoryId && (
            <button
              type="button"
              className="suggest"
              aria-label={t('add.useSuggestion', { name: getCategoryName(suggestedCat, t) })}
              onClick={() => handleCategorySelect(suggestedCat.id)}
            >
              <span aria-hidden="true">{suggestedCat.icon}</span>
              <span>{t('add.suggestion', { name: getCategoryName(suggestedCat, t) })}</span>
            </button>
          )}
        </label>
      </div>

      {isTransfer ? (
        <div className="flex flex-col flex-none">
          <div className="xfer-label">
            <span className="t-over">{t('transaction.fromAccount')}</span>
          </div>
          <div className="accs" role="group" aria-label={t('transaction.fromAccount')}>
            {accountChips(accountId, pickFrom, undefined, false)}
          </div>
          <div className="xfer-label">
            <span className="t-over">{t('transaction.toAccount')}</span>
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
          <div className="accs" role="group" aria-label={t('transaction.toAccount')}>
            {accountChips(toAccountId, setToAccountId, accountId, false)}
          </div>
          {accounts.length < 2 && <p className="t-sub px-4 pt-3">{t('add.secondAccount')}</p>}
          {crossCurrency && (
            <div className="field px-4 pt-4">
              <span className="t-label">{t('add.received')}</span>
              {typed ? (
                <span className="input">
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
                <button type="button" className={`input justify-between w-full${focus === 'received' ? ' focus' : ''}`} onClick={() => setFocus('received')}>
                  <span className="flex items-center">
                    <span className="amt text-[17px]" style={{ color: toAmount ? 'var(--ink)' : 'var(--ink-2)' }}>
                      {toAmount
                        ? formatAmount(parseAmount(toAmount), toAccount!.currency)
                        : convertedToAmount === null
                          ? '—'
                          : formatAmount(convertedToAmount, toAccount!.currency)}
                    </span>
                    {focus === 'received' && <span className="caret h-5" aria-hidden="true" />}
                  </span>
                </button>
              )}
              <span className="help num">
                {hasValidAmount && receivedAmount
                  ? t('add.rateUsed', { rate: pairRate(currency, toAccount!.currency, receivedAmount / parsedAmount) })
                  : (() => {
                      const live = convert(1, currency, toAccount!.currency)
                      return live ? t('add.rateDefault', { rate: pairRate(currency, toAccount!.currency, live) }) : t('transaction.receivedAmountRequired')
                    })()}
              </span>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="accs" role="group" aria-label={t('transaction.account')}>
            {accountChips(accountId, setAccountId)}
          </div>
          <div className={`hint${goHint ? ' go' : ''}`}>
            {goHint && <Check size={16} strokeWidth={2} aria-hidden="true" />}
            {goHint ? (wide ? t('add.clickToSave') : t('add.tapToSave')) : type === 'income' ? t('transaction.incomeSource') : t('transaction.category')}
          </div>
          <div className={`cats${wide ? ' wide' : ''}`} role="group" aria-label={t('transaction.category')}>
            {topCategories.map(renderCategory)}
            {folds && !wide && (
              <button type="button" className="cat all" onClick={() => setPanel('cats')}>
                <span className="bub" aria-hidden="true">
                  <LayoutGrid size={22} strokeWidth={1.75} />
                </span>
                <span className="cat-name">{t('add.all', { count: shownCategories.length })}</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* With the keypad the options sit above it; typing puts them in the save row */}
      {!typed && (
        <>
          <div className="flex-1" />
          <div className="dpills">{pills(false)}</div>
        </>
      )}
      {typed && wide && <p className="t-cap px-4 pt-3 pb-1">{t('add.enterHint')}</p>}
    </BottomSheet>
  )
}
