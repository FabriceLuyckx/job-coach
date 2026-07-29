// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { Check, FileText, Minus, Plus, Sparkles, X } from 'lucide-react'
import { api, pollCVJob, PollAbortedError, type CvHistoryEntry, type CVResult, type CVMutation } from '../api'
import type { LetterHistoryEntry, Profile } from '../types'
import Button from '../components/Button'
import Collapsible from '../components/Collapsible'
import Modal from '../components/Modal'
import { LANGUAGE_NAMES } from '../i18n'
import EmptyState from '../components/EmptyState'
import CreditChip from '../components/CreditChip'
import LangSelect from '../components/LangSelect'
import CVEditor from '../components/cv/CVEditor'
import GuideView from '../components/letters/GuideView'
import RemoveButton from '../components/RemoveButton'
import { useToast } from '../components/Toast'
import { useKeyStatus } from '../components/KeyStatus'
import { handoff } from '../lib/handoff'
import { GENERIC_URL, genericMissing } from '../lib/generic'
import { errMsg } from '../lib/errors'
import { formatDate } from '../lib/format'

// ─── Model ──────────────────────────────────────────────────────────────────
// An "application" groups a job's tailored CV and cover-letter guide, joined on
// job_url. Entries with no job_url (old/manual rows) each stand alone.

interface Application {
  key: string
  jobUrl: string | null
  jobTitle: string
  employer: string
  createdAt: string
  cv: CvHistoryEntry | null
  letter: LetterHistoryEntry | null
  /** The untargeted application: no posting, generated from the profile's
   *  preferences. Pinned above the list and never filtered out. */
  generic?: boolean
}

const urlKey = (url: string | null) => (url && url.trim() ? `url:${url}` : null)

function mergeApplications(cvs: CvHistoryEntry[], letters: LetterHistoryEntry[]): Application[] {
  const byUrl = new Map<string, Application>()
  const apps: Application[] = []

  for (const cv of cvs) {
    const k = urlKey(cv.job_url)
    // Histories arrive newest-first; keep the newest artifact per URL.
    if (k && byUrl.has(k)) { const a = byUrl.get(k)!; a.cv ??= cv; continue }
    const app: Application = {
      key: k ?? `cv:${cv.id}`, jobUrl: cv.job_url, jobTitle: cv.job_title,
      employer: cv.employer, createdAt: cv.created_at, cv, letter: null,
    }
    if (k) byUrl.set(k, app)
    apps.push(app)
  }
  for (const lt of letters) {
    const k = urlKey(lt.job_url)
    if (k && byUrl.has(k)) {
      const app = byUrl.get(k)!
      if (app.letter) continue
      app.letter = lt
      // Earliest artifact wins: the header date is when this application was
      // added, not when it was last regenerated.
      if (lt.created_at < app.createdAt) app.createdAt = lt.created_at
      continue
    }
    const app: Application = {
      key: k ?? `letter:${lt.id}`, jobUrl: lt.job_url, jobTitle: lt.job_title,
      employer: lt.employer, createdAt: lt.created_at, cv: null, letter: lt,
    }
    if (k) byUrl.set(k, app)
    apps.push(app)
  }
  return apps.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Split the generic application out of the merged list: it's pinned, so it
 *  takes part in neither the date sort nor the search filter. */
function splitGeneric(apps: Application[]): { generic: Application | null; rest: Application[] } {
  const generic = apps.find(a => a.jobUrl === GENERIC_URL) ?? null
  if (generic) generic.generic = true
  return { generic, rest: apps.filter(a => a !== generic) }
}

// ─── Generation helpers (start a job, poll to a history entry) ────────────────

async function pollCvToEntry(jobId: string, onStage: (s: string) => void, signal?: AbortSignal): Promise<CvHistoryEntry> {
  const res = await pollCVJob<CVResult>(jobId, s => onStage(s), signal)
  return {
    id: res.history_id, slug: res.slug, job_title: res.job_title, employer: res.employer,
    job_url: res.job_url, lang: res.lang, tailoring_notes: res.tailoring_notes,
    summary: res.summary, has_plan: res.has_plan, created_at: new Date().toISOString(),
  }
}
// The generic application has no URL to send: the server builds its brief from
// the profile, so it gets its own start call — everything after is identical.
async function runCV(url: string, lang: string | undefined, onStage: (s: string) => void, signal?: AbortSignal, onJobId?: (id: string) => void): Promise<CvHistoryEntry> {
  const { job_id } = url === GENERIC_URL ? await api.generateGenericCV(lang) : await api.startGenerateCV(url, lang ?? 'en')
  onJobId?.(job_id)
  return pollCvToEntry(job_id, onStage, signal)
}
async function runLetter(url: string, lang: string | undefined, onStage: (s: string) => void, signal?: AbortSignal, onJobId?: (id: string) => void): Promise<LetterHistoryEntry> {
  const { job_id } = url === GENERIC_URL ? await api.generateGenericLetter(lang) : await api.generateLetter(url, lang ?? 'en')
  onJobId?.(job_id)
  return pollCVJob<LetterHistoryEntry>(job_id, s => onStage(s), signal)
}

/** A running flow the user can cancel: stop the client polls AND tell the server
 * to stop each started job so the (single) local engine is freed. */
function makeCanceller(): { signal: AbortSignal; track: (id: string) => void; cancel: () => void } {
  const ac = new AbortController()
  const jobIds: string[] = []
  return {
    signal: ac.signal,
    track: (id: string) => jobIds.push(id),
    cancel: () => { ac.abort(); jobIds.forEach(id => api.cancelCVJob(id).catch(() => {})) },
  }
}

// ─── New / in-flight application slot ─────────────────────────────────────────

type Pending = { jobUrl: string; cvJobId?: string; letterJobId?: string }

function NewApplicationSlot({ pending, onCvGenerated, onLetterGenerated, onClose }: {
  pending?: Pending
  onCvGenerated: (e: CvHistoryEntry) => void
  onLetterGenerated: (e: LetterHistoryEntry) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { keySet } = useKeyStatus()
  const [url, setUrl] = useState(pending?.jobUrl ?? '')
  const [lang, setLang] = useState('auto')
  const [detecting, setDetecting] = useState(false)
  const [wantCv, setWantCv] = useState(true)
  const [wantLetter, setWantLetter] = useState(true)
  const [running, setRunning] = useState(false)
  const [cvStage, setCvStage] = useState<string | null>(null)   // null = not requested
  const [letterStage, setLetterStage] = useState<string | null>(null)
  const [cvDone, setCvDone] = useState(false)
  const [letterDone, setLetterDone] = useState(false)
  const [error, setError] = useState('')

  const cbRef = useRef({ onCvGenerated, onLetterGenerated, onClose })
  useEffect(() => { cbRef.current = { onCvGenerated, onLetterGenerated, onClose } })
  const cancelRunRef = useRef<(() => void) | null>(null)

  async function launch(opts: { cvJobId?: string; letterJobId?: string; url: string; lang: string; doCv: boolean; doLetter: boolean }) {
    setRunning(true); setError('')
    const stage = (s: string) => t(`cv.stage.${s}`, s)
    const c = makeCanceller()
    cancelRunRef.current = c.cancel
    if (opts.cvJobId) c.track(opts.cvJobId)
    if (opts.letterJobId) c.track(opts.letterJobId)
    // Persist the job ids as they're created (the accept flow already does):
    // navigating away unmounts this slot and its polls, and without the handoff
    // key the still-running generation is invisible until it lands in history.
    // With it, the mount-time resume re-attaches to the same jobs.
    const saved: Pending = { jobUrl: opts.url, cvJobId: opts.cvJobId, letterJobId: opts.letterJobId }
    const trackCv = (id: string) => { c.track(id); saved.cvJobId = id; handoff.setPending(saved) }
    const trackLetter = (id: string) => { c.track(id); saved.letterJobId = id; handoff.setPending(saved) }
    let ok = true
    let aborted = false
    const onErr = (e: unknown) => { if (e instanceof PollAbortedError) aborted = true; else { ok = false; setError(errMsg(e)) } }
    const tasks: Promise<void>[] = []
    if (opts.doCv) {
      setCvStage('')
      const p = (opts.cvJobId ? pollCvToEntry(opts.cvJobId, s => setCvStage(stage(s)), c.signal)
        : runCV(opts.url, opts.lang, s => setCvStage(stage(s)), c.signal, trackCv))
        .then(e => { cbRef.current.onCvGenerated(e); setCvDone(true) })
        .catch(onErr)
      tasks.push(p)
    }
    if (opts.doLetter) {
      setLetterStage('')
      const p = (opts.letterJobId ? pollCVJob<LetterHistoryEntry>(opts.letterJobId, s => setLetterStage(stage(s)), c.signal)
        : runLetter(opts.url, opts.lang, s => setLetterStage(stage(s)), c.signal, trackLetter))
        .then(e => { cbRef.current.onLetterGenerated(e); setLetterDone(true) })
        .catch(onErr)
      tasks.push(p)
    }
    await Promise.allSettled(tasks)
    cancelRunRef.current = null
    setRunning(false)
    handoff.clearPending()
    // Close the slot when everything landed or the user cancelled; stay open on error.
    if (aborted || ok) cbRef.current.onClose()
  }

  // Resume an accepted job handed off from the Job Suggestions page.
  useEffect(() => {
    if (pending && (pending.cvJobId || pending.letterJobId)) {
      launch({
        cvJobId: pending.cvJobId, letterJobId: pending.letterJobId,
        url: pending.jobUrl, lang: 'en',
        doCv: !!pending.cvJobId, doLetter: !!pending.letterJobId,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generate() {
    if (!url.trim() || (!wantCv && !wantLetter)) return
    let resolved = lang
    if (lang === 'auto') {
      setDetecting(true); setError('')
      try {
        resolved = (await api.detectLang(url.trim())).lang
        setLang(resolved)
      } catch (e) {
        setError(errMsg(e)); setDetecting(false); return
      }
      setDetecting(false)
    }
    launch({ url: url.trim(), lang: resolved, doCv: wantCv, doLetter: wantLetter })
  }

  function progressLine(label: string, stage: string | null, done: boolean) {
    if (stage === null) return null
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-sm)' }}>
        {done ? <Check size={15} aria-hidden /> : <span className="spinner" />}
        <strong>{label}</strong>
        <span className="muted-sm">{done ? t('applications.artifactDone') : (stage || t('cv.starting'))}</span>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <div style={{ fontWeight: 700 }}>{t('applications.newTitle')}</div>
        <Button variant="ghost" icon aria-label={t('common.close')} title={t('common.close')}
          onClick={() => { handoff.clearPending(); onClose() }}><X size={16} aria-hidden /></Button>
      </div>

      {!running && !cvDone && !letterDone ? (
        <>
          <div className="field">
            <label>{t('cv.jobUrl')}</label>
            <input
              type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…"
              onKeyDown={e => e.key === 'Enter' && generate()}
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ width: 140 }}>
              <label>{t('cv.language')}</label>
              <LangSelect value={lang} onChange={setLang} auto />
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 400, marginBottom: 0 }}>
              <input type="checkbox" checked={wantCv} onChange={e => setWantCv(e.target.checked)} style={{ width: 'auto' }} />
              {t('applications.tailoredCv')}
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 400, marginBottom: 0 }}>
              <input type="checkbox" checked={wantLetter} onChange={e => setWantLetter(e.target.checked)} style={{ width: 'auto' }} />
              {t('applications.letterGuide')}
            </label>
            <Button
              variant="primary" onClick={generate} busy={detecting}
              disabled={!url.trim() || (!wantCv && !wantLetter) || keySet === false}
              title={keySet === false ? t('cv.needEngine') : undefined}
            >
              {detecting ? t('cv.detectingLang') : t('applications.generate')}
            </Button>
          </div>
          {keySet === false && <p className="muted-sm" style={{ marginTop: 'var(--space-2)' }}>{t('cv.needEngine')}</p>}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {url && <div className="muted-sm" style={{ wordBreak: 'break-all' }}>{url}</div>}
          {progressLine(t('applications.cvTab'), cvStage, cvDone)}
          {progressLine(t('applications.letterTab'), letterStage, letterDone)}
          <p className="muted-sm">{t('applications.slowLocalHint')}</p>
          {running && (
            <div>
              <Button variant="ghost" onClick={() => cancelRunRef.current?.()}>{t('common.cancel')}</Button>
            </div>
          )}
        </div>
      )}
      {error && <p className="error-msg" style={{ marginTop: 10 }}>{error}</p>}
    </div>
  )
}

// Remembered across left-nav navigation (module stays loaded); resets on full
// page reload. ponytail: in-memory only — add sessionStorage if reload-persistence is wanted.
const expandedRows = new Set<string>()
const rowTabs = new Map<string, 'cv' | 'letter'>()

// Last-loaded page data, same module-side lifetime: shown instantly on return
// to this page while load() revalidates in the background (stale-while-revalidate).
const pageCache: {
  cvs?: CvHistoryEntry[]; letters?: LetterHistoryEntry[]
  hasPhoto?: boolean; profile?: Profile | null
} = {}

// ─── One application row (collapsible, CV | Letter tabs) ──────────────────────

function ApplicationRow({ app, hasPhoto, onDeleteApp, onDeleteLetter, onCvGenerated, onLetterGenerated, initialExpanded }: {
  app: Application
  hasPhoto: boolean
  onDeleteApp: (app: Application) => void
  onDeleteLetter: (letter: LetterHistoryEntry) => void
  onCvGenerated: (e: CvHistoryEntry) => void
  onLetterGenerated: (e: LetterHistoryEntry) => void
  initialExpanded: boolean
}) {
  const { t } = useTranslation()
  // The generic application has no posting to name, so it borrows a fixed label.
  const title = app.generic ? t('applications.generic.title') : app.jobTitle
  const [expanded, setExpanded] = useState(initialExpanded || expandedRows.has(app.key))
  const [cv, setCv] = useState(app.cv)
  const [letter, setLetter] = useState(app.letter)
  const [tab, setTab] = useState<'cv' | 'letter'>(rowTabs.get(app.key) ?? (app.cv ? 'cv' : 'letter'))

  function toggleExpanded(open: boolean) {
    setExpanded(open)
    if (open) expandedRows.add(app.key); else expandedRows.delete(app.key)
  }
  function pickTab(key: 'cv' | 'letter') { setTab(key); rowTabs.set(app.key, key) }
  const [creating, setCreating] = useState<'cv' | 'letter' | null>(null)
  const [createStage, setCreateStage] = useState('')
  const [createErr, setCreateErr] = useState('')
  // One language for the whole listing (governs both CV and letter).
  const [lang, setLang] = useState(app.cv?.lang ?? app.letter?.lang ?? 'en')
  const [relanging, setRelanging] = useState(false)
  const [relangErr, setRelangErr] = useState('')
  // A language change regenerates the letter (replacing the old one) — confirm
  // before that destructive, token-costing step. A CV-only change re-tailors in
  // place with edits preserved, so it runs without a prompt.
  const [pendingLang, setPendingLang] = useState<string | null>(null)

  const cvResult: CVResult | null = cv && {
    history_id: cv.id, slug: cv.slug,
    // The generic application has no real job title — the AI's guess ("Data
    // Scientist / …") must not leak into the editor header either.
    job_title: app.generic ? title : cv.job_title,
    employer: app.generic ? '' : cv.employer,
    tailoring_notes: cv.tailoring_notes ?? '', summary: cv.summary ?? '',
    preview_url: `/api/cv/preview/${cv.slug}/${cv.lang}`, job_url: cv.job_url ?? '',
    lang: cv.lang, has_plan: cv.has_plan,
  }

  const cancelCreateRef = useRef<(() => void) | null>(null)
  const [regenLetter, setRegenLetter] = useState(false)

  // Regenerate the cover-letter guide against the current profile/engine, in the
  // listing's language. Mirrors the relang letter branch: build a fresh guide,
  // swap it in, then delete the old row (letters are append-only history).
  async function regenerateLetter() {
    if (!app.jobUrl || !letter || regenLetter) return
    const old = letter
    const c = makeCanceller()
    cancelCreateRef.current = c.cancel
    setRegenLetter(true); setCreateErr(''); setCreateStage('')
    try {
      const e = await runLetter(app.jobUrl, lang, s => setCreateStage(t(`cv.stage.${s}`, s)), c.signal, c.track)
      setLetter(e); onLetterGenerated(e)
      api.deleteLetter(old.id).catch(() => {})
    } catch (e) {
      if (!(e instanceof PollAbortedError)) setCreateErr(errMsg(e))
    } finally {
      setRegenLetter(false); setCreateStage(''); cancelCreateRef.current = null
    }
  }

  async function create(kind: 'cv' | 'letter') {
    if (!app.jobUrl) return
    const c = makeCanceller()
    cancelCreateRef.current = c.cancel
    setCreating(kind); setCreateErr(''); setCreateStage('')
    const onStage = (s: string) => setCreateStage(t(`cv.stage.${s}`, s))
    try {
      if (kind === 'cv') {
        const e = await runCV(app.jobUrl, lang, onStage, c.signal, c.track)
        setCv(e); onCvGenerated(e)
      } else {
        const e = await runLetter(app.jobUrl, lang, onStage, c.signal, c.track)
        setLetter(e); onLetterGenerated(e)
      }
    } catch (e) {
      // Cancel = stop waiting; the server also stops the job, so don't show an error.
      if (!(e instanceof PollAbortedError)) setCreateErr(errMsg(e))
    } finally {
      setCreating(null); setCreateStage(''); cancelCreateRef.current = null
    }
  }

  // Change the whole application's language: re-tailor the existing CV (edits
  // preserved) and regenerate the existing letter, in parallel. Missing
  // artifacts adopt the new language when later created.
  const cancelRelangRef = useRef<(() => void) | null>(null)

  async function changeListingLang(newLang: string) {
    if (newLang === lang || relanging || !app.jobUrl) return
    const prevLang = lang
    setLang(newLang); setRelanging(true); setRelangErr('')
    const url = app.jobUrl
    const c = makeCanceller()
    cancelRelangRef.current = c.cancel
    const tasks: Promise<void>[] = []
    // Skip artifacts already in the target language (retry after a partial failure).
    if (cv && cv.lang !== newLang) {
      const curCv = cv
      tasks.push((async () => {
        const { job_id } = await api.relangCV(curCv.id, newLang)
        c.track(job_id)
        const r = await pollCVJob<CVMutation>(job_id, undefined, c.signal)
        const updated: CvHistoryEntry = {
          ...curCv, lang: r.lang, slug: r.slug, summary: r.summary,
          tailoring_notes: r.tailoring_notes, has_plan: true,
        }
        setCv(updated); onCvGenerated(updated)
      })())
    }
    if (letter && letter.lang !== newLang) {
      const oldLetter = letter
      tasks.push((async () => {
        const e = await runLetter(url, newLang, () => {}, c.signal, c.track)
        setLetter(e); onLetterGenerated(e)
        api.deleteLetter(oldLetter.id).catch(() => {})
      })())
    }
    const results = await Promise.allSettled(tasks)
    // A cancel rejects the polls with PollAbortedError — not an error to show.
    const failed = results.find(r => r.status === 'rejected'
      && !(r.reason instanceof PollAbortedError)) as PromiseRejectedResult | undefined
    if (failed) setRelangErr(errMsg(failed.reason))
    // Revert the control if anything didn't land, so re-picking the language
    // fires onChange again and retries only the artifacts still behind.
    if (results.some(r => r.status === 'rejected')) setLang(prevLang)
    cancelRelangRef.current = null
    setRelanging(false)
  }

  // Gate: prompt before a change that regenerates (and deletes) the letter;
  // run straight through when only a CV would be re-tailored (edits preserved).
  function requestLangChange(newLang: string) {
    if (newLang === lang || relanging || !app.jobUrl) return
    if (letter) setPendingLang(newLang)
    else changeListingLang(newLang)
  }

  const tabBtn = (key: 'cv' | 'letter', has: boolean) => {
    const name = t(key === 'cv' ? 'applications.cvTab' : 'applications.letterTab')
    return (
      <button type="button" aria-pressed={tab === key} onClick={() => pickTab(key)}
        aria-label={t(has ? 'applications.tabExists' : 'applications.tabMissing', { name })}>
        {name}
        {has
          ? <Check size={14} aria-hidden style={{ marginLeft: 6, verticalAlign: -2 }} />
          : <Minus size={14} aria-hidden style={{ marginLeft: 6, verticalAlign: -2, opacity: 0.6 }} />}
      </button>
    )
  }

  function missingArtifact(kind: 'cv' | 'letter') {
    if (!app.jobUrl) return <p className="muted-sm">{t('applications.noUrl')}</p>
    const busy = creating === kind
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <p className="muted-sm" style={{ margin: 0 }}>
          {t(kind === 'cv' ? 'applications.noCvYet' : 'applications.noLetterYet')}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <Button variant="primary" onClick={() => create(kind)} busy={busy}>
            {busy ? (createStage || t('cv.starting'))
              : t(kind === 'cv' ? 'applications.createCv' : 'applications.createLetter')}
          </Button>
          {busy && (
            <Button variant="ghost" onClick={() => cancelCreateRef.current?.()}>
              {t('common.cancel')}
            </Button>
          )}
        </div>
        {busy && <p className="muted-sm" style={{ margin: 0 }}>{t('applications.slowLocalHint')}</p>}
        {createErr && <p className="error-msg" style={{ margin: 0 }}>{createErr}</p>}
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      {pendingLang && (
        <Modal title={t('applications.changeLangTitle')} onClose={() => setPendingLang(null)}>
          <p style={{ lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
            <Trans i18nKey="applications.changeLangBody"
              values={{ lang: LANGUAGE_NAMES[pendingLang] ?? pendingLang }} components={{ b: <strong /> }} />
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="primary" onClick={() => { const l = pendingLang; setPendingLang(null); changeListingLang(l) }}>
              {t('applications.changeLangConfirm')}
            </Button>
            <Button variant="ghost" onClick={() => setPendingLang(null)}>{t('common.cancel')}</Button>
          </div>
        </Modal>
      )}
      <div style={{ padding: '11px 16px' }}>
        <Collapsible
          flat open={expanded} onToggle={toggleExpanded}
          title={
            <span className="collapsible-title-sm" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
              {app.generic
                // No employer to name — say what it's aimed at instead.
                ? <span style={{ color: 'var(--muted)', marginLeft: 6, fontWeight: 400 }}>{t('applications.generic.subtitle')}</span>
                : <span style={{ color: 'var(--muted)', marginLeft: 6, fontWeight: 400 }}>@ {app.employer}</span>}
            </span>
          }
          extras={
            <>
              <span className="muted-sm" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatDate(app.createdAt)}</span>
              <Button variant="ghost" icon className="btn-icon-danger" aria-label={t('applications.deleteApp', { title })} title={t('common.delete')}
                onClick={() => onDeleteApp(app)}><X size={16} aria-hidden /></Button>
            </>
          }
        >
          <div style={{ borderTop: '1px solid var(--border)', margin: '0 -16px -11px', padding: '16px 16px 0' }}>
            {app.jobUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 0, fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
                  {t('cv.language')}
                  <LangSelect value={lang} extra={cv?.lang ?? letter?.lang} disabled={relanging}
                    onChange={requestLangChange} style={{ padding: '3px 30px 3px 10px', backgroundPosition: 'right 10px center', fontSize: 'var(--fs-sm)', width: 'auto' }} />
                </label>
                {relanging && (
                  <>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
                      <span className="spinner" />{t('applications.changingLang')}
                    </span>
                    <Button variant="ghost" onClick={() => cancelRelangRef.current?.()}>{t('common.cancel')}</Button>
                  </>
                )}
                {relangErr && <span className="error-msg" style={{ margin: 0 }}>{relangErr}</span>}
              </div>
            )}

            <div className="seg" style={{ marginBottom: 'var(--space-4)' }}>
              {tabBtn('cv', !!cv)}
              {tabBtn('letter', !!letter)}
            </div>

            {tab === 'cv' && (
              cvResult
                ? <div style={{ margin: '0 -16px' }}><CVEditor key={`${cv!.id}:${cv!.lang}`} result={cvResult} hasPhoto={hasPhoto}
                    onSummaryUpdate={s => setCv(p => p && { ...p, summary: s })} /></div>
                : <div style={{ paddingBottom: 16 }}>{missingArtifact('cv')}</div>
            )}

            {tab === 'letter' && (
              <div style={{ paddingBottom: 16 }}>
                <div className="callout callout-highlight" style={{ marginBottom: 'var(--space-4)' }}>
                  <div>
                    <div><strong>{t('letters.explainer.headline')}</strong></div>
                    <p className="muted-sm" style={{ margin: '4px 0 0' }}>{t('letters.explainer.body')}</p>
                    <div className="editor-cluster-label" style={{ margin: '12px 0 4px' }}>{t('letters.guide.tips')}</div>
                    <ul className="muted-sm" style={{ margin: 0, paddingLeft: '1.2em' }}>
                      {(t('letters.explainer.tips', { returnObjects: true }) as string[]).map((tip, i) => <li key={i}>{tip}</li>)}
                    </ul>
                  </div>
                </div>
                {letter ? (
                  <>
                    <GuideView guide={letter.guide}
                      actions={
                        <>
                          <Button variant="secondary" onClick={regenerateLetter} busy={regenLetter} disabled={relanging}>
                            {!regenLetter && <Sparkles size={14} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />}
                            {regenLetter ? (createStage || t('cv.starting')) : t('applications.regenLetter')}
                          </Button>
                          {regenLetter && (
                            <Button variant="ghost" onClick={() => cancelCreateRef.current?.()}>{t('common.cancel')}</Button>
                          )}
                          <RemoveButton onClick={() => onDeleteLetter(letter)} title={t('applications.deleteLetter')} />
                        </>
                      }
                      note={
                        <>
                          {regenLetter && <p className="muted-sm" style={{ margin: 0 }}>{t('applications.slowLocalHint')}</p>}
                          {createErr && <p className="error-msg" style={{ margin: 0 }}>{createErr}</p>}
                        </>
                      } />

                  </>
                ) : missingArtifact('letter')}
              </div>
            )}
          </div>
        </Collapsible>
      </div>
    </div>
  )
}

// ─── Generic application (pinned, user-triggered) ─────────────────────────────

/** Shown in place of the pinned row until a generic application exists: what it
 *  is + the trigger, or what's still missing from the profile. */
function GenericCreateCard({ profile, onCvGenerated, onLetterGenerated, onRunningChange }: {
  profile: Profile | null
  onCvGenerated: (e: CvHistoryEntry) => void
  onLetterGenerated: (e: LetterHistoryEntry) => void
  /** Keeps this card mounted until BOTH artifacts land: the CV finishes first,
   *  and swapping to the finished row here would erase the letter's progress. */
  onRunningChange: (running: boolean) => void
}) {
  const { t } = useTranslation()
  const [running, setRunning] = useState(false)
  // One click builds both artifacts, so each reports its own progress — a single
  // shared stage line hid the fact that a letter was being generated at all.
  const [cvStage, setCvStage] = useState('')
  const [letterStage, setLetterStage] = useState('')
  const [cvDone, setCvDone] = useState(false)
  const [letterDone, setLetterDone] = useState(false)
  const [error, setError] = useState('')
  const cancelRef = useRef<(() => void) | null>(null)

  const missing = genericMissing(profile)

  async function create() {
    const c = makeCanceller()
    cancelRef.current = c.cancel
    setRunning(true); onRunningChange(true); setError('')
    setCvStage(''); setLetterStage(''); setCvDone(false); setLetterDone(false)
    const stage = (s: string) => t(`cv.stage.${s}`, s)
    // Both artifacts in parallel — the pair IS the generic application.
    const results = await Promise.allSettled([
      runCV(GENERIC_URL, undefined, s => setCvStage(stage(s)), c.signal, c.track)
        .then(e => { onCvGenerated(e); setCvDone(true) }),
      runLetter(GENERIC_URL, undefined, s => setLetterStage(stage(s)), c.signal, c.track)
        .then(e => { onLetterGenerated(e); setLetterDone(true) }),
    ])
    const failed = results.find(r => r.status === 'rejected'
      && !(r.reason instanceof PollAbortedError)) as PromiseRejectedResult | undefined
    if (failed) setError(errMsg(failed.reason))
    setRunning(false); onRunningChange(false); cancelRef.current = null
  }

  function progressLine(label: string, stage: string, done: boolean) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-sm)' }}>
        {done ? <Check size={15} aria-hidden /> : <span className="spinner" />}
        <strong>{label}</strong>
        <span className="muted-sm">{done ? t('applications.artifactDone') : (stage || t('cv.starting'))}</span>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 'var(--space-2)' }}>
      <h2 className="section-title" style={{ margin: '0 0 var(--space-2)' }}>{t('applications.generic.title')}</h2>
      <p className="help-text">{t('applications.generic.explainer')}</p>

      {missing.length > 0 ? (
        /* --highlight (mustard), DESIGN.md's nudge role: this is "not ready yet",
           not an error. */
        <p className="muted-sm" style={{ margin: 0, color: 'var(--highlight)', fontWeight: 500 }}>
          {t('applications.generic.needs')}{' '}
          {missing.map((m, i) => (
            <span key={m}>
              {i > 0 && t('applications.generic.and')}
              <Link to={m === 'target_roles' ? '/preferences' : '/profile'}>
                {t(`applications.generic.missing.${m}`)}
              </Link>
            </span>
          ))}
        </p>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={create} busy={running}>
              {t('applications.generic.create')}
            </Button>
            {running && (
              <Button variant="ghost" onClick={() => cancelRef.current?.()}>{t('common.cancel')}</Button>
            )}
          </div>
          {running && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'var(--space-3)' }}
              role="status" aria-live="polite">
              {progressLine(t('applications.cvTab'), cvStage, cvDone)}
              {progressLine(t('applications.letterTab'), letterStage, letterDone)}
              <span className="muted-sm">{t('applications.slowLocalHint')}</span>
            </div>
          )}
        </div>
      )}
      {error && <p className="error-msg" style={{ marginBottom: 0 }}>{error}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
  const toast = useToast()
  const { t } = useTranslation()
  const [cvHistory, setCvHistory] = useState<CvHistoryEntry[]>(pageCache.cvs ?? [])
  const [letterHistory, setLetterHistory] = useState<LetterHistoryEntry[]>(pageCache.letters ?? [])
  const [hasPhoto, setHasPhoto] = useState(pageCache.hasPhoto ?? false)
  const [profile, setProfile] = useState<Profile | null>(pageCache.profile ?? null)
  // Keep the cache mirroring live state, so local mutations (delete + Undo,
  // freshly generated artifacts) don't flash stale data on the next visit.
  useEffect(() => {
    pageCache.cvs = cvHistory; pageCache.letters = letterHistory
    pageCache.hasPhoto = hasPhoto; pageCache.profile = profile
  })
  const [genericRunning, setGenericRunning] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loadError, setLoadError] = useState('')

  function load() {
    setLoadError('')
    api.getPhoto().then(r => setHasPhoto(r.exists)).catch(() => {})
    // Only for the generic application's readiness gate; the server re-checks.
    api.getProfile().then(setProfile).catch(() => {})
    const openUrl = handoff.takeOpenUrl()
    if (openUrl) setOpenKey(urlKey(openUrl))
    Promise.all([api.getCVHistory(), api.getLetterHistory()])
      .then(([cvs, letters]) => {
        setCvHistory(cvs); setLetterHistory(letters)
        if (openUrl && !cvs.some(e => e.job_url === openUrl) && !letters.some(e => e.job_url === openUrl)) {
          // The generation this link promised never landed (it may have failed).
          // A toast alone is a dead end — open the New slot prefilled with the
          // URL so retrying is one click. No job ids ⇒ nothing auto-launches.
          setPending({ jobUrl: openUrl })
          toast.info(t('applications.noneForJob'))
        }
      })
      .catch(e => setLoadError(errMsg(e)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  // Resume an in-flight application handed off from Job Suggestions (accept).
  useEffect(() => {
    const p = handoff.peekPending()
    if (p && (p.cvJobId || p.letterJobId)) setPending(p)
  }, [])

  // Deletes waiting out their Undo window, flushed on unmount.
  const pendingDeletes = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const pd = pendingDeletes.current
    return () => {
      pd.forEach((timer, k) => {
        clearTimeout(timer)
        const [kind, id] = k.split(':', 2)
        const del = kind === 'cv' ? api.deleteCVHistory : api.deleteLetter
        del(id).catch(() => {})
      })
      pd.clear()
    }
  }, [])

  function scheduleDelete(kind: 'cv' | 'letter', id: string) {
    const key = `${kind}:${id}`
    const timer = setTimeout(() => {
      pendingDeletes.current.delete(key)
      const del = kind === 'cv' ? api.deleteCVHistory : api.deleteLetter
      del(id).catch(e => { toast.error(errMsg(e)); load() })
    }, 5000)
    pendingDeletes.current.set(key, timer)
  }
  function cancelDelete(kind: 'cv' | 'letter', id: string) {
    const key = `${kind}:${id}`
    const tm = pendingDeletes.current.get(key)
    if (tm) { clearTimeout(tm); pendingDeletes.current.delete(key) }
  }

  function addCv(e: CvHistoryEntry) {
    setCvHistory(h => [e, ...h.filter(x => x.id !== e.id)])
    if (e.job_url) setOpenKey(urlKey(e.job_url))
  }
  function addLetter(e: LetterHistoryEntry) {
    // Dedupe by job_url too, so a language change (which regenerates the letter
    // as a new row) drops the stale old-language entry from state.
    setLetterHistory(h => [e, ...h.filter(x => x.id !== e.id && !(e.job_url && x.job_url === e.job_url))])
    if (e.job_url) setOpenKey(urlKey(e.job_url))
  }

  function deleteApp(app: Application) {
    const cv = app.cv, letter = app.letter
    if (cv) { setCvHistory(h => h.filter(e => e.id !== cv.id)); scheduleDelete('cv', cv.id) }
    if (letter) { setLetterHistory(h => h.filter(e => e.id !== letter.id)); scheduleDelete('letter', letter.id) }
    // The generic row is labelled by the fixed i18n title everywhere; the stored
    // job_title is only the model's guess and must not resurface in the toast.
    toast.info(t('applications.deletedToast', { title: app.generic ? t('applications.generic.title') : app.jobTitle }), {
      duration: 5000,
      action: {
        label: t('cv.undo'),
        onClick: () => {
          if (cv) { cancelDelete('cv', cv.id); setCvHistory(h => [cv, ...h].sort((a, b) => b.created_at.localeCompare(a.created_at))) }
          if (letter) { cancelDelete('letter', letter.id); setLetterHistory(h => [letter, ...h].sort((a, b) => b.created_at.localeCompare(a.created_at))) }
        },
      },
    })
  }

  function deleteLetter(letter: LetterHistoryEntry) {
    setLetterHistory(h => h.filter(e => e.id !== letter.id))
    scheduleDelete('letter', letter.id)
    toast.info(t('letters.deletedToast', { title: letter.job_url === GENERIC_URL ? t('applications.generic.title') : letter.job_title }), {
      duration: 5000,
      action: {
        label: t('cv.undo'),
        onClick: () => { cancelDelete('letter', letter.id); setLetterHistory(h => [letter, ...h].sort((a, b) => b.created_at.localeCompare(a.created_at))) },
      },
    })
  }

  const { generic, rest: apps } = splitGeneric(mergeApplications(cvHistory, letterHistory))
  const q = query.trim().toLowerCase()
  const visible = q ? apps.filter(a => `${a.jobTitle} ${a.employer}`.toLowerCase().includes(q)) : apps
  const slotOpen = showNew || pending !== null

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{t('applications.title')}</h1>
        <div className="page-head-actions">
          <CreditChip />
          {!slotOpen && (
            <Button variant="primary" onClick={() => setShowNew(true)}>
              <Plus size={15} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
              {t('applications.new')}
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="load-error">
          <span style={{ flex: 1 }}>{t('applications.loadError', { error: loadError })}</span>
          <Button variant="secondary" onClick={load}>{t('common.retry')}</Button>
        </div>
      )}

      {slotOpen && (
        <NewApplicationSlot
          pending={pending ?? undefined}
          onCvGenerated={addCv}
          onLetterGenerated={addLetter}
          // Resync from the server on close so an artifact that finished after a
          // poll gave up still appears without a manual refresh.
          onClose={() => { setShowNew(false); setPending(null); load() }}
        />
      )}

      {generic && !genericRunning ? (
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <ApplicationRow
            app={generic}
            hasPhoto={hasPhoto}
            onDeleteApp={deleteApp}
            onDeleteLetter={deleteLetter}
            onCvGenerated={addCv}
            onLetterGenerated={addLetter}
            initialExpanded={generic.key === openKey}
          />
        </div>
      ) : (
        <GenericCreateCard profile={profile} onCvGenerated={addCv} onLetterGenerated={addLetter}
          onRunningChange={setGenericRunning} />
      )}

      {!slotOpen && !generic && visible.length === 0 && !loadError && (
        <EmptyState
          icon={FileText}
          title={t('applications.emptyTitle')}
          action={<Button variant="primary" onClick={() => setShowNew(true)}>
            <Plus size={15} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
            {t('applications.new')}
          </Button>}
        >
          {t('applications.emptyBody')}
        </EmptyState>
      )}

      {apps.length > 8 && (
        <div className="field" style={{ marginBottom: 'var(--space-2)' }}>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('applications.searchPlaceholder')} />
        </div>
      )}
      {q && visible.length === 0 && <p className="muted-sm">{t('applications.noMatches')}</p>}

      {visible.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {visible.map(app => (
            <ApplicationRow
              key={app.key}
              app={app}
              hasPhoto={hasPhoto}
              onDeleteApp={deleteApp}
              onDeleteLetter={deleteLetter}
              onCvGenerated={addCv}
              onLetterGenerated={addLetter}
              initialExpanded={app.key === openKey}
            />
          ))}
        </div>
      )}
    </div>
  )
}
