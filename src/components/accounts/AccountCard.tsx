import React from 'react'
import { useTranslation } from 'react-i18next'
import { Banknote, CreditCard, Ellipsis, PiggyBank } from 'lucide-react'
import type { Account } from '@/types'
import type { Converter } from '@/lib/accounts'
import { accountColor, accountLook, accountTypeLabel } from '@/lib/accounts'
import { formatAmount, MASK, moneyParts } from '@/lib/utils'

const TYPE_ICONS = { card: CreditCard, cash: Banknote, savings: PiggyBank }

export const AccountIcon: React.FC<{ account: Account; size?: number }> = ({ account, size = 18 }) => {
  const Icon = TYPE_ICONS[accountLook(account)]
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
}

interface BigMoneyProps {
  amount: number
  currency: string
  masked: boolean
  // money-xl on Home's cards, money-l in lists
  size: 'xl' | 'l'
}

// A big amount: prefix symbols ($) sit in the number, suffix ones (soʻm) follow it smaller.
// Long amounts step down a size instead of wrapping.
export const BigMoney: React.FC<BigMoneyProps> = ({ amount, currency, masked, size }) => {
  const base = size === 'xl' ? 'money-xl' : 'money-l'
  if (masked) return <span className={`${base} masked`}>{MASK}</span>
  const parts = moneyParts(amount, currency)
  const text = parts.sign + (parts.symbolBefore ? parts.symbol : '') + parts.number
  const step =
    size === 'xl' ? (text.length > 12 ? 'xlong' : text.length > 10 ? 'long' : '') : text.length > 11 ? 'long' : ''
  return (
    <span className="flex items-baseline min-w-0">
      <span className={`${base} ${step}`}>{text}</span>
      {!parts.symbolBefore && <span className="cur">{parts.symbol}</span>}
    </span>
  )
}

interface AccountCardProps {
  account: Account
  balance: number
  baseCurrency: string
  convert: Converter
  masked: boolean
  // 'lg' fills Home's card row; 'sm' is the compact card in the Accounts list
  size: 'lg' | 'sm'
  onClick: () => void
  // Home's card row hides the cards that are off to the side
  hidden?: boolean
  // Added to the screen-reader label, e.g. "(2 of 5)"
  position?: string
}

// A dark account card tinted with the account's colour. Tap it for the account's settings.
export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  balance,
  baseCurrency,
  convert,
  masked,
  size,
  onClick,
  hidden = false,
  position,
}) => {
  const { t } = useTranslation()
  const off = !account.includeInTotal
  const inBase = account.currency === baseCurrency ? null : convert(balance, account.currency, baseCurrency)
  const kind = `${accountTypeLabel(accountLook(account), t)} · ${account.currency}`
  const label = [
    account.name,
    masked ? t('home.amountHidden') : formatAmount(balance, account.currency),
    off ? t('accounts.notCounted') : null,
    position ? `(${position})` : null,
    t('home.openAccountSettings'),
  ]
    .filter(Boolean)
    .join(', ')

  const top = (
    <span className="bcard-top">
      <span className="bcard-name">
        <span className="bcard-ico">
          <AccountIcon account={account} />
        </span>
        <span>{account.name}</span>
      </span>
      <span className="bcard-more" aria-hidden="true">
        <Ellipsis size={18} strokeWidth={1.75} />
      </span>
    </span>
  )
  const amount = (
    <span className="bcard-amt">
      <BigMoney amount={balance} currency={account.currency} masked={masked} size={size === 'lg' ? 'xl' : 'l'} />
      {inBase !== null && !masked && <span className="amt-sub">≈ {formatAmount(inBase, baseCurrency)}</span>}
    </span>
  )
  const tag = off ? <span className="btag">{t('accounts.notCounted')}</span> : null

  return (
    <button
      type="button"
      className={`bcard${size === 'sm' ? ' sm' : ''}${off ? ' off' : ''}`}
      style={{ '--c': accountColor(account) } as React.CSSProperties}
      aria-label={label}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : 0}
      onClick={onClick}
    >
      {top}
      {size === 'lg' ? (
        <>
          {amount}
          <span className="bcard-foot">
            <span>{kind}</span>
            {tag}
          </span>
        </>
      ) : (
        <span className="bcard-row">
          {amount}
          <span className="bcard-foot">
            {tag}
            <span>{kind}</span>
          </span>
        </span>
      )}
    </button>
  )
}
