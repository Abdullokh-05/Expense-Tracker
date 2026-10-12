import type { AppTheme } from '@/types'

// Whether a theme setting currently resolves to dark ("system" follows the OS)
export function isDarkTheme(theme: AppTheme): boolean {
  return theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

// Apply dark mode class to HTML element
export function applyTheme(theme: AppTheme): void {
  document.documentElement.classList.toggle('dark', isDarkTheme(theme))
}
