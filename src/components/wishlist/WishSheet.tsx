import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import type { WishImportance, WishlistItem } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useWishlistStore } from '@/store/wishlistStore'
import { SUPPORTED_CURRENCIES } from '@/lib/constants'
import { IMPORTANCE_LEVELS, importanceKey, safeLink } from '@/lib/wishlist'
import { BottomSheet, ConfirmDialog } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
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
      <BottomSheet isOpen={isOpen} onClose={onClose} title={item ? t('wishlist.editTitle') : t('wishlist.newTitle')}>
        <div className="space-y-4">
          <Input
            id="wish-name-input"
            label={t('wishlist.name')}
            placeholder={t('wishlist.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!item}
          />

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <Input
              id="wish-price-input"
              type="text"
              inputMode="decimal"
              label={t('wishlist.price')}
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
            />
            <select
              id="wish-currency-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="input-base text-sm"
              style={{ width: '96px' }}
              aria-label={t('settings.currency')}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              {t('wishlist.importance')}
            </label>
            <div className="flex p-1 rounded-xl gap-1" style={{ background: 'var(--color-surface-2)' }}>
              {IMPORTANCE_LEVELS.map((level) => (
                <button
                  key={level}
                  id={`wish-importance-${level}`}
                  onClick={() => setImportance(level)}
                  aria-pressed={importance === level}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
                  style={{
                    background: importance === level ? 'var(--color-surface)' : 'transparent',
                    color: importance === level ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    boxShadow: importance === level ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {t(importanceKey(level))}
                </button>
              ))}
            </div>
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

          <div className="pt-1 flex gap-2">
            {item && (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setShowDeleteConfirm(true)}
                aria-label={t('common.delete')}
                style={{ color: 'var(--color-expense)' }}
              >
                <Trash2 size={18} />
              </Button>
            )}
            <Button id="save-wish-btn" fullWidth size="lg" onClick={handleSave} loading={isSaving}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </BottomSheet>

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
