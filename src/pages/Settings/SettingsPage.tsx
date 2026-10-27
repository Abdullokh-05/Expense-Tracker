import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeftRight,
  ChevronRight,
  BellRing,
  Calculator,
  Cloud,
  Coins,
  Download,
  EyeOff,
  Globe,
  Info,
  LogOut,
  RefreshCw,
  Repeat,
  Smartphone,
  Sparkles,
  Star,
  SunMoon,
  Tags,
  Trash2,
  TriangleAlert,
  UserRound,
  Zap,
  DatabaseBackup,
} from 'lucide-react'
import type { AppLanguage, AppTheme } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useAccountStore } from '@/store/accountStore'
import { useRecurringStore } from '@/store/recurringStore'
import { useTemplateStore } from '@/store/templateStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useRatesStore } from '@/store/ratesStore'
import { reloadAllData } from '@/store/reloadAll'
import { activeAccounts } from '@/lib/accounts'
import { getCategoryName, getCategoryKind } from '@/lib/categories'
import { findCustomRate, rateBetween } from '@/lib/rates'
import { applyTheme } from '@/lib/theme'
import { formatListAmount, formatShortDate, todayDate, toDateString } from '@/lib/utils'
import { db } from '@/db/schema'
import { seedDefaultCategories } from '@/db/operations'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { processSyncQueue, migrateGuestData } from '@/services/syncService'
import { exportBackup, exportTransactionsToCSV, restoreBackup } from '@/services/backupService'
import { convertBaseCurrency } from '@/services/currencyApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { Row } from '@/components/ui/Row'
import { Switch } from '@/components/ui/Switch'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { PopUp } from '@/components/ui/PopUp'
import { ConfirmDialog } from '@/components/ui/BottomSheet'
import { toast } from '@/components/ui/Toast'
import { ProfilePopUp } from '@/components/home/ProfilePopUp'
import {
  AuthPopUp,
  BackupPopUp,
  CurrencyPopUp,
  DefaultAccountPopUp,
  RecurringPopUp,
  TemplatesPopUp,
} from '@/components/settings/SettingsPopUps'

type Panel = 'profile' | 'auth' | 'recurring' | 'templates' | 'currency' | 'defaultAccount' | 'backup' | 'shortcut' | 'erase'

const ICON = { size: 18, strokeWidth: 1.75 } as const

// A titled group of rows
const Group: React.FC<{ title: string; caption?: string; children: React.ReactNode }> = ({ title, caption, children }) => (
  <section className="flex flex-col gap-2" aria-label={title}>
    <h2 className="t-over px-1">{title}</h2>
    <div className="sgroup">{children}</div>
    {caption && <p className="sgroup-cap">{caption}</p>}
  </section>
)

// A row with its label above a control that needs the full width (segmented controls)
const ColumnRow: React.FC<{ icon: React.ReactNode; label: string; id: string; children: React.ReactNode }> = ({
  icon,
  label,
  id,
  children,
}) => (
  <div className="prow prow-col">
    <div className="flex items-center gap-3">
      <span className="prow-ico" aria-hidden="true">{icon}</span>
      <span className="prow-title" id={id}>
        <span>{label}</span>
      </span>
    </div>
    {children}
  </div>
)

// Settings tab: grouped rows; theme and language switch as they're picked
export const SettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { settings, setSettings, setCurrency, setLanguage, setTheme, setUserId } = useAppStore()
  const categories = useCategoryStore((s) => s.categories)
  const accounts = useAccountStore((s) => s.accounts)
  const recurring = useRecurringStore((s) => s.recurringTransactions)
  const templates = useTemplateStore((s) => s.templates)
  const transactions = useTransactionStore((s) => s.transactions)
  const liveRates = useRatesStore((s) => s.rates)
  const base = settings.baseCurrency

  // Home's "payments still due" and the bell link here with ?open=recurring
  const [searchParams] = useSearchParams()
  const [panel, setPanel] = useState<Panel | null>(searchParams.get('open') === 'recurring' ? 'recurring' : null)
  const close = () => setPanel(null)

  // ── Sign-in and sync (only when a sync server is set up) ──
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncQueue, setSyncQueue] = useState(0)
  const [converting, setConverting] = useState(false)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)

  const loadSync = useCallback(async () => {
    setSyncQueue(await db.syncQueue.count())
    if (!isSupabaseConfigured) return
    const { data } = await supabase.auth.getSession()
    if (data.session?.user) {
      setAuthEmail(data.session.user.email || t('settings.user'))
      setUserId(data.session.user.id)
    } else {
      setAuthEmail(null)
    }
  }, [setUserId, t])

  useEffect(() => {
    loadSync()
  }, [loadSync])

  const syncNow = async () => {
    setSyncing(true)
    try {
      const { processed } = await processSyncQueue()
      setSyncQueue(await db.syncQueue.count())
      toast.success(t('settings.synced', { count: processed }))
    } catch {
      toast.error(t('settings.syncError'))
    } finally {
      setSyncing(false)
    }
  }

  // Signing in or registering adopts the account, moves guest data to it and reloads
  const authenticate = async (email: string, password: string, register: boolean) => {
    if (!email || !password) {
      toast.error(t('settings.fillEmailPassword'))
      return
    }
    setAuthBusy(true)
    try {
      const { data, error } = register
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      if (data.user) {
        setAuthEmail(data.user.email || t('settings.user'))
        setUserId(data.user.id)
        await migrateGuestData(data.user.id)
        await reloadAllData()
        toast.success(register ? t('settings.registered') : t('settings.signedIn'))
        close()
        loadSync()
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error && e.message ? e.message : t('settings.authError'))
    } finally {
      setAuthBusy(false)
    }
  }

  const signOut = async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut()
    setAuthEmail(null)
    setUserId('guest')
    await reloadAllData()
    toast.info(t('settings.signedOut'))
    loadSync()
  }

  // ── Data ──
  const exportCSV = () => {
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

  const downloadBackup = async () => {
    try {
      await exportBackup(settings.userId, base)
      setSettings({ lastBackupAt: new Date().toISOString() })
      toast.success(t('settings.exportDone'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const restore = async () => {
    if (!restoreFile) return
    try {
      const { baseCurrency, transactionCount } = await restoreBackup(restoreFile, settings.userId)
      // Amounts in the backup are in the main currency it was made with
      if (baseCurrency !== base) setCurrency(baseCurrency)
      await reloadAllData()
      toast.success(t('settings.restoreDone', { count: transactionCount }))
      close()
    } catch {
      toast.error(t('settings.restoreInvalid'))
    }
  }

  // Stored totals and limits are in the main currency, so they're converted along with it
  const changeCurrency = async (code: string) => {
    if (code === base || converting) return
    setConverting(true)
    try {
      await convertBaseCurrency(settings.userId, base, code)
      setCurrency(code)
      await reloadAllData()
      toast.success(t('settings.currencyConverted', { currency: code }))
      close()
    } catch {
      toast.error(t('settings.currencyRatesUnavailable'))
    } finally {
      setConverting(false)
    }
  }

  const eraseEverything = async () => {
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

  const changeTheme = (theme: AppTheme) => {
    setTheme(theme)
    applyTheme(theme)
  }

  // ── What the rows show on the right ──
  const name = settings.displayName?.trim() ?? ''
  const active = activeAccounts(accounts)
  const defaultAccount = active.find((a) => a.isDefault)
  const categoryCount = categories.filter((c) => !c.parentId && !c.isArchived && getCategoryKind(c) === 'expense').length
  const foreign = active.find((a) => a.currency !== base)?.currency
  const rate = foreign ? findCustomRate(settings.customRates, foreign, base)?.rate ?? rateBetween(liveRates, foreign, base) : null
  const backupWhen = settings.lastBackupAt
    ? (() => {
        const date = new Date(settings.lastBackupAt)
        const day = toDateString(date)
        const time = date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit', hour12: false })
        return `${day === todayDate() ? t('common.today') : formatShortDate(day, i18n.language)}, ${time}`
      })()
    : undefined

  return (
    <div className="flex flex-col gap-6 w-full max-w-[640px] mx-auto">
      <PageHeader title={t('settings.title')} />

      <div className="sgroup">
        <button type="button" className="profile" onClick={() => setPanel('profile')}>
          <span className="avatar" aria-hidden="true">
            {name ? name[0].toUpperCase() : <UserRound size={24} strokeWidth={1.75} />}
          </span>
          <span className="prow-main">
            <span className="t-head">{name || t('home.guest')}</span>
            <span className="prow-sub">{authEmail ? t('sets.signedInAs', { email: authEmail }) : t('sets.guestSub')}</span>
          </span>
          <span className="prow-go" aria-hidden="true">
            <ChevronRight size={14} strokeWidth={2.25} />
          </span>
        </button>
        {!isSupabaseConfigured ? (
          <Row
            icon={<Cloud {...ICON} />}
            title={t('sets.signIn')}
            subtitle={t('sets.signInSub')}
            end={<span className="soon">{t('sets.soon')}</span>}
          />
        ) : authEmail ? (
          <>
            <Row
              icon={<RefreshCw {...ICON} className={syncing ? 'animate-spin' : undefined} />}
              title={t('settings.syncNow')}
              value={t('settings.syncQueue', { count: syncQueue })}
              onClick={syncing ? undefined : syncNow}
            />
            <Row icon={<LogOut {...ICON} />} title={t('settings.signOut')} onClick={signOut} />
          </>
        ) : (
          <Row icon={<Cloud {...ICON} />} title={t('sets.signIn')} subtitle={t('sets.signInSub')} chevron onClick={() => setPanel('auth')} />
        )}
      </div>

      <Group title={t('sets.gMoney')}>
        <Row
          icon={<Tags {...ICON} />}
          title={t('settings.categoriesLimits')}
          subtitle={t('sets.catsSub')}
          value={categoryCount}
          chevron
          to="/settings/categories"
        />
        <Row icon={<Repeat {...ICON} />} title={t('sets.recurring')} value={recurring.length} chevron onClick={() => setPanel('recurring')} />
        <Row icon={<Zap {...ICON} />} title={t('sets.templates')} value={templates.length} chevron onClick={() => setPanel('templates')} />
        <Row icon={<Coins {...ICON} />} title={t('sets.mainCurrency')} value={base} chevron onClick={() => setPanel('currency')} />
        <Row
          icon={<ArrowLeftRight {...ICON} />}
          title={t('rates.title')}
          value={foreign && rate ? `${foreign} ${formatListAmount(rate, base, base)}` : undefined}
          chevron
          onClick={() => navigate('/accounts')}
        />
      </Group>

      <Group title={t('sets.gEntry')}>
        <ColumnRow icon={<Calculator {...ICON} />} label={t('sets.amountInput')} id="set-input">
          <SegmentedControl
            label={t('sets.amountInput')}
            value={settings.amountInput ?? 'keypad'}
            onChange={(amountInput) => setSettings({ amountInput })}
            options={[
              { value: 'keypad', label: t('sets.keypad') },
              { value: 'keyboard', label: t('sets.keyboard') },
            ]}
          />
        </ColumnRow>
        <Row
          icon={<Sparkles {...ICON} />}
          title={t('sets.suggest')}
          end={
            <Switch
              checked={settings.suggestCategory !== false}
              onChange={(suggestCategory) => setSettings({ suggestCategory })}
              label={t('sets.suggest')}
            />
          }
        />
        <Row
          icon={<Star {...ICON} />}
          title={t('sets.defaultAccount')}
          value={defaultAccount?.name ?? t('sets.lastUsed')}
          chevron
          onClick={() => setPanel('defaultAccount')}
        />
      </Group>

      <Group title={t('sets.gLook')}>
        <ColumnRow icon={<SunMoon {...ICON} />} label={t('settings.theme')} id="set-theme">
          <SegmentedControl<AppTheme>
            label={t('settings.theme')}
            value={settings.theme}
            onChange={changeTheme}
            options={[
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
              { value: 'system', label: t('sets.auto') },
            ]}
          />
        </ColumnRow>
        <ColumnRow icon={<Globe {...ICON} />} label={t('settings.language')} id="set-lang">
          <SegmentedControl<AppLanguage>
            label={t('settings.language')}
            value={settings.language}
            onChange={setLanguage}
            options={[
              { value: 'en', label: 'English' },
              { value: 'ru', label: 'Русский' },
              { value: 'uz', label: "O'zbekcha" },
            ]}
          />
        </ColumnRow>
        <Row
          icon={<EyeOff {...ICON} />}
          title={t('sets.hideOnOpen')}
          end={
            <Switch
              checked={Boolean(settings.hideAmountsOnOpen)}
              onChange={(hideAmountsOnOpen) => setSettings({ hideAmountsOnOpen })}
              label={t('sets.hideOnOpen')}
            />
          }
        />
      </Group>

      <Group title={t('sets.gNotif')} caption={t('sets.notifCap')}>
        <Row
          icon={<TriangleAlert {...ICON} />}
          title={t('sets.limitAlerts')}
          subtitle={t('sets.limitAlertsSub')}
          end={
            <Switch
              checked={settings.notifyBudgetAlertEnabled}
              onChange={(notifyBudgetAlertEnabled) => setSettings({ notifyBudgetAlertEnabled })}
              label={t('sets.limitAlerts')}
            />
          }
        />
        <Row
          icon={<BellRing {...ICON} />}
          title={t('sets.paymentReminders')}
          subtitle={t('sets.paymentRemindersSub')}
          end={
            <Switch
              checked={settings.notifyPaymentsEnabled !== false}
              onChange={(notifyPaymentsEnabled) => setSettings({ notifyPaymentsEnabled })}
              label={t('sets.paymentReminders')}
            />
          }
        />
      </Group>

      <Group title={t('sets.gData')}>
        <Row icon={<Download {...ICON} />} title={t('sets.exportCsv')} subtitle={t('settings.exportCSVHint')} chevron onClick={exportCSV} />
        <Row icon={<DatabaseBackup {...ICON} />} title={t('sets.backup')} value={backupWhen} chevron onClick={() => setPanel('backup')} />
        <Row icon={<Trash2 {...ICON} />} title={t('settings.deleteData')} danger chevron onClick={() => setPanel('erase')} />
      </Group>

      <Group title={t('sets.gAbout')}>
        <Row icon={<Smartphone {...ICON} />} title={t('sets.homeScreen')} chevron onClick={() => setPanel('shortcut')} />
        <Row icon={<Info {...ICON} />} title={t('sets.version')} value={__APP_VERSION__} />
      </Group>

      <p className="t-cap text-center pb-2">{t('sets.made')}</p>

      <ProfilePopUp isOpen={panel === 'profile'} onClose={close} />
      <AuthPopUp
        isOpen={panel === 'auth'}
        onClose={close}
        busy={authBusy}
        onLogin={(email, password) => authenticate(email, password, false)}
        onRegister={(email, password) => authenticate(email, password, true)}
      />
      <RecurringPopUp isOpen={panel === 'recurring'} onClose={close} />
      <TemplatesPopUp isOpen={panel === 'templates'} onClose={close} />
      <CurrencyPopUp isOpen={panel === 'currency'} onClose={close} onPick={changeCurrency} busy={converting} />
      <DefaultAccountPopUp isOpen={panel === 'defaultAccount'} onClose={close} />
      <BackupPopUp isOpen={panel === 'backup'} onClose={close} onDownload={downloadBackup} onRestore={setRestoreFile} />
      <PopUp isOpen={panel === 'shortcut'} onClose={close} title={t('sets.homeScreen')} subtitle={t('settings.shortcutIntro')}>
        <ol className="flex flex-col gap-2 list-decimal pl-5 t-body text-ink">
          <li>{t('settings.shortcutStep1')}</li>
          <li>{t('settings.shortcutStep2')}</li>
          <li>{t('settings.shortcutStep3')}</li>
          <li>{t('settings.shortcutStep4')}</li>
        </ol>
      </PopUp>

      <ConfirmDialog
        isOpen={panel === 'erase'}
        onClose={close}
        onConfirm={eraseEverything}
        title={t('settings.deleteData')}
        description={t('settings.deleteDataWarning')}
        confirmLabel={t('settings.deleteDataConfirm')}
        danger
      />
      {/* Restoring replaces everything, so it asks first */}
      <ConfirmDialog
        isOpen={restoreFile !== null}
        onClose={() => setRestoreFile(null)}
        onConfirm={restore}
        title={t('settings.restoreConfirmTitle')}
        description={t('settings.restoreConfirmText', { file: restoreFile?.name ?? '' })}
        confirmLabel={t('settings.restore')}
        danger
      />
    </div>
  )
}
