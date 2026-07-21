// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cpu, Cloud, Check } from 'lucide-react'
import { api } from '../api'
import type { LocalModel, DownloadStatus } from '../api'
import { SHIPPED_LOCALES, LANGUAGE_NAMES, loadLanguage } from '../i18n'
import Button from './Button'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { useToast } from './Toast'
import { usePoller } from '../lib/usePoller'
import { useKeyStatus } from './KeyStatus'
import { errMsg } from '../lib/errors'
import { radioGroup } from '../lib/radiogroup'
import { EngineCard, ModelRow, fmtGb } from './EngineSettings'

// One heading per step is rendered at a time, so a single shared id both labels
// the dialog (Modal's aria-labelledby) and is the focus target on step change.
const HEADING_ID = 'onboarding-heading'

/**
 * First-run wizard: pick a language, set up the AI engine (free local model or
 * OpenRouter key), done. Not dismissable — an app with no engine cannot do
 * anything the user came for — and marked done only on completion, so an
 * abandoned setup is offered again rather than silently left broken.
 */
export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { refresh: refreshEngine } = useKeyStatus()
  const [step, setStep] = useState(0)
  const [lang, setLang] = useState('en')
  const [otherCode, setOtherCode] = useState('')

  // Move focus into the newly-shown step's heading on every step change (and on
  // open), so a keyboard/SR user isn't left on a control that no longer exists.
  useEffect(() => { document.getElementById(HEADING_ID)?.focus() }, [step])

  async function finish() {
    // Only reaching the end marks the wizard done — and with no skip, the end is
    // only reachable once an engine works. Quitting mid-setup leaves the flag
    // false so the next launch offers the wizard again instead of an app that
    // can't do anything.
    try { await api.putSettings({ onboarding_done: true }) } catch { /* non-fatal */ }
    // If the user chose a Tier-2 language, kick off its translation now that an
    // engine may exist. Fire-and-forget, but a failure is surfaced (not
    // swallowed): the wizard already told them to track it in Settings.
    const code = otherCode.trim().toLowerCase()
    if (lang === '__other__' && /^[a-z]{2}$/.test(code)) {
      api.generateLocale(code)
        .then(() => api.putSettings({ app_language: code }))
        .catch(() => toast.error(t('onboarding.langTranslateFailed')))
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
    <Modal labelledBy={HEADING_ID} dismissable={false} onClose={() => {}}>
      {/* No skip: without an AI engine every feature in the app fails, so
          dismissing this would only hand the user a broken install. The engine
          step's own Next stays disabled until one is actually working. */}
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <Stepper step={step} />
        <span className="muted-sm">{t('onboarding.step', { n: step + 1, total: 3 })}</span>
      </div>

      {step === 0 && <LanguageStep lang={lang} otherCode={otherCode} setOtherCode={setOtherCode} onPick={pickLanguage} onNext={() => setStep(1)} />}
      {step === 1 && <EngineStep onBack={() => setStep(0)} onNext={() => setStep(2)} />}
      {step === 2 && (
        <div>
          <h2 id={HEADING_ID} tabIndex={-1} style={{ marginBottom: 'var(--space-2)' }}>{t('onboarding.doneTitle')}</h2>
          <p style={{ marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>{t('onboarding.doneBody')}</p>
          {lang === '__other__' && /^[a-z]{2}$/.test(otherCode.trim()) && (
            <p className="muted-sm" style={{ marginBottom: 'var(--space-4)' }}>{t('onboarding.langOtherDoneNote')}</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button variant="ghost" onClick={() => setStep(1)}>{t('onboarding.back')}</Button>
            <Button variant="primary" onClick={() => finish()}>{t('onboarding.finish')}</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Three ink segments filling left-to-right — the "Step n of 3" text made visual.
 *  aria-hidden: the text label beside it already conveys progress to a reader. */
function Stepper({ step }: { step: number }) {
  return (
    <div aria-hidden style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          flex: 1, height: 4, border: '1px solid var(--ink)',
          background: i <= step ? 'var(--ink)' : 'transparent',
        }} />
      ))}
    </div>
  )
}

function LanguageStep({ lang, otherCode, setOtherCode, onPick, onNext }: {
  lang: string; otherCode: string; setOtherCode: (s: string) => void
  onPick: (code: string) => void; onNext: () => void
}) {
  const { t } = useTranslation()
  const selectId = useId()
  return (
    <div>
      <h2 id={HEADING_ID} tabIndex={-1} style={{ marginBottom: 'var(--space-1)' }}>{t('onboarding.welcome')}</h2>
      <p className="muted-sm" style={{ marginBottom: 'var(--space-3)' }}>{t('onboarding.intro')}</p>
      <label htmlFor={selectId} style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-2)' }}>{t('onboarding.langTitle')}</label>
      <p className="help-text" style={{ marginBottom: 'var(--space-2)' }}>{t('onboarding.langHelp')}</p>
      <select id={selectId} value={lang} onChange={e => onPick(e.target.value)}
        style={{ marginBottom: 'var(--space-3)', maxWidth: 280 }}>
        {SHIPPED_LOCALES.map(code => (
          <option key={code} value={code}>{LANGUAGE_NAMES[code] ?? code}</option>
        ))}
        <option value="__other__">{t('onboarding.langOther')}</option>
      </select>
      {lang === '__other__' && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <input value={otherCode} onChange={e => setOtherCode(e.target.value)} placeholder={t('onboarding.langOtherPlaceholder')} style={{ maxWidth: 160 }} />
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
  const [models, setModels] = useState<LocalModel[]>([])
  const [modelId, setModelId] = useState<string | null>(null)
  const [dl, setDl] = useState<DownloadStatus | null>(null)
  const [ready, setReady] = useState(false)
  const [key, setKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keySaved, setKeySaved] = useState(false)
  const [err, setErr] = useState('')
  const [confirmForce, setConfirmForce] = useState<string | null>(null)
  const started = useRef(false)

  const modelsId = useId()

  useEffect(() => {
    api.listLocalModels().then(ms => {
      setModels(ms)
      // Preselect the active model if there is one, else the recommended default,
      // so an existing setup is reflected and accepting stays one click.
      setModelId(ms.find(m => m.active)?.id ?? ms.find(m => m.recommended)?.id ?? ms[0]?.id ?? null)
    }).catch(() => {})
    // An engine may already work (a prior setup, or the ?onboarding=1 dev
    // override showing the wizard over a configured app) — reflect that so Next
    // is enabled without forcing a redundant download.
    api.getEngine().then(e => { if (e.ready) setReady(true) }).catch(() => {})
  }, [])

  /** Point the engine at an already-downloaded model without re-downloading it. */
  async function useModel() {
    if (!modelId) return
    setErr('')
    try {
      await api.putSettings({ llm_provider: 'local', local_model_id: modelId })
      setReady(true); refreshEngine()
    } catch (e) { setErr(errMsg(e)) }
  }

  async function download(force = false) {
    setErr('')
    try {
      started.current = true
      await api.putSettings({ llm_provider: 'local' })
      await api.startModelDownload({ model_id: modelId ?? undefined, force })
      setDl({ state: 'pending' })
      poller.start(async () => {
        const s = await api.getDownloadStatus()
        if (s.state === 'downloading' || s.state === 'resuming' || s.state === 'pending') {
          setDl(s)
          return false
        }
        if (s.state === 'done') {
          // Make what was downloaded the active model, not whatever the default is.
          if (s.model_id) { try { await api.putSettings({ local_model_id: s.model_id }) } catch { /* keeps the default */ } }
          setDl(null); setReady(true); refreshEngine(); return true
        }
        setDl(null); setErr(s.error ?? 'Download failed'); return true
      })
    } catch (e) {
      setDl(null)
      const msg = errMsg(e)
      // The RAM pre-check is overridable — offer to proceed in-system, mirroring
      // Settings, rather than through a native window.confirm.
      if (/RAM/i.test(msg)) { setConfirmForce(msg); return }
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
  const selectedModel = models.find(m => m.id === modelId) ?? null
  const modelRadio = radioGroup(models.map(m => m.id), modelId, id => setModelId(id))
  const providers: ('local' | 'openrouter')[] = ['local', 'openrouter']
  const providerRadio = radioGroup(providers, choice, setChoice)
  const downloading = dl && dl.state !== 'done'
  const pct = dl?.bytes_total ? Math.min(100, Math.round((dl.bytes_done ?? 0) / dl.bytes_total * 100)) : 0

  return (
    <div>
      <h2 id={HEADING_ID} tabIndex={-1} style={{ marginBottom: 'var(--space-1)' }}>{t('onboarding.engineTitle')}</h2>
      <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>{t('onboarding.engineHelp')}</p>

      {/* Same cards and same ink-fill selection as Settings — and as the model
          picker below, so this step speaks one selection language, not two. */}
      <div {...providerRadio.group} aria-labelledby={HEADING_ID} className="engine-grid"
           style={{ marginBottom: 'var(--space-3)' }}>
        <EngineCard
          {...providerRadio.item(0)}
          icon={<Cpu size={18} aria-hidden />}
          title={t('engine.local.title')}
          desc={t('engine.local.desc')}
          onClick={() => setChoice('local')}
        />
        <EngineCard
          {...providerRadio.item(1)}
          icon={<Cloud size={18} aria-hidden />}
          title={t('engine.openrouter.title')}
          desc={t('engine.openrouter.desc')}
          onClick={() => setChoice('openrouter')}
        />
      </div>

      {choice === 'local' && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          {ready ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent-text)' }}><Check size={16} aria-hidden /> {t('onboarding.engineLocalReady')}</span>
          ) : downloading ? (
            <div>
              {/* Bordered ink bar, matching Settings. */}
              <div
                role="progressbar"
                aria-label={t('engine.local.progressLabelFor', { model: selectedModel?.label ?? '' })}
                aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                style={{ height: 8, background: 'var(--surface-dim)', border: '1px solid var(--border)', overflow: 'hidden' }}
              >
                {/* scaleX rather than width: the bar ticks for minutes, and
                    transform doesn't re-lay-out the step on every update. */}
                <div style={{
                  width: '100%', height: '100%', background: 'var(--ink)',
                  transformOrigin: 'left', transform: `scaleX(${pct / 100})`, transition: 'transform .3s',
                }} />
              </div>
              <p className="muted-sm" style={{ marginTop: 6 }}>
                {t('engine.local.downloading', { done: fmtGb(dl?.bytes_done), total: fmtGb(dl?.bytes_total), pct })}
              </p>
              <p className="help-text" style={{ marginTop: 2 }}>{t('onboarding.engineDownloadWait')}</p>
            </div>
          ) : (
            <>
              <p className="muted-sm" id={modelsId} style={{ marginBottom: 'var(--space-2)' }}>
                {t('engine.local.pickModel')}
              </p>
              <div {...modelRadio.group} aria-labelledby={modelsId} className="model-list"
                   style={{ marginBottom: 'var(--space-3)' }}>
                {models.map((m, i) => (
                  <ModelRow
                    key={m.id} {...modelRadio.item(i)}
                    model={m}
                    name={t(`engine.models.${m.id}.name`, { defaultValue: m.label })}
                    onClick={() => setModelId(m.id)}
                  />
                ))}
              </div>
              {selectedModel?.downloaded ? (
                // Already on disk — activate it, don't re-download.
                <Button onClick={useModel} disabled={!modelId}>
                  {t('engine.local.useModel')}
                </Button>
              ) : (
                <Button onClick={() => download()} disabled={!modelId}>
                  {t('onboarding.engineLocalCta')}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {choice === 'openrouter' && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          {keySaved ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent-text)' }}><Check size={16} aria-hidden /> {t('onboarding.engineKeySaved')}</span>
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

      {confirmForce && (
        <ConfirmModal
          title={t('engine.local.forceTitle')}
          body={t('engine.local.confirmForce', { msg: confirmForce })}
          confirmLabel={t('engine.local.downloadAnyway')}
          onConfirm={() => { setConfirmForce(null); void download(true) }}
          onCancel={() => setConfirmForce(null)}
        />
      )}
    </div>
  )
}
