import React, { useEffect, useState } from 'react'
import { Share, Plus, X } from 'lucide-react'

export const IOSInstallPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    // 1. Detect if iOS device
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes('Mac') && 'ontouchend' in document)

    // 2. Detect if running as PWA (standalone mode)
    const isStandalone =
      (window.navigator as any).standalone ||
      window.matchMedia('(display-mode: standalone)').matches

    // 3. Check if user already dismissed it
    const isDismissed = localStorage.getItem('xarajat-ios-prompt-dismissed') === 'true'

    if (isIOS && !isStandalone && !isDismissed) {
      // Delay showing it slightly for better UX
      const timer = setTimeout(() => {
        setShowPrompt(true)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleDismiss = () => {
    localStorage.setItem('xarajat-ios-prompt-dismissed', 'true')
    setShowPrompt(false)
  }

  if (!showPrompt) return null

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-scale-in p-5 rounded-2xl border"
      style={{
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <button
        onClick={handleDismiss}
        className="absolute top-3.5 right-3.5 p-1 rounded-full opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Закрыть"
      >
        <X size={15} style={{ color: 'var(--color-text-primary)' }} />
      </button>

      <div className="space-y-4">
        {/* Title */}
        <div className="pr-6">
          <h4 className="serif-heading text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Установить Xarajat
          </h4>
          <p className="text-xs mt-1 leading-normal" style={{ color: 'var(--color-text-secondary)' }}>
            Добавьте приложение на главный экран для быстрого доступа, работы в офлайне и полноэкранного режима.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-3 bg-[var(--color-surface-2)] p-3.5 rounded-xl border border-[var(--color-border)]/50">
          <div className="flex items-start gap-3 text-xs leading-normal">
            <div className="w-5 h-5 rounded-full bg-[var(--color-accent)] text-[var(--color-bg)] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
              1
            </div>
            <div style={{ color: 'var(--color-text-secondary)' }}>
              Нажмите кнопку <strong className="font-semibold text-[var(--color-text-primary)]">Поделиться</strong> (иконка <Share size={12} className="inline mb-0.5 mx-0.5 text-[var(--color-text-primary)]" /> в панели Safari)
            </div>
          </div>

          <div className="flex items-start gap-3 text-xs leading-normal">
            <div className="w-5 h-5 rounded-full bg-[var(--color-accent)] text-[var(--color-bg)] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
              2
            </div>
            <div style={{ color: 'var(--color-text-secondary)' }}>
              Выберите пункт <strong className="font-semibold text-[var(--color-text-primary)]">На экран «Домой»</strong> (иконка <Plus size={12} className="inline mb-0.5 mx-0.5 text-[var(--color-text-primary)]" /> в меню действий)
            </div>
          </div>
        </div>

        {/* Dismiss trigger */}
        <button
          onClick={handleDismiss}
          className="w-full py-2.5 rounded-xl text-xs font-bold text-center border transition-all"
          style={{
            background: 'var(--color-surface-2)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Понятно, спасибо
        </button>
      </div>
    </div>
  )
}
