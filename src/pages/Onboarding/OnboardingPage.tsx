import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChartColumn, Check, ChevronRight, Gift, Leaf, WifiOff } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useCategoryStore } from '@/store/categoryStore'
import { SUPPORTED_CURRENCIES } from '@/lib/constants'
import { currencyName } from '@/lib/rates'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import type { AppLanguage } from '@/types'

type Step = 'welcome' | 'setup'

// The same padding the app's pages get, clear of the notch and the home indicator
const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-dvh flex flex-col px-4 md:px-8 pt-[max(16px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
    {children}
  </div>
)

// First run: a welcome, then the language and the main currency
export const OnboardingPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { settings, setCurrency, setLanguage, setOnboardingCompleted } = useAppStore()
  const seedDefaults = useCategoryStore((s) => s.seedDefaults)

  const [step, setStep] = useState<Step>('welcome')
  const [selectedCurrency, setSelectedCurrency] = useState(settings.baseCurrency)
  const [isLoading, setIsLoading] = useState(false)

  const handleFinish = async () => {
    setIsLoading(true)
    try {
      setCurrency(selectedCurrency)
      await seedDefaults()
      setOnboardingCompleted(true)
      navigate('/', { replace: true })
    } finally {
      setIsLoading(false)
    }
  }

  const features = [
    { icon: ChartColumn, label: t('onboarding.featureCharts') },
    { icon: Gift, label: t('onboarding.featureWishlist') },
    { icon: WifiOff, label: t('onboarding.featurePrivacy') },
  ]

  if (step === 'welcome') {
    return (
      <Page>
      <div className="flex flex-col gap-6 w-full max-w-[480px] mx-auto flex-1 animate-fade-in">
        <section className="hero hero-surface gap-6 pb-6">
          <div className="flex flex-col items-center gap-4 text-center pt-8">
            <span className="w-16 h-16 rounded-[18px] bg-white text-accent grid place-items-center shadow-hero" aria-hidden="true">
              <Leaf size={32} strokeWidth={1.75} />
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="t-title">{t('onboarding.welcome')}</h1>
              <p className="t-body text-hero-ink-2">{t('onboarding.subtitle')}</p>
            </div>
          </div>
          <div className="tiles grid-cols-3">
            {features.map(({ icon: Icon, label }) => (
              <div key={label} className="htile items-center text-center">
                <span className="hdot in" aria-hidden="true">
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <span className="htile-label text-hero-ink">{label}</span>
              </div>
            ))}
          </div>
        </section>
        <div className="flex-1" />
        <Button id="onboarding-start" fullWidth size="lg" onClick={() => setStep('setup')}>
          {t('onboarding.getStarted')}
          <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
      </Page>
    )
  }

  return (
    <Page>
    <div className="flex flex-col gap-6 w-full max-w-[480px] mx-auto animate-fade-in">
      <header className="flex flex-col gap-2 pt-4">
        <h1 className="t-large text-ink">{t('onboarding.setupTitle')}</h1>
        <p className="t-sub">{t('onboarding.setupSubtitle')}</p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="t-over px-1">{t('onboarding.selectLanguage')}</h2>
        {/* Switches the app's language as it is picked */}
        <SegmentedControl<AppLanguage>
          label={t('onboarding.selectLanguage')}
          value={settings.language}
          onChange={setLanguage}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ru', label: 'Русский' },
            { value: 'uz', label: "O'zbekcha" },
          ]}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="t-over px-1">{t('onboarding.selectCurrency')}</h2>
        <div className="sgroup" role="radiogroup" aria-label={t('onboarding.selectCurrency')}>
          {SUPPORTED_CURRENCIES.map(({ code }) => {
            const selected = selectedCurrency === code
            return (
              <button
                key={code}
                id={`currency-${code.toLowerCase()}`}
                type="button"
                role="radio"
                aria-checked={selected}
                className="prow"
                onClick={() => setSelectedCurrency(code)}
              >
                <span className="prow-ico bg-fill" aria-hidden="true">
                  <span className="cbadge">{code}</span>
                </span>
                <span className="prow-main">
                  <span className="prow-title">
                    <span>{currencyName(code, i18n.language)}</span>
                  </span>
                </span>
                <span className={`shrink-0 ${selected ? 'text-accent-text' : 'invisible'}`} aria-hidden="true">
                  <Check size={20} strokeWidth={2} />
                </span>
              </button>
            )
          })}
        </div>
        <p className="sgroup-cap">{t('onboarding.currencyHint')}</p>
      </section>

      <Button id="onboarding-finish" fullWidth size="lg" onClick={handleFinish} loading={isLoading}>
        {t('common.done')}
      </Button>
    </div>
    </Page>
  )
}
