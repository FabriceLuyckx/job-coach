import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, FileText, Plus, X } from 'lucide-react'
import { api, pollCVJob, PollAbortedError, type CvHistoryEntry, type CVResult, type CVMutation } from '../api'
import type { LetterHistoryEntry } from '../types'
import Button from '../components/Button'
import Collapsible from '../components/Collapsible'
import EmptyState from '../components/EmptyState'
import CreditChip from '../components/CreditChip'
import LangSelect from '../components/LangSelect'
import CVEditor from '../components/cv/CVEditor'
import GuideView from '../components/letters/GuideView'
import RemoveButton from '../components/RemoveButton'
import { useToast } from '../components/Toast'
import { useKeyStatus } from '../components/KeyStatus'
import { handoff } from '../lib/handoff'
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
      if (lt.created_at > app.createdAt) app.createdAt = lt.created_at
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

// ─── Generation helpers (start a job, poll to a history entry) ────────────────

async function pollCvToEntry(jobId: string, onStage: (s: string) => void, signal?: AbortSignal): Promise<CvHistoryEntry> {
  const res = await pollCVJob<CVResult>(jobId, s => onStage(s), signal)
  return {
    id: res.history_id, slug: res.slug, job_title: res.job_title, employer: res.employer,
    job_url: res.job_url, lang: res.lang, tailoring_notes: res.tailoring_notes,
    summary: res.summary, has_plan: res.has_plan, created_at: new Date().toISOString(),
  }
}
async function runCV(url: string, lang: string, onStage: (s: string) => void, signal?: AbortSignal, onJobId?: (id: string) => void): Promise<CvHistoryEntry> {
  const { job_id } = await api.startGenerateCV(url, lang)
  onJobId?.(job_id)
  return pollCvToEntry(job_id, onStage, signal)
}
async function runLetter(url: string, lang: string, onStage: (s: string) => void, signal?: AbortSignal, onJobId?: (id: string) => void): Promise<LetterHistoryEntry> {
  const { job_id } = await api.generateLetter(url, lang)
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
    let ok = true
    let aborted = false
    const onErr = (e: unknown) => { if (e instanceof PollAbortedError) aborted = true; else { ok = false; setError(errMsg(e)) } }
    const tasks: Promise<void>[] = []
    if (opts.doCv) {
      setCvStage('')
      const p = (opts.cvJobId ? pollCvToEntry(opts.cvJobId, s => setCvStage(stage(s)), c.signal)
        : runCV(opts.url, opts.lang, s => setCvStage(stage(s)), c.signal, c.track))
        .then(e => { cbRef.current.onCvGenerated(e); setCvDone(true) })
        .catch(onErr)
      tasks.push(p)
    }
    if (opts.doLetter) {
      setLetterStage('')
      const p = (opts.letterJobId ? pollCVJob<LetterHistoryEntry>(opts.letterJobId, s => setLetterStage(stage(s)), c.signal)
        : runLetter(opts.url, opts.lang, s => setLetterStage(stage(s)), c.signal, c.track))
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
        {done ? <span aria-hidden>✓</span> : <span className="spinner" />}
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
  const [expanded, setExpanded] = useState(initialExpanded)
  const [cv, setCv] = useState(app.cv)
  const [letter, setLetter] = useState(app.letter)
  const [tab, setTab] = useState<'cv' | 'letter'>(app.cv ? 'cv' : 'letter')
  const [creating, setCreating] = useState<'cv' | 'letter' | null>(null)
  const [createStage, setCreateStage] = useState('')
  const [createErr, setCreateErr] = useState('')
  // One language for the whole listing (governs both CV and letter).
  const [lang, setLang] = useState(app.cv?.lang ?? app.letter?.lang ?? 'en')
  const [relanging, setRelanging] = useState(false)
  const [relangErr, setRelangErr] = useState('')

  const cvResult: CVResult | null = cv && {
    history_id: cv.id, slug: cv.slug, job_title: cv.job_title, employer: cv.employer,
    tailoring_notes: cv.tailoring_notes ?? '', summary: cv.summary ?? '',
    preview_url: `/api/cv/preview/${cv.slug}/${cv.lang}`, job_url: cv.job_url ?? '',
    lang: cv.lang, has_plan: cv.has_plan,
  }

  const cancelCreateRef = useRef<(() => void) | null>(null)

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

  const tabBtn = (key: 'cv' | 'letter', has: boolean) => (
    <button type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>
      {t(key === 'cv' ? 'applications.cvTab' : 'applications.letterTab')}
      <span style={{ marginLeft: 6, opacity: has ? 1 : 0.6 }} aria-hidden>{has ? '✓' : '—'}</span>
    </button>
  )

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
      <div style={{ padding: '11px 16px' }}>
        <Collapsible
          flat open={expanded} onToggle={setExpanded}
          title={
            <span className="collapsible-title-sm" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {app.jobTitle}
              <span style={{ color: 'var(--muted)', marginLeft: 6, fontWeight: 400 }}>@ {app.employer}</span>
            </span>
          }
          extras={
            <>
              <span className="muted-sm" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatDate(app.createdAt)}</span>
              {app.jobUrl && (
                <a href={app.jobUrl} target="_blank" rel="noreferrer" style={{ fontSize: 'var(--fs-sm)', whiteSpace: 'nowrap' }}>
                  {t('cv.listing')} <ExternalLink size={11} aria-hidden />
                </a>
              )}
              <Button variant="ghost" icon className="btn-icon-danger" aria-label={t('applications.deleteApp', { title: app.jobTitle })} title={t('common.delete')}
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
                    onChange={changeListingLang} style={{ padding: '3px 6px', fontSize: 'var(--fs-sm)', width: 'auto' }} />
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
                  <div><strong>{t('letters.explainer.headline')}</strong></div>
                </div>
                {letter ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-2)' }}>
                      <RemoveButton onClick={() => onDeleteLetter(letter)} title={t('applications.deleteLetter')} />
                    </div>
                    <GuideView guide={letter.guide} />
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
  const toast = useToast()
  const { t } = useTranslation()
  const [cvHistory, setCvHistory] = useState<CvHistoryEntry[]>([])
  const [letterHistory, setLetterHistory] = useState<LetterHistoryEntry[]>([])
  const [hasPhoto, setHasPhoto] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loadError, setLoadError] = useState('')

  function load() {
    setLoadError('')
    api.getPhoto().then(r => setHasPhoto(r.exists)).catch(() => {})
    const openUrl = handoff.takeOpenUrl()
    if (openUrl) setOpenKey(urlKey(openUrl))
    Promise.all([api.getCVHistory(), api.getLetterHistory()])
      .then(([cvs, letters]) => {
        setCvHistory(cvs); setLetterHistory(letters)
        if (openUrl && !cvs.some(e => e.job_url === openUrl) && !letters.some(e => e.job_url === openUrl)) {
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
    toast.info(t('applications.deletedToast', { title: app.jobTitle }), {
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
    toast.info(t('letters.deletedToast', { title: letter.job_title }), {
      duration: 5000,
      action: {
        label: t('cv.undo'),
        onClick: () => { cancelDelete('letter', letter.id); setLetterHistory(h => [letter, ...h].sort((a, b) => b.created_at.localeCompare(a.created_at))) },
      },
    })
  }

  const apps = mergeApplications(cvHistory, letterHistory)
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
          onClose={() => { setShowNew(false); setPending(null) }}
        />
      )}

      {!slotOpen && visible.length === 0 && !loadError && (
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
