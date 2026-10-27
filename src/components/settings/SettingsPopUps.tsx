import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Download, Trash2, Upload } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useAccountStore } from '@/store/accountStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useTemplateStore } from '@/store/templateStore'
import { activeAccounts } from '@/lib/accounts'
import { getCategoryName } from '@/lib/categories'
import { currencyName } from '@/lib/rates'
import { formatListAmount } from '@/lib/utils'
import { SUPPORTED_CURRENCIES } from '@/lib/constants'
import { PopUp } from '@/components/ui/PopUp'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'

interface PopUpProps {
  isOpen: boolean
  onClose: () => void
}

const Bubble: React.FC<{ categoryId: string | null }> = ({ categoryId }) => {
  const category = useCategoryStore((s) => s.categories.find((c) => c.id === categoryId))
  return (
    <span className="bub" style={{ '--c': category?.color ?? '#8E8E93' } as React.CSSProperties} aria-hidden="true">
      {category?.icon ?? '📦'}
    </span>
  )
}

// ── Quick templates: made from the add screen, removed here ──
export const TemplatesPopUp: React.FC<PopUpProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const categories = useCategoryStore((s) => s.categories)
  const accounts = useAccountStore((s) => s.accounts)
  const { templates, removeTemplate } = useTemplateStore()

  const remove = async (id: string) => {
    try {
      await removeTemplate(id)
      toast.success(t('sets.templateRemoved'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  return (
    <PopUp isOpen={isOpen} onClose={onClose} title={t('sets.templates')} subtitle={t('sets.templatesSub')}>
      {templates.length === 0 ? (
        <p className="t-sub">{t('sets.noTemplates')}</p>
      ) : (
        <div className="plist">
          {templates.map((template) => {
            const account = accounts.find((a) => a.id === template.accountId)
            const name = template.note || getCategoryName(categories.find((c) => c.id === template.categoryId), t)
            const isIncome = template.type === 'income'
            return (
              <div key={template.id} className="prow">
                <Bubble categoryId={template.categoryId} />
                <span className="prow-main">
                  <span className="prow-title">
                    <span>{name}</span>
                  </span>
                  <span className="prow-sub">
                    {[
                      formatListAmount(isIncome ? template.amount : -template.amount, account?.currency ?? base, base, isIncome),
                      account?.name,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <button type="button" className="iconbtn danger" aria-label={`${t('common.delete')}: ${name}`} onClick={() => remove(template.id)}>
                  <Trash2 size={18} strokeWidth={1.75} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </PopUp>
  )
}

interface ChoiceRowProps {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}

// A row in a one-of-many list, ticked when chosen
const ChoiceRow: React.FC<ChoiceRowProps> = ({ selected, onClick, children }) => (
  <button type="button" role="radio" aria-checked={selected} className="prow" onClick={onClick}>
    {children}
    <span className={`shrink-0 ${selected ? 'text-accent-text' : 'invisible'}`} aria-hidden="true">
      <Check size={20} strokeWidth={2} />
    </span>
  </button>
)

// ── Main currency: everything is shown in it; changing it converts what's recorded ──
export const CurrencyPopUp: React.FC<PopUpProps & { onPick: (code: string) => void; busy: boolean }> = ({
  isOpen,
  onClose,
  onPick,
  busy,
}) => {
  const { t, i18n } = useTranslation()
  const base = useAppStore((s) => s.settings.baseCurrency)
  return (
    <PopUp isOpen={isOpen} onClose={onClose} title={t('sets.mainCurrency')} subtitle={t('sets.mainCurrencySub')}>
      <div className="plist" role="radiogroup" aria-label={t('sets.mainCurrency')} aria-busy={busy}>
        {SUPPORTED_CURRENCIES.map(({ code }) => (
          <ChoiceRow key={code} selected={code === base} onClick={() => !busy && onPick(code)}>
            <span className="prow-ico bg-fill" aria-hidden="true">
              <span className="cbadge">{code}</span>
            </span>
            <span className="prow-main">
              <span className="prow-title">
                <span>{currencyName(code, i18n.language)}</span>
              </span>
            </span>
          </ChoiceRow>
        ))}
      </div>
    </PopUp>
  )
}

// ── Default account: where new entries start ──
export const DefaultAccountPopUp: React.FC<PopUpProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const accounts = useAccountStore((s) => s.accounts)
  const setDefaultAccount = useAccountStore((s) => s.setDefaultAccount)
  const active = activeAccounts(accounts)
  const current = active.find((a) => a.isDefault)?.id ?? null

  const pick = async (id: string | null) => {
    try {
      await setDefaultAccount(id)
      onClose()
    } catch {
      toast.error(t('common.error'))
    }
  }

  return (
    <PopUp isOpen={isOpen} onClose={onClose} title={t('sets.defaultAccount')} subtitle={t('sets.defaultAccountSub')}>
      <div className="plist" role="radiogroup" aria-label={t('sets.defaultAccount')}>
        <ChoiceRow selected={current === null} onClick={() => pick(null)}>
          <span className="prow-main">
            <span className="prow-title">
              <span>{t('sets.lastUsed')}</span>
            </span>
          </span>
        </ChoiceRow>
        {active.map((account) => (
          <ChoiceRow key={account.id} selected={current === account.id} onClick={() => pick(account.id)}>
            <span className="prow-main">
              <span className="prow-title">
                <span>{account.name}</span>
              </span>
              <span className="prow-sub">{account.currency}</span>
            </span>
          </ChoiceRow>
        ))}
      </div>
    </PopUp>
  )
}

// ── Back up and restore: one file with everything ──
export const BackupPopUp: React.FC<PopUpProps & { onDownload: () => void; onRestore: (file: File) => void }> = ({
  isOpen,
  onClose,
  onDownload,
  onRestore,
}) => {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <PopUp
      isOpen={isOpen}
      onClose={onClose}
      title={t('sets.backup')}
      subtitle={t('settings.backupHint')}
      footerStack
      footer={
        <>
          <Button size="lg" fullWidth onClick={onDownload}>
            <Download size={18} strokeWidth={1.75} aria-hidden="true" />
            {t('sets.downloadBackup')}
          </Button>
          <Button variant="secondary" size="lg" fullWidth onClick={() => fileRef.current?.click()}>
            <Upload size={18} strokeWidth={1.75} aria-hidden="true" />
            {t('sets.restoreFromFile')}
          </Button>
        </>
      }
    >
      <p className="t-sub">{t('settings.restoreHint')}</p>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Lets the same file be picked again later
          e.target.value = ''
          if (file) onRestore(file)
        }}
      />
    </PopUp>
  )
}

// ── Sign in or register (only offered when sync is set up) ──
export const AuthPopUp: React.FC<
  PopUpProps & { busy: boolean; onLogin: (email: string, password: string) => void; onRegister: (email: string, password: string) => void }
> = ({ isOpen, onClose, busy, onLogin, onRegister }) => {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return (
    <PopUp
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings.authTitle')}
      subtitle={t('settings.authHint')}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={() => onLogin(email, password)} loading={busy}>
            {t('settings.logIn')}
          </Button>
          <Button size="lg" fullWidth onClick={() => onRegister(email, password)} loading={busy}>
            {t('settings.register')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="field">
          <span className="field-label">{t('sets.email')}</span>
          <span className="input">
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </span>
        </label>
        <label className="field">
          <span className="field-label">{t('settings.password')}</span>
          <span className="input">
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </span>
        </label>
      </div>
    </PopUp>
  )
}
