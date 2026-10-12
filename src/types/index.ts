// Core types for Xarajat PWA

export type TransactionType = 'expense' | 'income'
export type TransactionStatus = 'confirmed' | 'pending' | 'skipped'
export type PaymentMethod = 'cash' | 'card'
export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly'
export type NoteLanguage = 'ru' | 'en' | 'uz'
export type AppLanguage = 'ru' | 'en' | 'uz'
export type AppTheme = 'light' | 'dark' | 'system'
export type ChatRole = 'user' | 'assistant'
export type AIInsightType = 'spending_pattern' | 'budget_advice' | 'worth_it_check'

// =====================
// Transaction
// =====================
export interface Transaction {
  id: string
  userId: string
  type: TransactionType
  status: TransactionStatus
  amount: number
  currency: string
  amountInBaseCurrency: number
  exchangeRate: number
  categoryId: string | null
  date: string // ISO date string YYYY-MM-DD
  note: string | null
  noteOriginal: string | null
  noteLanguage: NoteLanguage | null
  translationConfidence: number | null
  paymentMethod: PaymentMethod | null
  recurringTransactionId: string | null
  createdAt: string
  updatedAt: string
  // Local only fields
  synced?: boolean
}

// =====================
// Category
// =====================
export interface Category {
  id: string
  userId: string
  name: string
  icon: string
  color: string
  isArchived: boolean
  isDefault?: boolean // built-in categories
  createdAt: string
  updatedAt: string
  synced?: boolean
}

// =====================
// Budget
// =====================
export interface Budget {
  id: string
  userId: string
  categoryId: string
  monthlyLimit: number
  period: string
  createdAt: string
  updatedAt: string
  synced?: boolean
}

// =====================
// Recurring Transaction
// =====================
export interface RecurringTransaction {
  id: string
  userId: string
  type: TransactionType
  amount: number
  currency: string
  categoryId: string | null
  note: string | null
  frequency: RecurringFrequency
  nextRunDate: string
  autoCreate: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  synced?: boolean
}

// =====================
// Chat & AI
// =====================
export interface ChatMessage {
  id: string
  userId: string
  role: ChatRole
  content: string
  createdAt: string
}

export interface AIInsight {
  id: string
  userId: string
  period: string
  categoryId: string | null
  insightText: string
  type: AIInsightType
  createdAt: string
}

// =====================
// Push Subscription
// =====================
export interface PushSubscriptionRecord {
  id: string
  userId: string
  endpoint: string
  p256dhKey: string
  authKey: string
  createdAt: string
}

// =====================
// Sync Queue
// =====================
export type SyncOperation = 'create' | 'update' | 'delete'
export type SyncTable = 'transactions' | 'categories' | 'budgets' | 'recurring_transactions'

export interface SyncQueueItem {
  id: string
  table: SyncTable
  operation: SyncOperation
  recordId: string
  payload: any
  createdAt: string
  retries: number
}

// =====================
// App Settings
// =====================
export interface AppSettings {
  userId: string
  baseCurrency: string
  language: AppLanguage
  theme: AppTheme
  aiEnabled: boolean
  notifyReminderEnabled: boolean
  notifyReminderTime: string // HH:mm
  notifySummaryDailyEnabled: boolean
  notifySummaryWeeklyEnabled: boolean
  notifyBudgetAlertEnabled: boolean
  timezone: string
  onboardingCompleted: boolean
  recurringAutoCreate: boolean
}

// =====================
// Currency
// =====================
export interface ExchangeRate {
  baseCurrency: string
  rates: Record<string, number>
  lastUpdated: string
}

// =====================
// Analytics helpers
// =====================
export interface CategorySpending {
  categoryId: string
  categoryName: string
  categoryIcon: string
  categoryColor: string
  amount: number
  percentage: number
  transactionCount: number
}

export interface DailySpending {
  date: string
  amount: number
  income: number
}

export interface PeriodSummary {
  totalExpenses: number
  totalIncome: number
  balance: number
  topCategories: CategorySpending[]
  dailyData: DailySpending[]
  comparedToPrevious: number | null // percentage change
}

// =====================
// UI helpers
// =====================
export type Period = 'today' | 'week' | 'month' | 'year' | 'custom'

export interface DateRange {
  from: string
  to: string
}
