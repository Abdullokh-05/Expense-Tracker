import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useTransactionStore } from '@/store/transactionStore'
import { suggestCategory, createRecurringTransaction } from '@/db/operations'
import { convertAmount } from '@/services/currencyApi'
import { SUPPORTED_CURRENCIES } from '@/lib/constants'
import { todayDate } from '@/lib/utils'
import { Calendar, FileText, Repeat, ChevronDown } from 'lucide-react'
import type { PaymentMethod, TransactionType, Category, RecurringFrequency } from '@/types'
import { toast } from '@/components/ui/Toast'

interface AddTransactionSheetProps {
  isOpen: boolean
  onClose: () => void
  prefilledCategory?: string
  prefilledType?: TransactionType
  onSaved?: () => void
}

export const AddTransactionSheet: React.FC<AddTransactionSheetProps> = ({
  isOpen,
  onClose,
  prefilledCategory,
  prefilledType = 'expense',
  onSaved,
}) => {
  const { t } = useTranslation()
  const { settings } = useAppStore()

  // ✅ FIX: Select raw array, filter locally — never call methods in Zustand selectors
  const categories = useCategoryStore((s) => s.categories)
  const activeCategories = categories.filter((c) => !c.isArchived)

  const addTransaction = useTransactionStore((s) => s.addTransaction)

  const [type, setType] = useState<TransactionType>(prefilledType)
  const [amount, setAmount] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [date, setDate] = useState(todayDate())
  const [note, setNote] = useState('')
  const [currency, setCurrency] = useState(settings.baseCurrency)
  const [exchangeRate, setExchangeRate] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [showExtra, setShowExtra] = useState(false)

  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [autoCreate, setAutoCreate] = useState(true)

  const [suggestedCat, setSuggestedCat] = useState<Category | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setType(prefilledType)
      setAmount('')
      setSelectedCategoryId(prefilledCategory || '')
      setDate(todayDate())
      setNote('')
      setCurrency(settings.baseCurrency)
      setExchangeRate(1)
      setPaymentMethod(null)
      setIsRecurring(false)
      setFrequency('monthly')
      setAutoCreate(true)
      setSuggestedCat(null)
      setShowExtra(false)
    }
  }, [isOpen, prefilledType, prefilledCategory, settings.baseCurrency])

  useEffect(() => {
    let active = true
    const updateRate = async () => {
      if (currency === settings.baseCurrency) {
        if (active) setExchangeRate(1)
        return
      }
      try {
        const { rate } = await convertAmount(1, currency, settings.baseCurrency)
        if (active) setExchangeRate(rate)
      } catch {
        // keep existing rate
      }
    }
    updateRate()
    return () => { active = false }
  }, [currency, settings.baseCurrency])

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

  const handleSave = async (catId?: string) => {
    const finalCategoryId = catId || selectedCategoryId
    const parsedAmount = parseFloat(amount.replace(/[^0-9.]/g, ''))

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error(t('transaction.amountRequired'))
      return
    }
    if (!finalCategoryId) {
      toast.error(t('transaction.categoryRequired'))
      return
    }

    setIsLoading(true)
    try {
      const amountInBaseCurrency = parsedAmount * exchangeRate
      let recurringTransactionId: string | null = null

      if (isRecurring) {
        const baseDate = new Date(date + 'T00:00:00')
        if (frequency === 'weekly') baseDate.setDate(baseDate.getDate() + 7)
        else if (frequency === 'monthly') baseDate.setMonth(baseDate.getMonth() + 1)
        else if (frequency === 'yearly') baseDate.setFullYear(baseDate.getFullYear() + 1)
        const nextRunDate = baseDate.toISOString().split('T')[0]

        const rt = await createRecurringTransaction({
          userId: settings.userId,
          type,
          amount: parsedAmount,
          currency,
          categoryId: finalCategoryId,
          note: note.trim() || null,
          frequency,
          nextRunDate,
          autoCreate,
          isActive: true,
        })
        recurringTransactionId = rt.id
      }

      await addTransaction({
        userId: settings.userId,
        type,
        status: 'confirmed',
        amount: parsedAmount,
        currency,
        amountInBaseCurrency,
        exchangeRate,
        categoryId: finalCategoryId,
        date,
        note: note.trim() || null,
        noteOriginal: note.trim() || null,
        noteLanguage: null,
        translationConfidence: null,
        paymentMethod,
        recurringTransactionId,
      })

      toast.success(t('settings.saved'))
      onSaved?.()
      onClose()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategoryId(categoryId)
    if (amount) handleSave(categoryId)
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
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('transaction.addTitle')}>
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
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...selectSty, width: '88px' }}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
            <ChevronDown size={13} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
          </div>
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
              <span>{suggestedCat.name}</span>
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
                  {cat.name}
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
          {showExtra ? 'Скрыть детали' : 'Дата, заметка, метод оплаты…'}
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

            {/* Recurring */}
            <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  <Repeat size={14} />
                  {t('transaction.recurring')}
                </div>
                <button
                  onClick={() => setIsRecurring(!isRecurring)}
                  className="w-9 h-5 rounded-full p-0.5 transition-colors duration-200 flex-shrink-0"
                  style={{ background: isRecurring ? 'var(--color-accent)' : 'var(--color-border)' }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white transition-transform duration-200"
                    style={{ transform: isRecurring ? 'translateX(16px)' : 'translateX(0)' }}
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
                      <option value="auto">Авто</option>
                      <option value="confirm">Подтверждать</option>
                    </select>
                    <ChevronDown size={12} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Save */}
        <div className="pt-1">
          <Button id="save-transaction-btn" fullWidth size="lg" onClick={() => handleSave()} loading={isLoading}>
            {t('transaction.save')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
