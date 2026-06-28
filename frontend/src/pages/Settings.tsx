import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Profile } from '../types'
import Button from '../components/Button'
import SaveButton from '../components/SaveButton'

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

export default function SettingsPage() {
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
  } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [photo, setPhoto] = useState<{ exists: boolean; data_uri: string | null } | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [usageErr, setUsageErr] = useState(false)

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [cvPrompt, setCvPrompt] = useState('')
  const [scanExtract, setScanExtract] = useState('')
  const [scanFilter, setScanFilter] = useState('')
  const [savedPrefs, setSavedPrefs] = useState('')  // JSON snapshot of cv_design_preferences

  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
      setModel(s.openrouter_model)
      setCvPrompt(s.cv_prompt)
      setScanExtract(s.scan_extract_prompt)
      setScanFilter(s.scan_filter_prompt)
      setSavedPrefs(JSON.stringify(p.cv_design_preferences))
      if (!OPENROUTER_MODELS.includes(s.openrouter_model)) setCustomModel(s.openrouter_model)
      if (s.openrouter_api_key_set) loadUsage()
    }).catch(e => setMsg({ type: 'err', text: e.message }))
  }, [])

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text })
    if (type === 'ok') setTimeout(() => setMsg(null), 2500)
  }

  // Save handlers throw on error so the SaveButton surfaces it.
  async function saveOpenRouter() {
    const effectiveModel = model === '__custom__' ? customModel : model
    await api.putSettings({ ...(apiKey ? { openrouter_api_key: apiKey } : {}), openrouter_model: effectiveModel })
    setSettings(await api.getSettings())
    setApiKey('')
    loadUsage()
  }

  async function savePrompt(data: { cv_prompt?: string; scan_extract_prompt?: string; scan_filter_prompt?: string }) {
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
      flash('ok', 'Photo uploaded!')
    } catch (e: unknown) {
      flash('err', e instanceof Error ? e.message : String(e))
    } finally { setPhotoUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handlePhotoDelete() {
    setPhotoUploading(true)
    try {
      await api.deletePhoto()
      setPhoto({ exists: false, data_uri: null })
      flash('ok', 'Photo removed.')
    } catch (e: unknown) {
      flash('err', e instanceof Error ? e.message : String(e))
    } finally { setPhotoUploading(false) }
  }

  if (!settings || !profile) return <div style={{ padding: 32, color: 'var(--muted)' }}>Loading…</div>

  const isCustomModel = !OPENROUTER_MODELS.includes(settings.openrouter_model)
  const pendingModel = model !== '__custom__' ? model : customModel
  const connectionDirty = !!apiKey || pendingModel !== settings.openrouter_model
  const prefsDirty = JSON.stringify(profile.cv_design_preferences) !== savedPrefs

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 className="page-title">Settings</h1>
      {msg && <p className={msg.type === 'ok' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 16 }}>{msg.text}</p>}

      {/* OpenRouter */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 14 }}>OpenRouter Connection</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
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
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
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
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', marginTop: 5 }}>
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

      {/* CV Generator prompt */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 14 }}>CV Generator — Tailoring Prompt</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
          Sent to the AI on the <strong>CV Generator</strong> tab when tailoring a CV. Your profile and the
          job listing are added automatically below this. Use <code>{'{lang_name}'}</code> where the output
          language should appear.
        </p>
        <textarea
          value={cvPrompt}
          onChange={e => setCvPrompt(e.target.value)}
          rows={14}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <SaveButton dirty={cvPrompt !== settings.cv_prompt} onSave={() => savePrompt({ cv_prompt: cvPrompt })} idleLabel="Save prompt" />
          <Button
            variant="secondary"
            onClick={() => setCvPrompt(settings.cv_prompt_default)}
            disabled={cvPrompt === settings.cv_prompt_default}
          >
            Reset to default
          </Button>
        </div>
      </div>

      {/* Job Suggestions — link extraction prompt */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 14 }}>Job Suggestions — Link Extraction Prompt</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
          Used on the <strong>Job Suggestions</strong> tab to pick which of a page's links are real job
          openings. The list of links found on the page is added automatically below this.
        </p>
        <textarea
          value={scanExtract}
          onChange={e => setScanExtract(e.target.value)}
          rows={8}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <SaveButton dirty={scanExtract !== settings.scan_extract_prompt} onSave={() => savePrompt({ scan_extract_prompt: scanExtract })} idleLabel="Save prompt" />
          <Button
            variant="secondary"
            onClick={() => setScanExtract(settings.scan_extract_prompt_default)}
            disabled={scanExtract === settings.scan_extract_prompt_default}
          >
            Reset to default
          </Button>
        </div>
      </div>

      {/* Job Suggestions — relevance filter prompt */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 14 }}>Job Suggestions — Relevance Filter Prompt</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
          Used on the <strong>Job Suggestions</strong> tab to decide which new openings match you. The
          relevant parts of your profile are added automatically below this.
        </p>
        <textarea
          value={scanFilter}
          onChange={e => setScanFilter(e.target.value)}
          rows={8}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <SaveButton dirty={scanFilter !== settings.scan_filter_prompt} onSave={() => savePrompt({ scan_filter_prompt: scanFilter })} idleLabel="Save prompt" />
          <Button
            variant="secondary"
            onClick={() => setScanFilter(settings.scan_filter_prompt_default)}
            disabled={scanFilter === settings.scan_filter_prompt_default}
          >
            Reset to default
          </Button>
        </div>
      </div>

      {/* Photo */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 14 }}>Profile Photo</div>
        {photo?.exists && photo.data_uri && (
          <img
            src={photo.data_uri}
            alt="Profile"
            style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6, marginBottom: 12, display: 'block', border: '2px solid var(--border)' }}
          />
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
            <Button variant="danger" onClick={handlePhotoDelete} disabled={photoUploading}>Remove</Button>
          )}
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 400, color: 'var(--text)' }}>
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
        <div className="section-title" style={{ marginBottom: 14 }}>CV Visual Preferences</div>
        <div className="field">
          <label>Accent colour</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {ACCENT_PRESETS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                title={label}
                onClick={() => setProfile({ ...profile, cv_design_preferences: { ...profile.cv_design_preferences, accent_color: value } })}
                style={{
                  width: 32, height: 32, borderRadius: '50%', background: value, border: `3px solid ${profile.cv_design_preferences.accent_color === value ? '#fff' : 'transparent'}`,
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
          <label>Style notes (for Claude)</label>
          <input
            type="text"
            value={profile.cv_design_preferences.style}
            onChange={e => setProfile({ ...profile, cv_design_preferences: { ...profile.cv_design_preferences, style: e.target.value } })}
            placeholder="e.g. Minimalist"
          />
        </div>
        <SaveButton dirty={prefsDirty} onSave={saveVisualPrefs} idleLabel="Save preferences" />
      </div>
    </div>
  )
}
