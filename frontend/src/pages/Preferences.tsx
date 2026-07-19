// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useTranslation } from 'react-i18next'
import { Check, CloudUpload } from 'lucide-react'
import Button from '../components/Button'
import TagInput from '../components/TagInput'
import { useProfileAutosave } from '../lib/useProfileAutosave'

// ── Building blocks ──────────────────────────────────────────────────────────

/** One numbered question card: accent number block, bold question, one sub-line. */
function Question({ n, title, sub, children }: {
  n: number
  title: string
  sub: string
  children: React.ReactNode
}) {
  return (
    <div className="card">
      <div className="q-head">
        <span className="q-num" aria-hidden>{n}</span>
        <span className="q-title">{title}</span>
      </div>
      <p className="q-sub">{sub}</p>
      {children}
    </div>
  )
}

/** Squared single-choice control — friendlier than a dropdown for 4 options. */
function Segmented({ value, options, onChange, label }: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  label: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** One-tap examples that append to a free-text answer (disabled once present). */
function Suggestions({ items, value, onPick }: {
  items: string[]
  value: string
  onPick: (v: string) => void
}) {
  return (
    <div className="suggest-row">
      {items.map(s => (
        <button key={s} type="button" disabled={value.toLowerCase().includes(s.toLowerCase())}
          onClick={() => onPick(value.trim() ? `${value.replace(/[\s,;]+$/, '')}, ${s.toLowerCase()}` : s)}>
          + {s}
        </button>
      ))}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PreferencesPage() {
  const { t } = useTranslation()
  const { profile, error, saveState, saveError, runSave, set } = useProfileAutosave()

  if (!profile) return <div style={{ padding: 32, color: 'var(--muted)' }}>{error || t('profile.loading')}</div>

  const p = profile.preferences

  return (
    <div>
      <div className="page-head page-head-sticky">
        <h1 className="page-title">{t('preferences.title')}</h1>
        <span className="muted-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} role="status">
          {(saveState === 'pending' || saveState === 'saving') && <><span className="spinner" style={{ width: 13, height: 13 }} />{t('profile.saving')}</>}
          {saveState === 'saved' && <><Check size={14} color="var(--success)" aria-hidden />{t('profile.allSaved')}</>}
          {saveState === 'error' && (
            <>
              <span style={{ color: 'var(--danger)' }}>{t('profile.cantSave', { error: saveError })}</span>
              <Button variant="secondary" onClick={runSave} style={{ padding: '3px 10px', fontSize: 'var(--fs-sm)' }}>
                <CloudUpload size={13} style={{ marginRight: 4, verticalAlign: -2 }} aria-hidden />{t('common.retry')}
              </Button>
            </>
          )}
        </span>
      </div>
      <p className="help-text" style={{ marginTop: 'calc(-1 * var(--space-4))' }}>
        {t('preferences.help')}
      </p>

      <Question n={1} title={t('preferences.q.roles')} sub={t('preferences.q.rolesSub')}>
        <TagInput value={p.target_roles} onChange={v => set('preferences.target_roles', v)}
          placeholder={t('preferences.q.rolesPlaceholder')} />
      </Question>

      <Question n={2} title={t('preferences.q.where')} sub={t('preferences.q.whereSub')}>
        <div className="field">
          <label>{t('preferences.q.locations')}</label>
          <TagInput value={p.locations} onChange={v => set('preferences.locations', v)}
            placeholder={t('preferences.q.locationsPlaceholder')} />
        </div>
        <div className="field">
          <label>{t('preferences.q.workingStyle')}</label>
          <Segmented label={t('preferences.q.workingStyle')} value={p.remote}
            onChange={v => set('preferences.remote', v)}
            options={[
              { value: 'Remote', label: t('profile.work.remote') },
              { value: 'Hybrid', label: t('profile.work.hybrid') },
              { value: 'On-site', label: t('profile.work.onSite') },
              { value: 'No preference', label: t('profile.work.noPreference') },
            ]} />
        </div>
        <div className="field">
          <label>{t('preferences.q.languages')}</label>
          <TagInput value={p.languages} onChange={v => set('preferences.languages', v)}
            placeholder={t('preferences.q.languagesPlaceholder')} />
        </div>
      </Question>

      <Question n={3} title={t('preferences.q.great')} sub={t('preferences.q.greatSub')}>
        <textarea value={p.looking_for} placeholder={t('preferences.q.greatPlaceholder')}
          onChange={e => set('preferences.looking_for', e.target.value)} style={{ minHeight: 100 }} />
      </Question>

      <Question n={4} title={t('preferences.q.dealbreakers')} sub={t('preferences.q.dealbreakersSub')}>
        <textarea value={p.avoid} placeholder={t('preferences.q.dealbreakersPlaceholder')}
          onChange={e => set('preferences.avoid', e.target.value)} style={{ minHeight: 80 }} />
        <Suggestions value={p.avoid} onPick={v => set('preferences.avoid', v)}
          items={[
            t('preferences.suggest.admin'),
            t('preferences.suggest.travel'),
            t('preferences.suggest.shifts'),
            t('preferences.suggest.sales'),
          ]} />
      </Question>

      <Question n={5} title={t('preferences.q.practical')} sub={t('preferences.q.practicalSub')}>
        <textarea value={p.notes} placeholder={t('preferences.q.practicalPlaceholder')}
          onChange={e => set('preferences.notes', e.target.value)} style={{ minHeight: 80 }} />
      </Question>

      {error && <p className="error-msg" style={{ marginBottom: 'var(--space-2)' }}>{error}</p>}
    </div>
  )
}
