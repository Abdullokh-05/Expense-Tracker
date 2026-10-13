import { create } from 'zustand'
import type { TransactionTemplate } from '@/types'
import { getTemplates, createTemplate, deleteTemplate } from '@/db/operations'
import { getCurrentUserId } from '@/store/appStore'

type TemplateFields = Omit<TransactionTemplate, 'id' | 'createdAt' | 'updatedAt' | 'synced'>

interface TemplateStore {
  templates: TransactionTemplate[]
  loadTemplates: () => Promise<void>
  addTemplate: (data: TemplateFields) => Promise<TransactionTemplate>
  removeTemplate: (id: string) => Promise<void>
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  templates: [],

  loadTemplates: async () => {
    const templates = await getTemplates(getCurrentUserId())
    set({ templates })
  },

  // Saving the same entry twice keeps the one that is already there
  addTemplate: async (data) => {
    const existing = get().templates.find(
      (t) =>
        t.type === data.type &&
        t.amount === data.amount &&
        t.categoryId === data.categoryId &&
        t.accountId === data.accountId &&
        t.note === data.note
    )
    if (existing) return existing

    const template = await createTemplate(data)
    set((state) => ({ templates: [...state.templates, template] }))
    return template
  },

  removeTemplate: async (id) => {
    await deleteTemplate(id)
    set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }))
  },
}))
