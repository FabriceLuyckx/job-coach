import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Profile } from '../types'

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

export default function SettingsPage() {
  const [settings, setSettings] = useState<{
    openrouter_api_key_set: boolean
    openrouter_api_key_preview: string
    openrouter_model: string
  } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [photo, setPhoto] = useState<{ exists: boolean; data_uri: string | null } | null>(null)

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([api.getSettings(), api.getProfile(), api.getPhoto()]).then(([s, p, ph]) => {
      setSettings(s)
      setProfile(p)
      setPhoto(ph)
      setModel(s.openrouter_model)
      if (!OPENROUTER_MODELS.includes(s.openrouter_model)) setCustomModel(s.openrouter_model)
    }).catch(e => setMsg({ type: 'err', text: e.message }))
  }, [])

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text })
    if (type === 'ok') setTimeout(() => setMsg(null), 2500)
  }

  async function saveOpenRouter() {
    setSaving(true)
    try {
      const effectiveModel = model === '__custom__' ? customModel : model
      await api.putSettings({ ...(apiKey ? { openrouter_api_key: apiKey } : {}), openrouter_model: effectiveModel })
      const fresh = await api.getSettings()
      setSettings(fresh)
      setApiKey('')
      flash('ok', 'Saved!')
    } catch (e: unknown) {
      flash('err', e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  async function saveVisualPrefs() {
    if (!profile) return
    setSaving(true)
    try {
      await api.putProfile(profile)
      flash('ok', 'Visual preferences saved!')
    } catch (e: unknown) {
      flash('err', e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoUploading(true)
    try {
      await api.uploadPhoto(file)
      const ph = await api.getPhoto()
      setPhoto(ph)
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

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 className="page-title">Settings</h1>
      {msg && <p className={msg.type === 'ok' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 16 }}>{msg.text}</p>}

      {/* OpenRouter */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 14 }}>OpenRouter Connection</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
          OpenRouter routes requests to Claude, GPT-4, and other models via one API key.
          Get yours at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>.
        </p>
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
            {(model !== '__custom__' ? model : customModel) !== settings.openrouter_model && (
              <span style={{ color: 'var(--highlight)', marginLeft: 8 }}>● unsaved change</span>
            )}
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
        <button className="btn-primary" onClick={saveOpenRouter} disabled={saving}>
          {saving && <span className="spinner" />}Save connection
        </button>
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
          <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={photoUploading}>
            {photoUploading ? 'Uploading…' : photo?.exists ? 'Replace photo' : 'Upload photo'}
          </button>
          {photo?.exists && (
            <button className="btn-danger" onClick={handlePhotoDelete} disabled={photoUploading}>Remove</button>
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
        <button className="btn-primary" onClick={saveVisualPrefs} disabled={saving}>
          {saving && <span className="spinner" />}Save preferences
        </button>
      </div>
    </div>
  )
}
