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
import { formatAmount, parseMoneyInput, roundMoney, sanitizeMoneyInput, todayDate } from '@/lib/utils'
import { PopUp } from '@/components/ui/PopUp'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { paymentMethodOf } from '@/lib/accounts'

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
  const expenseCategories = categories.filter((c) => !c.parentId && getCategoryKind(c) === 'expense' && !c.isArchived)

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
    return converted === null ? '' : String(roundMoney(converted))
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
    const parsedPaid = parseMoneyInput(paid, { allowNegative: false }) ?? NaN
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
        amountInBaseCurrency: roundMoney(parsedPaid * rate),
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
        paymentMethod: paymentMethodOf(account),
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
    <PopUp
      isOpen={item !== null}
      onClose={onClose}
      title={t('wishlist.buyTitle')}
      subtitle={item ? `${item.name} · ${formatAmount(item.price, item.currency)}` : undefined}
      footerStack
      footer={
        <>
          <Button id="record-purchase-btn" fullWidth size="lg" onClick={handleRecord} loading={isSaving}>
            {t('wishlist.recordPurchase')}
          </Button>
          <Button id="mark-bought-only-btn" variant="ghost" fullWidth onClick={handleSkipExpense}>
            {t('wishlist.markOnly')}
          </Button>
        </>
      }
    >
      {item && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Select id="buy-account-select" label={t('wishlist.paidFrom')} value={accountId} onChange={(e) => handleAccountChange(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
            <Input
              id="buy-paid-input"
              type="text"
              inputMode="decimal"
              label={t('wishlist.paidAmount', { currency: account?.currency ?? '' })}
              placeholder="0"
              value={paid}
              onChange={(e) => setPaid(sanitizeMoneyInput(e.target.value))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select id="buy-category-select" label={t('transaction.category')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {getCategoryName(c, t)}</option>
              ))}
            </Select>
            <Input id="buy-date-input" type="date" label={t('transaction.date')} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      )}
    </PopUp>
  )
}
