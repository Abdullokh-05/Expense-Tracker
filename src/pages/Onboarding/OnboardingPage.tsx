import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle, ChevronRight } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { SUPPORTED_CURRENCIES, SUPPORTED_LANGUAGES } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import type { AppLanguage } from '@/types'

type Step = 'welcome' | 'setup'

export const OnboardingPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { settings, setCurrency, setLanguage, setOnboardingCompleted } = useAppStore()
  const seedDefaults = useCategoryStore((s) => s.seedDefaults)

  const [step, setStep] = useState<Step>('welcome')
  const [selectedCurrency, setSelectedCurrency] = useState(settings.baseCurrency)
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(settings.language)
  const [isLoading, setIsLoading] = useState(false)

  const handleLanguageSelect = (lang: AppLanguage) => {
    setSelectedLanguage(lang)
    // Live-preview the language
    setLanguage(lang)
    i18n.changeLanguage(lang)
  }

  const handleFinish = async () => {
    setIsLoading(true)
    try {
      setCurrency(selectedCurrency)
      setLanguage(selectedLanguage)
      await seedDefaults()
      setOnboardingCompleted(true)
      navigate('/', { replace: true })
    } finally {
      setIsLoading(false)
    }
  }

  const cardStyle = (selected: boolean, color?: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.875rem 1rem',
    borderRadius: '14px',
    border: selected
      ? `2px solid ${color || 'var(--color-accent)'}`
      : '2px solid var(--color-border)',
    background: selected
      ? `color-mix(in srgb, ${color || 'var(--color-accent)'} 8%, var(--color-surface))`
      : 'var(--color-surface)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    transform: selected ? 'scale(1.01)' : 'scale(1)',
    width: '100%',
    textAlign: 'left' as const,
  })

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'max(2rem, env(safe-area-inset-top)) 1.25rem max(2rem, env(safe-area-inset-bottom))',
      }}
    >
      <div style={{ width: '100%', maxWidth: '400px' }}>

        {/* ── STEP: WELCOME ── */}
        {step === 'welcome' && (
          <div className="animate-fade-in space-y-8">
            {/* Logo / Hero */}
            <div className="flex flex-col items-center gap-5 text-center">
              <div
                className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl relative"
                style={{
                  background: 'linear-gradient(135deg, #0f1117 0%, #1e2330 100%)',
                  boxShadow: '0 20px 60px -12px rgba(99,102,241,0.4)',
                }}
              >
                💸
                {/* Glow */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 'inherit',
                    background: 'radial-gradient(circle at 30% 30%, rgba(99,102,241,0.3), transparent 60%)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
              <div>
                <h1
                  style={{
                    fontSize: 'clamp(1.75rem, 6vw, 2.25rem)',
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    color: 'var(--color-text-primary)',
                    lineHeight: 1.1,
                    marginBottom: '0.5rem',
                  }}
                >
                  {t('onboarding.welcome')}
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                  {t('onboarding.subtitle')}
                </p>
              </div>
            </div>

            {/* Features */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { emoji: '📊', label: t('onboarding.featureCharts') || 'Графики' },
                { emoji: '🎁', label: t('onboarding.featureWishlist') },
                { emoji: '🔒', label: t('onboarding.featurePrivacy') || 'Офлайн' },
              ].map((f) => (
                <div
                  key={f.emoji}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl text-center"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  <span className="text-2xl">{f.emoji}</span>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)', lineHeight: 1.3 }}>
                    {f.label}
                  </span>
                </div>
              ))}
            </div>

            <Button id="onboarding-start" fullWidth size="lg" onClick={() => setStep('setup')}>
              {t('onboarding.getStarted')} <ChevronRight size={18} className="ml-1" />
            </Button>
          </div>
        )}

        {/* ── STEP: SETUP (language + currency in one screen) ── */}
        {step === 'setup' && (
          <div className="animate-fade-in space-y-6">
            <div>
              <h2
                style={{
                  fontSize: '1.375rem',
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  color: 'var(--color-text-primary)',
                  marginBottom: '0.25rem',
                }}
              >
                {t('onboarding.setupTitle') || 'Настройки'}
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                {t('onboarding.setupSubtitle') || 'Можно изменить в любой момент'}
              </p>
            </div>

            {/* Language */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                  marginBottom: '0.625rem',
                }}
              >
                {t('onboarding.selectLanguage')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    id={`lang-${lang.code}`}
                    onClick={() => handleLanguageSelect(lang.code as AppLanguage)}
                    style={cardStyle(selectedLanguage === lang.code)}
                  >
                    <span style={{ fontSize: '1.375rem', lineHeight: 1 }}>{lang.flag}</span>
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {lang.name}
                      </div>
                    </div>
                    {selectedLanguage === lang.code && (
                      <CheckCircle size={15} style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--color-accent)' }} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Currency */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                  marginBottom: '0.625rem',
                }}
              >
                {t('onboarding.selectCurrency')}
              </label>
              <div className="space-y-2">
                {SUPPORTED_CURRENCIES.map((c) => (
                  <button
                    key={c.code}
                    id={`currency-${c.code.toLowerCase()}`}
                    onClick={() => setSelectedCurrency(c.code)}
                    style={cardStyle(selectedCurrency === c.code, '#6366f1')}
                  >
                    <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{c.flag}</span>
                    <div className="flex-1">
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {c.code} — {c.name}
                      </div>
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      {c.symbol}
                    </span>
                    {selectedCurrency === c.code && (
                      <CheckCircle size={16} style={{ flexShrink: 0, color: '#6366f1' }} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <Button
              id="onboarding-finish"
              fullWidth
              size="lg"
              onClick={handleFinish}
              loading={isLoading}
            >
              {t('common.done')} <CheckCircle size={18} className="ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
