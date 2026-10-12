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
import { processRecurringTransactions } from '@/services/recurringProcessor'

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

  // Run recurring transaction checker on startup
  useEffect(() => {
    if (settings.onboardingCompleted) {
      processRecurringTransactions(settings.userId)
        .then((count) => {
          if (count > 0) {
            console.log(`Processed ${count} recurring transactions.`)
          }
        })
        .catch((err) => console.error(err))
    }
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
