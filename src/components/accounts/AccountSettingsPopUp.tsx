import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, Coins, Gift, Pencil, Scale, Sigma, Star } from 'lucide-react'
import type { AccountType } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useAccountStore } from '@/store/accountStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useUiStore } from '@/store/uiStore'
import { useConverter } from '@/store/ratesStore'
import { ACCOUNT_COLORS, TYPE_COLORS, accountColor, accountLook, accountTypeLabel, getAccountBalances } from '@/lib/accounts'
import { formatAmount, MASK, parseMoneyInput, roundMoney, sanitizeMoneyInput } from '@/lib/utils'
import { SUPPORTED_CURRENCIES } from '@/lib/constants'
import { PopUp } from '@/components/ui/PopUp'
import { Row } from '@/components/ui/Row'
import { Switch } from '@/components/ui/Switch'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { toast } from '@/components/ui/Toast'
import { AccountIcon } from './AccountCard'
import { CurrencyPicker } from './CurrencyPicker'

interface AccountSettingsPopUpProps {
  // The account to show; null when closed
  accountId: string | null
  onClose: () => void
}

type Section = 'name' | 'look' | 'balance' | 'currency'

// Tap an account card: everything about one account. Each change saves straight away.
export const AccountSettingsPopUp: React.FC<AccountSettingsPopUpProps> = ({ accountId, onClose }) => {
  const { t } = useTranslation()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const { accounts, editAccount, setDefaultAccount, setWishlistFund } = useAccountStore()
  const transactions = useTransactionStore((s) => s.transactions)
  const masked = useUiStore((s) => s.amountsHidden)
  const convert = useConverter()

  const account = accounts.find((a) => a.id === accountId) ?? null
  const [open, setOpen] = useState<Section | null>(null)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')

  const balance = useMemo(
    () => (account ? getAccountBalances([account], transactions, base, convert)[account.id] ?? 0 : 0),
    [account, transactions, base, convert]
  )
  const used = account ? transactions.some((txn) => txn.accountId === account.id || txn.toAccountId === account.id) : false
  const activeCount = accounts.filter((a) => !a.isArchived).length

  // A fresh start each time a card is opened
  useEffect(() => {
    if (!accountId) return
    setOpen(null)
    setName(useAccountStore.getState().accounts.find((a) => a.id === accountId)?.name ?? '')
  }, [accountId])

  if (!account) return <PopUp isOpen={false} onClose={onClose} />

  const save = async (patch: Parameters<typeof editAccount>[1]) => {
    try {
      await editAccount(account.id, patch)
    } catch {
      toast.error(t('common.error'))
    }
  }

  // The name saves when the field is left; an empty one keeps the old name
  const commitName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== account.name) save({ name: trimmed })
    else setName(account.name)
  }

  const close = () => {
    commitName()
    onClose()
  }

  const toggle = (section: Section) => {
    if (open === 'name') commitName()
    if (section === 'balance' && open !== 'balance') setTarget(String(balance))
    setOpen(open === section ? null : section)
  }

  const correctBalance = async () => {
    const wanted = parseMoneyInput(target)
    if (wanted === null) {
      toast.error(t('accounts.balanceInvalid'))
      return
    }
    // The difference goes into the starting balance, so no made-up entry lands in History
    await save({ startingBalance: roundMoney(account.startingBalance + wanted - balance) })
    toast.success(t('acct.corrected'))
    setOpen(null)
  }

  const archive = async () => {
    try {
      await editAccount(account.id, { isArchived: true, isWishlistFund: false, isDefault: false })
      toast.success(t('accounts.archived'))
      onClose()
    } catch {
      toast.error(t('common.error'))
    }
  }

  const look = accountLook(account)
  const shownName = name.trim() || account.name || t('acct.untitled')
  const subtitle = [
    `${accountTypeLabel(look, t)} · ${account.currency} · ${masked ? MASK : formatAmount(balance, account.currency)}`,
    account.includeInTotal ? null : t('acct.notInTotal'),
  ]
    .filter(Boolean)
    .join(' · ')
  const types: { value: AccountType; label: string }[] = [
    { value: 'card', label: t('accounts.typeCard') },
    { value: 'cash', label: t('accounts.typeCash') },
    { value: 'savings', label: t('accounts.typeSavings') },
  ]
  const color = accountColor(account)

  return (
    <PopUp isOpen onClose={close} title={shownName} subtitle={`${subtitle}. ${t('acct.saveHint')}`}>
      <div className="plist">
        <div className="pbox">
          <Row
            icon={<Pencil size={18} strokeWidth={1.75} />}
            title={t('accounts.name')}
            value={shownName}
            chevron={open === 'name' ? 'open' : true}
            expanded={open === 'name'}
            onClick={() => toggle('name')}
          />
          {open === 'name' && (
            <div className="pbox-exp">
              <span className="input">
                <input
                  value={name}
                  maxLength={32}
                  aria-label={t('accounts.name')}
                  enterKeyHint="done"
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                />
              </span>
            </div>
          )}
        </div>

        <div className="pbox">
          <Row
            icon={<AccountIcon account={account} />}
            iconTone={color}
            title={t('acct.typeColour')}
            value={accountTypeLabel(look, t)}
            chevron={open === 'look' ? 'open' : true}
            expanded={open === 'look'}
            onClick={() => toggle('look')}
          />
          {open === 'look' && (
            <div className="pbox-exp">
              <SegmentedControl
                label={t('accounts.type')}
                options={types}
                value={look}
                // A card that never had its own colour takes the new type's colour for good
                onChange={(type) => save(account.color ? { type } : { type, color: TYPE_COLORS[type] })}
              />
              <div className="swatches" role="radiogroup" aria-label={t('accounts.colour')}>
                {ACCOUNT_COLORS.map((option) => (
                  <button
                    key={option.color}
                    type="button"
                    role="radio"
                    aria-checked={color === option.color}
                    aria-label={t(`colors.${option.key}`)}
                    className={`swatch${color === option.color ? ' on' : ''}`}
                    style={{ '--c': option.color } as React.CSSProperties}
                    onClick={() => save({ color: option.color })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pbox">
          <Row
            icon={<Scale size={18} strokeWidth={1.75} />}
            title={t('acct.correct')}
            subtitle={t('acct.correctSub')}
            chevron={open === 'balance' ? 'open' : true}
            expanded={open === 'balance'}
            onClick={() => toggle('balance')}
          />
          {open === 'balance' && (
            <div className="pbox-exp">
              <label className="field">
                <span className="t-label">{t('acct.correctLabel', { currency: account.currency })}</span>
                <span className="input">
                  <input
                    inputMode="decimal"
                    value={target}
                    autoFocus
                    onChange={(e) => setTarget(sanitizeMoneyInput(e.target.value, { allowNegative: true }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') correctBalance()
                    }}
                  />
                </span>
                <span className="help">{t('acct.correctHint')}</span>
              </label>
              <Button size="sm" onClick={correctBalance}>
                {t('acct.correctSave')}
              </Button>
            </div>
          )}
        </div>

        {/* The currency can change only until an entry uses the account */}
        {!used && (
          <div className="pbox">
            <Row
              icon={<Coins size={18} strokeWidth={1.75} />}
              title={t('accounts.currency')}
              subtitle={t('acct.currencyHint')}
              value={account.currency}
              chevron={open === 'currency' ? 'open' : true}
              expanded={open === 'currency'}
              onClick={() => toggle('currency')}
            />
            {open === 'currency' && (
              <div className="pbox-exp">
                <CurrencyPicker
                  value={account.currency}
                  onChange={(currency) => save({ currency })}
                  label={t('accounts.currency')}
                  codes={SUPPORTED_CURRENCIES.map((c) => c.code)}
                />
              </div>
            )}
          </div>
        )}

        <Row
          icon={<Sigma size={18} strokeWidth={1.75} />}
          title={t('accounts.includeInTotal')}
          end={
            <Switch
              checked={account.includeInTotal}
              onChange={(includeInTotal) => save({ includeInTotal })}
              label={t('accounts.includeInTotal')}
            />
          }
        />
        <Row
          icon={<Star size={18} strokeWidth={1.75} />}
          title={t('acct.default')}
          end={
            <Switch
              checked={Boolean(account.isDefault)}
              onChange={(on) => setDefaultAccount(on ? account.id : null)}
              label={t('acct.default')}
            />
          }
        />
        <Row
          icon={<Gift size={18} strokeWidth={1.75} />}
          title={t('accounts.wishlistFund')}
          subtitle={t('accounts.wishlistFundHint')}
          end={
            <Switch
              checked={account.isWishlistFund}
              onChange={(on) => setWishlistFund(on ? account.id : null)}
              label={t('accounts.wishlistFund')}
            />
          }
        />

        <Row
          icon={<Archive size={18} strokeWidth={1.75} />}
          title={t('acct.archive')}
          subtitle={activeCount > 1 ? t('acct.archiveSub') : t('acct.onlyAccount')}
          danger
          chevron={activeCount > 1}
          onClick={activeCount > 1 ? archive : undefined}
        />
      </div>
    </PopUp>
  )
}
