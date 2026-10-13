import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, Banknote, ChevronRight, CreditCard, EyeOff, PiggyBank, Plus } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useAccountStore } from '@/store/accountStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useBudgetStore } from '@/store/budgetStore'
import { useConverter } from '@/store/ratesStore'
import { formatAmount } from '@/lib/utils'
import { getAccountBalances } from '@/lib/accounts'
import { getCategoryKind, getCategoryName } from '@/lib/categories'
import { AccountSheet } from '@/components/accounts/AccountSheet'
import { CategorySheet } from '@/components/categories/CategorySheet'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'
import { Button } from '@/components/ui/Button'
import type { Account, Category, CategoryKind } from '@/types'

export const AccountsPage: React.FC = () => {
  const { t } = useTranslation()
  const { settings } = useAppStore()
  const allAccounts = useAccountStore((s) => s.accounts)
  const categories = useCategoryStore((s) => s.categories)
  const transactions = useTransactionStore((s) => s.transactions)
  const budgets = useBudgetStore((s) => s.budgets)
  const convert = useConverter()

  // undefined = closed, null = adding a new one, otherwise the one being edited
  const [accountSheet, setAccountSheet] = useState<Account | null | undefined>(undefined)
  const [categorySheet, setCategorySheet] = useState<Category | null | undefined>(undefined)
  const [showTransfer, setShowTransfer] = useState(false)
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [showArchived, setShowArchived] = useState(false)

  const balances = useMemo(
    () => getAccountBalances(allAccounts, transactions, settings.baseCurrency, convert),
    [allAccounts, transactions, settings.baseCurrency, convert]
  )

  const accounts = allAccounts.filter((a) => !a.isArchived)
  const archivedAccounts = allAccounts.filter((a) => a.isArchived)
  const kindCategories = categories.filter((c) => getCategoryKind(c) === kind)
  const shownCategories = kindCategories.filter((c) => !c.isArchived)
  const archivedCategories = kindCategories.filter((c) => c.isArchived)
  const archivedCount = archivedAccounts.length + archivedCategories.length

  const hasTransactions = (account: Account) =>
    transactions.some((txn) => txn.accountId === account.id || txn.toAccountId === account.id)

  const renderAccount = (account: Account) => {
    const balance = balances[account.id] ?? 0
    const inBase = account.currency === settings.baseCurrency
      ? null
      : convert(balance, account.currency, settings.baseCurrency)
    return (
      <button
        key={account.id}
        onClick={() => setAccountSheet(account)}
        className="card p-4 text-left w-full flex items-center justify-between gap-3"
        style={{ background: 'var(--color-surface)', opacity: account.isArchived ? 0.6 : 1 }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center shrink-0 text-[var(--color-text-secondary)]">
            {account.type === 'cash' ? <Banknote size={18} /> : <CreditCard size={18} />}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-bold block truncate" style={{ color: 'var(--color-text-primary)' }}>
              {account.name}
            </span>
            <span className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {account.isWishlistFund && (
                <span className="flex items-center gap-1"><PiggyBank size={11} /> {t('accounts.wishlistFundBadge')}</span>
              )}
              {!account.includeInTotal && (
                <span className="flex items-center gap-1"><EyeOff size={11} /> {t('accounts.notCounted')}</span>
              )}
              {!account.isWishlistFund && account.includeInTotal && (
                <span>{account.type === 'cash' ? t('accounts.typeCash') : t('accounts.typeCard')}</span>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className="text-sm font-bold amount-display" style={{ color: balance < 0 ? 'var(--color-expense)' : 'var(--color-text-primary)' }}>
              {formatAmount(balance, account.currency)}
            </div>
            {inBase !== null && (
              <div className="text-[10px] amount-display" style={{ color: 'var(--color-text-muted)' }}>
                ≈ {formatAmount(inBase, settings.baseCurrency)}
              </div>
            )}
          </div>
          <ChevronRight size={16} className="text-[var(--color-text-muted)]" />
        </div>
      </button>
    )
  }

  const renderCategory = (category: Category) => {
    const limit = budgets.find((b) => b.categoryId === category.id)?.monthlyLimit ?? 0
    return (
      <button
        key={category.id}
        onClick={() => setCategorySheet(category)}
        className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] text-left"
        style={{ opacity: category.isArchived ? 0.6 : 1 }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
          <span className="text-xl leading-none">{category.icon}</span>
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
            {getCategoryName(category, t)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {limit > 0 && (
            <span className="text-[11px] amount-display" style={{ color: 'var(--color-text-muted)' }}>
              {t('accounts.limitLabel', { amount: formatAmount(limit, settings.baseCurrency) })}
            </span>
          )}
          <ChevronRight size={16} className="text-[var(--color-text-muted)]" />
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold serif-heading" style={{ color: 'var(--color-text-primary)' }}>
            {t('accounts.title')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('accounts.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button id="transfer-btn" variant="secondary" size="sm" onClick={() => setShowTransfer(true)} disabled={accounts.length < 2}>
            <ArrowLeftRight size={14} /> {t('transaction.transfer')}
          </Button>
          <Button id="add-account-btn" size="sm" onClick={() => setAccountSheet(null)}>
            <Plus size={14} /> {t('accounts.add')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ── ACCOUNTS ── */}
        <div className="lg:col-span-6 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
            {t('accounts.accountsSection')}
          </h2>
          <div className="space-y-2">{accounts.map(renderAccount)}</div>
          {showArchived && archivedAccounts.length > 0 && (
            <div className="space-y-2">{archivedAccounts.map(renderAccount)}</div>
          )}
        </div>

        {/* ── CATEGORIES ── */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
              {t('categories.title')}
            </h2>
            <Button id="add-category-btn" variant="secondary" size="sm" onClick={() => setCategorySheet(null)}>
              <Plus size={14} /> {t('common.add')}
            </Button>
          </div>

          <div className="flex p-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
            {(['expense', 'income'] as CategoryKind[]).map((k) => (
              <button
                key={k}
                id={`category-kind-${k}`}
                onClick={() => setKind(k)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  kind === k ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'
                }`}
              >
                {k === 'expense' ? t('home.outcome') : t('home.income')}
              </button>
            ))}
          </div>

          <div className="space-y-2">{shownCategories.map(renderCategory)}</div>
          {showArchived && archivedCategories.length > 0 && (
            <div className="space-y-2">{archivedCategories.map(renderCategory)}</div>
          )}
        </div>
      </div>

      {archivedCount > 0 && (
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:underline"
        >
          {showArchived ? t('accounts.hideArchived') : t('accounts.showArchived', { count: archivedCount })}
        </button>
      )}

      <AccountSheet
        isOpen={accountSheet !== undefined}
        onClose={() => setAccountSheet(undefined)}
        account={accountSheet ?? undefined}
        hasTransactions={accountSheet ? hasTransactions(accountSheet) : false}
      />

      <CategorySheet
        isOpen={categorySheet !== undefined}
        onClose={() => setCategorySheet(undefined)}
        category={categorySheet ?? undefined}
        kind={categorySheet ? getCategoryKind(categorySheet) : kind}
      />

      <AddTransactionSheet
        isOpen={showTransfer}
        onClose={() => setShowTransfer(false)}
        prefilledType="transfer"
      />
    </div>
  )
}
