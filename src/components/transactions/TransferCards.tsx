import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, TriangleAlert } from 'lucide-react'
import type { Account } from '@/types'
import { AccountIcon } from '@/components/accounts/AccountCard'
import { accountColor, accountLook, accountTypeLabel } from '@/lib/accounts'
import { formatAmount, MASK } from '@/lib/utils'

interface TransferCardsProps {
  // The accounts that can be picked, in display order
  accounts: Account[]
  fromId: string
  toId: string
  onFromChange: (id: string) => void
  onToChange: (id: string) => void
  onSwap: () => void
  // Each account's balance now, in its own currency
  balances: Record<string, number>
  // What leaves FROM (in its currency) and arrives in TO (in its), once an amount is typed
  amount: number | null
  received: number | null
  masked: boolean
  // In TO's card when the currencies differ: what arrives, editable
  receivedSlot?: React.ReactNode
}

interface SideProps {
  role: 'from' | 'to'
  // This side's choices: every account but the one on the other side
  accounts: Account[]
  selectedId: string
  onPick: (id: string) => void
  balances: Record<string, number>
  // The balance once the transfer is made, while an amount is typed
  after: number | null
  // FROM only: the amount is more than the account holds (saving is still allowed)
  short: boolean
  masked: boolean
  extra?: React.ReactNode
}

// One side of a transfer: the account cards in a row that scrolls sideways and snaps, the
// next card peeking in at the edge. Whichever card settles in front is the account.
const TransferSide: React.FC<SideProps> = ({ role, accounts, selectedId, onPick, balances, after, short, masked, extra }) => {
  const { t } = useTranslation()
  const rowRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<number | null>(null)
  // Set while the row is being scrolled into place by code, so that scroll isn't a pick
  const scripted = useRef(false)
  const label = role === 'from' ? t('transaction.fromAccount') : t('transaction.toAccount')
  const index = accounts.findIndex((a) => a.id === selectedId)

  // The picked account is brought to the front when it changes from outside (Swap, opening)
  useEffect(() => {
    const row = rowRef.current
    const card = row?.children[index] as HTMLElement | undefined
    if (!row || !card) return
    const left = card.offsetLeft - row.offsetLeft - 16
    if (Math.abs(row.scrollLeft - left) < 2) return
    scripted.current = true
    row.scrollTo({ left, behavior: 'instant' as ScrollBehavior })
    requestAnimationFrame(() => (scripted.current = false))
  }, [index, accounts.length])

  // Once the row stops moving, the card nearest the front is the pick
  const onScroll = () => {
    if (scripted.current) return
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      const row = rowRef.current
      if (!row) return
      const cards = [...row.children] as HTMLElement[]
      let nearest = 0
      cards.forEach((card, i) => {
        const gap = Math.abs(card.offsetLeft - row.offsetLeft - 16 - row.scrollLeft)
        const best = Math.abs(cards[nearest].offsetLeft - row.offsetLeft - 16 - row.scrollLeft)
        if (gap < best) nearest = i
      })
      const id = accounts[nearest]?.id
      if (id && id !== selectedId) onPick(id)
    }, 90)
  }

  const money = (value: number, currency: string) => (masked ? MASK : formatAmount(value, currency))

  return (
    <div className={`tside ${role}`}>
      <div className="tside-head">
        <span className="t-over">{label}</span>
        {accounts.length > 1 && index >= 0 && (
          <span className="tside-count num" aria-hidden="true">
            {index + 1} / {accounts.length}
          </span>
        )}
      </div>
      {accounts.length === 0 ? (
        <div className="tcard empty">
          <span>{t('add.secondAccount')}</span>
        </div>
      ) : (
        <div
          ref={rowRef}
          className={`trow${accounts.length === 1 ? ' solo' : ''}`}
          role="listbox"
          aria-label={label}
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
            const next = accounts[index + step]
            if (step && next) {
              e.preventDefault()
              onPick(next.id)
            }
          }}
        >
          {accounts.map((account) => {
            const on = account.id === selectedId
            const balance = balances[account.id] ?? 0
            return (
              <div
                key={account.id}
                role="option"
                aria-selected={on}
                className={`tcard${on ? ' on' : ''}${on && short ? ' short' : ''}`}
                style={{ '--c': accountColor(account) } as React.CSSProperties}
                onClick={() => !on && onPick(account.id)}
              >
                <div className="tcard-top">
                  <span className="tcard-ico">
                    <AccountIcon account={account} size={16} />
                  </span>
                  <span className="tcard-name">
                    <span className="tcard-title">{account.name}</span>
                    <span className="tcard-kind">
                      {accountTypeLabel(accountLook(account), t)} · {account.currency}
                    </span>
                  </span>
                </div>
                <div className="tcard-bot">
                  <span className={`tcard-bal${masked ? ' masked' : ''}`}>{money(balance, account.currency)}</span>
                  {on && short ? (
                    <span className="tcard-warn">
                      <TriangleAlert size={13} strokeWidth={2.25} aria-hidden="true" />
                      {t('add.moreThanBalance')}
                    </span>
                  ) : (
                    on &&
                    after !== null && (
                      <span className={`tcard-after${after < 0 ? ' neg' : ''}${masked ? ' masked' : ''}`}>
                        → {money(after, account.currency)}
                      </span>
                    )
                  )}
                </div>
                {on && extra && <div className="tcard-extra">{extra}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// A transfer's two accounts: FROM on top, TO below, each a row of account cards to swipe
// through, and between them an arrow that swaps the two. An account on one side isn't
// offered on the other.
export const TransferCards: React.FC<TransferCardsProps> = ({
  accounts,
  fromId,
  toId,
  onFromChange,
  onToChange,
  onSwap,
  balances,
  amount,
  received,
  masked,
  receivedSlot,
}) => {
  const { t } = useTranslation()
  const [turned, setTurned] = useState(false)
  const from = accounts.find((a) => a.id === fromId)
  const to = accounts.find((a) => a.id === toId)

  const fromAfter = from && amount !== null ? (balances[from.id] ?? 0) - amount : null
  const toAfter = to && received !== null ? (balances[to.id] ?? 0) + received : null
  const short = Boolean(from && amount !== null && amount > (balances[from.id] ?? 0))

  return (
    <div className="tpair">
      <TransferSide
        role="from"
        accounts={accounts.filter((a) => a.id !== toId)}
        selectedId={fromId}
        onPick={onFromChange}
        balances={balances}
        after={fromAfter}
        short={short}
        masked={masked}
      />
      <div className="tswap-row">
        <button
          type="button"
          className={`tswap${turned ? ' turned' : ''}`}
          aria-label={t('add.swap')}
          title={t('add.swap')}
          disabled={!from || !to}
          onClick={() => {
            setTurned(!turned)
            onSwap()
          }}
        >
          <ArrowDown size={18} strokeWidth={2.25} />
        </button>
      </div>
      <TransferSide
        role="to"
        accounts={accounts.filter((a) => a.id !== fromId)}
        selectedId={toId}
        onPick={onToChange}
        balances={balances}
        after={toAfter}
        short={false}
        masked={masked}
        extra={receivedSlot}
      />
    </div>
  )
}
