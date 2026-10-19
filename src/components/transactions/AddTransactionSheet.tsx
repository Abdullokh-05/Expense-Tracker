import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BottomSheet, ConfirmDialog } from '@/components/ui/BottomSheet'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useRecurringStore } from '@/store/recurringStore'
import { useAccountStore } from '@/store/accountStore'
import { useTemplateStore } from '@/store/templateStore'
import { useConverter, useRatesStore } from '@/store/ratesStore'
import { suggestCategory } from '@/db/operations'
import { getCategoryKind, getCategoryName } from '@/lib/categories'
import { advanceByFrequency, formatAmount, roundMoney, todayDate } from '@/lib/utils'
import { Calendar, FileText, Repeat, ChevronDown, Trash2, BookmarkPlus, X } from 'lucide-react'
import type { Account, Transaction, TransactionTemplate, TransactionType, Category, RecurringFrequency } from '@/types'
import { ToggleRow } from '@/components/ui/ToggleRow'
import { toast } from '@/components/ui/Toast'
import { paymentMethodOf } from '@/lib/accounts'
import { AccountIcon } from '@/components/accounts/AccountCard'

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

const parseAmount = (text: string) => parseFloat(text.replace(/[^0-9.]/g, ''))
const cleanAmountInput = (text: string) => text.replace(/[^0-9.,]/g, '').replace(',', '.')

interface AccountPickerProps {
  label: string
  accounts: Account[]
  selectedId: string
  onSelect: (id: string) => void
}

const AccountPicker: React.FC<AccountPickerProps> = ({ label, accounts, selectedId, onSelect }) => (
  <div>
    <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
      {label}
    </label>
    <div className="flex gap-2 overflow-x-auto hide-scrollbar">
      {accounts.map((account) => {
        const selected = account.id === selectedId
        return (
          <button
            key={account.id}
            onClick={() => onSelect(account.id)}
            aria-pressed={selected}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: selected ? 'var(--color-surface)' : 'var(--color-surface-2)',
              border: selected ? '1.5px solid var(--color-accent)' : '1.5px solid var(--color-border)',
              color: selected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
          >
            <AccountIcon account={account} size={14} />
            <span>{account.name}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>{account.currency}</span>
          </button>
        )
      })}
    </div>
  </div>
)

export const AddTransactionSheet: React.FC<AddTransactionSheetProps> = ({
  isOpen,
  onClose,
  transaction,
  prefilledCategory,
  prefilledType = 'expense',
  onSaved,
}) => {
  const { t } = useTranslation()
  const { settings } = useAppStore()
  const isEditing = Boolean(transaction)

  // ✅ FIX: Select raw array, filter locally — never call methods in Zustand selectors
  const categories = useCategoryStore((s) => s.categories)
  const allAccounts = useAccountStore((s) => s.accounts)
  const loadRates = useRatesStore((s) => s.loadRates)
  const convert = useConverter()

  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const editTransaction = useTransactionStore((s) => s.editTransaction)
  const removeTransaction = useTransactionStore((s) => s.removeTransaction)
  const addRecurringTransaction = useRecurringStore((s) => s.addRecurringTransaction)
  const { templates, addTemplate, removeTemplate } = useTemplateStore()

  const [type, setType] = useState<TransactionType>(prefilledType)
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  // Typed only when the two accounts of a transfer are in different currencies
  const [toAmount, setToAmount] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [date, setDate] = useState(todayDate())
  const [note, setNote] = useState('')
  const [showExtra, setShowExtra] = useState(false)

  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [autoCreate, setAutoCreate] = useState(true)

  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  // While on, tapping a template removes it instead of using it
  const [managingTemplates, setManagingTemplates] = useState(false)

  const [suggestedCat, setSuggestedCat] = useState<Category | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // Synchronous guard: a double tap fires twice before isLoading has re-rendered
  const isSaving = useRef(false)

  // An archived account or category stays selectable on the transaction that already uses it
  const accounts = allAccounts.filter(
    (a) => !a.isArchived || a.id === transaction?.accountId || a.id === transaction?.toAccountId
  )
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
      setToAccountId(transaction?.toAccountId ?? active.find((a) => a.id !== firstAccount)?.id ?? '')
      setToAmount(transaction?.toAmount != null ? String(transaction.toAmount) : '')
      setSelectedCategoryId(transaction?.categoryId ?? prefilledCategory ?? '')
      setDate(transaction?.date ?? todayDate())
      setNote(transaction?.note ?? '')
      setIsRecurring(false)
      setFrequency('monthly')
      setAutoCreate(true)
      setSaveAsTemplate(false)
      setManagingTemplates(false)
      setSuggestedCat(null)
      // Editing shows every field straight away
      setShowExtra(Boolean(transaction))
      setShowDeleteConfirm(false)
      // Foreign-currency accounts need rates; fetch them if this session hasn't yet
      if (!useRatesStore.getState().rates) loadRates()
    }
    // Deliberately not re-run when the account list changes: that would wipe what was typed
  }, [isOpen, transaction, prefilledType, prefilledCategory]) // oxlint-disable-line react-hooks/exhaustive-deps

  const account = accounts.find((a) => a.id === accountId)
  const toAccount = accounts.find((a) => a.id === toAccountId)
  const currency = account?.currency ?? settings.baseCurrency

  // Rate from the account's currency to the base currency. Saving needs a real one: recording
  // a foreign amount at a made-up rate of 1 would silently corrupt every total. Editing
  // without changing the currency keeps the rate the transaction was recorded at.
  const rate: number | null =
    currency === settings.baseCurrency
      ? 1
      : transaction && transaction.currency === currency
        ? transaction.exchangeRate
        : convert(1, currency, settings.baseCurrency)

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
        : roundMoney(convertedToAmount, toAccount!.currency)

  const handleTypeChange = (next: TransactionType) => {
    setType(next)
    // A category belongs to one kind; don't carry an expense category over to an income
    const current = categories.find((c) => c.id === selectedCategoryId)
    if (current && getCategoryKind(current) !== next) setSelectedCategoryId('')
  }

  const handleNoteChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setNote(val)
    if (val.trim().length > 2 && !isTransfer) {
      const suggested = await suggestCategory(settings.userId, val)
      setSuggestedCat(suggested && getCategoryKind(suggested) === type ? suggested : null)
    } else {
      setSuggestedCat(null)
    }
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
        amountInBaseCurrency: roundMoney(parsedAmount * rate, settings.baseCurrency),
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

      if (transaction) {
        await editTransaction(transaction.id, fields)
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

        await addTransaction({
          ...fields,
          userId: settings.userId,
          status: 'confirmed',
          noteLanguage: null,
          translationConfidence: null,
          recurringTransactionId,
        })
        localStorage.setItem(LAST_ACCOUNT_KEY, account.id)
        if (saveAsTemplate && type !== 'transfer') await saveTemplate(finalCategoryId)
      }

      toast.success(t('settings.saved'))
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
    const templateRate = convert(1, templateAccount.currency, settings.baseCurrency)
    if (templateRate === null) {
      toast.error(t('transaction.rateUnavailable'))
      return
    }

    isSaving.current = true
    setIsLoading(true)
    try {
      await addTransaction({
        userId: settings.userId,
        type: template.type,
        status: 'confirmed',
        amount: template.amount,
        currency: templateAccount.currency,
        amountInBaseCurrency: roundMoney(template.amount * templateRate, settings.baseCurrency),
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
      toast.success(t('settings.saved'))
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
    // Quick add: amount, then one tap on a category saves. Editing waits for the Save button.
    if (!isEditing && amount) handleSave(categoryId)
  }

  const selectSty: React.CSSProperties = {
    background: 'var(--color-surface-2)',
    border: '1.5px solid var(--color-border)',
    borderRadius: '12px',
    padding: '0.75rem 2rem 0.75rem 0.875rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
  }

  // A transfer stays a transfer when edited, and the others can't become one
  const typeOptions: TransactionType[] = !isEditing
    ? ['expense', 'income', 'transfer']
    : transaction?.type === 'transfer' ? [] : ['expense', 'income']

  const typeLabel = (tx: TransactionType) =>
    tx === 'expense' ? t('transaction.expense') : tx === 'income' ? t('transaction.income') : t('transaction.transfer')
  const typeColor = (tx: TransactionType) =>
    tx === 'expense' ? 'var(--color-expense)' : tx === 'income' ? 'var(--color-income)' : 'var(--color-text-primary)'

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title={isEditing ? t('transaction.editTitle') : t('transaction.addTitle')}
      >
        <div className="space-y-4">

          {/* Templates: entries made often, recorded for today with one tap */}
          {!isEditing && templates.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('transaction.templates')}
                </label>
                <button
                  id="manage-templates-btn"
                  onClick={() => setManagingTemplates(!managingTemplates)}
                  className="text-xs font-semibold"
                  style={{ color: managingTemplates ? 'var(--color-expense)' : 'var(--color-text-muted)' }}
                >
                  {managingTemplates ? t('common.done') : t('transaction.manageTemplates')}
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                {templates.map((template) => {
                  const category = categories.find((c) => c.id === template.categoryId)
                  const templateAccount = allAccounts.find((a) => a.id === template.accountId)
                  return (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateTap(template)}
                      className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all"
                      style={{
                        background: 'var(--color-surface-2)',
                        border: managingTemplates ? '1.5px dashed var(--color-expense)' : '1.5px solid var(--color-border)',
                      }}
                    >
                      <span className="text-lg leading-none">{category?.icon ?? '📦'}</span>
                      <span>
                        <span className="text-xs font-semibold block" style={{ color: 'var(--color-text-primary)' }}>
                          {template.note || getCategoryName(category, t)}
                        </span>
                        <span className="text-[11px] block amount-display" style={{ color: 'var(--color-text-muted)' }}>
                          {template.type === 'income' ? '+' : '−'}
                          {formatAmount(template.amount, templateAccount?.currency ?? settings.baseCurrency)}
                        </span>
                      </span>
                      {managingTemplates && <X size={14} style={{ color: 'var(--color-expense)' }} />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Type toggle */}
          {typeOptions.length > 0 && (
            <div className="flex p-1 rounded-xl gap-1" style={{ background: 'var(--color-surface-2)' }}>
              {typeOptions.map((tx) => (
                <button
                  key={tx}
                  onClick={() => handleTypeChange(tx)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
                  style={{
                    background: type === tx ? 'var(--color-surface)' : 'transparent',
                    color: type === tx ? typeColor(tx) : 'var(--color-text-muted)',
                    boxShadow: type === tx ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {typeLabel(tx)}
                </button>
              ))}
            </div>
          )}

          {/* Amount, in the currency of the chosen account */}
          <div>
            <Input
              id="amount-input"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(cleanAmountInput(e.target.value))}
              className="text-right text-2xl font-bold tracking-wide pl-14"
              leftIcon={
                <span style={{ color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>
                  {currency}
                </span>
              }
              autoFocus
            />

            {/* What a foreign-currency amount will count as in the base currency */}
            {currency !== settings.baseCurrency && (
              <p
                className="text-xs mt-1.5 text-right amount-display"
                style={{ color: rate === null ? 'var(--color-expense)' : 'var(--color-text-muted)' }}
              >
                {rate === null
                  ? t('transaction.rateUnavailable')
                  : `≈ ${formatAmount(hasValidAmount ? parsedAmount * rate : 0, settings.baseCurrency)}`}
              </p>
            )}
          </div>

          <AccountPicker
            label={isTransfer ? t('transaction.fromAccount') : t('transaction.account')}
            accounts={accounts}
            selectedId={accountId}
            onSelect={setAccountId}
          />

          {isTransfer && (
            <>
              <AccountPicker
                label={t('transaction.toAccount')}
                accounts={accounts.filter((a) => a.id !== accountId)}
                selectedId={toAccountId}
                onSelect={setToAccountId}
              />
              {crossCurrency && (
                <Input
                  id="to-amount-input"
                  type="text"
                  inputMode="decimal"
                  label={t('transaction.receivedAmount', { currency: toAccount!.currency })}
                  placeholder={convertedToAmount === null ? '0' : String(roundMoney(convertedToAmount, toAccount!.currency))}
                  value={toAmount}
                  onChange={(e) => setToAmount(cleanAmountInput(e.target.value))}
                />
              )}
            </>
          )}

          {/* Suggested category */}
          {!isTransfer && suggestedCat && !selectedCategoryId && (
            <button
              onClick={() => handleCategorySelect(suggestedCat.id)}
              className="w-full flex items-center justify-between p-3 rounded-xl transition-all"
              style={{
                background: 'color-mix(in srgb, var(--color-income) 8%, transparent)',
                border: '1px dashed color-mix(in srgb, var(--color-income) 40%, transparent)',
              }}
            >
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t('transaction.suggestedCategory')}:
              </span>
              <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                <span>{suggestedCat.icon}</span>
                <span>{getCategoryName(suggestedCat, t)}</span>
              </span>
            </button>
          )}

          {/* Category grid */}
          {!isTransfer && (
            <div>
              <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                {type === 'income' ? t('transaction.incomeSource') : t('transaction.category')}
              </label>
              <div className="grid grid-cols-4 gap-2 max-h-[180px] overflow-y-auto hide-scrollbar">
                {shownCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id)}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-xl transition-all duration-150"
                    style={{
                      background: selectedCategoryId === cat.id
                        ? `${cat.color}20`
                        : 'var(--color-surface-2)',
                      border: selectedCategoryId === cat.id
                        ? `1.5px solid ${cat.color || 'var(--color-accent)'}`
                        : '1.5px solid var(--color-border)',
                      transform: selectedCategoryId === cat.id ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    <span className="text-xl leading-none">{cat.icon}</span>
                    <span
                      className="text-[10px] font-medium truncate w-full text-center leading-tight"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {getCategoryName(cat, t)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Expand extras */}
          <button
            onClick={() => setShowExtra(!showExtra)}
            className="w-full flex items-center gap-1.5 text-xs font-semibold py-1 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <ChevronDown size={13} style={{ transform: showExtra ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
            {showExtra ? t('transaction.hideDetails') : t('transaction.showDetails')}
          </button>

          {showExtra && (
            <div className="space-y-3 animate-fade-in">
              <Input
                id="note-input"
                placeholder={t('transaction.notePlaceholder')}
                value={note}
                onChange={handleNoteChange}
                leftIcon={<FileText size={16} />}
              />

              <Input
                id="date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                leftIcon={<Calendar size={16} />}
              />

              {!isEditing && !isTransfer && (
                <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                  <ToggleRow
                    id="save-template-toggle"
                    label={t('transaction.saveAsTemplate')}
                    description={t('transaction.saveAsTemplateHint')}
                    checked={saveAsTemplate}
                    onChange={setSaveAsTemplate}
                  />
                </div>
              )}

              {/* Recurring (only when adding: an existing transaction is a single occurrence) */}
              {!isEditing && !isTransfer && (
                <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                      <Repeat size={14} />
                      {t('transaction.recurring')}
                    </div>
                    <button
                      onClick={() => setIsRecurring(!isRecurring)}
                      role="switch"
                      aria-checked={isRecurring}
                      aria-label={t('transaction.recurring')}
                      className="w-9 h-5 rounded-full p-0.5 transition-colors duration-200 flex-shrink-0"
                      style={{ background: isRecurring ? 'var(--color-accent)' : 'var(--color-border)' }}
                    >
                      <div
                        className="w-4 h-4 rounded-full transition-transform duration-200"
                        style={{
                          background: isRecurring ? 'var(--color-bg)' : '#fff',
                          transform: isRecurring ? 'translateX(16px)' : 'translateX(0)',
                        }}
                      />
                    </button>
                  </div>

                  {isRecurring && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)} style={{ ...selectSty, fontSize: '0.75rem' }}>
                          <option value="weekly">{t('transaction.weekly')}</option>
                          <option value="monthly">{t('transaction.monthly')}</option>
                          <option value="yearly">{t('transaction.yearly')}</option>
                        </select>
                        <ChevronDown size={12} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                      </div>
                      <div className="relative">
                        <select value={autoCreate ? 'auto' : 'confirm'} onChange={(e) => setAutoCreate(e.target.value === 'auto')} style={{ ...selectSty, fontSize: '0.75rem' }}>
                          <option value="auto">{t('transaction.recurringAuto')}</option>
                          <option value="confirm">{t('transaction.recurringConfirm')}</option>
                        </select>
                        <ChevronDown size={12} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Save */}
          <div className="pt-1 flex gap-2">
            {isEditing && (
              <Button
                id="delete-transaction-btn"
                variant="secondary"
                size="lg"
                onClick={() => setShowDeleteConfirm(true)}
                aria-label={t('transaction.delete')}
                style={{ color: 'var(--color-expense)' }}
              >
                <Trash2 size={18} />
              </Button>
            )}
            {isEditing && !isTransfer && (
              <Button
                id="template-from-edit-btn"
                variant="secondary"
                size="lg"
                onClick={handleSaveTemplateFromEdit}
                aria-label={t('transaction.saveAsTemplate')}
                title={t('transaction.saveAsTemplate')}
              >
                <BookmarkPlus size={18} />
              </Button>
            )}
            <Button id="save-transaction-btn" fullWidth size="lg" onClick={() => handleSave()} loading={isLoading}>
              {t('transaction.save')}
            </Button>
          </div>
        </div>
      </BottomSheet>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title={t('transaction.confirmDelete')}
        description={t('transaction.deleteWarning')}
        confirmLabel={t('transaction.delete')}
        danger
      />
    </>
  )
}
