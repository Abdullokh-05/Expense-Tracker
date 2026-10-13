import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, ArchiveRestore, Banknote, CreditCard } from 'lucide-react'
import type { Account, AccountType } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useAccountStore } from '@/store/accountStore'
import { SUPPORTED_CURRENCIES } from '@/lib/constants'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ToggleRow } from '@/components/ui/ToggleRow'
import { toast } from '@/components/ui/Toast'

interface AccountSheetProps {
  isOpen: boolean
  onClose: () => void
  // When set, the sheet edits this account instead of adding a new one
  account?: Account
  // An account's currency can't change once transactions were recorded in it
  hasTransactions?: boolean
}

export const AccountSheet: React.FC<AccountSheetProps> = ({ isOpen, onClose, account, hasTransactions = false }) => {
  const { t } = useTranslation()
  const { settings } = useAppStore()
  const { addAccount, editAccount, setWishlistFund } = useAccountStore()

  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('card')
  const [currency, setCurrency] = useState(settings.baseCurrency)
  const [startingBalance, setStartingBalance] = useState('')
  const [includeInTotal, setIncludeInTotal] = useState(true)
  const [isWishlistFund, setIsWishlistFund] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setName(account?.name ?? '')
      setType(account?.type ?? 'card')
      setCurrency(account?.currency ?? settings.baseCurrency)
      setStartingBalance(account && account.startingBalance !== 0 ? String(account.startingBalance) : '')
      setIncludeInTotal(account?.includeInTotal ?? true)
      setIsWishlistFund(account?.isWishlistFund ?? false)
    }
  }, [isOpen, account, settings.baseCurrency])

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('accounts.nameRequired'))
      return
    }
    // Empty means zero; a minus sign is allowed for an overdrawn card
    const parsedBalance = startingBalance.trim() === '' ? 0 : parseFloat(startingBalance.replace(',', '.'))
    if (isNaN(parsedBalance)) {
      toast.error(t('accounts.balanceInvalid'))
      return
    }

    setIsSaving(true)
    try {
      const fields = { name: name.trim(), type, currency, startingBalance: parsedBalance, includeInTotal }
      if (account) {
        await editAccount(account.id, fields)
        if (isWishlistFund !== account.isWishlistFund) await setWishlistFund(isWishlistFund ? account.id : null)
      } else {
        await addAccount({ ...fields, userId: settings.userId, isWishlistFund, isArchived: false })
      }
      toast.success(t('settings.saved'))
      onClose()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleArchive = async () => {
    if (!account) return
    try {
      // An archived account can't keep collecting wishlist savings
      await editAccount(account.id, { isArchived: !account.isArchived, isWishlistFund: false })
      toast.success(account.isArchived ? t('accounts.restored') : t('accounts.archived'))
      onClose()
    } catch {
      toast.error(t('common.error'))
    }
  }

  const types: { key: AccountType; label: string; icon: React.ReactNode }[] = [
    { key: 'card', label: t('accounts.typeCard'), icon: <CreditCard size={15} /> },
    { key: 'cash', label: t('accounts.typeCash'), icon: <Banknote size={15} /> },
  ]

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={account ? t('accounts.editTitle') : t('accounts.newTitle')}
    >
      <div className="space-y-4">
        <Input
          id="account-name-input"
          label={t('accounts.name')}
          placeholder={t('accounts.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="flex p-1 rounded-xl gap-1" style={{ background: 'var(--color-surface-2)' }}>
          {types.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setType(key)}
              aria-pressed={type === key}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-1.5"
              style={{
                background: type === key ? 'var(--color-surface)' : 'transparent',
                color: type === key ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                boxShadow: type === key ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <Input
            id="account-balance-input"
            type="text"
            inputMode="decimal"
            label={t('accounts.startingBalance')}
            placeholder="0"
            value={startingBalance}
            onChange={(e) => setStartingBalance(e.target.value.replace(/[^0-9.,-]/g, ''))}
          />
          <select
            id="account-currency-select"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={Boolean(account) && hasTransactions}
            className="input-base text-sm disabled:opacity-50"
            style={{ width: '96px' }}
            aria-label={t('settings.currency')}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
        <p className="text-[11px] -mt-2" style={{ color: 'var(--color-text-muted)' }}>
          {t('accounts.startingBalanceHint')}
        </p>

        <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
          <ToggleRow
            id="account-include-toggle"
            label={t('accounts.includeInTotal')}
            description={t('accounts.includeInTotalHint')}
            checked={includeInTotal}
            onChange={setIncludeInTotal}
          />
          <ToggleRow
            id="account-fund-toggle"
            label={t('accounts.wishlistFund')}
            description={t('accounts.wishlistFundHint')}
            checked={isWishlistFund}
            onChange={setIsWishlistFund}
          />
        </div>

        <div className="pt-1 flex gap-2">
          {account && (
            <Button
              variant="secondary"
              size="lg"
              onClick={handleToggleArchive}
              aria-label={account.isArchived ? t('accounts.restore') : t('categories.archive')}
              title={account.isArchived ? t('accounts.restore') : t('categories.archive')}
            >
              {account.isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
            </Button>
          )}
          <Button id="save-account-btn" fullWidth size="lg" onClick={handleSave} loading={isSaving}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
