// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Badge from '../components/Badge'
import Button from '../components/Button'
import SaveStatus from '../components/SaveStatus'
import TagInput from '../components/TagInput'
import { errMsg } from '../lib/errors'
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

/** Append a suggestion phrase to a free-text answer.
 *
 * Casing was inconsistent — the first pick landed as written, later ones
 * lowercased, giving "Frequent travel, purely administrative work".
 * Sentence-case a phrase only when it follows another. */
function appendPhrase(value: string, phrase: string): string {
  return value.trim()
    ? `${value.replace(/[\s,;]+$/, '')}, ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`
    : phrase
}

/** One-tap examples. Source-agnostic: the caller decides what "already added"
 * means and how a pick lands, so the same chips serve a free-text answer and a
 * tag list.
 *
 * The group is named once rather than each button carrying a described-by; a
 * bare "+ Frequent travel" announced on its own doesn't say what it does. */
function Suggestions({ items, added, onPick, label }: {
  items: string[]
  added: (s: string) => boolean
  onPick: (s: string) => void
  label: string
}) {
  return (
    <div className="suggest-row" role="group" aria-label={label}>
      {items.map(s => {
        const isAdded = added(s)
        return (
          // aria-disabled, not disabled: activating a `disabled` button drops
          // focus to <body>. Survivable with one chip row, hostile with three.
          <button key={s} type="button" aria-disabled={isAdded}
            onClick={() => { if (!isAdded) onPick(s) }}>
            {isAdded ? '✓' : '+'} {s}
          </button>
        )
      })}
    </div>
  )
}

// Suggested titles survive navigation and reload: each round-trip is a real LLM
// call, and re-earning the same list just to walk back to this page is the kind
// of repeat spend the scanner goes to some length to avoid. Deliberately NOT
// invalidated when the profile changes — regenerating is always an explicit
// button press, never something that happens to you on load.
const TITLES_KEY = 'preferences_suggested_titles'

function storedTitles(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TITLES_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter(x => typeof x === 'string') : []
  } catch { return [] }
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PreferencesPage() {
  const { t } = useTranslation()
  const { profile, error, saveState, saveError, runSave, set } = useProfileAutosave()
  const uid = useId()
  const [titles, setTitles] = useState<string[]>(storedTitles)
  const [suggesting, setSuggesting] = useState(false)
  const [titleError, setTitleError] = useState('')

  async function suggestTitles() {
    setSuggesting(true)
    setTitleError('')
    try {
      const r = await api.suggestTitles()
      setTitles(r.titles)
      localStorage.setItem(TITLES_KEY, JSON.stringify(r.titles))
      if (!r.titles.length) setTitleError(t('preferences.suggestTitles.none'))
    } catch (e) {
      setTitleError(errMsg(e))
    } finally {
      setSuggesting(false)
    }
  }

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
  const langs = profile.skills.languages.map(l => l.language.trim()).filter(Boolean)
  // Mirrors the server's gate only so we don't offer a button that would 400.
  const canSuggest = profile.experience.length > 0 || !!profile.personal.professional_title?.trim()

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
        {/* Secondary, not primary: the page's one vermilion action is the Job
            Suggestions link at the end. No sparkle/wand glyph either — the AI
            here is a background tool, not an assistant persona. */}
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Button variant="secondary" busy={suggesting} disabled={!canSuggest} onClick={suggestTitles}>
            {t('preferences.suggestTitles.action')}
          </Button>
          {!canSuggest && <p className="section-help" style={{ margin: '6px 0 0' }}>{t('preferences.suggestTitles.needProfile')}</p>}
          {titleError && <p className="error-msg">{titleError}</p>}
        </div>
        {/* The chips arrive after a round-trip and are otherwise silent. */}
        <div role="status" aria-live="polite" className="sr-only">
          {titles.length ? t('preferences.suggestTitles.arrived', { count: titles.length }) : ''}
        </div>
        {titles.length > 0 && (
          <Suggestions items={titles} label={t('preferences.suggestTitles.groupLabel')}
            added={s => p.target_roles.includes(s)}
            onPick={s => set('preferences.target_roles', [...p.target_roles, s])} />
        )}
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
          {/* Read-only: skills.languages on the Profile is the one source of
              truth (it also carries proficiency). Not a <label> — a list of
              chips isn't a form control, so it names its group instead. */}
          <span className="field-label" id={id('langs')}>{t('preferences.q.languages')}</span>
          {langs.length > 0 ? (
            // role="group": aria-labelledby is ignored on a bare <div>, so the
            // chips would be announced as loose text with no idea what they are.
            <div role="group" aria-labelledby={id('langs')}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {langs.map(l => <Badge key={l} variant="lang">{l}</Badge>)}
            </div>
          ) : (
            // The sentence names what's missing on its own — no group wrapper.
            <p className="section-help" style={{ margin: 0 }}>{t('preferences.q.languagesEmpty')}</p>
          )}
          <p className="section-help" style={{ margin: '6px 0 0' }}>
            <Link to="/profile#languages">{t('preferences.q.languagesEdit')}</Link>
          </p>
        </div>
      </Question>

      <Question title={t('preferences.q.great')} sub={t('preferences.q.greatSub')} controlId={id('great')}>
        <textarea id={id('great')} value={p.looking_for} placeholder={t('preferences.q.greatPlaceholder')}
          onChange={e => set('preferences.looking_for', e.target.value)} style={{ minHeight: 100 }} />
        <Suggestions label={t('preferences.greatLabel')}
          added={s => p.looking_for.toLowerCase().includes(s.toLowerCase())}
          onPick={s => set('preferences.looking_for', appendPhrase(p.looking_for, s))}
          items={[
            t('preferences.great.impact'),
            t('preferences.great.autonomy'),
            t('preferences.great.building'),
            t('preferences.great.learning'),
          ]} />
      </Question>

      <Question title={t('preferences.q.dealbreakers')} sub={t('preferences.q.dealbreakersSub')} controlId={id('avoid')}>
        <textarea id={id('avoid')} value={p.avoid} placeholder={t('preferences.q.dealbreakersPlaceholder')}
          onChange={e => set('preferences.avoid', e.target.value)} style={{ minHeight: 80 }} />
        <Suggestions label={t('preferences.suggestLabel')}
          // Whole-phrase match only: a substring test let "no cold-calling
          // please" disable the cold-calling chip, and vice versa.
          added={s => p.avoid.toLowerCase().includes(s.toLowerCase())}
          onPick={s => set('preferences.avoid', appendPhrase(p.avoid, s))}
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
