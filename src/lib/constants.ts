// Default preset categories for new users

export const DEFAULT_CATEGORIES = [
  { name: 'Еда', icon: '🍕', color: '#D06F45', isArchived: false },
  { name: 'Транспорт', icon: '🚗', color: '#3C7BB4', isArchived: false },
  { name: 'Жильё', icon: '🏠', color: '#8E68B4', isArchived: false },
  { name: 'Развлечения', icon: '🎮', color: '#B65A9F', isArchived: false },
  { name: 'Здоровье', icon: '💊', color: '#C4566C', isArchived: false },
  { name: 'Связь', icon: '📱', color: '#2E9690', isArchived: false },
  { name: 'Прочее', icon: '📦', color: '#7D8A80', isArchived: false },
]

// i18n category name keys (for default categories by key)
export const DEFAULT_CATEGORY_KEYS = [
  'food', 'transport', 'housing', 'entertainment', 'health', 'communication', 'other',
] as const

// Default income categories (sources of earnings), seeded alongside the expense ones
export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Зарплата', icon: '💼', color: '#4C8A5A', isArchived: false },
  { name: 'Подработка', icon: '💻', color: '#4A9BC8', isArchived: false },
  { name: 'Подарки', icon: '🎁', color: '#B65A9F', isArchived: false },
  { name: 'Другой доход', icon: '💰', color: '#C8A030', isArchived: false },
]

// The bright colours built-in categories were first created with, and the calmer ones that
// replaced them; ensureDefaults() moves untouched built-ins over once
export const LEGACY_CATEGORY_COLORS: Record<string, string> = {
  '#f97316': '#D06F45',
  '#3b82f6': '#3C7BB4',
  '#8b5cf6': '#8E68B4',
  '#ec4899': '#B65A9F',
  '#10b981': '#C4566C',
  '#06b6d4': '#2E9690',
  '#6b7280': '#7D8A80',
  '#22c55e': '#4C8A5A',
  '#0ea5e9': '#4A9BC8',
  '#a855f7': '#B65A9F',
  '#84cc16': '#C8A030',
}

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
// Category colours: muted so emoji tiles and charts stay calm; key names the colour for screen readers
export const CATEGORY_COLORS = [
  { color: '#C27C2C', key: 'amber' },
  { color: '#4C8A5A', key: 'green' },
  { color: '#3C7BB4', key: 'blue' },
  { color: '#C4566C', key: 'rose' },
  { color: '#8E68B4', key: 'violet' },
  { color: '#2E9690', key: 'teal' },
  { color: '#D06F45', key: 'orange' },
  { color: '#6A6FC0', key: 'indigo' },
  { color: '#C8A030', key: 'gold' },
  { color: '#4A9BC8', key: 'sky' },
  { color: '#B65A9F', key: 'plum' },
  { color: '#7D8A80', key: 'grey' },
] as const

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
