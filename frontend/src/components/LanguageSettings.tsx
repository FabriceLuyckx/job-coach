import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { SHIPPED_LOCALES, LANGUAGE_NAMES, loadLanguage } from '../i18n'
import { useToast } from './Toast'
import { errMsg } from '../lib/errors'

/**
 * UI-language picker. Tier-1 (shipped, reviewed) locales switch instantly. The
 * "Other…" free-entry path (on-device translation by the AI engine) is wired up
 * in Phase D; here it selects from the shipped set.
 */
export default function LanguageSettings({ current }: { current: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [lang, setLang] = useState(current)

  async function change(next: string) {
    setLang(next)
    try {
      await api.putSettings({ app_language: next })
      await loadLanguage(next)
    } catch (e) { toast.error(errMsg(e)) }
  }

  return (
    <div className="card">
      <div className="section-title" style={{ marginBottom: 'var(--space-4)' }}>{t('settings.language.title')}</div>
      <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>{t('settings.language.help')}</p>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{t('settings.language.label')}</label>
        <select value={lang} onChange={e => change(e.target.value)} style={{ maxWidth: 260 }}>
          {SHIPPED_LOCALES.map(code => (
            <option key={code} value={code}>{LANGUAGE_NAMES[code] ?? code}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
