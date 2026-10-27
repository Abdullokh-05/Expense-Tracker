import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Repeat, TriangleAlert } from 'lucide-react'
import type { Transaction } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useAccountStore } from '@/store/accountStore'
import { useRecurringStore } from '@/store/recurringStore'
import { useNotificationStore } from '@/store/notificationStore'
import type { AppNotification } from '@/lib/notifications'
import { getCategoryName } from '@/lib/categories'
import { formatListAmount, formatShortDate } from '@/lib/utils'
import { PopUp } from '@/components/ui/PopUp'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'

interface NotificationsPopUpProps {
  isOpen: boolean
  onClose: () => void
  notifications: AppNotification[]
  onEditTransaction: (transaction: Transaction) => void
}

const Chevron = () => (
  <span className="prow-go" aria-hidden="true">
    <ChevronRight size={14} strokeWidth={2.25} />
  </span>
)

// The bell: payments waiting for an answer, limits running out, and payments the app added
export const NotificationsPopUp: React.FC<NotificationsPopUpProps> = ({
  isOpen,
  onClose,
  notifications,
  onEditTransaction,
}) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const editTransaction = useTransactionStore((s) => s.editTransaction)
  const categories = useCategoryStore((s) => s.categories)
  const accounts = useAccountStore((s) => s.accounts)
  const recurring = useRecurringStore((s) => s.recurringTransactions)
  const { readIds, markRead } = useNotificationStore()

  const pendingCount = notifications.filter((n) => n.kind === 'pending').length
  const unread = notifications.filter((n) => n.kind !== 'pending' && !readIds.includes(n.id))
  const subtitle =
    pendingCount === 0 && unread.length === 0
      ? notifications.length === 0
        ? t('notifications.empty')
        : t('notifications.allRead')
      : [
          unread.length > 0 ? t('notifications.subNew', { count: unread.length }) : '',
          pendingCount > 0 ? t('notifications.subPending', { count: pendingCount }) : '',
        ]
          .filter(Boolean)
          .join(' ')

  const go = (id: string, then: () => void) => {
    markRead([id])
    onClose()
    then()
  }

  const resolve = async (txn: Transaction, status: 'confirmed' | 'skipped') => {
    try {
      await editTransaction(txn.id, { status })
      toast.success(status === 'confirmed' ? t('notifications.added') : t('notifications.skipped'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const titleOf = (txn: Transaction) =>
    txn.note || getCategoryName(categories.find((c) => c.id === txn.categoryId), t)
  const bubble = (txn: Transaction) => {
    const category = categories.find((c) => c.id === txn.categoryId)
    return (
      <span className="bub" style={{ '--c': category?.color ?? '#8E8E93' } as React.CSSProperties} aria-hidden="true">
        {category?.icon ?? '📦'}
      </span>
    )
  }
  const signedAmount = (txn: Transaction) =>
    formatListAmount(txn.type === 'income' ? txn.amount : -txn.amount, txn.currency, base, txn.type === 'income')

  return (
    <PopUp isOpen={isOpen} onClose={onClose} title={t('notifications.title')} subtitle={subtitle}>
      <div className="plist">
        {notifications.map((item) => {
          const isUnread = item.kind !== 'pending' && !readIds.includes(item.id)
          const unreadDot = isUnread ? <span className="udot" role="img" aria-label={t('notifications.unread')} /> : null

          if (item.kind === 'pending') {
            const txn = item.transaction
            const account = accounts.find((a) => a.id === txn.accountId)
            return (
              <div key={item.id} className="pbox" role="group" aria-label={t('notifications.needsOk')}>
                <div className="prow">
                  {bubble(txn)}
                  <span className="prow-main">
                    <span className="prow-title">
                      <span>{titleOf(txn)}</span>
                      <Repeat size={16} strokeWidth={1.75} className="text-ink-2 shrink-0" role="img" aria-label={t('transaction.recurring')} />
                    </span>
                    <span className="prow-sub">
                      {[t('notifications.wasDue', { date: formatShortDate(txn.date, i18n.language) }), account?.name]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className={`amt${txn.type === 'income' ? ' in' : ''}`}>{signedAmount(txn)}</span>
                </div>
                <div className="pbox-exp grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => resolve(txn, 'skipped')}>
                    {t('notifications.skip')}
                  </Button>
                  <Button size="sm" onClick={() => go(item.id, () => onEditTransaction(txn))}>
                    {t('notifications.markPaid')}
                  </Button>
                </div>
              </div>
            )
          }

          if (item.kind === 'limit') {
            const category = categories.find((c) => c.id === item.categoryId)
            const name = getCategoryName(category, t)
            const percent = Math.round((item.spent / item.limit) * 100)
            return (
              <button key={item.id} type="button" className="prow" onClick={() => go(item.id, () => navigate('/stats'))}>
                <span
                  className="prow-ico"
                  style={
                    item.over
                      ? { background: 'var(--danger-soft)', color: 'var(--danger-text)' }
                      : { background: 'var(--warn-soft)', color: 'var(--warn)' }
                  }
                  aria-hidden="true"
                >
                  <TriangleAlert size={18} strokeWidth={1.75} />
                </span>
                <span className="prow-main">
                  <span className="prow-title">
                    <span>{item.over ? t('notifications.overLimit', { name }) : t('notifications.nearLimit', { name })}</span>
                  </span>
                  <span className="prow-sub">
                    {item.over
                      ? t('notifications.overLimitSub', {
                          percent,
                          limit: formatListAmount(item.limit, base, base),
                          over: formatListAmount(item.spent - item.limit, base, base),
                        })
                      : t('notifications.nearLimitSub', { percent, left: formatListAmount(item.limit - item.spent, base, base) })}
                  </span>
                </span>
                {unreadDot}
                <Chevron />
              </button>
            )
          }

          if (item.kind === 'due') {
            const due = item.recurring
            const account = accounts.find((a) => a.id === due.accountId)
            const name = due.note || getCategoryName(categories.find((c) => c.id === due.categoryId), t)
            return (
              <button key={item.id} type="button" className="prow" onClick={() => go(item.id, () => navigate('/settings/planned'))}>
                <span className="bub" style={{ '--c': categories.find((c) => c.id === due.categoryId)?.color ?? '#8E8E93' } as React.CSSProperties} aria-hidden="true">
                  {categories.find((c) => c.id === due.categoryId)?.icon ?? '📦'}
                </span>
                <span className="prow-main">
                  <span className="prow-title">
                    <span>
                      {item.daysLeft === 0
                        ? t('notifications.dueToday', { name })
                        : item.daysLeft === 1
                          ? t('notifications.dueTomorrow', { name })
                          : t('notifications.dueIn', { name, count: item.daysLeft })}
                    </span>
                  </span>
                  <span className="prow-sub">
                    {[
                      formatListAmount(due.type === 'income' ? due.amount : -due.amount, due.currency, base, due.type === 'income'),
                      account?.name,
                      due.autoCreate ? t('upcoming.automatic') : t('upcoming.asksFirst'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {unreadDot}
                <Chevron />
              </button>
            )
          }

          const txn = item.transaction
          const repeat = recurring.find((r) => r.id === txn.recurringTransactionId)
          return (
            <button key={item.id} type="button" className="prow" onClick={() => go(item.id, () => onEditTransaction(txn))}>
              {bubble(txn)}
              <span className="prow-main">
                <span className="prow-title">
                  <span>{t('notifications.addedForYou', { name: titleOf(txn) })}</span>
                </span>
                <span className="prow-sub">
                  {[
                    repeat ? t(`transaction.${repeat.frequency}`) : null,
                    formatShortDate(txn.date, i18n.language),
                    signedAmount(txn),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {unreadDot}
              <Chevron />
            </button>
          )
        })}

        <button
          type="button"
          className="prow"
          onClick={() => {
            onClose()
            navigate('/settings/planned')
          }}
        >
          <span className="prow-ico" aria-hidden="true">
            <Repeat size={18} strokeWidth={1.75} />
          </span>
          <span className="prow-main">
            <span className="prow-title">
              <span>{t('notifications.recurringPayments')}</span>
            </span>
            {recurring.length > 0 && (
              <span className="prow-sub">{t('notifications.recurringCount', { count: recurring.filter((r) => r.isActive).length })}</span>
            )}
          </span>
          <Chevron />
        </button>
      </div>

      {unread.length > 0 && (
        <Button variant="ghost" size="sm" className="self-center" onClick={() => markRead(unread.map((n) => n.id))}>
          {t('notifications.markAllRead')}
        </Button>
      )}
    </PopUp>
  )
}
