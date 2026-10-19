import React, { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Banknote, ChevronRight, CreditCard, Ellipsis, Eye, EyeOff, PiggyBank } from 'lucide-react'
import type { Account } from '@/types'
import type { Converter } from '@/lib/accounts'
import { accountColor, accountLook } from '@/lib/accounts'
import { formatAmount, MASK, moneyParts } from '@/lib/utils'

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

// Long amounts step down a size instead of wrapping
function sizeClass(text: string): string {
  return text.length > 12 ? 'xlong' : text.length > 10 ? 'long' : ''
}

// A big amount: prefix symbols ($) sit in the number, suffix ones (soʻm) follow it smaller
const BigMoney: React.FC<{ amount: number; currency: string; masked: boolean }> = ({ amount, currency, masked }) => {
  if (masked) return <span className="money-xl masked">{MASK}</span>
  const parts = moneyParts(amount, currency)
  const text = parts.sign + (parts.symbolBefore ? parts.symbol : '') + parts.number
  return (
    <span className="flex items-baseline min-w-0">
      <span className={`money-xl ${sizeClass(text)}`}>{text}</span>
      {!parts.symbolBefore && <span className="cur">{parts.symbol}</span>}
    </span>
  )
}

const LOOK_ICONS = { card: CreditCard, cash: Banknote, savings: PiggyBank }

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

  const counted = accounts.filter((a) => a.includeInTotal).length
  const scope = !total.complete
    ? t('home.rateMissingShort')
    : counted === accounts.length
      ? t('home.scopeAll', { count: accounts.length })
      : t('home.scopeSome', { counted, count: accounts.length })
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
          <div
            className="bcard"
            role="group"
            aria-label={`${t('home.totalBalance')}, ${position(1)}`}
            aria-hidden={current !== 0}
          >
            <Link
              to="/accounts"
              className="bcard-link"
              aria-label={t('home.openAccounts')}
              tabIndex={current === 0 ? 0 : -1}
              draggable={false}
            />
            <div className="bcard-top">
              <span className="bcard-label">{t('home.totalBalance')}</span>
              <button
                type="button"
                className="iconbtn"
                aria-label={masked ? t('home.showAmounts') : t('home.hideAmounts')}
                aria-pressed={masked}
                tabIndex={current === 0 ? 0 : -1}
                onClick={onToggleMasked}
              >
                {masked ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
              </button>
            </div>
            <div className="bcard-amt">
              <BigMoney amount={total.total} currency={baseCurrency} masked={masked} />
            </div>
            <div className="bcard-foot">
              <span className={total.complete ? '' : 'warn'}>{scope}</span>
              <span className="bcard-more" aria-hidden="true">
                <ChevronRight size={18} strokeWidth={1.75} />
              </span>
            </div>
          </div>

          {accounts.map((account, i) => {
            const balance = balances[account.id] ?? 0
            const look = accountLook(account)
            const Icon = LOOK_ICONS[look]
            const off = !account.includeInTotal
            const shown = current === i + 1
            const inBase = account.currency === baseCurrency ? null : convert(balance, account.currency, baseCurrency)
            const kind = look === 'savings' ? t('home.kindSavings') : t(look === 'cash' ? 'accounts.typeCash' : 'accounts.typeCard')
            const label = [
              account.name,
              masked ? t('home.amountHidden') : formatAmount(balance, account.currency),
              off ? t('accounts.notCounted') : null,
              `(${position(i + 2)})`,
              t('home.openAccountSettings'),
            ]
              .filter(Boolean)
              .join(', ')
            return (
              <button
                key={account.id}
                type="button"
                className={`bcard${off ? ' off' : ''}`}
                style={{ '--c': accountColor(account) } as React.CSSProperties}
                aria-label={label}
                aria-hidden={!shown}
                tabIndex={shown ? 0 : -1}
                onClick={() => onOpenAccount(account)}
              >
                <span className="bcard-top">
                  <span className="bcard-name">
                    <span className="bcard-ico">
                      <Icon size={18} strokeWidth={1.75} />
                    </span>
                    <span>{account.name}</span>
                  </span>
                  <span className="bcard-more" aria-hidden="true">
                    <Ellipsis size={18} strokeWidth={1.75} />
                  </span>
                </span>
                <span className="bcard-amt">
                  <BigMoney amount={balance} currency={account.currency} masked={masked} />
                  {inBase !== null && !masked && (
                    <span className="amt-sub">≈ {formatAmount(inBase, baseCurrency)}</span>
                  )}
                </span>
                <span className="bcard-foot">
                  <span>{`${kind} · ${account.currency}`}</span>
                  {off && <span className="btag">{t('accounts.notCounted')}</span>}
                </span>
              </button>
            )
          })}
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
