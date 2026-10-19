import React, { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Eye, EyeOff } from 'lucide-react'
import type { Account } from '@/types'
import type { Converter } from '@/lib/accounts'
import { AccountCard, BigMoney } from '@/components/accounts/AccountCard'
import { totalScope } from '@/lib/accounts'

interface CardCarouselProps {
  // Accounts in display order, archived ones already left out
  accounts: Account[]
  balances: Record<string, number>
  total: { total: number; complete: boolean }
  baseCurrency: string
  convert: Converter
  masked: boolean
  onToggleMasked: () => void
  onOpenAccount: (account: Account) => void
}

interface TotalCardProps {
  total: { total: number; complete: boolean }
  baseCurrency: string
  scope: string
  masked: boolean
  onToggleMasked: () => void
  label?: string
  // Off to the side in the card row
  hidden?: boolean
  className?: string
}

// The dark Total balance card: the eye hides every amount; anywhere else on it opens Accounts
export const TotalCard: React.FC<TotalCardProps> = ({
  total,
  baseCurrency,
  scope,
  masked,
  onToggleMasked,
  label,
  hidden = false,
  className = '',
}) => {
  const { t } = useTranslation()
  return (
    <div className={`bcard ${className}`} role="group" aria-label={label ?? t('home.totalBalance')} aria-hidden={hidden || undefined}>
      <Link to="/accounts" className="bcard-link" aria-label={t('home.openAccounts')} tabIndex={hidden ? -1 : 0} draggable={false} />
      <div className="bcard-top">
        <span className="bcard-label">{t('home.totalBalance')}</span>
        <button
          type="button"
          className="iconbtn"
          aria-label={masked ? t('home.showAmounts') : t('home.hideAmounts')}
          aria-pressed={masked}
          tabIndex={hidden ? -1 : 0}
          onClick={onToggleMasked}
        >
          {masked ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
        </button>
      </div>
      <div className="bcard-amt">
        <BigMoney amount={total.total} currency={baseCurrency} masked={masked} size="xl" />
      </div>
      <div className="bcard-foot">
        <span className={total.complete ? '' : 'warn'}>{scope}</span>
        <span className="bcard-more" aria-hidden="true">
          <ChevronRight size={18} strokeWidth={1.75} />
        </span>
      </div>
    </div>
  )
}

// The dark cards in the balance block: Total balance first, then one per account.
// Swipe sideways (or use the dots) to move between them.
export const CardCarousel: React.FC<CardCarouselProps> = ({
  accounts,
  balances,
  total,
  baseCurrency,
  convert,
  masked,
  onToggleMasked,
  onOpenAccount,
}) => {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const count = accounts.length + 1
  const current = Math.min(index, count - 1)
  const carouselRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; width: number; dx: number; on: boolean } | null>(null)
  // Set while a drag is going on, so the click that ends it doesn't open a card
  const moved = useRef(false)

  const go = (next: number) => setIndex(Math.max(0, Math.min(count - 1, next)))

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    moved.current = false
    drag.current = { x: e.clientX, y: e.clientY, width: e.currentTarget.offsetWidth || 1, dx: 0, on: false }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = carouselRef.current
    if (!d || !el) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.on) {
      // Small moves and mostly-vertical ones (scrolling the page) aren't swipes
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return
      d.on = true
      moved.current = true
      el.classList.add('dragging')
      el.setPointerCapture(e.pointerId)
    }
    // Rubber-band past the first and last card
    const atEdge = (current === 0 && dx > 0) || (current === count - 1 && dx < 0)
    d.dx = dx
    el.style.setProperty('--drag', `${atEdge ? dx / 3 : dx}px`)
  }

  const handlePointerEnd = () => {
    const d = drag.current
    const el = carouselRef.current
    drag.current = null
    if (!d || !el) return
    el.classList.remove('dragging')
    el.style.removeProperty('--drag')
    if (!d.on) return
    // Past 18% of a card's width it moves on to the next one
    const threshold = d.width * 0.18
    if (d.dx < -threshold) go(current + 1)
    else if (d.dx > threshold) go(current - 1)
  }

  const handleClickCapture = (e: React.MouseEvent) => {
    if (!moved.current) return
    moved.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  const scope = totalScope(accounts, total.complete, t)
  const position = (n: number) => t('home.cardPosition', { index: n, count })

  return (
    <>
      <div
        ref={carouselRef}
        className="bcards"
        role="group"
        aria-roledescription={t('home.carousel')}
        aria-label={t('home.cardsLabel')}
        style={{ '--i': current } as React.CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClickCapture={handleClickCapture}
      >
        <div className="bcards-track">
          <TotalCard
            total={total}
            baseCurrency={baseCurrency}
            scope={scope}
            masked={masked}
            onToggleMasked={onToggleMasked}
            label={`${t('home.totalBalance')}, ${position(1)}`}
            hidden={current !== 0}
          />

          {accounts.map((account, i) => (
            <AccountCard
              key={account.id}
              account={account}
              balance={balances[account.id] ?? 0}
              baseCurrency={baseCurrency}
              convert={convert}
              masked={masked}
              size="lg"
              hidden={current !== i + 1}
              position={position(i + 2)}
              onClick={() => onOpenAccount(account)}
            />
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="bdots">
          {Array.from({ length: count }, (_, k) => (
            <button
              key={k}
              type="button"
              className={`bdot${k === current ? ' on' : ''}`}
              aria-label={`${position(k + 1)} · ${k === 0 ? t('home.totalBalance') : accounts[k - 1].name}`}
              aria-current={k === current}
              onClick={() => go(k)}
            />
          ))}
        </div>
      )}
    </>
  )
}
