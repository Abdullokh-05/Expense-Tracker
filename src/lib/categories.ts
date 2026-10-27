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

// =====================
// Subcategories (one level: Car → Fuel, Carwash)
// =====================
export function isSubcategory(category: Category): boolean {
  return Boolean(category.parentId)
}

// Categories that aren't subcategories: what lists, pickers and charts show
export function topLevelCategories(categories: Category[]): Category[] {
  return categories.filter((category) => !category.parentId)
}

// A category's subcategories, in the order the user set
export function subcategoriesOf(categories: Category[], parentId: string): Category[] {
  return sortCategories(categories.filter((category) => category.parentId === parentId))
}

// The category an entry counts under: a subcategory's id gives its parent
export function rootCategoryId(categories: Category[], categoryId: string | null): string | null {
  if (!categoryId) return null
  return categories.find((category) => category.id === categoryId)?.parentId ?? categoryId
}

// Built-in names of the catch-all categories entries move to when theirs is deleted
const OTHER_NAMES: Record<CategoryKind, string> = {
  expense: DEFAULT_CATEGORIES[DEFAULT_CATEGORY_KEYS.indexOf('other')].name,
  income: DEFAULT_INCOME_CATEGORIES[DEFAULT_INCOME_CATEGORY_KEYS.indexOf('otherIncome')].name,
}

export function isOtherCategory(category: Category): boolean {
  return Boolean(category.isDefault) && !category.parentId && category.name === OTHER_NAMES[getCategoryKind(category)]
}

// "Other" (or "Other income") of a kind, if the user still has it
export function findOtherCategory(categories: Category[], kind: CategoryKind): Category | undefined {
  return categories.find((category) => getCategoryKind(category) === kind && isOtherCategory(category))
}

// How to recreate "Other" of a kind if it's gone
export function otherCategorySeed(kind: CategoryKind) {
  const seeds = kind === 'expense' ? DEFAULT_CATEGORIES : DEFAULT_INCOME_CATEGORIES
  return seeds.find((seed) => seed.name === OTHER_NAMES[kind])!
}

// First palette color no category uses yet, so new categories stay distinguishable in charts
export function pickCategoryColor(categories: Category[]): string {
  const used = new Set(topLevelCategories(categories).filter((c) => !c.isArchived).map((c) => c.color.toLowerCase()))
  const free = CATEGORY_COLORS.find(({ color }) => !used.has(color.toLowerCase()))
  return (free ?? CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]).color
}

// The top-level categories of one kind used most in the last 90 days, most used first; at
// most `limit`, none that went unused. Entries count under their category even when they
// have a subcategory.
export function frequentCategories(
  categories: Category[],
  transactions: { categoryId: string | null; date: string; status: string; type: string }[],
  kind: CategoryKind,
  limit: number,
  since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
): Category[] {
  const counts = new Map<string, number>()
  for (const txn of transactions) {
    if (txn.type !== kind || txn.status !== 'confirmed' || !txn.categoryId || txn.date < since) continue
    counts.set(txn.categoryId, (counts.get(txn.categoryId) ?? 0) + 1)
  }
  return categories
    .filter((c) => !c.parentId && !c.isArchived && getCategoryKind(c) === kind && counts.has(c.id))
    .sort((a, b) => counts.get(b.id)! - counts.get(a.id)!)
    .slice(0, limit)
}
