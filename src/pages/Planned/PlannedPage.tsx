import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Plus } from 'lucide-react'
import type { RecurringTransaction, Transaction } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useAccountStore } from '@/store/accountStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useRecurringStore } from '@/store/recurringStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useUiStore } from '@/store/uiStore'
import { useConverter } from '@/store/ratesStore'
import { getCategoryName } from '@/lib/categories'
import { daysBetween, remindLead } from '@/lib/notifications'
import { getUpcomingNet, getUpcomingPayments } from '@/lib/upcoming'
import { formatListAmount, formatShortDate, getDateRange, MASK, todayDate } from '@/lib/utils'
import { PageHeader, GlassIconButton } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { PlannedPaymentPopUp } from '@/components/planned/PlannedPaymentPopUp'
import { useTransactionActions } from '@/components/transactions/useTransactionActions'

// Payments that come due within this many days are listed first
const SOON_DAYS = 7

// Settings › Planned payments: subscriptions, rent, salary… everything that comes back on a
// schedule. Those waiting for an OK first, then what's due soon, later, and paused. A row
// opens the payment to change its amount, schedule, reminder or to pause it.
export const PlannedPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const accounts = useAccountStore((s) => s.accounts)
  const categories = useCategoryStore((s) => s.categories)
  const planned = useRecurringStore((s) => s.recurringTransactions)
  const { transactions, editTransaction } = useTransactionStore()
  const masked = useUiStore((s) => s.amountsHidden)
  const convert = useConverter()
  const { onEdit, dialogs } = useTransactionActions()
  // undefined = closed, null = a new one
  const [editing, setEditing] = useState<RecurringTransaction | null | undefined>(undefined)

  const today = todayDate()
  const pending = transactions.filter((txn) => txn.status === 'pending')
  const active = [...planned.filter((p) => p.isActive)].sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate))
  const soon = active.filter((p) => daysBetween(today, p.nextRunDate) <= SOON_DAYS)
  const later = active.filter((p) => daysBetween(today, p.nextRunDate) > SOON_DAYS)
  const paused = planned.filter((p) => !p.isActive)

  // What's still due before the month ends
  const monthEnd = getDateRange('month').to
  const month = useMemo(() => {
    const due = getUpcomingPayments(planned, monthEnd, base, convert)
    return { count: due.length, net: getUpcomingNet(due, accounts) }
  }, [planned, monthEnd, base, convert, accounts])

  const nameOf = (note: string | null, categoryId: string | null, subcategoryId?: string | null) =>
    note || getCategoryName(categories.find((c) => c.id === (subcategoryId || categoryId)), t)
  const signed = (type: string, amount: number, currency: string) =>
    masked ? MASK : formatListAmount(type === 'income' ? amount : -amount, currency, base, type === 'income')
  const icon = (categoryId: string | null, subcategoryId?: string | null) => {
    const category = categories.find((c) => c.id === categoryId)
    const sub = subcategoryId ? categories.find((c) => c.id === subcategoryId) : undefined
    return (
      <span className="cico" style={{ '--c': category?.color ?? '#8E8E93' } as React.CSSProperties} aria-hidden="true">
        {sub?.icon ?? category?.icon ?? '📦'}
      </span>
    )
  }
  // "today", "tomorrow", "in 5 days", or the date when it's further
  const whenLabel = (date: string) => {
    const days = daysBetween(today, date)
    if (days <= 0) return t('common.today')
    if (days === 1) return t('planned.tomorrow')
    if (days <= 30) return t('planned.inDays', { count: days })
    return formatShortDate(date, i18n.language)
  }

  const skip = async (txn: Transaction) => {
    try {
      await editTransaction(txn.id, { status: 'skipped' })
      toast.success(t('notifications.skipped'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const row = (item: RecurringTransaction) => {
    const days = daysBetween(today, item.nextRunDate)
    const lead = remindLead(item)
    // Inside its reminder time: the date stands out
    const close = item.isActive && lead !== null && days <= Math.max(lead, 0)
    return (
      <button key={item.id} type="button" className={`frow tall${item.isActive ? '' : ' opacity-60'}`} onClick={() => setEditing(item)}>
        {icon(item.categoryId, item.subcategoryId)}
        <span className="frow-main">
          <span className="frow-title">{nameOf(item.note, item.categoryId, item.subcategoryId)}</span>
          <span className="frow-sub">
            {[
              t(`planned.every_${item.frequency}`),
              item.isActive ? formatShortDate(item.nextRunDate, i18n.language) : t('settings.recurringPaused'),
              accounts.find((a) => a.id === item.accountId)?.name ?? t('planned.accountOnDayShort'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className="plan-end">
          <span className={`amt${item.type === 'income' ? ' in' : ''}${masked ? ' masked' : ''}`}>{signed(item.type, item.amount, item.currency)}</span>
          {item.isActive && <span className={`plan-when${close ? ' close' : ''}`}>{whenLabel(item.nextRunDate)}</span>}
        </span>
      </button>
    )
  }

  const section = (title: string, items: RecurringTransaction[]) =>
    items.length > 0 && (
      <section className="flex flex-col gap-2">
        <h2 className="t-over px-4">{title}</h2>
        <div className="fgroup">{items.map(row)}</div>
      </section>
    )

  return (
    <div className="flex flex-col gap-5 w-full max-w-[640px] mx-auto">
      <PageHeader
        title={t('planned.title')}
        back={{ label: t('nav.settings'), to: '/settings' }}
        action={
          <GlassIconButton label={t('planned.newTitle')} onClick={() => setEditing(null)}>
            <Plus size={22} strokeWidth={1.75} />
          </GlassIconButton>
        }
      >
        {month.count > 0 && (
          <p className="t-sub">
            {t('planned.monthLeft', { count: month.count })}
            {month.net !== 0 && <span className="num"> · {masked ? MASK : formatListAmount(month.net, base, base, true)}</span>}
          </p>
        )}
      </PageHeader>

      {pending.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="t-over px-4">{t('notifications.needsOk')}</h2>
          <div className="fgroup">
            {pending.map((txn) => (
              <div key={txn.id} className="frow col">
                <div className="flex items-center gap-3 min-w-0">
                  {icon(txn.categoryId, txn.subcategoryId)}
                  <span className="frow-main">
                    <span className="frow-title">{nameOf(txn.note, txn.categoryId, txn.subcategoryId)}</span>
                    <span className="frow-sub">{t('notifications.wasDue', { date: formatShortDate(txn.date, i18n.language) })}</span>
                  </span>
                  <span className={`amt${txn.type === 'income' ? ' in' : ''}`}>{signed(txn.type, txn.amount, txn.currency)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => skip(txn)}>
                    {t('notifications.skip')}
                  </Button>
                  <Button size="sm" onClick={() => onEdit(txn)}>
                    {t('notifications.markPaid')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {planned.length === 0 ? (
        <div className="empty">
          <span className="empty-ico">
            <CalendarClock size={24} strokeWidth={1.75} />
          </span>
          <p className="t-head text-ink">{t('planned.emptyTitle')}</p>
          <p className="t-sub">{t('planned.emptyText')}</p>
          <Button onClick={() => setEditing(null)}>
            <Plus size={18} strokeWidth={2} aria-hidden="true" />
            {t('planned.newTitle')}
          </Button>
        </div>
      ) : (
        <>
          {section(t('planned.soon'), soon)}
          {section(t('planned.later'), later)}
          {section(t('planned.paused'), paused)}
          <p className="fsec-cap">{t('planned.howItWorks')}</p>
        </>
      )}

      <PlannedPaymentPopUp isOpen={editing !== undefined} onClose={() => setEditing(undefined)} payment={editing ?? undefined} />
      {dialogs}
    </div>
  )
}
