import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { SlidersHorizontal } from 'lucide-react'
import { api } from '../api'
import type { Profile } from '../types'
import Button from '../components/Button'
import SaveButton from '../components/SaveButton'
import Collapsible from '../components/Collapsible'
import EngineSettings from '../components/EngineSettings'
import { useToast } from '../components/Toast'
import { useKeyStatus } from '../components/KeyStatus'
import LanguageSettings from '../components/LanguageSettings'
import type { EngineProvider } from '../api'
import { errMsg } from '../lib/errors'

const ACCENT_PRESETS = [
  { value: '#1B3A6B', label: 'Dark Blue (default)' },
  { value: '#1a4a3a', label: 'Forest Green' },
  { value: '#3a1a4a', label: 'Deep Purple' },
  { value: '#4a2a1a', label: 'Warm Brown' },
  { value: '#1a3a4a', label: 'Teal' },
  { value: '#2a2a2a', label: 'Charcoal' },
]

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

/** One editable AI-prompt block (textarea + save + reset), used ×3 under Advanced. */
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
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>{title}</div>
      <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>{help}</p>
      <textarea
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

export default function SettingsPage() {
  const toast = useToast()
  const { t } = useTranslation()
  const { refresh: refreshKeyStatus } = useKeyStatus()
  const [settings, setSettings] = useState<{
    openrouter_api_key_set: boolean
    openrouter_api_key_preview: string
    openrouter_model: string
    cv_prompt: string
    cv_prompt_default: string
    scan_extract_prompt: string
    scan_extract_prompt_default: string
    scan_filter_prompt: string
    scan_filter_prompt_default: string
    llm_provider: EngineProvider
    local_model_id: string
    app_language: string
    onboarding_done: boolean
  } | null>(null)
  const [provider, setProvider] = useState<EngineProvider>('openrouter')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [photo, setPhoto] = useState<{ exists: boolean; data_uri: string | null } | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [usageErr, setUsageErr] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [cvPrompt, setCvPrompt] = useState('')
  const [scanExtract, setScanExtract] = useState('')
  const [scanFilter, setScanFilter] = useState('')
  const [savedPrefs, setSavedPrefs] = useState('')  // JSON snapshot of cv_design_preferences

  const [photoUploading, setPhotoUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const backupRef = useRef<HTMLInputElement>(null)

  function loadUsage() {
    api.getOpenrouterUsage()
      .then(u => { setUsage(u); setUsageErr(false) })
      .catch(() => { setUsage(null); setUsageErr(true) })
  }

  useEffect(() => {
    Promise.all([api.getSettings(), api.getProfile(), api.getPhoto()]).then(([s, p, ph]) => {
      setSettings(s)
      setProfile(p)
      setPhoto(ph)
      setProvider(s.llm_provider)
      setModel(s.openrouter_model)
      setCvPrompt(s.cv_prompt)
      setScanExtract(s.scan_extract_prompt)
      setScanFilter(s.scan_filter_prompt)
      setSavedPrefs(JSON.stringify(p.cv_design_preferences))
      if (!OPENROUTER_MODELS.includes(s.openrouter_model)) setCustomModel(s.openrouter_model)
      if (s.openrouter_api_key_set) loadUsage()
    }).catch(e => setLoadError(errMsg(e)))
  }, [])

  // Switching engine takes effect immediately (next AI request uses it).
  async function changeProvider(p: EngineProvider) {
    setProvider(p)
    try {
      await api.putSettings({ llm_provider: p })
      setSettings(await api.getSettings())
      refreshKeyStatus()
    } catch (e) { toast.error(errMsg(e)) }
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

  async function savePrompt(data: { cv_prompt?: string; scan_extract_prompt?: string; scan_filter_prompt?: string }) {
    // The language placeholder is what makes non-English CVs work; catch its
    // removal here with a clear message instead of a server round-trip.
    if (data.cv_prompt !== undefined && !data.cv_prompt.includes('{lang_name}')) {
      throw new Error(t('settings.prompts.langPlaceholderError'))
    }
    await api.putSettings(data)
    setSettings(await api.getSettings())
  }

  async function saveVisualPrefs() {
    if (!profile) return
    await api.putProfile(profile)
    setSavedPrefs(JSON.stringify(profile.cv_design_preferences))
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoUploading(true)
    try {
      await api.uploadPhoto(file)
      setPhoto(await api.getPhoto())
      toast.success(t('settings.photo.uploaded'))
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

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (backupRef.current) backupRef.current.value = ''
    if (!file) return
    if (!window.confirm(t('settings.backup.confirmRestore'))) return
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

  if (loadError) {
    return (
      <div>
        <h1 className="page-title">{t('settings.title')}</h1>
        <div className="load-error">
          <span style={{ flex: 1 }}>{t('settings.loadError', { error: loadError })}</span>
          <Button variant="secondary" onClick={() => window.location.reload()}>{t('common.retry')}</Button>
        </div>
      </div>
    )
  }
  if (!settings || !profile) return <div style={{ padding: 32, color: 'var(--muted)' }}>{t('common.loading')}</div>

  const isCustomModel = !OPENROUTER_MODELS.includes(settings.openrouter_model)
  const pendingModel = model !== '__custom__' ? model : customModel
  const connectionDirty = !!apiKey || pendingModel !== settings.openrouter_model
  const prefsDirty = JSON.stringify(profile.cv_design_preferences) !== savedPrefs

  return (
    <div>
      <h1 className="page-title">{t('settings.title')}</h1>

      {/* UI language */}
      <LanguageSettings current={settings.app_language} />

      {/* AI engine chooser (local vs OpenRouter) */}
      <EngineSettings provider={provider} onProviderChange={changeProvider} />

      {/* OpenRouter — key + model; shown when OpenRouter is the active engine */}
      {provider === 'openrouter' && (
      <div className="card">
        <div className="section-title" style={{ marginBottom: 'var(--space-4)' }}>{t('settings.openrouter.title')}</div>
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
            ) : usageErr ? <span>{t('settings.openrouter.balanceUnavailable')}</span> : <span>{t('settings.openrouter.loadingBalance')}</span>}
            <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noreferrer">{t('settings.openrouter.manageCredits')}</a>
          </div>
        )}
        <div className="field">
          <label>{t('settings.openrouter.apiKey')}</label>
          {settings.openrouter_api_key_set && (
            <p className="muted-sm" style={{ marginBottom: 6 }}>
              {t('settings.openrouter.currentlySet', { preview: settings.openrouter_api_key_preview })}
            </p>
          )}
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={settings.openrouter_api_key_set ? t('settings.openrouter.newKeyPlaceholder') : t('settings.openrouter.keyPlaceholder')}
          />
        </div>
        <div className="field">
          <label>{t('settings.openrouter.model')}</label>
          <select
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
            <label>{t('settings.openrouter.customModelLabel')}</label>
            <input
              type="text"
              value={isCustomModel ? settings.openrouter_model : customModel}
              onChange={e => setCustomModel(e.target.value)}
              placeholder="provider/model-name"
            />
          </div>
        )}
        <SaveButton dirty={connectionDirty} onSave={saveOpenRouter} idleLabel={t('settings.openrouter.saveConnection')} />
      </div>
      )}

      {/* Photo */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 'var(--space-4)' }}>{t('settings.photo.title')}</div>
        {photo?.exists && photo.data_uri && (
          <img
            src={photo.data_uri}
            alt="Profile"
            style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', display: 'block', border: '2px solid var(--border)' }}
          />
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
        <div className="field" style={{ marginTop: 'var(--space-4)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 400, color: 'var(--ink)' }}>
            <input
              type="checkbox"
              checked={profile.cv_design_preferences.include_photo}
              onChange={e => setProfile({ ...profile, cv_design_preferences: { ...profile.cv_design_preferences, include_photo: e.target.checked } })}
            />
            {t('settings.photo.includeInCv')}
          </label>
        </div>
      </div>

      {/* Visual preferences */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 'var(--space-4)' }}>{t('settings.visual.title')}</div>
        <div className="field">
          <label>{t('settings.visual.accent')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            {ACCENT_PRESETS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => setProfile({ ...profile, cv_design_preferences: { ...profile.cv_design_preferences, accent_color: value } })}
                style={{
                  width: 32, height: 32, borderRadius: '50%', background: value, border: `3px solid ${profile.cv_design_preferences.accent_color === value ? 'var(--surface)' : 'transparent'}`,
                  outline: profile.cv_design_preferences.accent_color === value ? `2px solid ${value}` : 'none',
                  cursor: 'pointer', padding: 0,
                }}
              />
            ))}
          </div>
          <input
            type="text"
            value={profile.cv_design_preferences.accent_color}
            onChange={e => setProfile({ ...profile, cv_design_preferences: { ...profile.cv_design_preferences, accent_color: e.target.value } })}
            placeholder={t('settings.visual.accentPlaceholder')}
            style={{ width: 200 }}
          />
        </div>
        <SaveButton dirty={prefsDirty} onSave={saveVisualPrefs} idleLabel={t('settings.visual.save')} />
      </div>

      {/* Backup & restore */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 'var(--space-4)' }}>{t('settings.backup.title')}</div>
        <p className="help-text">
          <Trans i18nKey="settings.backup.help" components={{ b: <strong />, code: <code /> }} />
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={() => { window.location.href = api.backupExportUrl }}>
            {t('settings.backup.export')}
          </Button>
          <input
            ref={backupRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <Button variant="secondary" busy={importing} onClick={() => backupRef.current?.click()}>
            Restore from backup…
          </Button>
        </div>
        <p className="help-text" style={{ marginTop: 'var(--space-3)', marginBottom: 0, fontSize: 'var(--fs-xs)' }}>
          <Trans i18nKey="settings.backup.note" components={{ b: <strong /> }} />
        </p>
      </div>

      {/* Advanced — AI prompts, collapsed by default so they can't be broken casually */}
      <Collapsible
        title={
          <span className="collapsible-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <SlidersHorizontal size={16} aria-hidden />
            {t('settings.prompts.title')}
          </span>
        }
      >
        <p className="help-text">{t('settings.prompts.help')}</p>

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
      </Collapsible>
    </div>
  )
}
