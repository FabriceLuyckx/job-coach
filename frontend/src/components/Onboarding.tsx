// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cpu, Cloud, Check } from 'lucide-react'
import { api } from '../api'
import type { LocalModel } from '../api'
import { SHIPPED_LOCALES, LANGUAGE_NAMES, loadLanguage } from '../i18n'
import Button from './Button'
import { usePoller } from '../lib/usePoller'
import { useKeyStatus } from './KeyStatus'
import { errMsg } from '../lib/errors'

/**
 * First-run wizard: pick a language, set up the AI engine (free local model or
 * OpenRouter key), done. Shown over the app until an engine is ready or the user
 * skips (which sets onboarding_done so it never nags again).
 */
export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const { refresh: refreshEngine } = useKeyStatus()
  const [step, setStep] = useState(0)
  const [lang, setLang] = useState('en')
  const [otherCode, setOtherCode] = useState('')

  async function finish(markDone = true) {
    try { if (markDone) await api.putSettings({ onboarding_done: true }) } catch { /* non-fatal */ }
    // If the user chose a Tier-2 language, kick off its translation now that an
    // engine may exist (fire-and-forget; Settings shows progress if they revisit).
    const code = otherCode.trim().toLowerCase()
    if (lang === '__other__' && /^[a-z]{2}$/.test(code)) {
      api.generateLocale(code).then(() => api.putSettings({ app_language: code })).catch(() => {})
    }
    refreshEngine()
    onDone()
  }

  async function pickLanguage(code: string) {
    setLang(code)
    if (code !== '__other__') {
      try { await api.putSettings({ app_language: code }); await loadLanguage(code) } catch { /* ignore */ }
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'color-mix(in srgb, var(--ink) 45%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
    }}>
      <div className="card" style={{ maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-2)' }}>
          <span className="muted-sm">{t('onboarding.step', { n: step + 1, total: 3 })}</span>
          <button type="button" className="btn-ghost" style={{ fontSize: 'var(--fs-sm)' }} onClick={() => finish()}>
            {t('onboarding.skip')}
          </button>
        </div>

        {step === 0 && <LanguageStep lang={lang} otherCode={otherCode} setOtherCode={setOtherCode} onPick={pickLanguage} onNext={() => setStep(1)} />}
        {step === 1 && <EngineStep onBack={() => setStep(0)} onNext={() => setStep(2)} />}
        {step === 2 && (
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-2)' }}>{t('onboarding.doneTitle')}</h2>
            <p style={{ marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>{t('onboarding.doneBody')}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button variant="ghost" onClick={() => setStep(1)}>{t('onboarding.back')}</Button>
              <Button variant="primary" onClick={() => finish()}>{t('onboarding.finish')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LanguageStep({ lang, otherCode, setOtherCode, onPick, onNext }: {
  lang: string; otherCode: string; setOtherCode: (s: string) => void
  onPick: (code: string) => void; onNext: () => void
}) {
  const { t } = useTranslation()
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-1)' }}>{t('onboarding.welcome')}</h2>
      <p className="muted-sm" style={{ marginBottom: 'var(--space-3)' }}>{t('onboarding.intro')}</p>
      <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>{t('onboarding.langTitle')}</div>
      <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>{t('onboarding.langHelp')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        {SHIPPED_LOCALES.map(code => (
          <button key={code} type="button" onClick={() => onPick(code)}
            style={{
              padding: '8px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
              border: `2px solid ${lang === code ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
            }}>
            {LANGUAGE_NAMES[code] ?? code}
            {lang === code && <Check size={14} color="var(--accent)" aria-hidden />}
          </button>
        ))}
        <button type="button" onClick={() => onPick('__other__')}
          style={{
            padding: '8px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
            border: `2px solid ${lang === '__other__' ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--surface)',
          }}>
          {t('onboarding.langOther')}
        </button>
      </div>
      {lang === '__other__' && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <input value={otherCode} onChange={e => setOtherCode(e.target.value)} placeholder="sv, ja, ar…" style={{ maxWidth: 160 }} />
          <p className="muted-sm" style={{ marginTop: 6 }}>{t('onboarding.langQueued')}</p>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={onNext}>{t('onboarding.next')}</Button>
      </div>
    </div>
  )
}

function EngineStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { t } = useTranslation()
  const { refresh: refreshEngine } = useKeyStatus()
  const poller = usePoller(1000)
  const [choice, setChoice] = useState<'local' | 'openrouter' | null>(null)
  const [model, setModel] = useState<LocalModel | null>(null)
  const [pct, setPct] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [key, setKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keySaved, setKeySaved] = useState(false)
  const [err, setErr] = useState('')
  const started = useRef(false)

  useEffect(() => { api.listLocalModels().then(ms => setModel(ms[0] ?? null)).catch(() => {}) }, [])

  async function download(force = false) {
    setErr('')
    try {
      started.current = true
      await api.putSettings({ llm_provider: 'local' })
      await api.startModelDownload({ force })
      setPct(0)
      poller.start(async () => {
        const s = await api.getDownloadStatus()
        if (s.state === 'downloading' || s.state === 'resuming' || s.state === 'pending') {
          setPct(s.bytes_total ? Math.round((s.bytes_done ?? 0) / s.bytes_total * 100) : 0)
          return false
        }
        if (s.state === 'done') { setPct(null); setReady(true); refreshEngine(); return true }
        setPct(null); setErr(s.error ?? 'Download failed'); return true
      })
    } catch (e) {
      setPct(null)
      const msg = errMsg(e)
      // ponytail: native confirm for the RAM override; swap for the shared Modal if it grows options
      if (/RAM/i.test(msg) && window.confirm(`${msg}\n\nDownload anyway?`)) return download(true)
      setErr(msg)
    }
  }

  async function saveKey() {
    if (!key.trim()) return
    setSavingKey(true); setErr('')
    try {
      await api.putSettings({ llm_provider: 'openrouter', openrouter_api_key: key.trim() })
      setKeySaved(true); refreshEngine()
    } catch (e) { setErr(errMsg(e)) } finally { setSavingKey(false) }
  }

  const canContinue = ready || keySaved

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-1)' }}>{t('onboarding.engineTitle')}</h2>
      <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>{t('onboarding.engineHelp')}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <button type="button" onClick={() => setChoice('local')} aria-pressed={choice === 'local'}
          style={{ textAlign: 'left', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            border: `2px solid ${choice === 'local' ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 4 }}><Cpu size={18} aria-hidden /> {t('engine.local.title')}</div>
          <div className="muted-sm">{t('engine.local.desc')}</div>
        </button>
        <button type="button" onClick={() => setChoice('openrouter')} aria-pressed={choice === 'openrouter'}
          style={{ textAlign: 'left', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            border: `2px solid ${choice === 'openrouter' ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 4 }}><Cloud size={18} aria-hidden /> {t('engine.openrouter.title')}</div>
          <div className="muted-sm">{t('engine.openrouter.desc')}</div>
        </button>
      </div>

      {choice === 'local' && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          {ready ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}><Check size={16} aria-hidden /> {t('onboarding.engineLocalReady')}</span>
          ) : pct !== null ? (
            <div>
              <div style={{ height: 8, background: 'var(--surface-dim)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width .3s' }} />
              </div>
              <p className="muted-sm" style={{ marginTop: 6 }}>{t('onboarding.engineDownloading', { pct })}</p>
            </div>
          ) : (
            <Button onClick={() => download()}>
              {t('onboarding.engineLocalCta')}{model ? ` (~${(model.size_bytes / 1e9).toFixed(1)} GB)` : ''}
            </Button>
          )}
        </div>
      )}

      {choice === 'openrouter' && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          {keySaved ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}><Check size={16} aria-hidden /> {t('onboarding.engineKeySaved')}</span>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder={t('onboarding.engineKeyPlaceholder')} style={{ flex: 1, minWidth: 220 }} />
              <Button onClick={saveKey} busy={savingKey}>{t('onboarding.engineSaveKey')}</Button>
            </div>
          )}
          <p className="muted-sm" style={{ marginTop: 6 }}>
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">{t('onboarding.engineGetKey')}</a>
          </p>
        </div>
      )}

      {err && <p className="error-msg" style={{ marginBottom: 'var(--space-2)' }}>{err}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="ghost" onClick={onBack}>{t('onboarding.back')}</Button>
        <Button variant="primary" onClick={onNext} disabled={!canContinue}>{t('onboarding.next')}</Button>
      </div>
    </div>
  )
}
