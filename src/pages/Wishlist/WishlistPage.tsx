import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CircleCheck, ExternalLink, Gift, PiggyBank, Plus, RotateCcw } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useAccountStore } from '@/store/accountStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useWishlistStore } from '@/store/wishlistStore'
import { useConverter } from '@/store/ratesStore'
import { formatAmount, formatDate, MASK, roundMoney } from '@/lib/utils'
import { activeAccounts, getAccountBalances } from '@/lib/accounts'
import { allocateSavings, importanceKey } from '@/lib/wishlist'
import { WishSheet } from '@/components/wishlist/WishSheet'
import { BuySheet } from '@/components/wishlist/BuySheet'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { Row } from '@/components/ui/Row'
import { PageHeader, GlassIconButton } from '@/components/layout/PageHeader'
import { useUiStore } from '@/store/uiStore'
import { toast } from '@/components/ui/Toast'
import type { WishImportance, WishlistItem } from '@/types'

// Most important in red, then orange, then grey; the words always say it too
const importanceTone = (importance: WishImportance) => (importance === 3 ? 'danger' : importance === 2 ? 'warn' : 'neutral')

export const WishlistPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const { settings } = useAppStore()
  const allAccounts = useAccountStore((s) => s.accounts)
  const setWishlistFund = useAccountStore((s) => s.setWishlistFund)
  const transactions = useTransactionStore((s) => s.transactions)
  const { items, editItem } = useWishlistStore()
  const convert = useConverter()
  const masked = useUiStore((s) => s.amountsHidden)

  // undefined = closed, null = adding a new one, otherwise the one being edited
  const [wishSheet, setWishSheet] = useState<WishlistItem | null | undefined>(undefined)
  const [buying, setBuying] = useState<WishlistItem | null>(null)
  const [showBought, setShowBought] = useState(false)

  const base = settings.baseCurrency
  const accounts = activeAccounts(allAccounts)
  const fund = accounts.find((a) => a.isWishlistFund)

  const balances = useMemo(
    () => getAccountBalances(accounts, transactions, base, convert),
    [accounts, transactions, base, convert]
  )
  const fundBalance = fund ? balances[fund.id] ?? 0 : 0
  // Null when the savings are in a foreign currency whose rate isn't known yet
  const savingsInBase = fund ? convert(fundBalance, fund.currency, base) : 0

  const wanted = items.filter((item) => item.status === 'wanted')
  const bought = items
    .filter((item) => item.status === 'bought')
    .sort((a, b) => (b.boughtAt ?? '').localeCompare(a.boughtAt ?? ''))

  const progress = useMemo(
    () => allocateSavings(wanted, savingsInBase ?? 0, base, convert),
    [wanted, savingsInBase, base, convert]
  )
  const wantedTotal = progress.reduce((sum, p) => roundMoney(sum + (p.priceInBase ?? 0)), 0)
  const missing = Math.max(0, wantedTotal - Math.max(0, savingsInBase ?? 0))

  const handleReturn = async (item: WishlistItem) => {
    try {
      await editItem(item.id, { status: 'wanted', boughtAt: null })
      toast.success(t('wishlist.returned'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const money = (amount: number, currency: string) => (masked ? MASK : formatAmount(amount, currency))

  return (
    <div className="flex flex-col gap-6 w-full max-w-[640px] mx-auto lg:max-w-[1100px] lg:grid lg:grid-cols-12 lg:items-start">
      <div className="lg:col-span-12">
        <PageHeader
          title={t('wishlist.title')}
          action={
            <GlassIconButton id="add-wish-btn" label={t('wishlist.add')} onClick={() => setWishSheet(null)}>
              <Plus size={22} strokeWidth={1.75} />
            </GlassIconButton>
          }
        >
          <p className="t-sub">{t('wishlist.subtitle')}</p>
        </PageHeader>
      </div>

      {/* ── SAVINGS: the account whose money is kept for wishes ── */}
      <section className="scard lg:col-span-5" aria-label={t('wishlist.savings')}>
        <div className="flex items-center gap-3">
          <span className="prow-ico" aria-hidden="true">
            <PiggyBank size={18} strokeWidth={1.75} />
          </span>
          <span className="t-label">{t('wishlist.savings')}</span>
        </div>

        {fund ? (
          <>
            <div className="flex flex-col gap-0.5">
              <span id="wishlist-savings" className={`hero-num${masked ? ' masked' : ''}`}>{money(fundBalance, fund.currency)}</span>
              <span className="t-sub">
                {fund.name}
                {fund.currency !== base && savingsInBase !== null && !masked && ` · ≈ ${formatAmount(savingsInBase, base)}`}
              </span>
            </div>
            {wanted.length > 0 && (
              <div className="tiles gap-3">
                <div className="ktile bg-fill shadow-none">
                  <span className="t-cap">{t('wishlist.wantedTotal')}</span>
                  <span className="ktile-val text-[17px]">{money(wantedTotal, base)}</span>
                </div>
                <div className="ktile bg-fill shadow-none">
                  <span className="t-cap">{t('wishlist.missing')}</span>
                  <span className={`ktile-val text-[17px]${missing === 0 ? ' text-in' : ''}`}>{money(missing, base)}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="t-sub">{t('wishlist.noSavingsHint')}</p>
        )}

        <Select
          id="wishlist-fund-select"
          label={t('wishlist.savingsAccount')}
          value={fund?.id ?? ''}
          onChange={(e) => setWishlistFund(e.target.value || null)}
        >
          <option value="">{t('wishlist.noSavingsAccount')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </section>

      {/* ── WISHES, most important first; the savings reach down the list ── */}
      <div className="flex flex-col gap-3 lg:col-span-7">
        {wanted.length === 0 ? (
          <div className="card empty">
            <span className="empty-ico">
              <Gift size={24} strokeWidth={1.75} />
            </span>
            <h2 className="t-head">{t('wishlist.empty')}</h2>
            <p className="t-sub max-w-[280px]">{t('wishlist.emptyHint')}</p>
            <Button variant="tinted" onClick={() => setWishSheet(null)}>
              <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
              {t('wishlist.add')}
            </Button>
          </div>
        ) : (
          progress.map(({ item, priceInBase, covered }) => {
            const ready = priceInBase !== null && covered >= priceInBase
            const share = priceInBase ? (covered / priceInBase) * 100 : 0
            return (
              <article key={item.id} className="card p-4 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => setWishSheet(item)} className="flex-1 min-w-0 text-left">
                    <span className="t-head block truncate text-ink">{item.name}</span>
                    <span className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`pill ${importanceTone(item.importance)}`}>{t(importanceKey(item.importance))}</span>
                      <span className="t-sub num">
                        {money(item.price, item.currency)}
                        {item.currency !== base && priceInBase !== null && !masked && ` · ≈ ${formatAmount(priceInBase, base)}`}
                      </span>
                    </span>
                  </button>
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="iconbtn"
                      aria-label={t('wishlist.openLink')}
                      title={t('wishlist.openLink')}
                    >
                      <ExternalLink size={18} strokeWidth={1.75} />
                    </a>
                  )}
                  <Button variant="tinted" size="sm" onClick={() => setBuying(item)} className="mt-1">
                    <Check size={16} strokeWidth={2} aria-hidden="true" />
                    {t('wishlist.bought')}
                  </Button>
                </div>

                {/* How far the savings reach for this item */}
                {fund && priceInBase !== null && (
                  <div
                    className="flex flex-col gap-2"
                    style={{ '--m': ready ? 'var(--in)' : 'var(--accent-text)' } as React.CSSProperties}
                  >
                    <span
                      className="meter"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(Math.min(share, 100))}
                      aria-label={item.name}
                    >
                      <span style={{ width: `${Math.min(share, 100)}%` }} />
                    </span>
                    <span className="mstat">
                      {ready && <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" />}
                      <span>
                        {ready ? t('wishlist.ready') : t('wishlist.needMore', { amount: money(priceInBase - covered, base) })}
                      </span>
                    </span>
                  </div>
                )}
              </article>
            )
          })
        )}

        {/* Bought items: tap one to see it, the arrow puts it back on the list */}
        {bought.length > 0 && (
          <section className="flex flex-col gap-2 pt-3" aria-label={t('wishlist.boughtGroup')}>
            <h2 className="t-over px-1">{t('wishlist.boughtGroup')}</h2>
            <div className="sgroup">
              {showBought ? (
                bought.map((item) => (
                  <div key={item.id} className="prow">
                    <button type="button" className="prow-main text-left" onClick={() => setWishSheet(item)}>
                      <span className="prow-title">
                        <span className="line-through text-ink-2">{item.name}</span>
                      </span>
                      <span className="prow-sub">
                        {money(item.price, item.currency)}
                        {item.boughtAt ? ` · ${formatDate(item.boughtAt, i18n.language)}` : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={`${t('wishlist.returnToList')}: ${item.name}`}
                      title={t('wishlist.returnToList')}
                      onClick={() => handleReturn(item)}
                    >
                      <RotateCcw size={18} strokeWidth={1.75} />
                    </button>
                  </div>
                ))
              ) : (
                <Row id="toggle-bought" title={t('wishlist.showBought', { count: bought.length })} chevron onClick={() => setShowBought(true)} />
              )}
            </div>
          </section>
        )}
      </div>

      <WishSheet isOpen={wishSheet !== undefined} onClose={() => setWishSheet(undefined)} item={wishSheet ?? undefined} />
      <BuySheet item={buying} onClose={() => setBuying(null)} />
    </div>
  )
}
