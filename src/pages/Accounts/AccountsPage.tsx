import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, ArrowLeftRight, Plus, Trash2 } from 'lucide-react'
import type { Account } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useAccountStore } from '@/store/accountStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useRatesStore, useConverter } from '@/store/ratesStore'
import { useUiStore } from '@/store/uiStore'
import { getAccountBalances, sumBalances } from '@/lib/accounts'
import { findCustomRate, formatRateLine, rateBetween } from '@/lib/rates'
import { formatListAmount, formatShortDate, MASK, moneyParts } from '@/lib/utils'
import { PageHeader, GlassIconButton } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Row } from '@/components/ui/Row'
import { toast } from '@/components/ui/Toast'
import { AccountCard, AccountIcon } from '@/components/accounts/AccountCard'
import { AccountSettingsPopUp } from '@/components/accounts/AccountSettingsPopUp'
import { NewAccountPopUp } from '@/components/accounts/NewAccountPopUp'
import { RatePopUp } from '@/components/accounts/RatePopUp'

// Opened from the Total balance card: every account, grouped by whether it counts toward
// the total, the archived ones, and the exchange rates foreign accounts are counted at
export const AccountsPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const settings = useAppStore((s) => s.settings)
  const allAccounts = useAccountStore((s) => s.accounts)
  const editAccount = useAccountStore((s) => s.editAccount)
  const removeAccount = useAccountStore((s) => s.removeAccount)
  const transactions = useTransactionStore((s) => s.transactions)
  const liveRates = useRatesStore((s) => s.rates)
  const ratesUpdatedAt = useRatesStore((s) => s.updatedAt)
  const masked = useUiStore((s) => s.amountsHidden)
  const openAddSheet = useUiStore((s) => s.openAddSheet)
  const convert = useConverter()
  const base = settings.baseCurrency

  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // undefined = closed, null = pick a currency, otherwise that currency's rate
  const [rateFor, setRateFor] = useState<string | null | undefined>(undefined)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const balances = useMemo(
    () => getAccountBalances(allAccounts, transactions, base, convert),
    [allAccounts, transactions, base, convert]
  )
  const active = allAccounts.filter((a) => !a.isArchived)
  const counted = active.filter((a) => a.includeInTotal)
  const apart = active.filter((a) => !a.includeInTotal)
  const archived = allAccounts.filter((a) => a.isArchived)
  const total = sumBalances(counted, balances, base, convert)
  const apartTotal = sumBalances(apart, balances, base, convert)
  const totalParts = moneyParts(total.total, base)

  const groups: { key: string; label: string; sum: number; items: Account[] }[] = [
    { key: 'in', label: t('accounts.groupIn'), sum: total.total, items: counted },
    { key: 'off', label: t('accounts.groupOff'), sum: apartTotal.total, items: apart },
  ]

  // ── Exchange rates: every foreign currency an account uses, and any the user set by hand ──
  const rateCodes = [
    ...new Set([
      ...active.map((a) => a.currency),
      ...(settings.customRates ?? []).filter((r) => r.quote === base).map((r) => r.code),
    ]),
  ].filter((code) => code !== base)

  const remove = async (account: Account) => {
    try {
      await removeAccount(account.id)
      toast.success(t('acct.deleted'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const restore = async (account: Account) => {
    try {
      await editAccount(account.id, { isArchived: false })
      toast.success(t('accounts.restored'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  return (
    // One column on phones; on a computer the cards fill a grid and the rates sit on the right
    <div className="flex flex-col gap-6 w-full max-w-[640px] mx-auto lg:max-w-[1100px] lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="lg:col-span-2">
      <PageHeader
        title={t('accounts.title')}
        back={{ label: t('nav.home'), to: '/' }}
        action={
          <GlassIconButton label={t('accounts.newTitle')} onClick={() => setAdding(true)}>
            <Plus size={22} strokeWidth={1.75} />
          </GlassIconButton>
        }
      >
        <div className="flex flex-col gap-0.5">
          <span className="flex items-baseline gap-1.5 flex-wrap">
            {masked ? (
              <span className="sum-amt masked">{MASK}</span>
            ) : (
              <>
                <span className="sum-amt">
                  {totalParts.sign}
                  {totalParts.symbolBefore && totalParts.symbol}
                  {totalParts.number}
                </span>
                {!totalParts.symbolBefore && <span className="t-label">{totalParts.symbol}</span>}
              </>
            )}
          </span>
          <span className="t-sub">
            {total.complete
              ? t('accounts.countToward', { counted: counted.length, count: active.length })
              : t('home.rateMissingShort')}
          </span>
        </div>
      </PageHeader>
      </div>

      <div className="flex flex-col gap-6 min-w-0">
      <Button
        variant="secondary"
        fullWidth
        className="lg:w-auto lg:self-start"
        disabled={active.length < 2}
        onClick={() => openAddSheet({ type: 'transfer' })}
      >
        <ArrowLeftRight size={18} strokeWidth={1.75} aria-hidden="true" />
        {t('accounts.transferBetween')}
      </Button>

      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.key} className="flex flex-col gap-2" aria-label={group.label}>
            <div className="sec-head">
              <span className="t-over">{group.label}</span>
              {!masked && <span className="num">{formatListAmount(group.sum, base, base)}</span>}
            </div>
            <div className="cards lg:grid lg:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] lg:gap-3">
              {group.items.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  balance={balances[account.id] ?? 0}
                  baseCurrency={base}
                  convert={convert}
                  masked={masked}
                  size="sm"
                  onClick={() => setSettingsFor(account.id)}
                />
              ))}
            </div>
          </section>
        ))}

      {archived.length > 0 && (
        <div className="pbox">
          <Row
            icon={<Archive size={18} strokeWidth={1.75} />}
            title={t('accounts.archivedGroup')}
            value={archived.length}
            chevron={archiveOpen ? 'open' : true}
            expanded={archiveOpen}
            onClick={() => setArchiveOpen(!archiveOpen)}
            className="[&_.prow-ico]:bg-fill [&_.prow-ico]:text-ink"
          />
          {archiveOpen && (
            <div className="pbox-exp pt-0">
              {archived.map((account) => (
                <div key={account.id} className="arc-row">
                  <span className="prow-ico plain" aria-hidden="true">
                    <AccountIcon account={account} />
                  </span>
                  <span className="prow-main">
                    <span className="prow-title">
                      <span>{account.name}</span>
                    </span>
                    <span className="prow-sub">
                      {t('accounts.archivedOn', {
                        currency: account.currency,
                        date: formatShortDate(account.updatedAt.slice(0, 10), i18n.language),
                      })}
                    </span>
                  </span>
                  {!transactions.some((txn) => txn.accountId === account.id || txn.toAccountId === account.id) && (
                    <button
                      type="button"
                      className="iconbtn danger"
                      aria-label={`${t('acct.delete')}: ${account.name}`}
                      title={t('acct.delete')}
                      onClick={() => remove(account)}
                    >
                      <Trash2 size={18} strokeWidth={1.75} />
                    </button>
                  )}
                  <Button variant="tinted" size="sm" onClick={() => restore(account)}>
                    {t('accounts.restore')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>

      <section className="flex flex-col gap-2 lg:sticky lg:top-10" aria-label={t('rates.title')}>
        <div className="sec-head">
          <span className="t-over">{t('rates.title')}</span>
        </div>
        <div className="plist">
          {rateCodes.map((code) => {
            const custom = findCustomRate(settings.customRates, code, base)
            const live = rateBetween(liveRates, code, base)
            const rate = custom?.rate ?? live
            const users = active.filter((a) => a.currency === code).map((a) => a.name)
            const source = custom
              ? t('rates.setByYou')
              : live
                ? ratesUpdatedAt
                  ? t('rates.updated', { date: formatShortDate(ratesUpdatedAt.slice(0, 10), i18n.language) })
                  : null
                : t('rates.missing')
            return (
              <Row
                key={code}
                icon={<span className="cbadge">{code}</span>}
                className="[&_.prow-ico]:bg-fill"
                title={<span className="num">{rate ? formatRateLine(code, base, rate) : code}</span>}
                subtitle={[source, users.length ? t('rates.usedFor', { names: users.join(', ') }) : t('rates.unused')]
                  .filter(Boolean)
                  .join(' · ')}
                chevron
                onClick={() => setRateFor(code)}
              />
            )
          })}
          <Row icon={<Plus size={18} strokeWidth={1.75} />} title={t('rates.add')} chevron onClick={() => setRateFor(null)} />
        </div>
        <p className="t-cap px-1">{t('rates.note')}</p>
      </section>

      <AccountSettingsPopUp accountId={settingsFor} onClose={() => setSettingsFor(null)} />
      <NewAccountPopUp
        isOpen={adding}
        onClose={() => setAdding(false)}
        onAddRate={(code) => setRateFor(code)}
      />
      <RatePopUp isOpen={rateFor !== undefined} onClose={() => setRateFor(undefined)} code={rateFor ?? null} />
    </div>
  )
}
