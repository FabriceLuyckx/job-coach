import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { api } from '../api'
import type { Profile } from '../types'
import Button from '../components/Button'
import SaveButton from '../components/SaveButton'
import Collapsible from '../components/Collapsible'
import EngineSettings from '../components/EngineSettings'
import { useToast } from '../components/Toast'
import { useKeyStatus } from '../components/KeyStatus'
import type { EngineProvider } from '../api'
import { errMsg } from '../lib/errors'

const FONT_OPTIONS = [
  { value: 'Sans-serif', label: 'Sans-serif (current default — Inter)' },
  { value: 'Serif', label: 'Serif (professional, traditional)' },
  { value: 'Mono', label: 'Monospace (technical / developer)' },
]

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
        <SaveButton dirty={value !== saved} onSave={onSave} idleLabel="Save prompt" />
        <Button variant="secondary" onClick={() => onChange(defaultValue)} disabled={value === defaultValue}>
          Reset to default
        </Button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const toast = useToast()
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
      throw new Error('The prompt must contain the {lang_name} placeholder — it tells the AI which language to write in.')
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
      toast.success('Photo uploaded')
    } catch (e) {
      toast.error(errMsg(e))
    } finally { setPhotoUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handlePhotoDelete() {
    setPhotoUploading(true)
    try {
      await api.deletePhoto()
      setPhoto({ exists: false, data_uri: null })
      toast.success('Photo removed')
    } catch (e) {
      toast.error(errMsg(e))
    } finally { setPhotoUploading(false) }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (backupRef.current) backupRef.current.value = ''
    if (!file) return
    if (!window.confirm(
      'Restoring a backup replaces your profile, settings, job history and generated CVs ' +
      'on this computer with the contents of the backup (your API key is kept). This ' +
      'cannot be undone. Continue?'
    )) return
    setImporting(true)
    try {
      await api.importBackup(file)
      toast.success('Backup restored — reloading…')
      setTimeout(() => window.location.reload(), 900)
    } catch (e) {
      toast.error(errMsg(e))
      setImporting(false)
    }
  }

  if (loadError) {
    return (
      <div>
        <h1 className="page-title">Settings</h1>
        <div className="load-error">
          <span style={{ flex: 1 }}>Couldn't load settings: {loadError}</span>
          <Button variant="secondary" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    )
  }
  if (!settings || !profile) return <div style={{ padding: 32, color: 'var(--muted)' }}>Loading…</div>

  const isCustomModel = !OPENROUTER_MODELS.includes(settings.openrouter_model)
  const pendingModel = model !== '__custom__' ? model : customModel
  const connectionDirty = !!apiKey || pendingModel !== settings.openrouter_model
  const prefsDirty = JSON.stringify(profile.cv_design_preferences) !== savedPrefs

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      {/* AI engine chooser (local vs OpenRouter) */}
      <EngineSettings provider={provider} onProviderChange={changeProvider} />

      {/* OpenRouter — key + model; shown when OpenRouter is the active engine */}
      {provider === 'openrouter' && (
      <div className="card">
        <div className="section-title" style={{ marginBottom: 'var(--space-4)' }}>OpenRouter Connection</div>
        <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>
          OpenRouter routes requests to Claude, GPT-4, and other models via one API key.
          Get yours at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>.
        </p>
        {settings.openrouter_api_key_set && (
          <div className="credit-line">
            {usage ? (
              <>
                <span>Balance: <strong>{fmtUsd(usage.balance ?? usage.remaining)}</strong></span>
                {usage.usage != null && <span>· Used: <strong>{fmtUsd(usage.usage)}</strong></span>}
              </>
            ) : usageErr ? <span>Balance unavailable</span> : <span>Loading balance…</span>}
            <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noreferrer">Manage credits ↗</a>
          </div>
        )}
        <div className="field">
          <label>API key</label>
          {settings.openrouter_api_key_set && (
            <p className="muted-sm" style={{ marginBottom: 6 }}>
              Currently set (ending {settings.openrouter_api_key_preview}). Enter a new key to replace it.
            </p>
          )}
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={settings.openrouter_api_key_set ? 'Enter new key to replace…' : 'sk-or-…'}
          />
        </div>
        <div className="field">
          <label>Model</label>
          <select
            value={model === '__custom__' || isCustomModel ? '__custom__' : model}
            onChange={e => setModel(e.target.value)}
          >
            {OPENROUTER_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            <option value="__custom__">Custom model ID…</option>
          </select>
          <p className="field-hint">
            Active: <strong>{settings.openrouter_model}</strong>
            {connectionDirty && <span style={{ color: 'var(--highlight)', marginLeft: 8 }}>● unsaved change</span>}
          </p>
        </div>
        {(model === '__custom__' || isCustomModel) && (
          <div className="field">
            <label>Custom model ID</label>
            <input
              type="text"
              value={isCustomModel ? settings.openrouter_model : customModel}
              onChange={e => setCustomModel(e.target.value)}
              placeholder="provider/model-name"
            />
          </div>
        )}
        <SaveButton dirty={connectionDirty} onSave={saveOpenRouter} idleLabel="Save connection" />
      </div>
      )}

      {/* Photo */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 'var(--space-4)' }}>Profile Photo</div>
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
            {photo?.exists ? 'Replace photo' : 'Upload photo'}
          </Button>
          {photo?.exists && (
            <Button variant="ghost" className="btn-icon-danger" onClick={handlePhotoDelete} disabled={photoUploading}>Remove</Button>
          )}
        </div>
        <div className="field" style={{ marginTop: 'var(--space-4)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 400, color: 'var(--ink)' }}>
            <input
              type="checkbox"
              checked={profile.cv_design_preferences.include_photo}
              onChange={e => setProfile({ ...profile, cv_design_preferences: { ...profile.cv_design_preferences, include_photo: e.target.checked } })}
            />
            Include photo in generated CVs
          </label>
        </div>
      </div>

      {/* Visual preferences */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 'var(--space-4)' }}>CV Visual Preferences</div>
        <div className="field">
          <label>Accent colour</label>
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
            placeholder="#1B3A6B or 'Dark blue'"
            style={{ width: 200 }}
          />
        </div>
        <div className="field">
          <label>Font style</label>
          <select
            value={profile.cv_design_preferences.font_type}
            onChange={e => setProfile({ ...profile, cv_design_preferences: { ...profile.cv_design_preferences, font_type: e.target.value } })}
          >
            {FONT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Style notes (for the AI)</label>
          <input
            type="text"
            value={profile.cv_design_preferences.style}
            onChange={e => setProfile({ ...profile, cv_design_preferences: { ...profile.cv_design_preferences, style: e.target.value } })}
            placeholder="e.g. Minimalist"
          />
        </div>
        <SaveButton dirty={prefsDirty} onSave={saveVisualPrefs} idleLabel="Save preferences" />
      </div>

      {/* Backup & restore */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 'var(--space-4)' }}>Backup &amp; Restore</div>
        <p className="help-text">
          Move to a new computer or keep a safe copy of your work. <strong>Export</strong> downloads a
          single <code>.zip</code> containing your profile &amp; photo, settings, job sources &amp;
          history, and every generated CV. On the new machine, install Job Coach and use{' '}
          <strong>Restore</strong> to load that file, then re-enter your OpenRouter API key.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={() => { window.location.href = api.backupExportUrl }}>
            Export backup (.zip)
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
          Restoring <strong>replaces</strong> your profile, job history and generated CVs with the
          backup's contents — it does not merge. Your OpenRouter API key is never included in the
          export and is left untouched on restore.
        </p>
      </div>

      {/* Advanced — AI prompts, collapsed by default so they can't be broken casually */}
      <Collapsible
        title={
          <span className="collapsible-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <SlidersHorizontal size={16} aria-hidden />
            Advanced — AI prompts
          </span>
        }
      >
        <p className="help-text">
          These are the exact instructions sent to the AI. The defaults work well — only edit
          them if you want to change how CVs are written or how job listings are filtered.
          You can always reset to the default.
        </p>

        <PromptEditor
          title="CV Generator — tailoring prompt"
          help={<>Sent when tailoring a CV. Your profile and the job listing are added automatically
            below it. <code>{'{lang_name}'}</code> is replaced with the output language — it must stay in the prompt.</>}
          value={cvPrompt}
          saved={settings.cv_prompt}
          defaultValue={settings.cv_prompt_default}
          rows={14}
          onChange={setCvPrompt}
          onSave={() => savePrompt({ cv_prompt: cvPrompt })}
        />

        <PromptEditor
          title="Job Suggestions — link extraction prompt"
          help="Picks which of a page's links are real job openings. The list of links found on the page is added automatically below it."
          value={scanExtract}
          saved={settings.scan_extract_prompt}
          defaultValue={settings.scan_extract_prompt_default}
          onChange={setScanExtract}
          onSave={() => savePrompt({ scan_extract_prompt: scanExtract })}
        />

        <PromptEditor
          title="Job Suggestions — relevance filter prompt"
          help="Decides which new openings match you. The relevant parts of your profile are added automatically below it."
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
