import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from '@/locales/ru.json'
import en from '@/locales/en.json'
import uz from '@/locales/uz.json'
import { SETTINGS_STORAGE_KEY } from '@/lib/constants'

const resources = {
  ru: { translation: ru },
  en: { translation: en },
  uz: { translation: uz },
}

// Start in the language the user picked last time, not the default
function getSavedLanguage(): string {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    const language = stored ? JSON.parse(stored).state?.settings?.language : null
    if (language && language in resources) return language
  } catch (e) {
    console.error(e)
  }
  return 'ru'
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getSavedLanguage(),
    fallbackLng: 'ru',
    interpolation: {
      escapeValue: false,
    },
  })

document.documentElement.lang = i18n.language
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language
})

export default i18n
