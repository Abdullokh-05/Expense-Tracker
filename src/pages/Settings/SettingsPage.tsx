import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useRecurringStore } from '@/store/recurringStore'
import { useTransactionStore } from '@/store/transactionStore'
import { SUPPORTED_CURRENCIES, SUPPORTED_LANGUAGES } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BottomSheet, ConfirmDialog, Modal } from '@/components/ui/BottomSheet'
import { db } from '@/db/schema'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { processSyncQueue, migrateGuestData, exportTransactionsToCSV } from '@/services/syncService'
import {
  Smartphone,
  FolderOpen,
  Trash2,
  Globe,
  DollarSign,
  Sun,
  Brain,
  ChevronRight,
  Plus,
  Archive,
  Repeat,
  Clock,
  Download,
  Cloud,
  CloudOff,
  User,
  LogOut,
  RefreshCw
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import type { AppLanguage, AppTheme } from '@/types'

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation()
  const { settings, setCurrency, setLanguage, setTheme, setAIEnabled, setUserId } = useAppStore()
  const { categories, loadCategories, addCategory, archiveCategoryById } = useCategoryStore()
  const {
    recurringTransactions,
    loadRecurringTransactions,
  } = useRecurringStore()
  const { transactions, loadTransactions } = useTransactionStore()

  // Modal controls
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Auth & Sync States
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)

  // Category form state
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('🍕')
  const newCatColor = '#ef4444'

  const loadData = useCallback(async () => {
    await Promise.all([
      loadCategories(),
      loadRecurringTransactions(),
      loadTransactions(),
    ])

    // Load sync queue count
    const queue = await db.syncQueue.count()
    setPendingSyncCount(queue)

    // Check Supabase auth session
    if (isSupabaseConfigured) {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user) {
        setAuthUserEmail(data.session.user.email || 'Пользователь')
        setUserId(data.session.user.id)
      } else {
        setAuthUserEmail(null)
      }
    }
  }, [loadCategories, loadRecurringTransactions, loadTransactions, setUserId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleManualSync = async () => {
    setIsSyncing(true)
    try {
      const { processed } = await processSyncQueue()
      const queue = await db.syncQueue.count()
      setPendingSyncCount(queue)
      toast.success(`Синхронизировано: ${processed} записей`)
    } catch {
      toast.error('Ошибка синхронизации')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleLogin = async () => {
    if (!authEmail || !authPassword) {
      toast.error('Заполните email и пароль')
      return
    }
    setIsAuthLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      })
      if (error) throw error
      if (data.user) {
        setAuthUserEmail(data.user.email || 'Пользователь')
        setUserId(data.user.id)
        await migrateGuestData(data.user.id)
        toast.success('Успешный вход! Данные синхронизированы.')
        setShowAuthModal(false)
        loadData()
      }
    } catch (e: any) {
      toast.error(e.message || 'Ошибка входа')
    } finally {
      setIsAuthLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!authEmail || !authPassword) {
      toast.error('Заполните email и пароль')
      return
    }
    setIsAuthLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      })
      if (error) throw error
      if (data.user) {
        setAuthUserEmail(data.user.email || 'Пользователь')
        setUserId(data.user.id)
        await migrateGuestData(data.user.id)
        toast.success('Регистрация успешна! Данные привязаны.')
        setShowAuthModal(false)
        loadData()
      }
    } catch (e: any) {
      toast.error(e.message || 'Ошибка регистрации')
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
    toast.info('Вы вышли из аккаунта')
    loadData()
  }

  const handleExportCSV = () => {
    exportTransactionsToCSV(transactions)
    toast.success('Файл CSV успешно скачан')
  }

  const handleArchiveCategory = async (id: string) => {
    try {
      await archiveCategoryById(id)
      toast.success(t('categories.archived'))
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
      await db.chatMessages.clear()
      await db.aiInsights.clear()
      await db.syncQueue.clear()
      
      toast.success(t('settings.deleteDataConfirm'))
      window.location.reload()
    } catch {
      toast.error(t('common.error'))
    }
  }

  const applyTheme = (themeValue: AppTheme) => {
    const isDark =
      themeValue === 'dark' ||
      (themeValue === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const handleThemeChange = (newTheme: AppTheme) => {
    setTheme(newTheme)
    applyTheme(newTheme)
  }

  const [showAddCategory, setShowAddCategory] = useState(false)
  const [showShortcutInfo, setShowShortcutInfo] = useState(false)
  const [showRecurringManager, setShowRecurringManager] = useState(false)
  const [showPendingManager, setShowPendingManager] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  const activeCategories = categories.filter(c => !c.isArchived)
  const pendingTransactions = transactions.filter((t) => t.status === 'pending')

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-bold serif-heading" style={{ color: 'var(--color-text-primary)' }}>
          {t('settings.title')}
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Управление аккаунтом, синхронизацией и параметрами
        </p>
      </div>

      <div className="space-y-4">
        
        {/* Section: Account & Cloud Sync */}
        <div className="card p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            Аккаунт и Синхронизация
          </h2>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center">
                {authUserEmail ? <User size={20} className="text-[var(--color-income)]" /> : <CloudOff size={20} className="text-[var(--color-text-muted)]" />}
              </div>
              <div>
                <span className="text-sm font-semibold block" style={{ color: 'var(--color-text-primary)' }}>
                  {authUserEmail || 'Гостевой режим (офлайн)'}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {authUserEmail ? 'Облачная синхронизация активна' : 'Данные хранятся локально в браузере'}
                </span>
              </div>
            </div>

            {authUserEmail ? (
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl border border-[var(--color-border)] text-xs font-semibold hover:bg-[var(--color-surface-2)] transition-colors text-[var(--color-expense)]"
                title="Выйти из аккаунта"
              >
                <LogOut size={16} />
              </button>
            ) : (
              <Button size="sm" onClick={() => setShowAuthModal(true)}>
                Войти / Создать аккаунт
              </Button>
            )}
          </div>

          {/* Sync Queue Status */}
          {authUserEmail && (
            <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <Cloud size={14} />
                <span>Очередь синхронизации: {pendingSyncCount} записей</span>
              </div>
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-semibold hover:bg-[var(--color-surface-2)] transition-all"
              >
                <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                <span>Синхронизировать</span>
              </button>
            </div>
          )}
        </div>

        {/* Section: Data Export */}
        <div className="card p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            Экспорт данных
          </h2>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-semibold block" style={{ color: 'var(--color-text-primary)' }}>
                Экспорт расходов в CSV
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                Скачайте готовую табличную выписку всех транзакций
              </span>
            </div>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-all"
            >
              <Download size={14} />
              <span>Скачать CSV</span>
            </button>
          </div>
        </div>

        {/* Section: General Settings */}
        <div className="card p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            Общие настройки
          </h2>

          {/* Currency */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DollarSign size={18} className="text-[var(--color-text-muted)]" />
              <span className="text-sm font-semibold">{t('settings.currency')}</span>
            </div>
            <select
              value={settings.baseCurrency}
              onChange={(e) => setCurrency(e.target.value)}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)]"
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
            Управление объектами
          </h2>

          <button
            onClick={() => setShowCategoryManager(true)}
            className="w-full flex items-center justify-between text-left group"
          >
            <div className="flex items-center gap-3">
              <FolderOpen size={18} className="text-[var(--color-text-muted)]" />
              <span className="text-sm font-semibold">{t('settings.categories')}</span>
            </div>
            <ChevronRight size={18} className="text-[var(--color-text-muted)]" />
          </button>

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

        {/* Section: AI Privacy Toggle */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain size={18} className="text-[var(--color-text-muted)]" />
              <span className="text-sm font-semibold">{t('settings.aiFeatures')}</span>
            </div>
            <input
              type="checkbox"
              checked={settings.aiEnabled}
              onChange={(e) => setAIEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--color-border)]"
            />
          </div>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            {t('settings.aiPrivacyNote')}
          </p>
        </div>

        {/* Section: Danger Zone */}
        <div className="card p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-expense)]">
            Сброс данных
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
        title="Вход / Регистрация Supabase"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Привяжите ваш аккаунт Supabase для синхронизации данных между устройствами.
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
            label="Пароль"
            placeholder="••••••••"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="ghost" onClick={handleLogin} loading={isAuthLoading}>
              Войти
            </Button>
            <Button onClick={handleRegister} loading={isAuthLoading}>
              Регистрация
            </Button>
          </div>
        </div>
      </Modal>

      {/* Category Manager Sheet */}
      <BottomSheet
        isOpen={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
        title={t('settings.categories')}
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
              {activeCategories.length} активных
            </span>
            <Button size="sm" onClick={() => setShowAddCategory(true)}>
              <Plus size={14} className="mr-1" /> Добавить
            </Button>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {activeCategories.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{c.icon}</span>
                  <span className="text-sm font-semibold">{c.name}</span>
                </div>
                {!c.isDefault && (
                  <button onClick={() => handleArchiveCategory(c.id)} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-expense)] rounded-lg">
                    <Archive size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </BottomSheet>

      {/* Danger Confirm Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleClearAllData}
        title={t('settings.deleteData')}
        description={t('settings.deleteDataConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
      />

      {/* Add Category Sheet */}
      <BottomSheet
        isOpen={showAddCategory}
        onClose={() => setShowAddCategory(false)}
        title="Новая категория"
      >
        <div className="space-y-4">
          <Input
            id="new-cat-name"
            label="Название"
            placeholder="Например: Кофе"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
          />
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-muted)] mb-2 block">Иконка</label>
            <div className="flex flex-wrap gap-2">
              {['🍕','🚗','🏠','🎮','💊','📱','✈️','🛍️','📚','🎵','🐾','💡'].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => setNewCatIcon(emoji)}
                  className={`text-xl p-2 rounded-xl border transition-all ${newCatIcon === emoji ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]' : 'border-[var(--color-border)]'}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowAddCategory(false)}>Отмена</Button>
            <Button onClick={async () => {
              if (!newCatName.trim()) { toast.error('Введите название'); return }
              await addCategory({ userId: settings.userId, name: newCatName.trim(), icon: newCatIcon, color: newCatColor, isArchived: false })
              setNewCatName(''); setShowAddCategory(false); toast.success('Категория добавлена')
            }}>Добавить</Button>
          </div>
        </div>
      </BottomSheet>

      {/* Recurring Manager Sheet */}
      <BottomSheet
        isOpen={showRecurringManager}
        onClose={() => setShowRecurringManager(false)}
        title={t('settings.recurring')}
      >
        <div className="space-y-3">
          {recurringTransactions.length === 0 ? (
            <p className="text-sm text-center text-[var(--color-text-muted)] py-8">Нет повторяющихся транзакций</p>
          ) : (
            recurringTransactions.map((rt) => (
              <div key={rt.id} className="flex items-center justify-between p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <div>
                  <span className="text-sm font-semibold block">{rt.note || 'Без названия'}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{rt.frequency} · {rt.amount} {rt.currency}</span>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${rt.isActive ? 'bg-[var(--color-income)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-text-muted)]'}`}>
                  {rt.isActive ? 'Активна' : 'Пауза'}
                </span>
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
            <p className="text-sm text-center text-[var(--color-text-muted)] py-8">Нет ожидающих транзакций</p>
          ) : (
            pendingTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <div>
                  <span className="text-sm font-semibold block">{tx.note || 'Без описания'}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{tx.date} · {tx.amount} {tx.currency}</span>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-500/20 text-amber-400">Pending</span>
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
          <p>Чтобы добавить ярлык быстрого добавления на главный экран:</p>
          <ol className="list-decimal list-inside space-y-2">
            <li>Откройте приложение в браузере Safari (iOS) или Chrome (Android).</li>
            <li>Нажмите кнопку «Поделиться» / меню браузера.</li>
            <li>Выберите «На экран «Домой»» / «Добавить на главный экран».</li>
            <li>Приложение будет работать как нативное, без браузерной строки.</li>
          </ol>
        </div>
      </BottomSheet>

    </div>
  )
}
