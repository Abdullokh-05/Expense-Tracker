import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { OnboardingPage } from '@/pages/Onboarding/OnboardingPage'
import { HomePage } from '@/pages/Home/HomePage'
import { StatsPage } from '@/pages/Stats/StatsPage'
import { AccountsPage } from '@/pages/Accounts/AccountsPage'
import { WishlistPage } from '@/pages/Wishlist/WishlistPage'
import { SettingsPage } from '@/pages/Settings/SettingsPage'
import { CategoriesPage } from '@/pages/Categories/CategoriesPage'
import { CategoryPage } from '@/pages/Categories/CategoryPage'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useRecurringStore } from '@/store/recurringStore'
import { reloadAllData } from '@/store/reloadAll'
import { processRecurringTransactions } from '@/services/recurringProcessor'
import { useRatesStore } from '@/store/ratesStore'

// The income and outcome breakdowns became the Stats tab; old links land there
function BreakdownRedirect() {
  const { type } = useParams()
  const { search } = useLocation()
  const month = new URLSearchParams(search).get('m') ?? '0'
  return <Navigate to={`/stats?type=${type === 'income' ? 'income' : 'expense'}&m=${month}`} replace />
}

// Shared components on one page, for checking the redesign while it is built. Only in
// development builds; production never includes it.
const KitPage = import.meta.env.DEV ? lazy(() => import('@/pages/Kit/KitPage')) : null

export const App: React.FC = () => {
  const { settings, setOnline } = useAppStore()
  const location = useLocation()

  // Handle online/offline events globally
  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setOnline])

  // Load the user's data once for every page, then run the recurring transaction checker
  useEffect(() => {
    if (!settings.onboardingCompleted) return

    const start = async () => {
      await reloadAllData()

      const { baseCurrency } = useAppStore.getState().settings
      // Rates turn foreign-currency accounts and wishes into the base currency; loading them
      // here also keeps a cached copy for when the app is offline
      await useRatesStore.getState().loadRates()

      const count = await processRecurringTransactions(settings.userId, baseCurrency)
      if (count > 0) {
        console.log(`Processed ${count} recurring transactions.`)
        // Pick up the new transactions and the advanced next-run dates
        await Promise.all([
          useTransactionStore.getState().loadTransactions(),
          useRecurringStore.getState().loadRecurringTransactions(),
        ])
      }
    }
    start().catch((err) => console.error(err))
  }, [settings.onboardingCompleted, settings.userId])

  const onboardingCompleted = settings.onboardingCompleted
  const isOnboardingPath = location.pathname === '/onboarding'

  // Route Guard: Redirect to onboarding if not completed
  if (!onboardingCompleted && !isOnboardingPath) {
    return <Navigate to="/onboarding" replace />
  }

  // Route Guard: Redirect to home if completed and trying to go to onboarding
  if (onboardingCompleted && isOnboardingPath) {
    return <Navigate to="/" replace />
  }

  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/breakdown/:type" element={<BreakdownRedirect />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/categories" element={<CategoriesPage />} />
        <Route path="/settings/categories/:id" element={<CategoryPage />} />
        {KitPage && (
          <Route path="/kit" element={<Suspense fallback={null}><KitPage /></Suspense>} />
        )}
        {/* Deep link redirect fallback */}
        <Route path="/add" element={<Navigate to="/?quick=true" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
