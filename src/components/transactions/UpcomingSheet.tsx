import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Account, Category } from '@/types'
import type { UpcomingPayment } from '@/lib/upcoming'
import { formatAmount, formatDate } from '@/lib/utils'
import { getCategoryName } from '@/lib/categories'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'

interface UpcomingSheetProps {
  isOpen: boolean
  onClose: () => void
  upcoming: UpcomingPayment[]
  categories: Category[]
  accounts: Account[]
  baseCurrency: string
  // Balance expected once every payment listed has gone through
  expectedBalance: number
}

// The recurring payments still due this month, and where they leave the balance
export const UpcomingSheet: React.FC<UpcomingSheetProps> = ({
  isOpen,
  onClose,
  upcoming,
  categories,
  accounts,
  baseCurrency,
  expectedBalance,
}) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('upcoming.title')}>
      <div className="space-y-4">
        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {upcoming.map(({ recurring, date }, index) => {
            const category = categories.find((c) => c.id === recurring.categoryId)
            const account = accounts.find((a) => a.id === recurring.accountId)
            const isIncome = recurring.type === 'income'
            return (
              <div
                key={`${recurring.id}-${date}-${index}`}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl leading-none shrink-0">{category?.icon ?? '📦'}</span>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold block truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {recurring.note || getCategoryName(category, t)}
                    </span>
                    <span className="text-[11px] block truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {[formatDate(date, i18n.language), account?.name, t(`transaction.${recurring.frequency}`)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                </div>
                <span
                  className="text-sm font-bold amount-display shrink-0"
                  style={{ color: isIncome ? 'var(--color-income)' : 'var(--color-text-primary)' }}
                >
                  {isIncome ? '+' : '−'}{formatAmount(recurring.amount, recurring.currency)}
                </span>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--color-border)]">
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            {t('upcoming.expectedBalance')}
          </span>
          <span id="upcoming-expected" className="text-base font-bold amount-display" style={{ color: 'var(--color-text-primary)' }}>
            {formatAmount(expectedBalance, baseCurrency)}
          </span>
        </div>

        <Button variant="secondary" fullWidth onClick={() => navigate('/settings?open=recurring')}>
          {t('upcoming.manage')}
        </Button>
      </div>
    </BottomSheet>
  )
}
