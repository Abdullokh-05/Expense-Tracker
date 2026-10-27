import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, Pause, Play, Trash2 } from 'lucide-react'
import type { CategoryKind, RecurringFrequency, RecurringTransaction } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useAccountStore } from '@/store/accountStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useRecurringStore } from '@/store/recurringStore'
import { getCategoryKind, getCategoryName, sortCategories, subcategoriesOf } from '@/lib/categories'
import { remindLead } from '@/lib/notifications'
import { addToCalendar } from '@/lib/calendar'
import { FREQUENCIES } from '@/lib/upcoming'
import { advanceByFrequency, currencySymbol, formatListAmount, parseMoneyInput, sanitizeMoneyInput, todayDate } from '@/lib/utils'
import { PopUp } from '@/components/ui/PopUp'
import { ConfirmDialog } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Switch } from '@/components/ui/Switch'
import { toast } from '@/components/ui/Toast'

// The reminder choices, in days before the payment (null: none)
const REMINDERS: (number | null)[] = [null, 0, 1, 2, 3, 7]

interface PlannedPaymentPopUpProps {
  isOpen: boolean
  onClose: () => void
  // Edits this one; without it a new planned payment is added
  payment?: RecurringTransaction
}

// One planned payment: what, how much, from which account, how often, from which day, whether
// the app records it by itself or asks first, and how early to remind of it.
export const PlannedPaymentPopUp: React.FC<PlannedPaymentPopUpProps> = ({ isOpen, onClose, payment }) => {
  const { t } = useTranslation()
  const settings = useAppStore((s) => s.settings)
  const allAccounts = useAccountStore((s) => s.accounts)
  const categories = useCategoryStore((s) => s.categories)
  const { addRecurringTransaction, editRecurringTransaction, toggleRecurringTransactionActive, removeRecurringTransaction } = useRecurringStore()

  const [kind, setKind] = useState<CategoryKind>('expense')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  // "parentId" or "parentId/subId"
  const [categoryKey, setCategoryKey] = useState('')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [date, setDate] = useState(todayDate())
  const [autoCreate, setAutoCreate] = useState(true)
  const [remind, setRemind] = useState<number | null>(1)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const accounts = allAccounts.filter((a) => !a.isArchived || a.id === payment?.accountId)

  useEffect(() => {
    if (!isOpen) return
    setKind(payment?.type === 'income' ? 'income' : 'expense')
    setName(payment?.note ?? '')
    setAmount(payment ? String(payment.amount) : '')
    // New ones leave the account for the day itself: who knows what's in which account then
    setAccountId(payment?.accountId ?? '')
    setCategoryKey(payment?.categoryId ? (payment.subcategoryId ? `${payment.categoryId}/${payment.subcategoryId}` : payment.categoryId) : '')
    setFrequency(payment?.frequency ?? 'monthly')
    setDate(payment?.nextRunDate ?? todayDate())
    setAutoCreate(payment?.autoCreate ?? false)
    setRemind(payment ? remindLead(payment) : 1)
    setDeleting(false)
  }, [isOpen, payment]) // oxlint-disable-line react-hooks/exhaustive-deps -- reset only when it opens

  const account = accounts.find((a) => a.id === accountId)
  const currency = account?.currency ?? settings.baseCurrency
  const parsed = parseMoneyInput(amount, { allowNegative: false })
  const [categoryId, subcategoryId] = categoryKey.split('/')
  const category = categories.find((c) => c.id === categoryId)
  const title = name.trim() || (category ? getCategoryName(categories.find((c) => c.id === (subcategoryId || categoryId)), t) : '')
  const kindCategories = sortCategories(categories.filter((c) => !c.parentId && !c.isArchived && getCategoryKind(c) === kind))

  const reminderLabel = (days: number | null) =>
    days === null ? t('planned.noReminder') : days === 0 ? t('planned.onTheDay') : t('planned.daysBefore', { count: days })

  const save = async () => {
    if (!parsed || parsed <= 0) {
      toast.error(t('transaction.amountRequired'))
      return
    }
    if (!categoryId && !name.trim()) {
      toast.error(t('planned.nameOrCategory'))
      return
    }
    setSaving(true)
    // A day already past moves on to the next one due, rather than filling in every payment
    // since then (a subscription started a year ago would add twelve)
    const today = todayDate()
    let nextRunDate = date
    while (nextRunDate < today) nextRunDate = advanceByFrequency(nextRunDate, frequency)
    const fields = {
      type: kind,
      amount: parsed,
      currency,
      categoryId: categoryId || null,
      subcategoryId: subcategoryId || null,
      accountId: account?.id ?? null,
      note: name.trim() || null,
      frequency,
      nextRunDate,
      // Recording by itself needs an account to record to
      autoCreate: account ? autoCreate : false,
      remindDaysBefore: remind,
    }
    try {
      if (payment) await editRecurringTransaction(payment.id, fields)
      else await addRecurringTransaction({ ...fields, userId: settings.userId, isActive: true })
      toast.success(payment ? t('settings.saved') : t('planned.added'))
      onClose()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const calendar = () =>
    addToCalendar({
      id: payment?.id ?? `${Date.now()}`,
      title,
      details: [
        parsed ? formatListAmount(kind === 'income' ? parsed : -parsed, currency, settings.baseCurrency, kind === 'income') : '',
        account?.name,
      ]
        .filter(Boolean)
        .join(' · '),
      date,
      frequency,
      remindDaysBefore: remind,
    })

  return (
    <>
      <PopUp
        isOpen={isOpen}
        onClose={onClose}
        title={payment ? t('planned.editTitle') : t('planned.newTitle')}
        subtitle={payment && !payment.isActive ? t('settings.recurringPaused') : undefined}
        footer={
          <Button size="lg" fullWidth onClick={save} loading={saving}>
            {t('common.save')}
          </Button>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <SegmentedControl<CategoryKind>
            label={t('add.typeGroup')}
            value={kind}
            onChange={(next) => {
              setKind(next)
              setCategoryKey('')
            }}
            options={[
              { value: 'expense', label: t('transaction.expense') },
              { value: 'income', label: t('transaction.income') },
            ]}
          />

          <label className="field">
            <span className="field-label">{t('planned.name')}</span>
            <span className="input">
              <input value={name} maxLength={60} placeholder={t('planned.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
            </span>
          </label>

          <label className="field">
            <span className="field-label">{t('transaction.amount')}</span>
            <span className="input">
              <input inputMode="decimal" value={amount} placeholder="0" onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value))} />
              <span className="suffix" aria-hidden="true">{currencySymbol(currency).symbol}</span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span className="field-label">{kind === 'income' ? t('transaction.incomeSource') : t('transaction.category')}</span>
              <span className="input">
                <select value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}>
                  <option value="">{t('add.decideLater')}</option>
                  {kindCategories.map((c) => {
                    const subs = subcategoriesOf(categories, c.id)
                    const own = (
                      <option key={c.id} value={c.id}>
                        {c.icon} {getCategoryName(c, t)}
                      </option>
                    )
                    return subs.length === 0 ? (
                      own
                    ) : (
                      <optgroup key={c.id} label={getCategoryName(c, t)}>
                        {own}
                        {subs.map((sub) => (
                          <option key={sub.id} value={`${c.id}/${sub.id}`}>
                            {sub.icon} {getCategoryName(sub, t)}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
              </span>
            </label>
            <label className="field">
              <span className="field-label">{t('transaction.account')}</span>
              <span className="input">
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">{t('planned.accountOnDay')}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </div>

          <div className="field">
            <span className="field-label">{t('add.howOften')}</span>
            <SegmentedControl<RecurringFrequency>
              label={t('add.howOften')}
              value={frequency}
              onChange={setFrequency}
              options={FREQUENCIES.map((f) => ({ value: f, label: t(`planned.unit_${f}`) }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span className="field-label">{payment ? t('planned.nextDate') : t('planned.firstDate')}</span>
              <span className="input">
                <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              </span>
            </label>
            <label className="field">
              <span className="field-label">{t('planned.remind')}</span>
              <span className="input">
                <select value={remind === null ? 'off' : String(remind)} onChange={(e) => setRemind(e.target.value === 'off' ? null : Number(e.target.value))}>
                  {REMINDERS.map((days) => (
                    <option key={String(days)} value={days === null ? 'off' : String(days)}>
                      {reminderLabel(days)}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </div>

          <div className="pbox">
            <div className="prow">
              <span className="prow-main">
                <span className="prow-title">
                  <span>{t('planned.recordItself')}</span>
                </span>
                <span className="prow-sub">
                  {!account ? t('planned.recordNeedsAccount') : autoCreate ? t('planned.recordItselfOn') : t('planned.recordItselfOff')}
                </span>
              </span>
              <Switch checked={Boolean(account) && autoCreate} onChange={setAutoCreate} label={t('planned.recordItself')} disabled={!account} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <button type="button" className="btn ghost self-center" onClick={calendar} disabled={!title}>
              <CalendarPlus size={18} strokeWidth={1.75} aria-hidden="true" />
              {t('planned.addToCalendar')}
            </button>
            <span className="t-cap text-center">{t('planned.calendarHint')}</span>
          </div>

          {payment && (
            <div className="flex flex-wrap justify-center gap-x-2">
              <button
                type="button"
                className="btn ghost"
                onClick={async () => {
                  await toggleRecurringTransactionActive(payment.id, !payment.isActive)
                  onClose()
                }}
              >
                {payment.isActive ? <Pause size={18} strokeWidth={1.75} aria-hidden="true" /> : <Play size={18} strokeWidth={1.75} aria-hidden="true" />}
                {payment.isActive ? t('settings.pause') : t('settings.resume')}
              </button>
              <button type="button" className="btn ghost text-danger-text" onClick={() => setDeleting(true)}>
                <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
                {t('common.delete')}
              </button>
            </div>
          )}
        </form>
      </PopUp>

      <ConfirmDialog
        isOpen={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          if (!payment) return
          try {
            await removeRecurringTransaction(payment.id)
            toast.success(t('settings.recurringDeleted'))
            onClose()
          } catch {
            toast.error(t('common.error'))
          }
        }}
        title={t('settings.deleteRecurringTitle')}
        description={t('settings.deleteRecurringText')}
        confirmLabel={t('common.delete')}
        danger
      />
    </>
  )
}
