import React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronsUpDown } from 'lucide-react'
import { currencyName } from '@/lib/rates'

interface CurrencyPickerProps {
  value: string
  onChange: (code: string) => void
  label: string
  codes: string[]
  id?: string
}

// A select dressed as a field: the currency's code badge, then its name
export const CurrencyPicker: React.FC<CurrencyPickerProps> = ({ value, onChange, label, codes, id }) => {
  const { i18n } = useTranslation()
  return (
    <span className="input picker">
      <span className="cbadge" aria-hidden="true">{value}</span>
      <select id={id} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {codes.map((code) => (
          <option key={code} value={code}>
            {currencyName(code, i18n.language)}
          </option>
        ))}
      </select>
      <ChevronsUpDown size={18} strokeWidth={1.75} aria-hidden="true" />
    </span>
  )
}
