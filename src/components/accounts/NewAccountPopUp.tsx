import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TriangleAlert } from 'lucide-react'
import type { AccountType } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useAccountStore } from '@/store/accountStore'
import { useConverter } from '@/store/ratesStore'
import { ACCOUNT_COLORS, TYPE_COLORS } from '@/lib/accounts'
import { currencySymbol, parseMoneyInput } from '@/lib/utils'
import { SUPPORTED_CURRENCIES } from '@/lib/constants'
import { PopUp } from '@/components/ui/PopUp'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { toast } from '@/components/ui/Toast'
import { CurrencyPicker } from './CurrencyPicker'

interface NewAccountPopUpProps {
  isOpen: boolean
  onClose: () => void
  // "Add a rate" under a currency without one
  onAddRate: (code: string) => void
}

// A new account: name, type, currency, what it holds now and its colour
export const NewAccountPopUp: React.FC<NewAccountPopUpProps> = ({ isOpen, onClose, onAddRate }) => {
  const { t } = useTranslation()
  const settings = useAppStore((s) => s.settings)
  const addAccount = useAccountStore((s) => s.addAccount)
  const convert = useConverter()

  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('card')
  const [currency, setCurrency] = useState(settings.baseCurrency)
  const [start, setStart] = useState('')
  // Follows the type until the user picks one
  const [color, setColor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setName('')
    setType('card')
    setCurrency(useAppStore.getState().settings.baseCurrency)
    setStart('')
    setColor(null)
  }, [isOpen])

  const shownColor = color ?? TYPE_COLORS[type]
  const noRate = currency !== settings.baseCurrency && convert(1, currency, settings.baseCurrency) === null
  const types: { value: AccountType; label: string }[] = [
    { value: 'card', label: t('accounts.typeCard') },
    { value: 'cash', label: t('accounts.typeCash') },
    { value: 'savings', label: t('accounts.typeSavings') },
  ]

  const add = async () => {
    if (!name.trim() || saving) return
    const startingBalance = start.trim() ? parseMoneyInput(start) : 0
    if (startingBalance === null) {
      toast.error(t('accounts.balanceInvalid'))
      return
    }
    setSaving(true)
    try {
      await addAccount({
        userId: settings.userId,
        name: name.trim(),
        type,
        currency,
        startingBalance,
        color: shownColor,
        includeInTotal: true,
        isWishlistFund: false,
        isDefault: false,
        isArchived: false,
      })
      toast.success(t('accounts.added'))
      onClose()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PopUp
      isOpen={isOpen}
      onClose={onClose}
      title={t('accounts.newTitle')}
      subtitle={t('accounts.newSub')}
      footer={
        <Button size="lg" fullWidth onClick={add} disabled={!name.trim()} loading={saving}>
          {t('accounts.add')}
        </Button>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <label className="field">
          <span className="field-label">{t('accounts.name')}</span>
          <span className="input">
            <input
              value={name}
              maxLength={32}
              placeholder={t('accounts.namePlaceholderNew')}
              onChange={(e) => setName(e.target.value)}
            />
          </span>
        </label>

        <div className="field">
          <span className="field-label">{t('accounts.type')}</span>
          <SegmentedControl label={t('accounts.type')} options={types} value={type} onChange={setType} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="new-account-currency">{t('accounts.currency')}</label>
          <CurrencyPicker
            id="new-account-currency"
            value={currency}
            onChange={setCurrency}
            label={t('accounts.currency')}
            codes={SUPPORTED_CURRENCIES.map((c) => c.code)}
          />
          {noRate && (
            <p className="note">
              <TriangleAlert size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>
                {t('accounts.noRate', { code: currency })}{' '}
                <button type="button" onClick={() => onAddRate(currency)}>
                  {t('accounts.addRate')}
                </button>
              </span>
            </p>
          )}
        </div>

        <label className="field">
          <span className="field-label">{t('accounts.startingBalance')}</span>
          <span className="input">
            <input inputMode="decimal" placeholder="0" value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="suffix" aria-hidden="true">{currencySymbol(currency).symbol}</span>
          </span>
          <span className="help">{t('accounts.startingBalanceHint')}</span>
        </label>

        <div className="field">
          <span className="field-label" id="new-account-colour">{t('accounts.colour')}</span>
          <div className="swatches" role="radiogroup" aria-labelledby="new-account-colour">
            {ACCOUNT_COLORS.map((option) => (
              <button
                key={option.color}
                type="button"
                role="radio"
                aria-checked={shownColor === option.color}
                aria-label={t(`colors.${option.key}`)}
                className={`swatch${shownColor === option.color ? ' on' : ''}`}
                style={{ '--c': option.color } as React.CSSProperties}
                onClick={() => setColor(option.color)}
              />
            ))}
          </div>
        </div>
      </form>
    </PopUp>
  )
}
