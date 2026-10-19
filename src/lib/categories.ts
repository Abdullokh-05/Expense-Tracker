import type { TFunction } from 'i18next'
import type { Category, CategoryKind } from '@/types'
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY_KEYS,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_INCOME_CATEGORY_KEYS,
} from '@/lib/constants'

// Default categories are seeded with Russian names; this maps each back to its translation key
const DEFAULT_NAME_KEYS: Record<string, string> = Object.fromEntries([
  ...DEFAULT_CATEGORIES.map((category, index) => [category.name, DEFAULT_CATEGORY_KEYS[index]]),
  ...DEFAULT_INCOME_CATEGORIES.map((category, index) => [category.name, DEFAULT_INCOME_CATEGORY_KEYS[index]]),
])

const DEFAULT_ORDER = [...DEFAULT_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map((category) => category.name)

// Whether a category is for expenses or for income
export function getCategoryKind(category: Category): CategoryKind {
  return category.kind ?? 'expense'
}

// Name to show for a category: built-in ones follow the UI language, custom ones keep their name
export function getCategoryName(category: Category | null | undefined, t: TFunction): string {
  if (!category) return t('categories.other')
  const key = category.isDefault ? DEFAULT_NAME_KEYS[category.name] : undefined
  return key ? t(`categories.${key}`) : category.name
}

// The order the user set (Settings › Categories), then built-in categories in their seed
// order, then custom ones oldest first. This is also the order on the add screen.
export function sortCategories(categories: Category[]): Category[] {
  const rank = (category: Category) => {
    const index = category.isDefault ? DEFAULT_ORDER.indexOf(category.name) : -1
    return index === -1 ? DEFAULT_ORDER.length : index
  }
  const placed = (category: Category) => category.sortOrder ?? Number.MAX_SAFE_INTEGER
  return [...categories].sort(
    (a, b) =>
      placed(a) - placed(b) || rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  )
}

// First palette color no category uses yet, so new categories stay distinguishable in charts
export function pickCategoryColor(categories: Category[]): string {
  const used = new Set(categories.filter((c) => !c.isArchived).map((c) => c.color.toLowerCase()))
  const free = CATEGORY_COLORS.find(({ color }) => !used.has(color.toLowerCase()))
  return (free ?? CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]).color
}
