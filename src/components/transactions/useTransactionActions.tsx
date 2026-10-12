import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Transaction } from '@/types'
import { useTransactionStore } from '@/store/transactionStore'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'
import { ConfirmDialog } from '@/components/ui/BottomSheet'
import { toast } from '@/components/ui/Toast'

// Edit and delete for any list of transactions. Pass onEdit/onDelete to each TransactionItem
// and render `dialogs` once on the page.
export function useTransactionActions() {
  const { t } = useTranslation()
  const removeTransaction = useTransactionStore((s) => s.removeTransaction)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      await removeTransaction(deletingId)
      toast.success(t('transaction.deleted'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const dialogs = (
    <>
      <AddTransactionSheet
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        transaction={editing ?? undefined}
      />
      <ConfirmDialog
        isOpen={deletingId !== null}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title={t('transaction.confirmDelete')}
        description={t('transaction.deleteWarning')}
        confirmLabel={t('transaction.delete')}
        danger
      />
    </>
  )

  return { onEdit: setEditing, onDelete: setDeletingId, dialogs }
}
