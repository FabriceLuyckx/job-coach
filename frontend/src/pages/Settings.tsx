// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useId, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Pencil, SlidersHorizontal } from 'lucide-react'
import { api } from '../api'
import type { Profile } from '../types'
import Button from '../components/Button'
import SaveButton from '../components/SaveButton'
import SaveStatus from '../components/SaveStatus'
import Collapsible from '../components/Collapsible'
import ConfirmModal from '../components/ConfirmModal'
import EngineSettings from '../components/EngineSettings'
import TemplateThumb from '../components/TemplateThumb'
import PhotoCropModal, { DEFAULT_CROP } from '../components/PhotoCropModal'
import { useToast } from '../components/Toast'
import { useKeyStatus } from '../components/KeyStatus'
import LanguageSettings from '../components/LanguageSettings'
import type { CVTemplateRegistry, EngineProvider } from '../api'
import { errMsg } from '../lib/errors'
import { radioGroup } from '../lib/radiogroup'
import { useProfileAutosave } from '../lib/useProfileAutosave'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

const OPENROUTER_MODELS = [
  'anthropic/claude-sonnet-4-6',
  'anthropic/claude-opus-4',
  'anthropic/claude-haiku-4-5',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-001',
  'mistralai/mistral-large',
]

const fmtUsd = (n: number | null | undefined) => (n == null ? '—' : `$${n.toFixed(2)}`)

interface Usage { balance: number | null; usage: number | null; remaining: number | null }

/** One editable AI-prompt block (textarea + save + reset), used ×4 under Advanced. */
function PromptEditor({ title, help, value, saved, defaultValue, rows = 8, onChange, onSave }: {
  title: string
  help: React.ReactNode
  value: string
  saved: string
  defaultValue: string
  rows?: number
  onChange: (v: string) => void
  onSave: () => Promise<void>
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <h3 id={id} style={{ fontSize: 'var(--fs-base)', margin: '0 0 var(--space-2)' }}>{title}</h3>
      <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>{help}</p>
      <textarea
        aria-labelledby={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 'var(--fs-sm)', lineHeight: 1.5 }}
      />
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        <SaveButton dirty={value !== saved} onSave={onSave} idleLabel={t('settings.prompts.savePrompt')} />
        <Button variant="secondary" onClick={() => onChange(defaultValue)} disabled={value === defaultValue}>
          {t('settings.prompts.reset')}
        </Button>
      </div>
    </div>
  )
}

/** One editable palette slot: swatch + hex field.
 *
 * The hex field keeps its own draft so a half-typed value stays on screen, and
 * only commits when it parses. Writing every keystroke through meant "nope" was
 * autosaved to the profile while the picker beside it displayed #000000 — the
 * control showing a colour the app had not stored. */
function ColorRow({ name, value, onChange }: {
  name: string
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [bad, setBad] = useState(false)
  // A swatch click (or any outside change) re-seeds the field.
  useEffect(() => { setDraft(value); setBad(false) }, [value])

  return (
    <div style={{ marginBottom: 'var(--space-2)' }}>
      {/* wraps, like every other multi-child row on this page — these three
          children are ~308px and were the one row that could clip at 200% zoom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <span style={{ width: 140, fontSize: 'var(--fs-sm)' }}>{name}</span>
        <input
          type="color"
          value={HEX_RE.test(value) ? value : '#000000'}
          onChange={e => onChange(e.target.value)}
          aria-label={t('settings.template.colors.pickerLabel', { slot: name })}
          style={{ width: 34, height: 26, padding: 0, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }}
        />
        <input
          type="text"
          value={draft}
          aria-label={t('settings.template.colors.hexLabel', { slot: name })}
          aria-invalid={bad || undefined}
          onChange={e => {
            setDraft(e.target.value)
            if (HEX_RE.test(e.target.value)) { setBad(false); onChange(e.target.value) }
          }}
          onBlur={() => setBad(!HEX_RE.test(draft))}
          style={{ width: 110, fontFamily: 'monospace' }}
        />
      </div>
      {bad && <p className="error-msg">{t('settings.template.colors.badHex')}</p>}
    </div>
  )
}

export default function SettingsPage() {
  const toast = useToast()
  const { t } = useTranslation()
  const { refresh: refreshKeyStatus } = useKeyStatus()
  // The design prefs live in profile.json, so they save the way every other
  // profile field does — debounced, no button. This card used to be the one
  // place in the app that still asked you to press Save.
  const { profile, error: profileError, saveState, saveError, runSave, set } = useProfileAutosave()
  const [settings, setSettings] = useState<{
    openrouter_api_key_set: boolean
    openrouter_api_key_preview: string
    openrouter_model: string
    cv_prompt: string
    cv_prompt_default: string
    letter_prompt: string
    letter_prompt_default: string
    scan_extract_prompt: string
    scan_extract_prompt_default: string
    scan_filter_prompt: string
    scan_filter_prompt_default: string
    llm_provider: EngineProvider
    local_model_id: string
    app_language: string
    onboarding_done: boolean
    auto_update_check: boolean
  } | null>(null)
  const [provider, setProvider] = useState<EngineProvider>('openrouter')
  const [photo, setPhoto] = useState<{ exists: boolean; data_uri: string | null } | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [usageErr, setUsageErr] = useState('')
  const [loadError, setLoadError] = useState('')

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [cvPrompt, setCvPrompt] = useState('')
  const [letterPrompt, setLetterPrompt] = useState('')
  const [scanExtract, setScanExtract] = useState('')
  const [scanFilter, setScanFilter] = useState('')

  const [registry, setRegistry] = useState<CVTemplateRegistry | null>(null)
  const [cropping, setCropping] = useState(false)

  const [photoUploading, setPhotoUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const backupRef = useRef<HTMLInputElement>(null)

  function loadUsage() {
    api.getOpenrouterUsage()
      .then(u => { setUsage(u); setUsageErr('') })
      .catch(e => { setUsage(null); setUsageErr(errMsg(e)) })
  }

  useEffect(() => {
    Promise.all([api.getSettings(), api.getPhoto(), api.getTemplates()]).then(([s, ph, tpl]) => {
      setSettings(s)
      setPhoto(ph)
      setRegistry(tpl)
      setProvider(s.llm_provider)
      setModel(s.openrouter_model)
      setCvPrompt(s.cv_prompt)
      setLetterPrompt(s.letter_prompt)
      setScanExtract(s.scan_extract_prompt)
      setScanFilter(s.scan_filter_prompt)
      if (!OPENROUTER_MODELS.includes(s.openrouter_model)) setCustomModel(s.openrouter_model)
      if (s.openrouter_api_key_set) loadUsage()
    }).catch(e => setLoadError(errMsg(e)))
  }, [])

  // Switching engine takes effect immediately (next AI request uses it).
  async function changeProvider(p: EngineProvider) {
    const previous = provider
    setProvider(p)
    try {
      await api.putSettings({ llm_provider: p })
      setSettings(await api.getSettings())
      refreshKeyStatus()
    } catch (e) {
      // Optimistic, so a failure has to roll back: leaving the new engine's
      // fields on screen meant the card claimed a switch the server refused.
      setProvider(previous)
      toast.error(errMsg(e))
    }
  }

  // Save handlers throw on error so the SaveButton surfaces it.
  async function saveOpenRouter() {
    const effectiveModel = model === '__custom__' ? customModel : model
    await api.putSettings({ ...(apiKey ? { openrouter_api_key: apiKey } : {}), openrouter_model: effectiveModel })
    setSettings(await api.getSettings())
    setApiKey('')
    refreshKeyStatus()
    loadUsage()
  }

  async function savePrompt(data: { cv_prompt?: string; letter_prompt?: string; scan_extract_prompt?: string; scan_filter_prompt?: string }) {
    // The language placeholder is what makes non-English output work; catch its
    // removal here with a clear message instead of a server round-trip.
    for (const p of [data.cv_prompt, data.letter_prompt]) {
      if (p !== undefined && !p.includes('{lang_name}')) {
        throw new Error(t('settings.prompts.langPlaceholderError'))
      }
    }
    await api.putSettings(data)
    setSettings(await api.getSettings())
  }

  // Optimistic like changeProvider: the checkbox flips immediately, a refused
  // save rolls it back so the control never claims a preference the server lost.
  async function saveAutoUpdate(v: boolean) {
    if (!settings) return
    const previous = settings.auto_update_check
    setSettings({ ...settings, auto_update_check: v })
    try {
      await api.putSettings({ auto_update_check: v })
    } catch (e) {
      setSettings(s => (s ? { ...s, auto_update_check: previous } : s))
      toast.error(errMsg(e))
    }
  }

  /** Patch design prefs — autosaved like any other profile edit. */
  function setDesign(patch: Partial<Profile['cv_design_preferences']>) {
    if (!profile) return
    set('cv_design_preferences', { ...profile.cv_design_preferences, ...patch })
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoUploading(true)
    try {
      await api.uploadPhoto(file)
      setPhoto(await api.getPhoto())
      toast.success(t('settings.photo.uploaded'))
      setCropping(true)  // frame the fresh upload right away
    } catch (e) {
      toast.error(errMsg(e))
    } finally { setPhotoUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handlePhotoDelete() {
    setPhotoUploading(true)
    try {
      await api.deletePhoto()
      setPhoto({ exists: false, data_uri: null })
      toast.success(t('settings.photo.removed'))
    } catch (e) {
      toast.error(errMsg(e))
    } finally { setPhotoUploading(false) }
  }

  async function runImport(file: File) {
    setImporting(true)
    try {
      await api.importBackup(file)
      toast.success(t('settings.backup.restored'))
      setTimeout(() => window.location.reload(), 900)
    } catch (e) {
      toast.error(errMsg(e))
      setImporting(false)
    }
  }

  if (loadError || (profileError && !profile)) {
    return (
      <div>
        <h1 className="page-title">{t('settings.title')}</h1>
        <div className="load-error">
          <span style={{ flex: 1 }}>{t('settings.loadError', { error: loadError || profileError })}</span>
          <Button variant="secondary" onClick={() => window.location.reload()}>{t('common.retry')}</Button>
        </div>
      </div>
    )
  }
  if (!settings || !profile) return <div style={{ padding: 32, color: 'var(--muted)' }}>{t('common.loading')}</div>

  const isCustomModel = !OPENROUTER_MODELS.includes(settings.openrouter_model)
  const pendingModel = model !== '__custom__' ? model : customModel
  const connectionDirty = !!apiKey || pendingModel !== settings.openrouter_model

  const design = profile.cv_design_preferences
  // An unknown/legacy template id renders as 'default', mirroring the server.
  const templates = registry?.templates ?? []
  const activeTemplate = templates.includes(design.template) ? design.template : 'default'
  const crop = design.photo_crop ?? DEFAULT_CROP
  // Thumbnails preview the live choice, so tapping a swatch or editing a colour
  // recolours them immediately.
  const inkColor = design.colors?.ink ?? '#1E1E1E'
  const paperColor = design.colors?.paper ?? '#FFFFFF'
  const thumbPalette = { accent: design.accent_color, ink: inkColor, paper: paperColor }
  const hex = (s?: string) => (s ?? '').toLowerCase()

  const palettes = registry?.palettes ?? []
  const paletteIds = palettes.map(p => p.id)
  // '' when the colours have been hand-edited away from every preset — a real
  // state (custom palette), so no swatch may claim to be checked.
  const activePalette = palettes.find(pal =>
    hex(design.accent_color) === hex(pal.accent_color)
    && hex(design.colors?.ink) === hex(pal.colors.ink)
    && hex(design.colors?.paper) === hex(pal.colors.paper))?.id ?? ''

  const templateRadio = radioGroup(templates, activeTemplate, id => setDesign({ template: id }))
  const paletteRadio = radioGroup(paletteIds, activePalette, id => {
    const pal = palettes.find(p => p.id === id)
    if (pal) setDesign({ accent_color: pal.accent_color, colors: pal.colors })
  })

  return (
    <div>
      {/* Plain, non-sticky: unlike Profile and Preferences, most of this page
          saves on a button. A page-level autosave status here reported on one
          card out of five and contradicted the four beneath it. */}
      <h1 className="page-title">{t('settings.title')}</h1>

      {/* AI engine — first, because nothing else in the app works without it.
          The OpenRouter key/model live inside it: one decision, one card. */}
      <EngineSettings provider={provider} onProviderChange={changeProvider}>
        {provider === 'openrouter' && (
          <div className="field" style={{ marginTop: 'var(--space-4)', marginBottom: 0 }}>
            <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>
              <Trans i18nKey="settings.openrouter.help"
                components={{ link: <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" /> }} />
            </p>
            {settings.openrouter_api_key_set && (
              <div className="credit-line">
                {usage ? (
                  <>
                    <span>{t('settings.openrouter.balance')}: <strong>{fmtUsd(usage.balance ?? usage.remaining)}</strong></span>
                    {usage.usage != null && <span>· {t('settings.openrouter.used')}: <strong>{fmtUsd(usage.usage)}</strong></span>}
                  </>
                ) : usageErr
                  ? <span>{t('settings.openrouter.balanceUnavailable', { error: usageErr })}</span>
                  : <span>{t('settings.openrouter.loadingBalance')}</span>}
                <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noreferrer">{t('settings.openrouter.manageCredits')}</a>
              </div>
            )}
            <div className="field">
              <label htmlFor="or-key">{t('settings.openrouter.apiKey')}</label>
              {settings.openrouter_api_key_set && (
                <p className="muted-sm" style={{ marginBottom: 6 }}>
                  {t('settings.openrouter.currentlySet', { preview: settings.openrouter_api_key_preview })}
                </p>
              )}
              <input
                id="or-key"
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={settings.openrouter_api_key_set ? t('settings.openrouter.newKeyPlaceholder') : t('settings.openrouter.keyPlaceholder')}
              />
            </div>
            <div className="field">
              <label htmlFor="or-model">{t('settings.openrouter.model')}</label>
              <select
                id="or-model"
                value={model === '__custom__' || isCustomModel ? '__custom__' : model}
                onChange={e => setModel(e.target.value)}
              >
                {OPENROUTER_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                <option value="__custom__">{t('settings.openrouter.customModel')}</option>
              </select>
              <p className="field-hint">
                {t('settings.openrouter.active')}: <strong>{settings.openrouter_model}</strong>
                {connectionDirty && <span style={{ color: 'var(--highlight)', marginLeft: 8 }}>● {t('common.unsavedChange')}</span>}
              </p>
            </div>
            {(model === '__custom__' || isCustomModel) && (
              <div className="field">
                <label htmlFor="or-custom">{t('settings.openrouter.customModelLabel')}</label>
                <input
                  id="or-custom"
                  type="text"
                  // Bound to the draft, not the saved value: reading from
                  // settings made the field ignore every keystroke once a
                  // custom model was already active.
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                  placeholder={t('settings.openrouter.customModelPlaceholder')}
                />
              </div>
            )}
            <SaveButton dirty={connectionDirty} onSave={saveOpenRouter} idleLabel={t('settings.openrouter.saveConnection')} />
          </div>
        )}
      </EngineSettings>

      {/* How CVs look — template, colours and photo are one concern. */}
      <div className="card">
        {/* The status sits on the one card it actually describes. */}
        <div className="section-header">
          <h2 className="section-title" style={{ margin: 0 }}>{t('settings.visual.title')}</h2>
          <SaveStatus state={saveState} error={saveError} onRetry={runSave} />
        </div>
        <p className="help-text">{t('profile.autoSaveNote')}</p>

        <div className="field">
          <label id="tpl-label">{t('settings.template.label')}</label>
          <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>{t('settings.template.help')}</p>
          <div
            {...templateRadio.group}
            aria-labelledby="tpl-label"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}
          >
            {templates.map((id, i) => {
              const isSel = activeTemplate === id
              return (
                <button
                  key={id}
                  type="button"
                  {...templateRadio.item(i)}
                  onClick={() => setDesign({ template: id })}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
                    background: 'none', padding: 'var(--space-3)', cursor: 'pointer',
                    // Ink, not vermilion: the engine cards and .seg already say
                    // ink = chosen, and one page must not hold two selection
                    // vocabularies. Vermilion stays for actions.
                    border: `2px solid ${isSel ? 'var(--ink)' : 'transparent'}`,
                    // Reset the global button 999px (which ovals the frame). A tight
                    // radius (--radius-sm), not --r-panel: at 22px the round corners
                    // pull far off the square thumbnail and the margin reads uneven.
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <TemplateThumb layout={id} palette={thumbPalette} selected={isSel} />
                  <span style={{ fontSize: 'var(--fs-xs)', fontWeight: isSel ? 700 : 400 }}>
                    {t(`settings.template.names.${id}`)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="field">
          <label id="pal-label">{t('settings.template.palette')}</label>
          <div
            {...paletteRadio.group}
            aria-labelledby="pal-label"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
          >
            {palettes.map((pal, i) => (
              <button
                key={pal.id}
                type="button"
                {...paletteRadio.item(i)}
                title={t(`settings.template.palettes.${pal.id}`)}
                aria-label={t(`settings.template.palettes.${pal.id}`)}
                onClick={() => setDesign({ accent_color: pal.accent_color, colors: pal.colors })}
                style={{
                  display: 'flex', width: 44, height: 26, padding: 0, cursor: 'pointer',
                  border: `2px solid ${activePalette === pal.id ? 'var(--ink)' : 'var(--border)'}`,
                  // Reset the global button pill + clip the colour spans to the
                  // rounded frame — otherwise the swatch is a stadium and the
                  // square colour blocks poke past its ends. 6px, not --radius-sm:
                  // on a 26px chip 12px is still nearly a full pill.
                  borderRadius: 6, overflow: 'hidden',
                }}
              >
                {/* the palette's slots, in the proportion the CV uses them */}
                <span style={{ flex: 2, background: pal.accent_color }} />
                <span style={{ flex: 1, background: pal.colors.ink }} />
                <span style={{ flex: 1, background: pal.colors.paper }} />
              </button>
            ))}
          </div>
        </div>

        {/* The selected palette's colours, each editable — overwrite any of them
            to make your own palette. */}
        <div className="field">
          <div className="field-label">{t('settings.template.colors.title')}</div>
          <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>{t('settings.template.colors.help')}</p>
          {([
            { slot: 'accent', value: design.accent_color, write: (v: string) => setDesign({ accent_color: v }) },
            { slot: 'text', value: inkColor, write: (v: string) => setDesign({ colors: { ...design.colors, ink: v } }) },
            { slot: 'background', value: paperColor, write: (v: string) => setDesign({ colors: { ...design.colors, paper: v } }) },
          ]).map(({ slot, value, write }) => (
            <ColorRow key={slot} name={t(`settings.template.colors.${slot}`)} value={value} onChange={write} />
          ))}
        </div>

        {/* Photo — part of how the CV looks, so it lives with the rest of it. */}
        <div className="field">
          <div className="field-label">{t('settings.photo.title')}</div>
          {photo?.exists && photo.data_uri && (
            <div style={{ position: 'relative', width: 120, height: 120, margin: 'var(--space-2) 0 var(--space-3)' }}>
              {/* Same circle + crop CSS the templates use, so this preview is
                  exactly what lands on the CV. */}
              <div style={{
                width: '100%', height: '100%', overflow: 'hidden', borderRadius: '50%',
                border: '2px solid var(--border)', background: paperColor,
              }}>
                <img
                  src={photo.data_uri}
                  alt={t('settings.photo.alt')}
                  style={{
                    display: 'block', width: '100%', height: '100%', objectFit: 'contain',
                    transform: `translate(${crop.x - 50}%, ${crop.y - 50}%) scale(${crop.zoom})`,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => setCropping(true)}
                disabled={photoUploading}
                title={t('settings.photo.adjustTitle')}
                aria-label={t('settings.photo.adjustTitle')}
                style={{
                  position: 'absolute', top: 0, right: 0, width: 28, height: 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--paper)', border: '1px solid var(--ink)',
                  cursor: 'pointer', padding: 0,
                }}
              >
                <Pencil size={14} aria-hidden />
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handlePhotoUpload}
            />
            <Button variant="secondary" busy={photoUploading} onClick={() => fileRef.current?.click()}>
              {photo?.exists ? t('settings.photo.replace') : t('settings.photo.upload')}
            </Button>
            {photo?.exists && (
              <Button variant="ghost" className="btn-icon-danger" onClick={handlePhotoDelete} disabled={photoUploading}>{t('common.remove')}</Button>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 400, color: 'var(--ink)', marginTop: 'var(--space-3)' }}>
            <input
              type="checkbox"
              checked={design.include_photo}
              onChange={e => setDesign({ include_photo: e.target.checked })}
            />
            {t('settings.photo.includeByDefault')}
          </label>
        </div>

        <p className="help-text" style={{ marginTop: 'var(--space-4)', marginBottom: 0 }}>
          {t('settings.template.appliesToAll')}
        </p>
      </div>

      {cropping && photo?.data_uri && (
        <PhotoCropModal
          src={photo.data_uri}
          initial={crop}
          paper={paperColor}
          onCancel={() => setCropping(false)}
          onSave={async c => { setDesign({ photo_crop: c }); setCropping(false) }}
        />
      )}

      {/* UI language */}
      <LanguageSettings current={settings.app_language} />

      {/* Updates */}
      <div className="card">
        <h2 className="section-title" style={{ margin: '0 0 var(--space-4)' }}>{t('settings.updates.title')}</h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.auto_update_check}
            onChange={e => { void saveAutoUpdate(e.target.checked) }}
          />
          {t('settings.updates.autoCheck')}
        </label>
        <p className="help-text" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
          {t('settings.updates.help')}
        </p>
      </div>

      {/* Backup & restore */}
      <div className="card">
        <h2 className="section-title" style={{ margin: '0 0 var(--space-4)' }}>{t('settings.backup.title')}</h2>
        <p className="help-text">
          <Trans i18nKey="settings.backup.help" components={{ b: <strong />, code: <code /> }} />
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Both secondary: neither is the page's primary action, and Restore
              is destructive enough that it must not read as the happy path. */}
          <Button variant="secondary" onClick={() => { window.location.href = api.backupExportUrl }}>
            {t('settings.backup.export')}
          </Button>
          <input
            ref={backupRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0] ?? null
              if (backupRef.current) backupRef.current.value = ''
              setRestoreFile(file)
            }}
          />
          <Button variant="secondary" busy={importing} onClick={() => backupRef.current?.click()}>
            {t('settings.backup.restore')}
          </Button>
        </div>
        <p className="help-text" style={{ marginTop: 'var(--space-3)', marginBottom: 0, fontSize: 'var(--fs-xs)' }}>
          <Trans i18nKey="settings.backup.note" components={{ b: <strong /> }} />
        </p>
      </div>

      {restoreFile && (
        <ConfirmModal
          title={t('settings.backup.confirmTitle')}
          body={t('settings.backup.confirmRestore')}
          confirmLabel={t('settings.backup.confirmButton')}
          danger
          onConfirm={() => { const f = restoreFile; setRestoreFile(null); void runImport(f) }}
          onCancel={() => setRestoreFile(null)}
        />
      )}

      {/* Advanced — AI prompts, collapsed by default so they can't be broken casually */}
      <Collapsible
        headingLevel={2}
        title={
          <span className="collapsible-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <SlidersHorizontal size={16} aria-hidden />
            {t('settings.prompts.title')}
          </span>
        }
      >
        <p className="help-text">{t('settings.prompts.help')}</p>

        {/* Pipeline order: extract links → judge the posting → tailor the CV →
            outline the letter. Same order as job_scanner → cv_generator → letter_guide. */}
        <PromptEditor
          title={t('settings.prompts.extractTitle')}
          help={t('settings.prompts.extractHelp')}
          value={scanExtract}
          saved={settings.scan_extract_prompt}
          defaultValue={settings.scan_extract_prompt_default}
          onChange={setScanExtract}
          onSave={() => savePrompt({ scan_extract_prompt: scanExtract })}
        />

        <PromptEditor
          title={t('settings.prompts.filterTitle')}
          help={t('settings.prompts.filterHelp')}
          value={scanFilter}
          saved={settings.scan_filter_prompt}
          defaultValue={settings.scan_filter_prompt_default}
          onChange={setScanFilter}
          onSave={() => savePrompt({ scan_filter_prompt: scanFilter })}
        />

        <PromptEditor
          title={t('settings.prompts.cvTitle')}
          help={<Trans i18nKey="settings.prompts.cvHelp" components={{ code: <code /> }} />}
          value={cvPrompt}
          saved={settings.cv_prompt}
          defaultValue={settings.cv_prompt_default}
          rows={14}
          onChange={setCvPrompt}
          onSave={() => savePrompt({ cv_prompt: cvPrompt })}
        />

        <PromptEditor
          title={t('settings.prompts.letterTitle')}
          help={<Trans i18nKey="settings.prompts.letterHelp" components={{ code: <code /> }} />}
          value={letterPrompt}
          saved={settings.letter_prompt}
          defaultValue={settings.letter_prompt_default}
          rows={14}
          onChange={setLetterPrompt}
          onSave={() => savePrompt({ letter_prompt: letterPrompt })}
        />
      </Collapsible>
    </div>
  )
}
