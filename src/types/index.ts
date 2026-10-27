// Core types for Xarajat PWA

// A transfer moves money between two accounts; it is neither income nor an expense
export type TransactionType = 'expense' | 'income' | 'transfer'
export type AccountType = 'cash' | 'card' | 'savings'
export type CategoryKind = 'expense' | 'income'
// 3 is the most important
export type WishImportance = 1 | 2 | 3
export type WishStatus = 'wanted' | 'bought'
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
  // Optional finer split inside categoryId (Car → Fuel). categoryId always stays the parent,
  // so totals and limits by category include their subcategories without extra work.
  subcategoryId?: string | null
  // Account the money left (expense, transfer) or entered (income); the amount is in its currency
  accountId: string | null
  // Transfers only: the receiving account, and the amount that arrived in its currency
  toAccountId: string | null
  toAmount: number | null
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
  // Missing on categories created before income categories existed, which are all expense ones
  kind?: CategoryKind
  isArchived: boolean
  isDefault?: boolean // built-in categories
  // Place in the list (and on the add screen) once the user has reordered it; a
  // subcategory's place is among its siblings
  sortOrder?: number
  // Set on a subcategory: the category it belongs to. One level only: a subcategory has no
  // children of its own, takes its parent's colour and is of the parent's kind.
  parentId?: string | null
  createdAt: string
  updatedAt: string
  synced?: boolean
}

// =====================
// Account
// =====================
export interface Account {
  id: string
  userId: string
  name: string
  type: AccountType
  currency: string
  // What the account held before the first transaction recorded here
  startingBalance: number
  // Whether its balance counts towards the total on the home screen
  includeInTotal: boolean
  // The one account whose money is being saved up for the wishlist
  isWishlistFund: boolean
  // The card colour; accounts made before colours existed use their type's colour
  color?: string
  // The one account new entries start on
  isDefault?: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
  synced?: boolean
}

// =====================
// Wishlist
// =====================
export interface WishlistItem {
  id: string
  userId: string
  name: string
  price: number
  currency: string
  importance: WishImportance
  link: string | null
  status: WishStatus
  boughtAt: string | null // ISO date string YYYY-MM-DD
  createdAt: string
  updatedAt: string
  synced?: boolean
}

// =====================
// Template
// =====================
// A saved entry the user makes often (a usual taxi fare, a coffee): one tap records it for today
export interface TransactionTemplate {
  id: string
  userId: string
  type: 'expense' | 'income'
  amount: number
  categoryId: string
  subcategoryId?: string | null
  accountId: string | null
  note: string | null
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
  subcategoryId?: string | null
  accountId: string | null
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
export type SyncTable =
  | 'transactions'
  | 'categories'
  | 'budgets'
  | 'recurring_transactions'
  | 'accounts'
  | 'wishlist_items'
  | 'templates'

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
// Exchange rates
// =====================
// A rate the user set by hand; it wins over the live one. 1 `code` is worth `rate` units of
// `quote` (the main currency at the time it was set).
export interface CustomRate {
  code: string
  quote: string
  rate: number
  setAt: string
}

// =====================
// App Settings
// =====================
export interface AppSettings {
  userId: string
  // What the home screen greets the user by; empty until they set it
  displayName?: string
  // Exchange rates set by hand (Accounts › Exchange rates)
  customRates?: CustomRate[]
  // How amounts are typed on the add screen; the app's keypad unless changed
  amountInput?: 'keypad' | 'keyboard'
  // Suggest a category from what the note says (on unless turned off)
  suggestCategory?: boolean
  // Start every session with amounts hidden
  hideAmountsOnOpen?: boolean
  // The bell's reminder the day before a recurring payment (on unless turned off)
  notifyPaymentsEnabled?: boolean
  // When a backup file was last downloaded
  lastBackupAt?: string
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
