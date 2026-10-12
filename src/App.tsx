import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { OnboardingPage } from '@/pages/Onboarding/OnboardingPage'
import { DashboardPage } from '@/pages/Dashboard/DashboardPage'
import { HistoryPage } from '@/pages/History/HistoryPage'
import { AIChatPage } from '@/pages/AIChat/AIChatPage'
import { ReportsPage } from '@/pages/Reports/ReportsPage'
import { SettingsPage } from '@/pages/Settings/SettingsPage'
import { BudgetsPage } from '@/pages/Budgets/BudgetsPage'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useRecurringStore } from '@/store/recurringStore'
import { reloadAllData } from '@/store/reloadAll'
import { processRecurringTransactions } from '@/services/recurringProcessor'
import { fetchExchangeRates } from '@/services/currencyApi'

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
      // Keep rates cached so foreign-currency entries still convert while offline
      fetchExchangeRates().catch((err) => console.error(err))

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
        <Route path="/" element={<DashboardPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/ai-chat" element={<AIChatPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* Deep link redirect fallback */}
        <Route path="/add" element={<Navigate to="/?quick=true" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
