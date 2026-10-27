import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, CircleDollarSign, Tag } from 'lucide-react'
import type { Transaction } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useAccountStore } from '@/store/accountStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useUiStore } from '@/store/uiStore'
import { formatListAmount, formatShortDate, MASK } from '@/lib/utils'
import { PopUp } from '@/components/ui/PopUp'

// What still needs the user, kept on Home until it's done: planned payments that came due and
// wait to be marked paid, and entries saved without a category.
export const AttentionCards: React.FC<{ onEdit: (transaction: Transaction) => void }> = ({ onEdit }) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const accounts = useAccountStore((s) => s.accounts)
  const transactions = useTransactionStore((s) => s.transactions)
  const masked = useUiStore((s) => s.amountsHidden)
  const [listOpen, setListOpen] = useState(false)

  const toPay = transactions.filter((txn) => txn.status === 'pending')
  const uncategorized = transactions.filter((txn) => txn.status === 'confirmed' && txn.type !== 'transfer' && !txn.categoryId)
  const signed = (txn: Transaction) =>
    masked ? MASK : formatListAmount(txn.type === 'income' ? txn.amount : -txn.amount, txn.currency, base, txn.type === 'income')

  const card = (icon: React.ReactNode, title: string, sub: string, onClick: () => void) => (
    <button type="button" className="card fc attn" onClick={onClick}>
      <span className="fc-ico" aria-hidden="true">
        {icon}
      </span>
      <span className="flex flex-col flex-1 min-w-0">
        <span className="t-strong">{title}</span>
        <span className="t-sub">{sub}</span>
      </span>
      <ChevronRight size={18} strokeWidth={1.75} className="text-ink-2 shrink-0" aria-hidden="true" />
    </button>
  )

  return (
    <>
      {toPay.length > 0 &&
        card(
          <CircleDollarSign size={18} strokeWidth={1.75} />,
          t('home.toPay', { count: toPay.length }),
          t('home.toPaySub'),
          // One waiting: straight to it; more: the list on Planned payments
          () => (toPay.length === 1 ? onEdit(toPay[0]) : navigate('/settings/planned'))
        )}
      {uncategorized.length > 0 &&
        card(
          <Tag size={18} strokeWidth={1.75} />,
          t('home.noCategory', { count: uncategorized.length }),
          t('home.noCategorySub'),
          () => (uncategorized.length === 1 ? onEdit(uncategorized[0]) : setListOpen(true))
        )}

      <PopUp isOpen={listOpen} onClose={() => setListOpen(false)} title={t('home.noCategoryTitle')} subtitle={t('home.noCategoryHint')}>
        <div className="fgroup">
          {uncategorized.map((txn) => (
            <button
              key={txn.id}
              type="button"
              className="frow tall"
              onClick={() => {
                setListOpen(false)
                onEdit(txn)
              }}
            >
              <span className="cico unset" aria-hidden="true">?</span>
              <span className="frow-main">
                <span className="frow-title">{txn.note || t('transaction.noCategory')}</span>
                <span className="frow-sub">
                  {[formatShortDate(txn.date, i18n.language), accounts.find((a) => a.id === txn.accountId)?.name].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={`amt${txn.type === 'income' ? ' in' : ''}${masked ? ' masked' : ''}`}>{signed(txn)}</span>
            </button>
          ))}
        </div>
      </PopUp>
    </>
  )
}
