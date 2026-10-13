import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ExternalLink, Gift, PiggyBank, Plus, RotateCcw } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useAccountStore } from '@/store/accountStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useWishlistStore } from '@/store/wishlistStore'
import { useConverter } from '@/store/ratesStore'
import { formatAmount, formatDate } from '@/lib/utils'
import { activeAccounts, getAccountBalances } from '@/lib/accounts'
import { allocateSavings, importanceKey } from '@/lib/wishlist'
import { WishSheet } from '@/components/wishlist/WishSheet'
import { BuySheet } from '@/components/wishlist/BuySheet'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import type { WishImportance, WishlistItem } from '@/types'

const importanceColor = (importance: WishImportance) =>
  importance === 3 ? 'var(--color-expense)' : importance === 2 ? 'var(--color-warning)' : 'var(--color-text-muted)'

export const WishlistPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const { settings } = useAppStore()
  const allAccounts = useAccountStore((s) => s.accounts)
  const setWishlistFund = useAccountStore((s) => s.setWishlistFund)
  const transactions = useTransactionStore((s) => s.transactions)
  const { items, editItem } = useWishlistStore()
  const convert = useConverter()

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
  const wantedTotal = progress.reduce((sum, p) => sum + (p.priceInBase ?? 0), 0)
  const missing = Math.max(0, wantedTotal - Math.max(0, savingsInBase ?? 0))

  const handleReturn = async (item: WishlistItem) => {
    try {
      await editItem(item.id, { status: 'wanted', boughtAt: null })
      toast.success(t('wishlist.returned'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold serif-heading" style={{ color: 'var(--color-text-primary)' }}>
            {t('wishlist.title')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('wishlist.subtitle')}
          </p>
        </div>
        <Button id="add-wish-btn" size="sm" onClick={() => setWishSheet(null)} className="self-start sm:self-auto">
          <Plus size={14} /> {t('wishlist.add')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ── SAVINGS: the account whose money is kept for wishes ── */}
        <div className="lg:col-span-5 card p-5 space-y-4" style={{ background: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2">
            <PiggyBank size={16} className="text-[var(--color-text-muted)]" />
            <span className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">
              {t('wishlist.savings')}
            </span>
          </div>

          {fund ? (
            <>
              <div>
                <div id="wishlist-savings" className="text-3xl font-bold amount-display" style={{ color: 'var(--color-text-primary)' }}>
                  {formatAmount(fundBalance, fund.currency)}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {fund.name}
                  {fund.currency !== base && savingsInBase !== null && ` · ≈ ${formatAmount(savingsInBase, base)}`}
                </p>
              </div>

              {wanted.length > 0 && (
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--color-border)]">
                  <div>
                    <span className="text-xs block" style={{ color: 'var(--color-text-muted)' }}>{t('wishlist.wantedTotal')}</span>
                    <span className="text-sm font-bold amount-display" style={{ color: 'var(--color-text-primary)' }}>
                      {formatAmount(wantedTotal, base)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs block" style={{ color: 'var(--color-text-muted)' }}>{t('wishlist.missing')}</span>
                    <span className="text-sm font-bold amount-display" style={{ color: missing > 0 ? 'var(--color-expense)' : 'var(--color-income)' }}>
                      {formatAmount(missing, base)}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {t('wishlist.noSavingsHint')}
            </p>
          )}

          <div>
            <label htmlFor="wishlist-fund-select" className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              {t('wishlist.savingsAccount')}
            </label>
            <select
              id="wishlist-fund-select"
              value={fund?.id ?? ''}
              onChange={(e) => setWishlistFund(e.target.value || null)}
              className="input-base text-sm"
            >
              <option value="">{t('wishlist.noSavingsAccount')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── WISHES ── */}
        <div className="lg:col-span-7 space-y-3">
          {wanted.length === 0 ? (
            <div className="card p-8 flex flex-col items-center justify-center text-center" style={{ background: 'var(--color-surface)' }}>
              <div className="w-12 h-12 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center mb-3">
                <Gift size={20} className="text-[var(--color-text-muted)]" />
              </div>
              <p className="text-xs font-semibold text-[var(--color-text-secondary)]">{t('wishlist.empty')}</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{t('wishlist.emptyHint')}</p>
            </div>
          ) : (
            progress.map(({ item, priceInBase, covered }) => {
              const ready = priceInBase !== null && covered >= priceInBase
              const share = priceInBase ? (covered / priceInBase) * 100 : 0
              return (
                <div key={item.id} className="card p-4 space-y-3" style={{ background: 'var(--color-surface)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => setWishSheet(item)} className="text-left min-w-0 flex-1">
                      <span className="text-sm font-bold block truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {item.name}
                      </span>
                      <span className="flex items-center gap-2 text-[11px] mt-0.5">
                        <span className="font-bold" style={{ color: importanceColor(item.importance) }}>
                          {t(importanceKey(item.importance))}
                        </span>
                        <span className="amount-display" style={{ color: 'var(--color-text-muted)' }}>
                          {formatAmount(item.price, item.currency)}
                          {item.currency !== base && priceInBase !== null && ` · ≈ ${formatAmount(priceInBase, base)}`}
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                          aria-label={t('wishlist.openLink')}
                          title={t('wishlist.openLink')}
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button
                        onClick={() => setBuying(item)}
                        className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-bg)] hover:opacity-90"
                      >
                        <Check size={13} /> {t('wishlist.bought')}
                      </button>
                    </div>
                  </div>

                  {/* How far the savings reach for this item */}
                  {fund && priceInBase !== null && (
                    <div className="space-y-1.5">
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${Math.min(share, 100)}%`, background: ready ? 'var(--color-income)' : 'var(--color-warning)' }}
                        />
                      </div>
                      <p className="text-[11px] font-semibold" style={{ color: ready ? 'var(--color-income)' : 'var(--color-text-muted)' }}>
                        {ready
                          ? t('wishlist.ready')
                          : t('wishlist.needMore', { amount: formatAmount(priceInBase - covered, base) })}
                      </p>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {/* Bought items */}
          {bought.length > 0 && (
            <div className="space-y-2 pt-2">
              <button
                id="toggle-bought"
                onClick={() => setShowBought(!showBought)}
                className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:underline"
              >
                {showBought ? t('wishlist.hideBought') : t('wishlist.showBought', { count: bought.length })}
              </button>
              {showBought && bought.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]"
                >
                  <button onClick={() => setWishSheet(item)} className="text-left min-w-0 flex-1">
                    <span className="text-sm font-semibold block truncate line-through" style={{ color: 'var(--color-text-secondary)' }}>
                      {item.name}
                    </span>
                    <span className="text-[11px] amount-display" style={{ color: 'var(--color-text-muted)' }}>
                      {formatAmount(item.price, item.currency)}
                      {item.boughtAt && ` · ${formatDate(item.boughtAt, i18n.language)}`}
                    </span>
                  </button>
                  <button
                    onClick={() => handleReturn(item)}
                    className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] shrink-0"
                    aria-label={t('wishlist.returnToList')}
                    title={t('wishlist.returnToList')}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <WishSheet
        isOpen={wishSheet !== undefined}
        onClose={() => setWishSheet(undefined)}
        item={wishSheet ?? undefined}
      />
      <BuySheet item={buying} onClose={() => setBuying(null)} />
    </div>
  )
}
