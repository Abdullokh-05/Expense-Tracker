import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import type { WishImportance, WishlistItem } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useWishlistStore } from '@/store/wishlistStore'
import { SUPPORTED_CURRENCIES } from '@/lib/constants'
import { IMPORTANCE_LEVELS, importanceKey, safeLink } from '@/lib/wishlist'
import { ConfirmDialog } from '@/components/ui/BottomSheet'
import { PopUp } from '@/components/ui/PopUp'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'

interface WishSheetProps {
  isOpen: boolean
  onClose: () => void
  // When set, the sheet edits this item instead of adding a new one
  item?: WishlistItem
}

export const WishSheet: React.FC<WishSheetProps> = ({ isOpen, onClose, item }) => {
  const { t } = useTranslation()
  const { settings } = useAppStore()
  const { addItem, editItem, removeItem } = useWishlistStore()

  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState(settings.baseCurrency)
  const [importance, setImportance] = useState<WishImportance>(2)
  const [link, setLink] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setName(item?.name ?? '')
      setPrice(item ? String(item.price) : '')
      setCurrency(item?.currency ?? settings.baseCurrency)
      setImportance(item?.importance ?? 2)
      setLink(item?.link ?? '')
      setShowDeleteConfirm(false)
    }
  }, [isOpen, item, settings.baseCurrency])

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('wishlist.nameRequired'))
      return
    }
    const parsedPrice = parseFloat(price.replace(/[^0-9.]/g, ''))
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      toast.error(t('wishlist.priceRequired'))
      return
    }
    if (link.trim() && !safeLink(link)) {
      toast.error(t('wishlist.linkInvalid'))
      return
    }

    setIsSaving(true)
    try {
      const fields = { name: name.trim(), price: parsedPrice, currency, importance, link: safeLink(link) }
      if (item) {
        await editItem(item.id, fields)
      } else {
        await addItem({ ...fields, userId: settings.userId, status: 'wanted', boughtAt: null })
      }
      toast.success(t('settings.saved'))
      onClose()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!item) return
    try {
      await removeItem(item.id)
      toast.success(t('wishlist.deleted'))
      onClose()
    } catch {
      toast.error(t('common.error'))
    }
  }

  return (
    <>
      <PopUp
        isOpen={isOpen}
        onClose={onClose}
        title={item ? t('wishlist.editTitle') : t('wishlist.newTitle')}
        footer={
          <>
            {item && (
              <Button variant="secondary" size="lg" onClick={() => setShowDeleteConfirm(true)} aria-label={t('common.delete')}>
                <Trash2 size={18} strokeWidth={1.75} className="text-danger-text" />
              </Button>
            )}
            <Button id="save-wish-btn" fullWidth size="lg" onClick={handleSave} loading={isSaving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
        >
          <Input
            id="wish-name-input"
            label={t('wishlist.name')}
            placeholder={t('wishlist.namePlaceholder')}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!item}
          />

          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 items-end">
            <Input
              id="wish-price-input"
              type="text"
              inputMode="decimal"
              label={t('wishlist.price')}
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
            />
            <Select id="wish-currency-select" label={t('accounts.currency')} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </Select>
          </div>

          <div className="field">
            <span className="field-label">{t('wishlist.importance')}</span>
            <SegmentedControl
              label={t('wishlist.importance')}
              value={String(importance)}
              onChange={(level) => setImportance(Number(level) as WishImportance)}
              options={IMPORTANCE_LEVELS.map((level) => ({ value: String(level), label: t(importanceKey(level)) }))}
            />
          </div>

          <Input
            id="wish-link-input"
            type="url"
            inputMode="url"
            label={t('wishlist.link')}
            placeholder="https://"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </form>
      </PopUp>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title={t('wishlist.deleteTitle')}
        description={t('transaction.deleteWarning')}
        confirmLabel={t('common.delete')}
        danger
      />
    </>
  )
}
