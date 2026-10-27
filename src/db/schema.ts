import Dexie, { type Table } from 'dexie'
import type {
  Transaction,
  Category,
  Budget,
  RecurringTransaction,
  Account,
  WishlistItem,
  TransactionTemplate,
  ChatMessage,
  AIInsight,
  SyncQueueItem,
  ExchangeRate,
  AppSettings,
} from '@/types'
import { MINOR_UNITS_BACKUP_ID, MONEY_TABLES, toStored } from './money'

export class XarajatDB extends Dexie {
  transactions!: Table<Transaction>
  categories!: Table<Category>
  budgets!: Table<Budget>
  recurringTransactions!: Table<RecurringTransaction>
  accounts!: Table<Account>
  wishlistItems!: Table<WishlistItem>
  templates!: Table<TransactionTemplate>
  chatMessages!: Table<ChatMessage>
  aiInsights!: Table<AIInsight>
  syncQueue!: Table<SyncQueueItem>
  exchangeRates!: Table<ExchangeRate>
  settings!: Table<AppSettings>
  migrationBackups!: Table<MigrationBackup>

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

    // Accounts and the wishlist. Existing transactions are attached to accounts by
    // ensureDefaults() at startup, which needs the user's base currency.
    this.version(2).stores({
      transactions:
        'id, userId, type, status, categoryId, accountId, date, recurringTransactionId, createdAt, updatedAt, synced',
      accounts:
        'id, userId, isArchived, createdAt, updatedAt, synced',
      wishlistItems:
        'id, userId, status, createdAt, updatedAt, synced',
    })

    // Templates for entries made often
    this.version(3).stores({
      templates:
        'id, userId, createdAt, updatedAt, synced',
    })

    // Amounts move to whole hundredths (23,67 → 2367) so they can have decimals without
    // floating-point noise. Dexie runs an upgrade once, when the database is first opened at
    // this version; the backup it leaves is also checked, so the amounts can never be
    // multiplied twice. The whole upgrade is one transaction: if any step fails nothing changes.
    this.version(4)
      .stores({
        migrationBackups: 'id, createdAt',
      })
      .upgrade(async (tx) => {
        const backups = tx.table<MigrationBackup>('migrationBackups')
        if (await backups.get(MINOR_UNITS_BACKUP_ID)) return

        const tables: Record<string, unknown[]> = {}
        for (const table of MONEY_TABLES) tables[table] = await tx.table(table).toArray()
        await backups.add({
          id: MINOR_UNITS_BACKUP_ID,
          createdAt: new Date().toISOString(),
          note: 'Amounts as they were before being stored in hundredths',
          tables,
        })

        for (const table of MONEY_TABLES) {
          await tx.table(table).toCollection().modify((record: Record<string, unknown>) => {
            Object.assign(record, toStored(table, record))
          })
        }
      })
  }
}

// A copy of tables taken before a data upgrade changed them
export interface MigrationBackup {
  id: string
  createdAt: string
  note: string
  tables: Record<string, unknown[]>
}

export const db = new XarajatDB()
