// Default preset categories for new users

export const DEFAULT_CATEGORIES = [
  { name: 'Еда', icon: '🍕', color: '#f97316', isArchived: false },
  { name: 'Транспорт', icon: '🚗', color: '#3b82f6', isArchived: false },
  { name: 'Жильё', icon: '🏠', color: '#8b5cf6', isArchived: false },
  { name: 'Развлечения', icon: '🎮', color: '#ec4899', isArchived: false },
  { name: 'Здоровье', icon: '💊', color: '#10b981', isArchived: false },
  { name: 'Связь', icon: '📱', color: '#06b6d4', isArchived: false },
  { name: 'Прочее', icon: '📦', color: '#6b7280', isArchived: false },
]

// i18n category name keys (for default categories by key)
export const DEFAULT_CATEGORY_KEYS = [
  'food', 'transport', 'housing', 'entertainment', 'health', 'communication', 'other',
] as const

// Default income categories (sources of earnings), seeded alongside the expense ones
export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Зарплата', icon: '💼', color: '#22c55e', isArchived: false },
  { name: 'Подработка', icon: '💻', color: '#0ea5e9', isArchived: false },
  { name: 'Подарки', icon: '🎁', color: '#a855f7', isArchived: false },
  { name: 'Другой доход', icon: '💰', color: '#84cc16', isArchived: false },
]

export const DEFAULT_INCOME_CATEGORY_KEYS = ['salary', 'freelance', 'gifts', 'otherIncome'] as const

// Supported currencies
export const SUPPORTED_CURRENCIES = [
  { code: 'UZS', name: "So'm", symbol: "so'm", flag: '🇺🇿' },
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', flag: '🇷🇺' },
  { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
  { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '₸', flag: '🇰🇿' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', flag: '🇹🇷' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', flag: '🇦🇪' },
]

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'uz', name: "O'zbek", flag: '🇺🇿' },
] as const

// Category emoji options for custom categories
export const CATEGORY_EMOJIS = [
  '🍕', '🍔', '🍜', '🍱', '☕', '🍺', '🛒',
  '🚗', '🚕', '🚌', '✈️', '🚂', '⛽',
  '🏠', '🏢', '💡', '🛁', '🔑',
  '🎮', '🎬', '🎵', '📚', '⚽', '🎭',
  '💊', '🏥', '💪', '🧘',
  '📱', '💻', '🖥️', '📡',
  '👔', '👗', '👟', '💄',
  '📦', '🎁', '💰', '💳', '🏦',
  '✂️', '🐕', '🌱', '✈️', '🏖️',
]

// Category color options
export const CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#6b7280', '#475569', '#374151',
]

// AI limits per day
export const AI_LIMITS = {
  chat: 20,
  normalize: 50,
  insights: 10,
}

// App name
export const APP_NAME = 'Xarajat'
export const GUEST_USER_ID = 'guest'

// localStorage key of the persisted app settings (read before React starts for theme and language)
export const SETTINGS_STORAGE_KEY = 'xarajat-app-settings'
