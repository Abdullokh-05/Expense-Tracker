import Dexie, { type Table } from 'dexie'
import type {
  Transaction,
  Category,
  Budget,
  RecurringTransaction,
  ChatMessage,
  AIInsight,
  SyncQueueItem,
  ExchangeRate,
  AppSettings,
} from '@/types'

export class XarajatDB extends Dexie {
  transactions!: Table<Transaction>
  categories!: Table<Category>
  budgets!: Table<Budget>
  recurringTransactions!: Table<RecurringTransaction>
  chatMessages!: Table<ChatMessage>
  aiInsights!: Table<AIInsight>
  syncQueue!: Table<SyncQueueItem>
  exchangeRates!: Table<ExchangeRate>
  settings!: Table<AppSettings>

  constructor() {
    super('xarajat-db')

    this.version(1).stores({
      // Primary key, then indexed fields
      transactions:
        'id, userId, type, status, categoryId, date, recurringTransactionId, createdAt, updatedAt, synced',
      categories:
        'id, userId, isArchived, createdAt, updatedAt, synced',
      budgets:
        'id, userId, categoryId, createdAt, updatedAt, synced',
      recurringTransactions:
        'id, userId, isActive, nextRunDate, createdAt, updatedAt, synced',
      chatMessages:
        'id, userId, role, createdAt',
      aiInsights:
        'id, userId, period, categoryId, createdAt',
      syncQueue:
        'id, table, operation, recordId, createdAt',
      exchangeRates:
        'baseCurrency, lastUpdated',
      settings:
        'userId',
    })
  }
}

export const db = new XarajatDB()
