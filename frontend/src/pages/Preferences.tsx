// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import Button from '../components/Button'
import SaveStatus from '../components/SaveStatus'
import TagInput from '../components/TagInput'
import { useProfileAutosave } from '../lib/useProfileAutosave'

// ── Building blocks ──────────────────────────────────────────────────────────

/** One question card: heading + one sub-line.
 *
 * `controlId` labels the card's single control. Cards that hold several fields
 * (each with its own label) pass nothing and keep the heading as a heading. */
function Question({ title, sub, controlId, children }: {
  title: string
  sub: string
  controlId?: string
  children: React.ReactNode
}) {
  return (
    <div className="card">
      <h2 className="q-title">{controlId ? <label htmlFor={controlId}>{title}</label> : title}</h2>
      <p className="q-sub">{sub}</p>
      {children}
    </div>
  )
}

/** Squared single-choice control — friendlier than a dropdown for 4 options.
 *
 * A real radiogroup, not four toggle buttons: the options are mutually
 * exclusive, so a screen reader should say "2 of 4" and arrow keys should move
 * the selection. Roving tabIndex keeps the whole group to one tab stop. */
function Segmented({ value, options, onChange, labelledBy }: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  labelledBy: string
}) {
  const i = options.findIndex(o => o.value === value)
  // An unrecognised stored value would leave every option unfocusable.
  const selected = i === -1 ? 0 : i

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (selected + step + options.length) % options.length
    onChange(options[next].value)
    ;(e.currentTarget.children[next] as HTMLElement).focus()
  }

  return (
    <div className="seg" role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKey}>
      {options.map((o, n) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          tabIndex={n === selected ? 0 : -1}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** One-tap examples that append to a free-text answer.
 *
 * The group is named once rather than each button carrying a described-by; a
 * bare "+ Frequent travel" announced on its own doesn't say what it does. */
function Suggestions({ items, value, onPick, label }: {
  items: string[]
  value: string
  onPick: (v: string) => void
  label: string
}) {
  return (
    <div className="suggest-row" role="group" aria-label={label}>
      {items.map(s => {
        // Whole-phrase match only: a substring test let "no cold-calling
        // please" disable the cold-calling chip, and vice versa.
        const added = value.toLowerCase().includes(s.toLowerCase())
        return (
          <button key={s} type="button" disabled={added}
            // Casing was inconsistent — the first pick landed as written, later
            // ones lowercased, giving "Frequent travel, purely administrative
            // work". Sentence-case a phrase only when it follows another.
            onClick={() => onPick(
              value.trim()
                ? `${value.replace(/[\s,;]+$/, '')}, ${s.charAt(0).toLowerCase()}${s.slice(1)}`
                : s
            )}>
            {added ? '✓' : '+'} {s}
          </button>
        )
      })}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PreferencesPage() {
  const { t } = useTranslation()
  const { profile, error, saveState, saveError, runSave, set } = useProfileAutosave()
  const uid = useId()

  if (error && !profile) {
    return (
      <div className="load-error" style={{ margin: 'var(--space-6) 0' }}>
        <span style={{ flex: 1 }}>{t('preferences.loadError', { error })}</span>
        <Button variant="secondary" onClick={() => window.location.reload()}>{t('common.retry')}</Button>
      </div>
    )
  }
  if (!profile) return <div style={{ padding: 32, color: 'var(--muted)' }}>{t('profile.loading')}</div>

  const p = profile.preferences
  const id = (k: string) => `${uid}-${k}`
  // The one answer the scanner can't work without — it's what a listing title
  // is matched against before anything more expensive runs.
  const hasRoles = p.target_roles.length > 0

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{t('preferences.title')}</h1>
        <SaveStatus state={saveState} error={saveError} onRetry={runSave} />
      </div>
      <p className="help-text">{t('preferences.help')}</p>

      <Question title={t('preferences.q.roles')} sub={t('preferences.q.rolesSub')} controlId={id('roles')}>
        <TagInput id={id('roles')} value={p.target_roles} onChange={v => set('preferences.target_roles', v)}
          placeholder={t('preferences.q.rolesPlaceholder')} />
      </Question>

      <Question title={t('preferences.q.where')} sub={t('preferences.q.whereSub')}>
        <div className="field">
          <label htmlFor={id('locations')}>{t('preferences.q.locations')}</label>
          <TagInput id={id('locations')} value={p.locations} onChange={v => set('preferences.locations', v)}
            placeholder={t('preferences.q.locationsPlaceholder')} />
        </div>
        <div className="field">
          {/* Not a <label>: it labels a radiogroup, not a form control, so it
              names the group via aria-labelledby instead of sitting orphaned. */}
          <span className="field-label" id={id('style')}>{t('preferences.q.workingStyle')}</span>
          <Segmented labelledBy={id('style')} value={p.remote}
            onChange={v => set('preferences.remote', v)}
            options={[
              { value: 'Remote', label: t('profile.work.remote') },
              { value: 'Hybrid', label: t('profile.work.hybrid') },
              { value: 'On-site', label: t('profile.work.onSite') },
              { value: 'No preference', label: t('profile.work.noPreference') },
            ]} />
        </div>
        <div className="field">
          <label htmlFor={id('languages')}>{t('preferences.q.languages')}</label>
          <TagInput id={id('languages')} value={p.languages} onChange={v => set('preferences.languages', v)}
            placeholder={t('preferences.q.languagesPlaceholder')} />
        </div>
      </Question>

      <Question title={t('preferences.q.great')} sub={t('preferences.q.greatSub')} controlId={id('great')}>
        <textarea id={id('great')} value={p.looking_for} placeholder={t('preferences.q.greatPlaceholder')}
          onChange={e => set('preferences.looking_for', e.target.value)} style={{ minHeight: 100 }} />
      </Question>

      <Question title={t('preferences.q.dealbreakers')} sub={t('preferences.q.dealbreakersSub')} controlId={id('avoid')}>
        <textarea id={id('avoid')} value={p.avoid} placeholder={t('preferences.q.dealbreakersPlaceholder')}
          onChange={e => set('preferences.avoid', e.target.value)} style={{ minHeight: 80 }} />
        <Suggestions value={p.avoid} onPick={v => set('preferences.avoid', v)} label={t('preferences.suggestLabel')}
          items={[
            t('preferences.suggest.admin'),
            t('preferences.suggest.travel'),
            t('preferences.suggest.shifts'),
            t('preferences.suggest.sales'),
          ]} />
      </Question>

      <Question title={t('preferences.q.practical')} sub={t('preferences.q.practicalSub')} controlId={id('notes')}>
        <textarea id={id('notes')} value={p.notes} placeholder={t('preferences.q.practicalPlaceholder')}
          onChange={e => set('preferences.notes', e.target.value)} style={{ minHeight: 80 }} />
      </Question>

      {/* These questions had no destination: five careful answers and then the
          page just ended. This names the next step — but it has to be honest
          about it. Without target_roles the scanner has no strong signal, so
          claiming the matcher is ready would send someone to a page that can't
          help them yet; that case points back at Q1 in the warning colour
          instead of offering the primary action. */}
      <div className="card q-end">
        <p className={hasRoles ? 'q-sub' : 'q-sub q-end-warn'}>
          {hasRoles ? t('preferences.doneSubReady') : t('preferences.doneSubNoRoles')}
        </p>
        {/* The link IS the button. Wrapping a <button> in a <Link> gives two
            consecutive tab stops to one destination. */}
        {hasRoles && <Link to="/jobs" className="btn-primary">{t('preferences.doneAction')}</Link>}
      </div>
    </div>
  )
}
