import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WishlistItem } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useAccountStore } from '@/store/accountStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useWishlistStore } from '@/store/wishlistStore'
import { useConverter } from '@/store/ratesStore'
import { getCategoryKind, getCategoryName } from '@/lib/categories'
import { DEFAULT_CATEGORIES } from '@/lib/constants'
import { formatAmount, roundMoney, todayDate } from '@/lib/utils'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'

interface BuySheetProps {
  // The wish being bought; null keeps the sheet closed
  item: WishlistItem | null
  onClose: () => void
}

// Marks a wish as bought and, unless the user skips it, records the purchase as an expense
// so the account it was paid from goes down by what was actually paid.
export const BuySheet: React.FC<BuySheetProps> = ({ item, onClose }) => {
  const { t } = useTranslation()
  const { settings } = useAppStore()
  const allAccounts = useAccountStore((s) => s.accounts)
  const categories = useCategoryStore((s) => s.categories)
  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const editItem = useWishlistStore((s) => s.editItem)
  const convert = useConverter()

  const accounts = allAccounts.filter((a) => !a.isArchived)
  const expenseCategories = categories.filter((c) => getCategoryKind(c) === 'expense' && !c.isArchived)

  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paid, setPaid] = useState('')
  const [date, setDate] = useState(todayDate())
  const [isSaving, setIsSaving] = useState(false)

  const account = accounts.find((a) => a.id === accountId)

  // The price expressed in the paying account's currency, as the suggested amount paid
  const suggestedPaid = (target: string | undefined) => {
    const targetAccount = accounts.find((a) => a.id === target)
    if (!item || !targetAccount) return ''
    const converted = convert(item.price, item.currency, targetAccount.currency)
    return converted === null ? '' : String(roundMoney(converted, targetAccount.currency))
  }

  useEffect(() => {
    if (item) {
      // Wishes are paid from the savings account by default
      const first = (accounts.find((a) => a.isWishlistFund) ?? accounts[0])?.id ?? ''
      setAccountId(first)
      // "Other" unless the user picks something more specific
      const otherName = DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1].name
      const other = expenseCategories.find((c) => c.isDefault && c.name === otherName)
      setCategoryId((other ?? expenseCategories[0])?.id ?? '')
      setPaid(suggestedPaid(first))
      setDate(todayDate())
    }
  }, [item]) // oxlint-disable-line react-hooks/exhaustive-deps -- reset only when a different wish is opened

  const handleAccountChange = (id: string) => {
    setAccountId(id)
    setPaid(suggestedPaid(id))
  }

  const markBought = async () => {
    if (!item) return
    await editItem(item.id, { status: 'bought', boughtAt: date })
    toast.success(t('wishlist.markedBought'))
    onClose()
  }

  const handleRecord = async () => {
    if (!item) return
    const parsedPaid = parseFloat(paid.replace(/[^0-9.]/g, ''))
    if (isNaN(parsedPaid) || parsedPaid <= 0) {
      toast.error(t('transaction.amountRequired'))
      return
    }
    if (!account) {
      toast.error(t('transaction.accountRequired'))
      return
    }
    if (!categoryId) {
      toast.error(t('transaction.categoryRequired'))
      return
    }
    const rate = convert(1, account.currency, settings.baseCurrency)
    if (rate === null) {
      toast.error(t('transaction.rateUnavailable'))
      return
    }

    setIsSaving(true)
    try {
      await addTransaction({
        userId: settings.userId,
        type: 'expense',
        status: 'confirmed',
        amount: parsedPaid,
        currency: account.currency,
        amountInBaseCurrency: roundMoney(parsedPaid * rate, settings.baseCurrency),
        exchangeRate: rate,
        categoryId,
        accountId: account.id,
        toAccountId: null,
        toAmount: null,
        date,
        note: item.name,
        noteOriginal: item.name,
        noteLanguage: null,
        translationConfidence: null,
        paymentMethod: account.type,
        recurringTransactionId: null,
      })
      await markBought()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleSkipExpense = async () => {
    try {
      await markBought()
    } catch {
      toast.error(t('common.error'))
    }
  }

  return (
    <BottomSheet isOpen={item !== null} onClose={onClose} title={t('wishlist.buyTitle')}>
      {item && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{item.name}</p>
            <p className="text-xs amount-display" style={{ color: 'var(--color-text-muted)' }}>
              {formatAmount(item.price, item.currency)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                {t('wishlist.paidFrom')}
              </label>
              <select
                id="buy-account-select"
                value={accountId}
                onChange={(e) => handleAccountChange(e.target.value)}
                className="input-base text-sm"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <Input
              id="buy-paid-input"
              type="text"
              inputMode="decimal"
              label={t('wishlist.paidAmount', { currency: account?.currency ?? '' })}
              placeholder="0"
              value={paid}
              onChange={(e) => setPaid(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                {t('transaction.category')}
              </label>
              <select
                id="buy-category-select"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="input-base text-sm"
              >
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {getCategoryName(c, t)}</option>
                ))}
              </select>
            </div>
            <Input
              id="buy-date-input"
              type="date"
              label={t('transaction.date')}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2 pt-1">
            <Button id="record-purchase-btn" fullWidth size="lg" onClick={handleRecord} loading={isSaving}>
              {t('wishlist.recordPurchase')}
            </Button>
            <Button id="mark-bought-only-btn" variant="ghost" fullWidth onClick={handleSkipExpense}>
              {t('wishlist.markOnly')}
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
