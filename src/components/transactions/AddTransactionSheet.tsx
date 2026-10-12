import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BottomSheet, ConfirmDialog } from '@/components/ui/BottomSheet'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useRecurringStore } from '@/store/recurringStore'
import { suggestCategory } from '@/db/operations'
import { getConversionRate } from '@/services/currencyApi'
import { SUPPORTED_CURRENCIES } from '@/lib/constants'
import { getCategoryName } from '@/lib/categories'
import { advanceByFrequency, formatAmount, roundMoney, todayDate } from '@/lib/utils'
import { Calendar, FileText, Repeat, ChevronDown, Trash2 } from 'lucide-react'
import type { PaymentMethod, Transaction, TransactionType, Category, RecurringFrequency } from '@/types'
import { toast } from '@/components/ui/Toast'

interface AddTransactionSheetProps {
  isOpen: boolean
  onClose: () => void
  // When set, the sheet edits this transaction instead of adding a new one
  transaction?: Transaction
  prefilledCategory?: string
  prefilledType?: TransactionType
  onSaved?: () => void
}

// Rate from the chosen currency to the base currency. Saving waits for it: recording a
// foreign amount at a made-up rate of 1 would silently corrupt every total.
type RateState =
  | { status: 'ready'; value: number }
  | { status: 'loading' }
  | { status: 'unavailable' }

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
  // An archived category stays selectable on the transaction that already uses it
  const activeCategories = categories.filter((c) => !c.isArchived || c.id === transaction?.categoryId)

  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const editTransaction = useTransactionStore((s) => s.editTransaction)
  const removeTransaction = useTransactionStore((s) => s.removeTransaction)
  const addRecurringTransaction = useRecurringStore((s) => s.addRecurringTransaction)

  const [type, setType] = useState<TransactionType>(prefilledType)
  const [amount, setAmount] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [date, setDate] = useState(todayDate())
  const [note, setNote] = useState('')
  const [currency, setCurrency] = useState(settings.baseCurrency)
  // Last rate fetched, tagged with the currency pair it is for so a stale one is never used
  const [fetchedRate, setFetchedRate] = useState<{ pair: string; value: number | null } | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [showExtra, setShowExtra] = useState(false)

  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [autoCreate, setAutoCreate] = useState(true)

  const [suggestedCat, setSuggestedCat] = useState<Category | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // Synchronous guard: a double tap fires twice before isLoading has re-rendered
  const isSaving = useRef(false)

  useEffect(() => {
    if (isOpen) {
      setType(transaction?.type ?? prefilledType)
      setAmount(transaction ? String(transaction.amount) : '')
      setSelectedCategoryId(transaction?.categoryId ?? prefilledCategory ?? '')
      setDate(transaction?.date ?? todayDate())
      setNote(transaction?.note ?? '')
      setCurrency(transaction?.currency ?? settings.baseCurrency)
      setPaymentMethod(transaction?.paymentMethod ?? null)
      setIsRecurring(false)
      setFrequency('monthly')
      setAutoCreate(true)
      setSuggestedCat(null)
      // Editing shows every field straight away
      setShowExtra(Boolean(transaction))
      setShowDeleteConfirm(false)
    }
  }, [isOpen, transaction, prefilledType, prefilledCategory, settings.baseCurrency])

  const ratePair = `${currency}>${settings.baseCurrency}`
  // Editing without changing the currency keeps the rate the transaction was recorded at
  const keepsRecordedRate = Boolean(transaction) && currency === transaction?.currency
  const needsFetchedRate = currency !== settings.baseCurrency && !keepsRecordedRate

  let rate: RateState
  if (currency === settings.baseCurrency) {
    rate = { status: 'ready', value: 1 }
  } else if (transaction && keepsRecordedRate) {
    rate = { status: 'ready', value: transaction.exchangeRate }
  } else if (fetchedRate?.pair !== ratePair) {
    rate = { status: 'loading' }
  } else {
    rate = fetchedRate.value === null ? { status: 'unavailable' } : { status: 'ready', value: fetchedRate.value }
  }

  useEffect(() => {
    if (!isOpen || !needsFetchedRate) return

    let active = true
    getConversionRate(currency, settings.baseCurrency)
      .catch(() => null)
      .then((value) => {
        if (active) setFetchedRate({ pair: ratePair, value })
      })
    return () => { active = false }
  }, [isOpen, needsFetchedRate, currency, settings.baseCurrency, ratePair])

  const handleNoteChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setNote(val)
    if (val.trim().length > 2) {
      const suggested = await suggestCategory(settings.userId, val)
      setSuggestedCat(suggested)
    } else {
      setSuggestedCat(null)
    }
  }

  const parsedAmount = parseFloat(amount.replace(/[^0-9.]/g, ''))
  const hasValidAmount = !isNaN(parsedAmount) && parsedAmount > 0

  const handleSave = async (catId?: string) => {
    if (isSaving.current) return
    const finalCategoryId = catId || selectedCategoryId

    if (!hasValidAmount) {
      toast.error(t('transaction.amountRequired'))
      return
    }
    if (!finalCategoryId) {
      toast.error(t('transaction.categoryRequired'))
      return
    }
    if (rate.status !== 'ready') {
      toast.error(t(rate.status === 'loading' ? 'transaction.rateLoading' : 'transaction.rateUnavailable'))
      return
    }

    isSaving.current = true
    setIsLoading(true)
    try {
      const fields = {
        type,
        amount: parsedAmount,
        currency,
        amountInBaseCurrency: roundMoney(parsedAmount * rate.value, settings.baseCurrency),
        exchangeRate: rate.value,
        categoryId: finalCategoryId,
        date,
        note: note.trim() || null,
        noteOriginal: note.trim() || null,
        paymentMethod,
      }

      if (transaction) {
        await editTransaction(transaction.id, fields)
      } else {
        let recurringTransactionId: string | null = null

        if (isRecurring) {
          const rt = await addRecurringTransaction({
            userId: settings.userId,
            type,
            amount: parsedAmount,
            currency,
            categoryId: finalCategoryId,
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

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title={isEditing ? t('transaction.editTitle') : t('transaction.addTitle')}
      >
        <div className="space-y-4">

          {/* Type toggle */}
          <div className="flex p-1 rounded-xl gap-1" style={{ background: 'var(--color-surface-2)' }}>
            {(['expense', 'income'] as TransactionType[]).map((tx) => (
              <button
                key={tx}
                onClick={() => setType(tx)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
                style={{
                  background: type === tx ? 'var(--color-surface)' : 'transparent',
                  color: type === tx
                    ? tx === 'expense' ? 'var(--color-expense)' : 'var(--color-income)'
                    : 'var(--color-text-muted)',
                  boxShadow: type === tx ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {tx === 'expense' ? t('transaction.expense') : t('transaction.income')}
              </button>
            ))}
          </div>

          {/* Amount + Currency */}
          <div>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  id="amount-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
                  className="text-right text-2xl font-bold tracking-wide"
                  leftIcon={
                    <span style={{ color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>
                      {currency}
                    </span>
                  }
                  autoFocus
                />
              </div>
              <div className="relative" style={{ flexShrink: 0 }}>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ ...selectSty, width: '88px' }}
                  aria-label={t('settings.currency')}
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
                <ChevronDown size={13} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
              </div>
            </div>

            {/* What a foreign-currency amount will count as in the base currency */}
            {currency !== settings.baseCurrency && (
              <p
                className="text-xs mt-1.5 text-right amount-display"
                style={{ color: rate.status === 'unavailable' ? 'var(--color-expense)' : 'var(--color-text-muted)' }}
              >
                {rate.status === 'ready' && `≈ ${formatAmount(hasValidAmount ? parsedAmount * rate.value : 0, settings.baseCurrency)}`}
                {rate.status === 'loading' && t('transaction.rateLoading')}
                {rate.status === 'unavailable' && t('transaction.rateUnavailable')}
              </p>
            )}
          </div>

          {/* Suggested category */}
          {suggestedCat && !selectedCategoryId && (
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
          <div>
            <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              {t('transaction.category')}
            </label>
            <div className="grid grid-cols-4 gap-2 max-h-[180px] overflow-y-auto hide-scrollbar">
              {activeCategories.map((cat) => (
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

              <div className="grid grid-cols-2 gap-2">
                <Input
                  id="date-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  leftIcon={<Calendar size={16} />}
                />
                <div className="relative">
                  <select
                    value={paymentMethod || ''}
                    onChange={(e) => setPaymentMethod((e.target.value as PaymentMethod) || null)}
                    style={selectSty}
                  >
                    <option value="">{t('transaction.paymentMethod')}</option>
                    <option value="cash">{t('transaction.cash')}</option>
                    <option value="card">{t('transaction.card')}</option>
                  </select>
                  <ChevronDown size={13} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                </div>
              </div>

              {/* Recurring (only when adding: an existing transaction is a single occurrence) */}
              {!isEditing && (
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
