import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import type { Account, Category } from '@/types'
import type { UpcomingPayment } from '@/lib/upcoming'
import { formatAmount, formatListAmount, formatMonthName, formatShortDate, MASK, todayDate, parseDateString } from '@/lib/utils'
import { getCategoryName } from '@/lib/categories'
import { PopUp } from '@/components/ui/PopUp'
import { Button } from '@/components/ui/Button'

interface UpcomingPopUpProps {
  isOpen: boolean
  onClose: () => void
  upcoming: UpcomingPayment[]
  categories: Category[]
  accounts: Account[]
  baseCurrency: string
  // What the payments add to the balance (negative when they take from it)
  net: number
  // Balance expected once every payment listed has gone through
  expectedBalance: number
  masked: boolean
}

// The recurring payments still due this month, and where they leave the balance
export const UpcomingPopUp: React.FC<UpcomingPopUpProps> = ({
  isOpen,
  onClose,
  upcoming,
  categories,
  accounts,
  baseCurrency,
  net,
  expectedBalance,
  masked,
}) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const month = formatMonthName(parseDateString(todayDate()), i18n.language)
  const money = (amount: number) => (masked ? MASK : formatAmount(amount, baseCurrency))
  // Uzbek starts with the month, which is written lowercase
  const title = t('upcoming.titleMonth', { month })

  const subtitle = [
    net < 0 ? t('upcoming.take', { amount: money(-net) }) : net > 0 ? t('upcoming.bring', { amount: money(net) }) : '',
    t('upcoming.endNear', { amount: money(expectedBalance) }),
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <PopUp isOpen={isOpen} onClose={onClose} title={title.charAt(0).toUpperCase() + title.slice(1)} subtitle={subtitle}>
      <div className="plist">
        {upcoming.map(({ recurring, date }, index) => {
          const category = categories.find((c) => c.id === recurring.categoryId)
          const account = accounts.find((a) => a.id === recurring.accountId)
          const isIncome = recurring.type === 'income'
          return (
            <div key={`${recurring.id}-${date}-${index}`} className="prow">
              <span className="bub" style={{ '--c': category?.color ?? '#8E8E93' } as React.CSSProperties} aria-hidden="true">
                {category?.icon ?? '📦'}
              </span>
              <span className="prow-main">
                <span className="prow-title">
                  <span>{recurring.note || getCategoryName(category, t)}</span>
                </span>
                <span className="prow-sub">
                  {[
                    formatShortDate(date, i18n.language),
                    account?.name,
                    recurring.autoCreate ? t('upcoming.automatic') : t('upcoming.asksFirst'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className={`amt${isIncome ? ' in' : ''}${masked ? ' masked' : ''}`}>
                {masked
                  ? MASK
                  : formatListAmount(isIncome ? recurring.amount : -recurring.amount, recurring.currency, baseCurrency, isIncome)}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="t-cap">{t('upcoming.paidInHistory')}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onClose()
            navigate('/settings/planned')
          }}
        >
          {t('upcoming.manageShort')}
          <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
    </PopUp>
  )
}
