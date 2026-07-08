import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'

/**
 * i18n setup. English is the source catalog, bundled and always present.
 * Shipped Tier-1 locales (nl, fr, de, es, it, pt, pl) are code-split and loaded
 * on demand from ./locales/<lng>.json. Any other language is Tier-2: generated
 * on-device and served by the backend at /api/i18n/<lng> (see loadLanguage).
 *
 * The active language is server-driven (config.app_language) but cached in
 * localStorage so a reload doesn't flash English before settings arrive.
 */

export const SHIPPED_LOCALES = ['en', 'nl', 'fr', 'de', 'es', 'it', 'pt', 'pl'] as const

// Native names for the language pickers (Settings + onboarding).
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', nl: 'Nederlands', fr: 'Français', de: 'Deutsch',
  es: 'Español', it: 'Italiano', pt: 'Português', pl: 'Polski',
}

const STORAGE_KEY = 'jobcoach_lang'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: localStorage.getItem(STORAGE_KEY) || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },  // React already escapes
  returnEmptyString: false,               // empty translation → fall back to en
})

const shipped = new Set(SHIPPED_LOCALES as readonly string[])

/** Load a locale's catalog (shipped bundle or on-device backend file) and switch to it. */
export async function loadLanguage(lng: string): Promise<void> {
  if (lng !== 'en' && !i18n.hasResourceBundle(lng, 'translation')) {
    try {
      const catalog = shipped.has(lng)
        ? (await import(`./locales/${lng}.json`)).default
        : await fetch(`/api/i18n/${lng}`).then(r => (r.ok ? r.json() : {}))
      i18n.addResourceBundle(lng, 'translation', catalog, true, true)
    } catch {
      // Fall back to English if the catalog can't be loaded.
    }
  }
  localStorage.setItem(STORAGE_KEY, lng)
  await i18n.changeLanguage(lng)
}

// Apply a cached non-English language on first load.
const cached = localStorage.getItem(STORAGE_KEY)
if (cached && cached !== 'en') void loadLanguage(cached)

export default i18n
