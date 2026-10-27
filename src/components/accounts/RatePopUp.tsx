import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/appStore'
import { useRatesStore } from '@/store/ratesStore'
import { findCustomRate, formatRateLine, formatRateUnit, rateBetween, rateUnit } from '@/lib/rates'
import { currencySymbol, formatShortDate, nowISO, parseNumberInput } from '@/lib/utils'
import { SUPPORTED_CURRENCIES } from '@/lib/constants'
import { PopUp } from '@/components/ui/PopUp'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { CurrencyPicker } from './CurrencyPicker'
import { currencyName } from '@/lib/rates'

interface RatePopUpProps {
  isOpen: boolean
  onClose: () => void
  // The currency to set a rate for; null lets the user pick one ("Add a currency rate")
  code: string | null
}

// One exchange rate against the main currency. The user's own rate wins over the live one
// until they go back to it.
export const RatePopUp: React.FC<RatePopUpProps> = ({ isOpen, onClose, code }) => {
  const { t, i18n } = useTranslation()
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const live = useRatesStore((s) => s.rates)
  const updatedAt = useRatesStore((s) => s.updatedAt)
  const base = settings.baseCurrency

  const choices = SUPPORTED_CURRENCIES.map((c) => c.code).filter((c) => c !== base)
  const [picked, setPicked] = useState(code ?? choices[0])
  const [value, setValue] = useState('')

  const liveRate = rateBetween(live, picked, base)
  const custom = findCustomRate(settings.customRates, picked, base)
  const shownRate = custom?.rate ?? liveRate
  // Small rates are typed per 100, 1 000 … units so the number stays readable
  const unit = shownRate ? rateUnit(shownRate) : 1

  // Start from the rate in use: whole numbers once it's in the hundreds, two decimals below that
  const fill = (currency: string) => {
    const rate = findCustomRate(settings.customRates, currency, base)?.rate ?? rateBetween(live, currency, base)
    if (!rate) return setValue('')
    const value = rate * rateUnit(rate)
    setValue(String(value >= 100 ? Math.round(value) : Math.round(value * 100) / 100))
  }

  useEffect(() => {
    if (!isOpen) return
    const first = code ?? choices.find((c) => !findCustomRate(settings.customRates, c, base)) ?? choices[0]
    setPicked(first)
    fill(first)
    // Only when it opens: typing must not be overwritten
  }, [isOpen, code]) // oxlint-disable-line react-hooks/exhaustive-deps

  const others = (settings.customRates ?? []).filter((r) => !(r.code === picked && r.quote === base))

  const save = () => {
    const typed = parseNumberInput(value)
    if (typed === null || typed <= 0) {
      toast.error(t('rates.invalid'))
      return
    }
    setSettings({ customRates: [...others, { code: picked, quote: base, rate: typed / unit, setAt: nowISO() }] })
    toast.success(t('rates.saved'))
    onClose()
  }

  const useLive = () => {
    setSettings({ customRates: others })
    toast.success(t('rates.removed'))
    onClose()
  }

  const liveLine = liveRate
    ? [t('rates.live', { rate: formatRateLine(picked, base, liveRate) }), updatedAt ? t('rates.updated', { date: formatShortDate(updatedAt.slice(0, 10), i18n.language) }) : null]
        .filter(Boolean)
        .join(' · ')
    : t('rates.noLive')

  return (
    <PopUp
      isOpen={isOpen}
      onClose={onClose}
      title={code ? t('rates.editTitle', { name: currencyName(picked, i18n.language) }) : t('rates.add')}
      subtitle={t('rates.editSub', { code: picked, base })}
      footer={
        <>
          {custom && liveRate && (
            <Button variant="secondary" size="lg" onClick={useLive}>
              {t('rates.useLive')}
            </Button>
          )}
          <Button size="lg" fullWidth onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {!code && (
          <div className="field">
            <label className="field-label" htmlFor="rate-currency">{t('rates.currency')}</label>
            <CurrencyPicker
              id="rate-currency"
              value={picked}
              label={t('rates.currency')}
              codes={choices}
              onChange={(next) => {
                setPicked(next)
                fill(next)
              }}
            />
          </div>
        )}
        <label className="field">
          <span className="field-label">
            {t('rates.rateLabel', { amount: `${formatRateUnit(shownRate ?? 1)} ${currencySymbol(picked).symbol}` })}
          </span>
          <span className="input">
            <input inputMode="decimal" value={value} autoFocus={Boolean(code)} onChange={(e) => setValue(e.target.value)} />
            <span className="suffix" aria-hidden="true">{currencySymbol(base).symbol}</span>
          </span>
          <span className="help">{liveLine}</span>
        </label>
      </form>
    </PopUp>
  )
}
