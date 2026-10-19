import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useAccountStore } from '@/store/accountStore'
import { useRecurringStore } from '@/store/recurringStore'
import { useTransactionStore } from '@/store/transactionStore'
import { reloadAllData } from '@/store/reloadAll'
import { SUPPORTED_CURRENCIES, SUPPORTED_LANGUAGES } from '@/lib/constants'
import { getCategoryName } from '@/lib/categories'
import { applyTheme } from '@/lib/theme'
import { formatAmount, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BottomSheet, ConfirmDialog, Modal } from '@/components/ui/BottomSheet'
import { db } from '@/db/schema'
import { seedDefaultCategories } from '@/db/operations'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { processSyncQueue, migrateGuestData } from '@/services/syncService'
import { exportBackup, exportTransactionsToCSV, restoreBackup } from '@/services/backupService'
import { convertBaseCurrency } from '@/services/currencyApi'
import {
  Smartphone,
  Trash2,
  Globe,
  DollarSign,
  Sun,
  ChevronRight,
  Repeat,
  Clock,
  Download,
  Upload,
  Cloud,
  CloudOff,
  User,
  LogOut,
  RefreshCw,
  Pause,
  Play,
  Check,
  X,
  Tags,
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import type { AppLanguage, AppTheme } from '@/types'
import { Row, RowGroup } from '@/components/ui/Row'

export const SettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const { settings, setCurrency, setLanguage, setTheme, setUserId } = useAppStore()
  const categories = useCategoryStore((s) => s.categories)
  const accounts = useAccountStore((s) => s.accounts)
  const {
    recurringTransactions,
    toggleRecurringTransactionActive,
    removeRecurringTransaction,
  } = useRecurringStore()
  const { transactions, editTransaction } = useTransactionStore()

  // Modal controls
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showShortcutInfo, setShowShortcutInfo] = useState(false)
  // The home screen's "upcoming payments" links here with ?open=recurring
  const [searchParams] = useSearchParams()
  const [showRecurringManager, setShowRecurringManager] = useState(searchParams.get('open') === 'recurring')
  const [showPendingManager, setShowPendingManager] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [deleteRecurringId, setDeleteRecurringId] = useState<string | null>(null)

  // Auth & Sync States
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)

  // Data states
  const [isConverting, setIsConverting] = useState(false)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const restoreInputRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async () => {
    // Load sync queue count
    const queue = await db.syncQueue.count()
    setPendingSyncCount(queue)

    // Check Supabase auth session
    if (isSupabaseConfigured) {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user) {
        setAuthUserEmail(data.session.user.email || t('settings.user'))
        setUserId(data.session.user.id)
      } else {
        setAuthUserEmail(null)
      }
    }
  }, [setUserId, t])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleManualSync = async () => {
    setIsSyncing(true)
    try {
      const { processed } = await processSyncQueue()
      const queue = await db.syncQueue.count()
      setPendingSyncCount(queue)
      toast.success(t('settings.synced', { count: processed }))
    } catch {
      toast.error(t('settings.syncError'))
    } finally {
      setIsSyncing(false)
    }
  }

  // Shared by sign-in and registration: adopt the account, move guest data to it, reload
  const completeAuth = async (user: { id: string; email?: string }, successMessage: string) => {
    setAuthUserEmail(user.email || t('settings.user'))
    setUserId(user.id)
    await migrateGuestData(user.id)
    await reloadAllData()
    toast.success(successMessage)
    setShowAuthModal(false)
    loadData()
  }

  const handleLogin = async () => {
    if (!authEmail || !authPassword) {
      toast.error(t('settings.fillEmailPassword'))
      return
    }
    setIsAuthLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      })
      if (error) throw error
      if (data.user) await completeAuth(data.user, t('settings.signedIn'))
    } catch (e: any) {
      toast.error(e.message || t('settings.authError'))
    } finally {
      setIsAuthLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!authEmail || !authPassword) {
      toast.error(t('settings.fillEmailPassword'))
      return
    }
    setIsAuthLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      })
      if (error) throw error
      if (data.user) await completeAuth(data.user, t('settings.registered'))
    } catch (e: any) {
      toast.error(e.message || t('settings.authError'))
    } finally {
      setIsAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut()
    }
    setAuthUserEmail(null)
    setUserId('guest')
    await reloadAllData()
    toast.info(t('settings.signedOut'))
    loadData()
  }

  const handleExportCSV = () => {
    if (transactions.length === 0) {
      toast.info(t('settings.nothingToExport'))
      return
    }
    exportTransactionsToCSV(
      transactions,
      (categoryId) => getCategoryName(categories.find((c) => c.id === categoryId), t),
      (accountId) => accounts.find((a) => a.id === accountId)?.name ?? ''
    )
    toast.success(t('settings.exportDone'))
  }

  const handleExportBackup = async () => {
    try {
      await exportBackup(settings.userId, settings.baseCurrency)
      toast.success(t('settings.exportDone'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const handleRestoreBackup = async () => {
    if (!restoreFile) return
    try {
      const { baseCurrency, transactionCount } = await restoreBackup(restoreFile, settings.userId)
      // Amounts in the backup are expressed in the base currency it was made with
      if (baseCurrency !== settings.baseCurrency) setCurrency(baseCurrency)
      await reloadAllData()
      toast.success(t('settings.restoreDone', { count: transactionCount }))
    } catch {
      toast.error(t('settings.restoreInvalid'))
    }
  }

  const handleCurrencyChange = async (newCurrency: string) => {
    if (newCurrency === settings.baseCurrency || isConverting) return
    setIsConverting(true)
    try {
      // Existing totals and budget limits are stored in the base currency, so they have to
      // be converted along with the setting.
      await convertBaseCurrency(settings.userId, settings.baseCurrency, newCurrency)
      setCurrency(newCurrency)
      await reloadAllData()
      toast.success(t('settings.currencyConverted', { currency: newCurrency }))
    } catch {
      toast.error(t('settings.currencyRatesUnavailable'))
    } finally {
      setIsConverting(false)
    }
  }

  const handleResolvePending = async (id: string, status: 'confirmed' | 'skipped') => {
    try {
      await editTransaction(id, { status })
    } catch {
      toast.error(t('common.error'))
    }
  }

  const handleDeleteRecurring = async () => {
    if (!deleteRecurringId) return
    try {
      await removeRecurringTransaction(deleteRecurringId)
      toast.success(t('settings.recurringDeleted'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const handleClearAllData = async () => {
    try {
      await db.transactions.clear()
      await db.categories.clear()
      await db.budgets.clear()
      await db.recurringTransactions.clear()
      await db.accounts.clear()
      await db.wishlistItems.clear()
      await db.templates.clear()
      await db.chatMessages.clear()
      await db.aiInsights.clear()
      await db.syncQueue.clear()
      // A fresh start still needs categories, or nothing new could be added. Accounts and
      // income categories are re-created by ensureDefaults() when the page reloads.
      await seedDefaultCategories(settings.userId)

      window.location.reload()
    } catch {
      toast.error(t('common.error'))
    }
  }

  const handleThemeChange = (newTheme: AppTheme) => {
    setTheme(newTheme)
    applyTheme(newTheme)
  }

  const pendingTransactions = transactions.filter((txn) => txn.status === 'pending')

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-bold serif-heading" style={{ color: 'var(--color-text-primary)' }}>
          {t('settings.title')}
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('settings.subtitle')}
        </p>
      </div>

      <div className="space-y-4">

        {/* Categories moved here from Accounts; the rest of Settings is regrouped in the redesign */}
        <RowGroup>
          <Row icon={<Tags size={18} strokeWidth={1.75} />} title={t('settings.categoriesLimits')} chevron to="/settings/categories" />
        </RowGroup>

        {/* Section: Account & Cloud Sync */}
        <div className="card p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t('settings.accountAndSync')}
          </h2>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center shrink-0">
                {authUserEmail ? <User size={20} className="text-[var(--color-income)]" /> : <CloudOff size={20} className="text-[var(--color-text-muted)]" />}
              </div>
              <div className="min-w-0">
                <span className="text-sm font-semibold block truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {authUserEmail || t('settings.guest')}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {authUserEmail
                    ? t('settings.syncActive')
                    : isSupabaseConfigured
                      ? t('settings.storedLocally')
                      : t('settings.syncNotConfigured')}
                </span>
              </div>
            </div>

            {authUserEmail ? (
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl border border-[var(--color-border)] text-xs font-semibold hover:bg-[var(--color-surface-2)] transition-colors text-[var(--color-expense)] shrink-0"
                title={t('settings.signOut')}
                aria-label={t('settings.signOut')}
              >
                <LogOut size={16} />
              </button>
            ) : (
              // Without a configured backend there is nothing to sign in to
              isSupabaseConfigured && (
                <Button size="sm" onClick={() => setShowAuthModal(true)} className="shrink-0">
                  {t('settings.signIn')}
                </Button>
              )
            )}
          </div>

          {/* Sync Queue Status */}
          {authUserEmail && (
            <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <Cloud size={14} />
                <span>{t('settings.syncQueue', { count: pendingSyncCount })}</span>
              </div>
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-semibold hover:bg-[var(--color-surface-2)] transition-all"
              >
                <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                <span>{t('settings.syncNow')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Section: Data Export & Backup */}
        <div className="card p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t('settings.dataSection')}
          </h2>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <span className="text-sm font-semibold block" style={{ color: 'var(--color-text-primary)' }}>
                {t('settings.exportCSV')}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {t('settings.exportCSVHint')}
              </span>
            </div>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-all shrink-0"
            >
              <Download size={14} />
              <span>CSV</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <span className="text-sm font-semibold block" style={{ color: 'var(--color-text-primary)' }}>
                {t('settings.backup')}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {t('settings.backupHint')}
              </span>
            </div>
            <button
              id="export-backup-btn"
              onClick={handleExportBackup}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-all shrink-0"
            >
              <Download size={14} />
              <span>{t('settings.download')}</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <span className="text-sm font-semibold block" style={{ color: 'var(--color-text-primary)' }}>
                {t('settings.restore')}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {t('settings.restoreHint')}
              </span>
            </div>
            <input
              ref={restoreInputRef}
              id="restore-backup-input"
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                setRestoreFile(e.target.files?.[0] ?? null)
                // Allow picking the same file again later
                e.target.value = ''
              }}
            />
            <button
              onClick={() => restoreInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-all shrink-0"
            >
              <Upload size={14} />
              <span>{t('settings.chooseFile')}</span>
            </button>
          </div>
        </div>

        {/* Section: General Settings */}
        <div className="card p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t('settings.general')}
          </h2>

          {/* Currency */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DollarSign size={18} className="text-[var(--color-text-muted)]" />
              <span className="text-sm font-semibold">{t('settings.currency')}</span>
            </div>
            <select
              id="base-currency-select"
              value={settings.baseCurrency}
              onChange={(e) => handleCurrencyChange(e.target.value)}
              disabled={isConverting}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] disabled:opacity-50"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.code}
                </option>
              ))}
            </select>
          </div>

          {/* Language */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe size={18} className="text-[var(--color-text-muted)]" />
              <span className="text-sm font-semibold">{t('settings.language')}</span>
            </div>
            <select
              id="language-select"
              value={settings.language}
              onChange={(e) => setLanguage(e.target.value as AppLanguage)}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)]"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* Theme */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sun size={18} className="text-[var(--color-text-muted)]" />
              <span className="text-sm font-semibold">{t('settings.theme')}</span>
            </div>
            <select
              value={settings.theme}
              onChange={(e) => handleThemeChange(e.target.value as AppTheme)}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)]"
            >
              <option value="light">{t('settings.themeLight')}</option>
              <option value="dark">{t('settings.themeDark')}</option>
              <option value="system">{t('settings.themeSystem')}</option>
            </select>
          </div>
        </div>

        {/* Section: Features */}
        <div className="card p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t('settings.manage')}
          </h2>

          <button
            onClick={() => setShowRecurringManager(true)}
            className="w-full flex items-center justify-between text-left group"
          >
            <div className="flex items-center gap-3">
              <Repeat size={18} className="text-[var(--color-text-muted)]" />
              <span className="text-sm font-semibold">{t('settings.recurring')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {recurringTransactions.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 bg-[var(--color-surface-2)] rounded-full">
                  {recurringTransactions.length}
                </span>
              )}
              <ChevronRight size={18} className="text-[var(--color-text-muted)]" />
            </div>
          </button>

          <button
            onClick={() => setShowPendingManager(true)}
            className="w-full flex items-center justify-between text-left group"
          >
            <div className="flex items-center gap-3">
              <Clock size={18} className="text-[var(--color-text-muted)]" />
              <span className="text-sm font-semibold">{t('settings.pendingConfirmation')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {pendingTransactions.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-[var(--color-expense)] text-white rounded-full">
                  {pendingTransactions.length}
                </span>
              )}
              <ChevronRight size={18} className="text-[var(--color-text-muted)]" />
            </div>
          </button>

          <button
            onClick={() => setShowShortcutInfo(true)}
            className="w-full flex items-center justify-between text-left group"
          >
            <div className="flex items-center gap-3">
              <Smartphone size={18} className="text-[var(--color-text-muted)]" />
              <span className="text-sm font-semibold">{t('settings.quickAccess')}</span>
            </div>
            <ChevronRight size={18} className="text-[var(--color-text-muted)]" />
          </button>
        </div>

        {/* Section: Danger Zone */}
        <div className="card p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-expense)]">
            {t('settings.dangerZone')}
          </h2>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center gap-3 text-left font-semibold text-[var(--color-expense)] hover:opacity-80 transition-opacity"
          >
            <Trash2 size={18} />
            <span className="text-sm">{t('settings.deleteData')}</span>
          </button>
        </div>

      </div>

      {/* Supabase Auth Modal */}
      <Modal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title={t('settings.authTitle')}
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {t('settings.authHint')}
          </p>
          <Input
            id="auth-email-input"
            type="email"
            label="Email"
            placeholder="your@email.com"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
          />
          <Input
            id="auth-password-input"
            type="password"
            label={t('settings.password')}
            placeholder="••••••••"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="ghost" onClick={handleLogin} loading={isAuthLoading}>
              {t('settings.logIn')}
            </Button>
            <Button onClick={handleRegister} loading={isAuthLoading}>
              {t('settings.register')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Recurring Manager Sheet */}
      <BottomSheet
        isOpen={showRecurringManager}
        onClose={() => setShowRecurringManager(false)}
        title={t('settings.recurring')}
      >
        <div className="space-y-3">
          {recurringTransactions.length === 0 ? (
            <p className="text-sm text-center text-[var(--color-text-muted)] py-8">{t('settings.noRecurring')}</p>
          ) : (
            recurringTransactions.map((rt) => (
              <div key={rt.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <div className="min-w-0">
                  <span className="text-sm font-semibold block truncate">
                    {rt.note || getCategoryName(categories.find((c) => c.id === rt.categoryId), t)}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)] block">
                    {t(`transaction.${rt.frequency}`)} · {formatAmount(rt.amount, rt.currency)}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-muted)] block">
                    {rt.isActive
                      ? t('settings.nextRun', { date: formatDate(rt.nextRunDate, i18n.language) })
                      : t('settings.recurringPaused')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => toggleRecurringTransactionActive(rt.id, !rt.isActive)}
                    className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    aria-label={rt.isActive ? t('settings.pause') : t('settings.resume')}
                    title={rt.isActive ? t('settings.pause') : t('settings.resume')}
                  >
                    {rt.isActive ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button
                    onClick={() => setDeleteRecurringId(rt.id)}
                    className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-expense)]"
                    aria-label={t('common.delete')}
                    title={t('common.delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </BottomSheet>

      {/* Pending Manager Sheet */}
      <BottomSheet
        isOpen={showPendingManager}
        onClose={() => setShowPendingManager(false)}
        title={t('settings.pendingConfirmation')}
      >
        <div className="space-y-3">
          {pendingTransactions.length === 0 ? (
            <p className="text-sm text-center text-[var(--color-text-muted)] py-8">{t('settings.noPending')}</p>
          ) : (
            pendingTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <div className="min-w-0">
                  <span className="text-sm font-semibold block truncate">
                    {tx.note || getCategoryName(categories.find((c) => c.id === tx.categoryId), t)}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {formatDate(tx.date, i18n.language)} · {formatAmount(tx.amount, tx.currency)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleResolvePending(tx.id, 'confirmed')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-bg)]"
                  >
                    <Check size={13} /> {t('transaction.confirm')}
                  </button>
                  <button
                    onClick={() => handleResolvePending(tx.id, 'skipped')}
                    className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
                    aria-label={t('transaction.skip')}
                    title={t('transaction.skip')}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </BottomSheet>

      {/* Shortcut Info Sheet */}
      <BottomSheet
        isOpen={showShortcutInfo}
        onClose={() => setShowShortcutInfo(false)}
        title={t('settings.quickAccess')}
      >
        <div className="space-y-4 text-sm text-[var(--color-text-secondary)]">
          <p>{t('settings.shortcutIntro')}</p>
          <ol className="list-decimal list-inside space-y-2">
            <li>{t('settings.shortcutStep1')}</li>
            <li>{t('settings.shortcutStep2')}</li>
            <li>{t('settings.shortcutStep3')}</li>
            <li>{t('settings.shortcutStep4')}</li>
          </ol>
        </div>
      </BottomSheet>

      {/* Danger Confirm Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleClearAllData}
        title={t('settings.deleteData')}
        description={t('settings.deleteDataWarning')}
        confirmLabel={t('settings.deleteDataConfirm')}
        danger
      />

      {/* Restore replaces everything, so it asks first */}
      <ConfirmDialog
        isOpen={restoreFile !== null}
        onClose={() => setRestoreFile(null)}
        onConfirm={handleRestoreBackup}
        title={t('settings.restoreConfirmTitle')}
        description={t('settings.restoreConfirmText', { file: restoreFile?.name ?? '' })}
        confirmLabel={t('settings.restore')}
        danger
      />

      <ConfirmDialog
        isOpen={deleteRecurringId !== null}
        onClose={() => setDeleteRecurringId(null)}
        onConfirm={handleDeleteRecurring}
        title={t('settings.deleteRecurringTitle')}
        description={t('settings.deleteRecurringText')}
        confirmLabel={t('common.delete')}
        danger
      />

    </div>
  )
}
