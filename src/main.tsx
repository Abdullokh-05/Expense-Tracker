import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import '@/lib/i18n'

// Register PWA service worker automatically
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('SW registered successfully:', reg.scope)
      })
      .catch((err) => {
        console.error('SW registration failed:', err)
      })
  })
}

// Apply theme class on startup
const initTheme = () => {
  const store = localStorage.getItem('xarajat-app-settings')
  if (store) {
    try {
      const parsed = JSON.parse(store)
      const themeValue = parsed.state?.settings?.theme
      const isDark =
        themeValue === 'dark' ||
        (themeValue === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      
      if (isDark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
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
