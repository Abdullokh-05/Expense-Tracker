import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import '@/lib/i18n'
import { applyTheme } from '@/lib/theme'
import { SETTINGS_STORAGE_KEY } from '@/lib/constants'

// The service worker keeps the app working offline. A new version reloads the app as soon as
// it's installed. An app opened from the iPhone home screen is usually woken up rather than
// loaded again, so it also looks for a new version each time it comes back to the screen.
if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {})
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      setInterval(check, 60 * 60 * 1000)
    },
  })
}

// Apply theme class on startup
const initTheme = () => {
  const store = localStorage.getItem(SETTINGS_STORAGE_KEY)
  if (store) {
    try {
      const parsed = JSON.parse(store)
      applyTheme(parsed.state?.settings?.theme)
    } catch (e) {
      console.error(e)
    }
  }
}

initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
