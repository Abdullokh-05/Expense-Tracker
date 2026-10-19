import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import type { Transaction } from '@/types'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useAccountStore } from '@/store/accountStore'
import { useUiStore } from '@/store/uiStore'
import { lockScroll } from '@/lib/scrollLock'
import { HistoryList } from './HistoryList'
import { matchesSearch } from './historyFilter'

interface SearchOverlayProps {
  isOpen: boolean
  onClose: () => void
  onEdit: (transaction: Transaction) => void
}

// Results shown at most; the field narrows them down
const MAX_RESULTS = 100

// Search every entry by note, category, account or amount. A glass field at the top of the
// blurred screen, results under it; tap one to edit it.
export const SearchOverlay: React.FC<SearchOverlayProps> = ({ isOpen, onClose, onEdit }) => {
  const { t } = useTranslation()
  const base = useAppStore((s) => s.settings.baseCurrency)
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useCategoryStore((s) => s.categories)
  const accounts = useAccountStore((s) => s.accounts)
  const masked = useUiStore((s) => s.amountsHidden)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    const unlock = lockScroll()
    const previous = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      unlock()
      document.removeEventListener('keydown', handleKey)
      previous?.focus?.()
    }
  }, [isOpen])

  const results = useMemo(
    () =>
      query.trim()
        ? transactions.filter((txn) => txn.status === 'confirmed' && matchesSearch(txn, query, categories, accounts, t))
        : [],
    [query, transactions, categories, accounts, t]
  )

  if (!isOpen) return null

  const trimmed = query.trim()
  return createPortal(
    <div className="search-layer" role="dialog" aria-modal="true" aria-label={t('home.search')}>
      <div className="scrim scrim-fade" onClick={onClose} aria-hidden="true" />
      <div className="search-top">
        <label className="search-field">
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={query}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="iconbtn"
              aria-label={t('search.clear')}
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
            >
              <X size={18} strokeWidth={2} />
            </button>
          )}
        </label>
        <button type="button" className="search-cancel" onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>

      {!trimmed ? (
        <p className="search-hint t-sub">{t('search.hint')}</p>
      ) : results.length === 0 ? (
        <p className="search-hint t-sub" role="status">{t('search.noResults', { query: trimmed })}</p>
      ) : (
        <div className="search-results">
          <p className="t-cap pt-3" role="status">
            {results.length > MAX_RESULTS
              ? t('search.firstOf', { shown: MAX_RESULTS, count: results.length })
              : t('home.entries', { count: results.length })}
          </p>
          <HistoryList
            transactions={results.slice(0, MAX_RESULTS)}
            byDay
            totalsFrom={[]}
            categories={categories}
            accounts={accounts}
            baseCurrency={base}
            masked={masked}
            onEdit={onEdit}
          />
        </div>
      )}
    </div>,
    document.body
  )
}
