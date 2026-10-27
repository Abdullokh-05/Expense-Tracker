import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpDown, TriangleAlert } from 'lucide-react'
import type { Account } from '@/types'
import { AccountIcon } from '@/components/accounts/AccountCard'
import { accountColor, accountLook, accountTypeLabel } from '@/lib/accounts'
import { formatAmount, MASK } from '@/lib/utils'

// How long the two cards take to trade places
const SWAP_MS = 240

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
  // In TO's corner when the currencies differ: what arrives, editable
  receivedSlot?: React.ReactNode
}

interface SideProps {
  role: 'from' | 'to'
  accounts: Account[]
  selectedId: string
  // The account on the other side: swiping skips it
  otherId: string
  onPick: (id: string) => void
  balances: Record<string, number>
  // The balance once the transfer is made, while an amount is typed
  after: number | null
  // FROM only: the amount is more than the account holds (saving is still allowed)
  short: boolean
  masked: boolean
  extra?: React.ReactNode
}

// One side of a transfer: a small dark account card that swipes through the accounts, with
// page dots under it
const TransferSide: React.FC<SideProps> = ({ role, accounts, selectedId, otherId, onPick, balances, after, short, masked, extra }) => {
  const { t } = useTranslation()
  // -1 when nothing can be picked (a single account: TO has nowhere to go)
  const index = accounts.findIndex((a) => a.id === selectedId)
  const viewRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; width: number; dx: number; on: boolean } | null>(null)
  const label = role === 'from' ? t('transaction.fromAccount') : t('transaction.toAccount')

  // One account along, past the one already on the other side
  const step = (dir: 1 | -1) => {
    let next = index + dir
    if (accounts[next]?.id === otherId) next += dir
    if (next >= 0 && next < accounts.length) onPick(accounts[next].id)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, width: e.currentTarget.offsetWidth || 1, dx: 0, on: false }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = viewRef.current
    if (!d || !el) return
    const dx = e.clientX - d.x
    if (!d.on) {
      // Small moves and mostly-vertical ones aren't swipes
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(e.clientY - d.y)) return
      d.on = true
      el.classList.add('dragging')
      el.setPointerCapture(e.pointerId)
    }
    // Rubber-band past the first and last account
    const atEdge = (index === 0 && dx > 0) || (index === accounts.length - 1 && dx < 0)
    d.dx = dx
    el.style.setProperty('--drag', `${atEdge ? dx / 3 : dx}px`)
  }
  const onPointerEnd = () => {
    const d = drag.current
    const el = viewRef.current
    drag.current = null
    if (!d || !el) return
    el.classList.remove('dragging')
    el.style.removeProperty('--drag')
    if (!d.on) return
    const threshold = d.width * 0.18
    if (d.dx < -threshold) step(1)
    else if (d.dx > threshold) step(-1)
  }

  const money = (value: number, currency: string) => (masked ? MASK : formatAmount(value, currency))
  const selected = index >= 0 ? accounts[index] : undefined

  if (!selected) {
    return (
      <div className="tside">
        <div className="tcard empty">
          <span className="tcard-role">{label}</span>
          <span className="t-sub text-white/70">{t('add.secondAccount')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`tside ${role}`}>
      <div
        ref={viewRef}
        className="tcards"
        role="group"
        aria-roledescription={t('home.carousel')}
        aria-label={`${label}: ${selected.name}, ${t('home.cardPosition', { index: index + 1, count: accounts.length })}`}
        tabIndex={0}
        style={{ '--i': index } as React.CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1)
          else if (e.key === 'ArrowLeft') step(-1)
        }}
      >
        <div className="tcards-track">
          {accounts.map((account) => {
            const on = account.id === selected.id
            const balance = balances[account.id] ?? 0
            return (
              <div
                key={account.id}
                className={`tcard${on && short ? ' short' : ''}${account.id === otherId ? ' taken' : ''}`}
                style={{ '--c': accountColor(account) } as React.CSSProperties}
                aria-hidden={!on || undefined}
              >
                <div className="tcard-top">
                  <span className="bcard-ico">
                    <AccountIcon account={account} size={16} />
                  </span>
                  <span className="tcard-name">
                    <span className="tcard-title">{account.name}</span>
                    <span className="tcard-kind">
                      {accountTypeLabel(accountLook(account), t)} · {account.currency}
                    </span>
                  </span>
                  <span className={`tcard-bal${masked ? ' masked' : ''}`}>{money(balance, account.currency)}</span>
                </div>
                <div className="tcard-bot">
                  {on && short ? (
                    <span className="tcard-warn">
                      <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
                      {t('add.moreThanBalance')}
                    </span>
                  ) : on && extra ? (
                    extra
                  ) : (
                    <span className="tcard-role">{label}</span>
                  )}
                  {on && after !== null && (
                    <span className={`tcard-after${after < 0 ? ' neg' : ''}${masked ? ' masked' : ''}`}>
                      → {money(after, account.currency)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {accounts.length > 1 && (
        <div className="tdots">
          {accounts.map((account, k) => {
            const taken = account.id === otherId
            return (
              <button
                key={account.id}
                type="button"
                className={`tdot${k === index ? ' on' : ''}`}
                aria-label={`${label}: ${account.name}`}
                aria-current={k === index}
                disabled={taken}
                onClick={() => onPick(account.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// A transfer's two accounts as cards: FROM on top, TO below, a round Swap button between
// them. Each card swipes through the accounts; the one on the other side is skipped.
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
  const [swapping, setSwapping] = useState(false)
  const from = accounts.find((a) => a.id === fromId)
  const to = accounts.find((a) => a.id === toId)

  const swap = () => {
    if (swapping || !from || !to) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onSwap()
      return
    }
    // The cards slide past each other, then trade accounts
    setSwapping(true)
    window.setTimeout(() => {
      onSwap()
      setSwapping(false)
    }, SWAP_MS)
  }

  const fromAfter = from && amount !== null ? (balances[from.id] ?? 0) - amount : null
  const toAfter = to && received !== null ? (balances[to.id] ?? 0) + received : null
  const short = Boolean(from && amount !== null && amount > (balances[from.id] ?? 0))

  return (
    <div className={`tpair${swapping ? ' swapping' : ''}`}>
      <TransferSide
        role="from"
        accounts={accounts}
        selectedId={fromId}
        otherId={toId}
        onPick={onFromChange}
        balances={balances}
        after={fromAfter}
        short={short}
        masked={masked}
      />
      <button type="button" className="tswap" aria-label={t('add.swap')} title={t('add.swap')} disabled={!from || !to} onClick={swap}>
        <ArrowUpDown size={18} strokeWidth={2} />
      </button>
      <TransferSide
        role="to"
        accounts={accounts}
        selectedId={toId}
        otherId={fromId}
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
