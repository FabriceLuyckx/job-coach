// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { SHIPPED_LOCALES, LANGUAGE_NAMES, loadLanguage } from '../i18n'
import { useKeyStatus } from './KeyStatus'
import Button from './Button'
import { useToast } from './Toast'
import { usePoller } from '../lib/usePoller'
import { errMsg } from '../lib/errors'

// Common ISO 639-1 codes offered as a convenience for the "Other" flow.
const OTHER_CODES: Record<string, string> = {
  sv: 'Svenska', da: 'Dansk', no: 'Norsk', fi: 'Suomi', cs: 'Čeština',
  ro: 'Română', hu: 'Magyar', el: 'Ελληνικά', tr: 'Türkçe', uk: 'Українська',
  ru: 'Русский', zh: '中文', ja: '日本語', ko: '한국어', hi: 'हिन्दी',
  vi: 'Tiếng Việt', id: 'Bahasa Indonesia', ar: 'العربية', he: 'עברית',
}

/**
 * UI-language picker. Tier-1 (shipped, reviewed) locales switch instantly; the
 * "Other…" path translates a chosen language on-device with the AI engine and
 * then switches to it.
 */
export default function LanguageSettings({ current }: { current: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { keySet } = useKeyStatus()
  const poller = usePoller(1500)
  const [lang, setLang] = useState(SHIPPED_LOCALES.includes(current as never) ? current : '__other__')
  const [otherCode, setOtherCode] = useState(SHIPPED_LOCALES.includes(current as never) ? '' : current)
  const [genPct, setGenPct] = useState<number | null>(null)

  async function apply(next: string) {
    try {
      await api.putSettings({ app_language: next })
      await loadLanguage(next)
    } catch (e) { toast.error(errMsg(e)) }
  }

  function onSelect(value: string) {
    setLang(value)
    if (value !== '__other__') void apply(value)
  }

  async function generateOther() {
    const code = otherCode.trim().toLowerCase()
    if (!/^[a-z]{2}$/.test(code)) { toast.error(t('settings.language.badCode')); return }
    if (!keySet) { toast.error(t('settings.language.needEngineFirst')); return }
    try {
      setGenPct(0)
      await api.generateLocale(code)
      poller.start(async () => {
        const s = await api.getLocaleGenStatus(code)
        if (s.status === 'running') {
          setGenPct(s.total ? Math.round((s.current ?? 0) / s.total * 100) : 0)
          return false
        }
        if (s.status === 'done') {
          setGenPct(null)
          await apply(code)
          toast.success(t('settings.language.generated', { lang: OTHER_CODES[code] ?? code }))
          return true
        }
        setGenPct(null)
        toast.error(s.error ? `${s.error}` : t('settings.language.genFailed'))
        return true
      })
    } catch (e) {
      setGenPct(null)
      toast.error(errMsg(e))
    }
  }

  return (
    <div className="card">
      <div className="section-title" style={{ marginBottom: 'var(--space-4)' }}>{t('settings.language.title')}</div>
      <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>{t('settings.language.help')}</p>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{t('settings.language.label')}</label>
        <select value={lang} onChange={e => onSelect(e.target.value)} style={{ maxWidth: 260 }}>
          {SHIPPED_LOCALES.map(code => (
            <option key={code} value={code}>{LANGUAGE_NAMES[code] ?? code}</option>
          ))}
          <option value="__other__">{t('settings.language.other')}</option>
        </select>
      </div>

      {lang === '__other__' && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <p className="muted-sm" style={{ marginBottom: 'var(--space-2)' }}>{t('settings.language.otherHelp')}</p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              list="other-langs"
              value={otherCode}
              onChange={e => setOtherCode(e.target.value)}
              placeholder={t('settings.language.otherPlaceholder')}
              style={{ maxWidth: 200 }}
            />
            <datalist id="other-langs">
              {Object.entries(OTHER_CODES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </datalist>
            <Button onClick={generateOther} busy={genPct !== null}>
              {genPct !== null ? t('settings.language.generating', { pct: genPct }) : t('settings.language.generate')}
            </Button>
          </div>
          <p className="callout callout-warn" style={{ marginTop: 'var(--space-3)' }}>
            {t('settings.language.experimental')}
          </p>
        </div>
      )}
    </div>
  )
}
