// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { Search, Inbox, RotateCcw, ExternalLink, Check, X, RefreshCw, Link2, Filter,
  Building2, MapPin, Laptop, FileText, CalendarClock, type LucideIcon } from 'lucide-react'
import { api, type JobSource, type JobOpening, type JobDigest } from '../api'
import Button from '../components/Button'
import RemoveButton from '../components/RemoveButton'
import Badge from '../components/Badge'
import Collapsible from '../components/Collapsible'
import Modal from '../components/Modal'
import Pager from '../components/Pager'
import EmptyState from '../components/EmptyState'
import CreditChip from '../components/CreditChip'
import { useToast } from '../components/Toast'
import { useKeyStatus } from '../components/KeyStatus'
import { handoff } from '../lib/handoff'
import { errMsg } from '../lib/errors'
import { formatDate, formatDateTime } from '../lib/format'
import { usePoller } from '../lib/usePoller'

const PAGE_LIMIT = 10  // filtered-out / history rows per page

type OpeningPage = { items: JobOpening[]; total: number; page: number }
const EMPTY_PAGE: OpeningPage = { items: [], total: 0, page: 0 }

function host(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

// Structured fields read from the posting (squared neutral chips), the
// posting's own ~3-sentence description, and — separately — the one-sentence
// verdict reason (why it was matched/filtered), explicitly labelled so the two
// are never confused. `userNote` (the user's own reject reason) takes priority
// over the AI's `reason` when both exist; `fallbackReason` covers openings the
// title prescreen dropped before the posting was ever read.
function Verdict({ digest, reason, userNote, fallbackReason }: {
  digest: JobDigest | null
  reason?: string | null
  userNote?: string | null
  fallbackReason?: string
}) {
  const { t } = useTranslation()
  // De-badged: fields are one inline mono line (middot-separated), not pills.
  // The icon is decorative, so each field carries a screen-reader-only label —
  // without it a field reads as a bare "Ghent" with no hint it's a location.
  // The deadline is coloured mono text (--deadline), never a chip.
  const fields: [LucideIcon, string | undefined, string, boolean][] = [
    [Building2, digest?.employer, 'employer', false],
    [MapPin, digest?.location, 'location', false],
    [Laptop, digest?.remote && digest.remote !== 'unknown' ? digest.remote : undefined, 'remote', false],
    [FileText, digest?.contract, 'contract', false],
    [CalendarClock, digest?.deadline, 'deadline', true],
  ]
  const shown = fields.filter(([, v]) => v)
  // A handful of legacy rows carry a bare 2-letter code (e.g. "en") in `reason`
  // from before the lang/reason split — too short to be a real sentence, so
  // treat it as no input rather than render it as a reason.
  const real = (s?: string | null) => (s && s.trim().length > 4 ? s.trim() : undefined)
  // fallbackReason claims the posting was never read — only true when there's
  // no digest either. A digest is proof the posting WAS fetched and reviewed,
  // even if that same review returned a blank/short `reason` string.
  const reasonText = real(userNote) || real(reason) || (!digest && fallbackReason) || undefined
  if (!shown.length && !digest?.summary && !reasonText) return null
  return (
    <>
      {shown.length > 0 && (
        <div className="meta">
          {shown.map(([Icon, v, key, isDeadline], i) => (
            <span key={i} className={isDeadline ? 'meta-deadline' : undefined}>
              <Icon size={12} aria-hidden />
              <span className="sr-only">{t(`jobs.digest.${key}`)}: </span>{v}
            </span>
          ))}
        </div>
      )}
      {digest?.summary && (
        <div className="muted-sm" style={{ marginTop: 'var(--space-2)' }}>{digest.summary}</div>
      )}
      {reasonText && (
        <div style={{ fontSize: 'var(--fs-sm)', marginTop: 'var(--space-1)' }}>
          <strong style={{ color: 'var(--accent-text)' }}>{t('jobs.reasonLabel')}</strong> {reasonText}
        </div>
      )}
    </>
  )
}

// Remembered across left-nav navigation (module stays loaded) so a scan started
// here still shows as running when the user returns; the server keeps it running
// and its status queryable for 1h. Resets on full page reload.
// ponytail: in-memory only — swap to localStorage if reload-persistence is wanted.
let activeScan: { id: string; kind: 'scan' | 'recheck' } | null = null

// Last-loaded page data, same module-side lifetime: shown instantly on return
// to this page while load() revalidates in the background (stale-while-revalidate).
const pageCache: {
  sources?: JobSource[]; suggestions?: JobOpening[]
  filtered?: OpeningPage; history?: OpeningPage
  lastScan?: string | null; profileChanged?: boolean; recheckableCount?: number
} = {}

export default function JobsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useTranslation()
  const { keySet } = useKeyStatus()
  const [sources, setSources] = useState<JobSource[]>(pageCache.sources ?? [])
  const [suggestions, setSuggestions] = useState<JobOpening[]>(pageCache.suggestions ?? [])
  // Filtered-out and history are paged server-side; each holds one page.
  const [filtered, setFiltered] = useState<OpeningPage>(pageCache.filtered ?? EMPTY_PAGE)
  const [history, setHistory] = useState<OpeningPage>(pageCache.history ?? EMPTY_PAGE)
  const [lastScan, setLastScan] = useState<string | null>(pageCache.lastScan ?? null)
  const [profileChanged, setProfileChanged] = useState(pageCache.profileChanged ?? false)
  const [recheckableCount, setRecheckableCount] = useState(pageCache.recheckableCount ?? 0)
  // Keep the cache mirroring live state, so local mutations (accept/reject,
  // scan results) don't flash stale data on the next visit.
  useEffect(() => {
    pageCache.sources = sources; pageCache.suggestions = suggestions
    pageCache.filtered = filtered; pageCache.history = history
    pageCache.lastScan = lastScan; pageCache.profileChanged = profileChanged
    pageCache.recheckableCount = recheckableCount
  })
  const [newUrl, setNewUrl] = useState('')
  const [checkUrl, setCheckUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [scanProgress, setScanProgress] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  // The opening whose reject modal is open, and the optional note being typed.
  const [rejecting, setRejecting] = useState<JobOpening | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  // Openings accepted this visit: kept in place in the suggestions list showing
  // their generation state, instead of vanishing to History or navigating away.
  const [accepted, setAccepted] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const poller = usePoller()
  // Anchors for the top of each paged section, so a page-number click scrolls
  // there instead of leaving the browser to reflow-scroll wherever it likes
  // (most visible on the last, shortest page, which could jump near the bottom).
  const filteredTopRef = useRef<HTMLDivElement>(null)
  const historyTopRef = useRef<HTMLHeadingElement>(null)

  // Load one page of an archival list. If the page came back empty and it wasn't
  // the first (its last row was just acted on), step back to the now-last page.
  function loadGroup(group: 'filtered' | 'history', page: number) {
    const set = group === 'filtered' ? setFiltered : setHistory
    api.getOpeningsPage(group, page * PAGE_LIMIT, PAGE_LIMIT)
      .then(({ items, total }) => {
        if (items.length === 0 && page > 0) return loadGroup(group, page - 1)
        set({ items, total, page })
      })
      .catch(e => toast.error(errMsg(e)))
  }

  const load = useCallback(() => {
    setLoadError('')
    Promise.all([api.getJobSources(), api.getOpenings(), api.getLastScan()])
      .then(([s, o, l]) => { setSources(s); setSuggestions(o); setLastScan(l.last_scan); setProfileChanged(l.profile_changed); setRecheckableCount(l.recheckable) })
      .catch(e => setLoadError(errMsg(e)))
    loadGroup('filtered', 0)
    loadGroup('history', 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(load, [load])

  function reloadOpenings() {
    api.getOpenings().then(setSuggestions).catch(e => toast.error(errMsg(e)))
    // Reload the current page of each archival list (a mutation can move a row
    // between suggestions/filtered/history, so refresh all three).
    loadGroup('filtered', filtered.page)
    loadGroup('history', history.page)
    // Restoring a filtered row changes what a re-check could examine, so the
    // server's re-checkable count has to move with the list — a stale count
    // re-opens the "examined nothing, reported no matches" hole.
    api.getLastScan().then(r => setRecheckableCount(r.recheckable)).catch(() => {})
  }

  async function addSource() {
    const url = newUrl.trim()
    if (!url) return
    try {
      const added = await api.addJobSource(url)
      setNewUrl('')
      setSources(s => [...s, added])
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  async function removeSource(id: string) {
    try {
      await api.deleteJobSource(id)
      setSources(s => s.filter(x => x.id !== id))
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  // Shared driver for the two long-running background jobs (scan + recheck):
  // both return a scan_id and report progress through the same status endpoint.
  // `resumed` = re-attaching to a scan started before this mount; a 404 then
  // (server restarted / TTL passed) resets quietly instead of alarming.
  function pollJob(scanId: string, setBusyFlag: (b: boolean) => void,
                   onDone: (found: number) => void, resumed = false) {
    poller.start(async () => {
      try {
        const s = await api.getScanStatus(scanId)
        if (s.status === 'running' && (s.total || s.reading_total)) {
          const src = s.source ?? ''
          setScanProgress(
            s.reading_total
              ? t('jobs.readingPosting', { current: s.reading_current, total: s.reading_total })
              : s.phase
                ? t(`jobs.phase.${s.phase}`, { source: src })
                : t('jobs.scanProgress', { source: src, current: s.current, total: s.total }))
          return false
        }
        if (s.status === 'done') {
          setBusyFlag(false); setScanProgress(''); activeScan = null
          setSourceErrors(s.errors ?? {})
          onDone(s.found ?? 0)
          reloadOpenings()
          api.getLastScan().then(r => { setLastScan(r.last_scan); setProfileChanged(r.profile_changed); setRecheckableCount(r.recheckable) }).catch(() => {})
          // Per-source last_scanned times were stamped server-side during the
          // scan — without this reload they stay stale until a page refresh.
          api.getJobSources().then(setSources).catch(() => {})
          return true
        }
        if (s.status === 'cancelled') {
          setBusyFlag(false); setScanProgress(''); activeScan = null
          reloadOpenings()  // work stored before the cancel may exist
          api.getJobSources().then(setSources).catch(() => {})  // sources finished pre-cancel were stamped
          return true
        }
        if (s.status === 'error') {
          setBusyFlag(false); setScanProgress(''); activeScan = null
          toast.error(s.error ?? t('jobs.scanFailed'))
          return true
        }
        return false
      } catch {
        setBusyFlag(false); setScanProgress(''); activeScan = null
        if (!resumed) toast.error(t('jobs.scanFailedRestart'))
        return true
      }
    })
  }

  // Kick off (or re-attach to) a scan/recheck poll, remembering it module-side.
  function startPolling(scanId: string, kind: 'scan' | 'recheck', resumed = false) {
    activeScan = { id: scanId, kind }
    if (kind === 'scan') {
      setScanning(true)
      // "Nothing found" is a neutral non-result, not a success, and easy to miss
      // on a scan you walked away from — show it as info and hold it 10s.
      pollJob(scanId, setScanning, found =>
        found ? toast.success(t('jobs.foundListings', { count: found }))
              : toast.info(t('jobs.noNewListings'), { duration: 10000 }), resumed)
    } else {
      setRechecking(true)
      pollJob(scanId, setRechecking, found =>
        found ? toast.success(t('jobs.recheckFound', { count: found }))
              : toast.info(t('jobs.recheckNone'), { duration: 10000 }), resumed)
    }
  }

  // Resume a scan that was running when the user last left the page.
  useEffect(() => {
    if (activeScan) {
      setScanProgress(t('jobs.starting'))
      startPolling(activeScan.id, activeScan.kind, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function scan() {
    setScanning(true)
    setScanProgress(t('jobs.starting'))
    setSourceErrors({})
    try {
      // The server hands back an in-flight job rather than starting a second
      // one; poll it under the kind it actually is, not the button we clicked.
      const { scan_id, kind } = await api.startScan()
      startPolling(scan_id, kind)
    } catch (e) {
      setScanning(false); setScanProgress('')
      toast.error(errMsg(e))
    }
  }

  async function recheck() {
    setRechecking(true)
    setScanProgress(t('jobs.starting'))
    setSourceErrors({})  // a previous run's failure must not outlive it
    try {
      const { scan_id, kind } = await api.recheckOpenings()
      startPolling(scan_id, kind)
    } catch (e) {
      setRechecking(false); setScanProgress('')
      toast.error(errMsg(e))
    }
  }

  function cancelScan() {
    if (!activeScan) return
    setCancelling(true)  // a remote in-flight LLM call can't be interrupted; show it registered
    api.cancelScan(activeScan.id).catch(() => {})  // poll resolves the true state
  }

  // Reset the pending-cancel flag once the run actually ends (any terminal branch).
  useEffect(() => { if (!scanning && !rechecking) setCancelling(false) }, [scanning, rechecking])

  async function checkJob() {
    const url = checkUrl.trim()
    if (!url) return
    setChecking(true)
    try {
      const o = await api.checkOpening(url)
      setCheckUrl('')
      reloadOpenings()
      if (o.status === 'suggested') toast.success(t('jobs.checkMatch'))
      else toast.info(t('jobs.checkNoMatch', { reason: o.reason || '' }))
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setChecking(false)
    }
  }

  // Accepting stays on this page so a queue can be triaged in one pass: the row
  // marks accepted in place and links through, rather than navigating for you.
  async function accept(o: JobOpening) {
    setBusy(o.id)
    try {
      const { cv_job_id, letter_job_id, job_url } = await api.acceptOpening(o.id)
      // Still handed off, so following the link shows both artifacts building.
      handoff.setPending({ jobUrl: job_url, cvJobId: cv_job_id, letterJobId: letter_job_id })
      setAccepted(a => ({ ...a, [o.id]: job_url }))
      toast.success(t('jobs.acceptedToast', { title: o.title }), {
        action: {
          label: t('jobs.undo'),
          // Undo the paid work too — the generations are already running, so
          // restoring the opening without stopping them would burn tokens.
          onClick: async () => {
            [cv_job_id, letter_job_id].forEach(id => { if (id) api.cancelCVJob(id).catch(() => {}) })
            handoff.clearPending()
            try {
              await api.restoreOpening(o.id)
              setAccepted(a => { const { [o.id]: _drop, ...rest } = a; return rest })
              reloadOpenings()
            } catch (e) { toast.error(errMsg(e)) }
          },
        },
      })
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  function reject(o: JobOpening) {
    setRejectNote('')
    setRejecting(o)  // ask for an optional "why" before rejecting
  }

  async function confirmReject() {
    const o = rejecting
    if (!o) return
    const note = rejectNote.trim()
    setRejecting(null)
    setBusy(o.id)
    try {
      await api.rejectOpening(o.id, note)
      reloadOpenings()
      // Rejecting an *accepted* job doesn't remove the CV and letter it already
      // generated — say so, rather than silently orphaning them on Applications.
      const msg = o.status === 'accepted'
        ? t('jobs.rejectedKeptArtifacts', { title: o.title })
        : t('jobs.rejectedToast', { title: o.title })
      toast.info(msg, {
        action: {
          label: t('jobs.undo'),
          onClick: async () => {
            try {
              await api.restoreOpening(o.id)
              reloadOpenings()
            } catch (e) { toast.error(errMsg(e)) }
          },
        },
      })
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  async function suggestAnyway(o: JobOpening) {
    setBusy(o.id)
    try {
      await api.restoreOpening(o.id)
      reloadOpenings()
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  function openCV(o: JobOpening) {
    handoff.setOpenUrl(o.url)
    navigate('/applications')
  }

  const busyScan = scanning || rechecking
  const allSuggested = suggestions
  // Re-check re-judges cached posting text, which title-prescreened rows don't
  // have — without a gate the button runs, examines nothing, and still reports
  // "no filtered jobs match". The count comes from the server (same WHERE the
  // re-check uses), so it counts every re-checkable row, not just this page.
  const recheckable = recheckableCount > 0
  const failedSources = Object.entries(sourceErrors)

  // D1: text + source filter, only worth showing once the list is long.
  const q = query.trim().toLowerCase()
  const suggested = allSuggested.filter(o => {
    if (sourceFilter && o.source_url !== sourceFilter) return false
    if (!q) return true
    const hay = `${o.title} ${o.digest?.employer ?? ''} ${o.digest?.summary ?? ''} ${o.reason ?? ''}`.toLowerCase()
    return hay.includes(q)
  })
  const showFilters = allSuggested.length > 5
  const suggestedSources = [...new Set(allSuggested.map(o => o.source_url))]

  return (
    <div>
      {rejecting && (
        <Modal title={t('jobs.rejectModalTitle')} onClose={() => setRejecting(null)}>
          <p style={{ lineHeight: 1.6, marginBottom: 'var(--space-3)' }}>
            {t('jobs.rejectModalHelp')}
          </p>
          <div className="field" style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="reject-note">{t('jobs.rejectModalLabel')}</label>
            <textarea
              id="reject-note"
              rows={3}
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder={t('jobs.rejectModalPlaceholder')}
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="primary" className="btn-danger-hover" onClick={confirmReject}>
              {t('jobs.reject')}
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(null)}>{t('common.cancel')}</Button>
          </div>
        </Modal>
      )}
      <div className="page-head">
        <h1 className="page-title">{t('jobs.title')}</h1>
        <CreditChip />
      </div>

      {loadError && (
        <div className="load-error">
          <span style={{ flex: 1 }}>{t('jobs.loadError', { error: loadError })}</span>
          <Button variant="secondary" onClick={load}>{t('common.retry')}</Button>
        </div>
      )}

      {/* Coarse live region: announces once when work starts and once when it
          stops. The visible counter below changes every poll tick — announcing
          that would read out all 40 postings of a scan, one at a time. */}
      <div role="status" aria-live="polite" className="sr-only">
        {busyScan ? t(rechecking ? 'jobs.rechecking' : 'jobs.scanning') : ''}
      </div>

      {/* One home for long-running work: sticks to the top of the scroll, and is
          never nested inside a results list — so Cancel can't vanish because the
          list it sat in went empty. */}
      {busyScan && (
        <div className="callout scan-status" style={{ marginBottom: 'var(--space-4)' }}>
          <span className="spinner" aria-hidden />
          <span style={{ flex: 1 }}>
            {cancelling
              ? t('jobs.cancelling')
              : scanProgress || t(rechecking ? 'jobs.rechecking' : 'jobs.scanning')}
          </span>
          <Button variant="ghost" onClick={cancelScan} disabled={cancelling} title={t('jobs.cancelScan')}>
            <X size={14} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />
            {t('common.cancel')}
          </Button>
        </div>
      )}

      <div className="card">
        <h2 className="section-title" style={{ marginBottom: 'var(--space-2)' }}>{t('jobs.sources')}</h2>
        <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>{t('jobs.sourcesHelp')}</p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="job-source-url">{t('jobs.sourceUrlAria')}</label>
            <input
              id="job-source-url"
              type="url"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSource()}
              placeholder="https://example.com/jobs"
            />
          </div>
          <Button variant="secondary" onClick={addSource}>{t('jobs.add')}</Button>
        </div>
        {sources.length === 0 && <div className="muted-sm">{t('jobs.noSources')}</div>}
        {sources.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0' }}>
            <a href={s.url} target="_blank" rel="noreferrer" style={{ flex: 1 }}>{s.name}</a>
            {s.last_scanned && (
              <span className="muted-sm" title={t('jobs.sourceLastScanned', { time: formatDateTime(s.last_scanned) })}>
                {formatDateTime(s.last_scanned)}
              </span>
            )}
            {sourceErrors[s.id] && (
              <span className="muted-sm" style={{ color: 'var(--danger)' }}>{t('jobs.couldntRead')}</span>
            )}
            <RemoveButton onClick={() => removeSource(s.id)} title={t('jobs.removeSource', { name: s.name })} />
          </div>
        ))}
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            onClick={scan}
            disabled={busyScan || sources.length === 0 || keySet === false}
            title={keySet === false ? t('jobs.needEngine') : undefined}
          >
            {/* No `busy` spinner here — the status strip above owns the activity
                indicator; two spinners for one job read as two jobs. */}
            <Search size={15} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />
            {t('jobs.findNew')}
          </Button>
          <span className="muted-sm">
            {lastScan ? t('jobs.lastScan', { time: formatDateTime(lastScan) }) : t('jobs.neverScanned')}
          </span>
        </div>
        {keySet === false && (
          <p className="muted-sm" style={{ marginTop: 'var(--space-2)' }}>
            {t('jobs.needEngine')}
          </p>
        )}
        {failedSources.length > 0 && (
          <div className="load-error" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
            <div style={{ flex: 1 }}>
              {failedSources.map(([id, err]) => (
                <div key={id}><Trans i18nKey="jobs.couldntReadSource"
                  values={{ name: sources.find(s => s.id === id)?.name ?? id, err }}
                  components={{ b: <strong /> }} /></div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sits beside the automated scan, not after History: both start the same
          review, so the manual escape hatch belongs next to the thing it mirrors. */}
      <div className="card" style={{ marginTop: 'var(--space-6)' }}>
        <h2 className="section-title" style={{ marginBottom: 'var(--space-2)' }}>{t('jobs.checkTitle')}</h2>
        <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>{t('jobs.checkHelp')}</p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="job-check-url">{t('jobs.checkAria')}</label>
            <input
              id="job-check-url"
              type="url"
              value={checkUrl}
              onChange={e => setCheckUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !checking && checkJob()}
              placeholder="https://example.com/jobs/data-scientist"
            />
          </div>
          <Button variant="secondary" onClick={checkJob} busy={checking}
            disabled={checking || keySet === false} title={keySet === false ? t('jobs.needEngine') : undefined}>
            {!checking && <Link2 size={14} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />}
            {t('jobs.check')}
          </Button>
        </div>
      </div>

      <h2 className="section-title" style={{ marginBottom: 'var(--space-2)' }}>{t('jobs.suggestions')}</h2>
      {/* Accepting spends real AI credit — say so where the decision is made,
          not only in a hover title a first-timer will never trigger. */}
      {suggested.length > 0 && (
        <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>
          {t('jobs.acceptHint')} {t('jobs.aiCaveat')}
        </p>
      )}
      {showFilters && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder={t('jobs.searchPlaceholder')} aria-label={t('jobs.searchPlaceholder')}
            style={{ flex: 1, minWidth: 180 }} />
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} aria-label={t('jobs.filterBySource')}>
            <option value="">{t('jobs.allSources')}</option>
            {suggestedSources.map(su => <option key={su} value={su}>{host(su)}</option>)}
          </select>
        </div>
      )}
      {suggested.length === 0 ? (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <EmptyState icon={Inbox} title={t('jobs.noSuggestionsTitle')}
            action={allSuggested.length > 0
              ? <Button variant="secondary" onClick={() => { setQuery(''); setSourceFilter('') }}>
                  {t('jobs.clearFilters')}
                </Button>
              : undefined}>
            {allSuggested.length > 0 ? t('jobs.noSuggestionsFiltered')
              : sources.length === 0 ? t('jobs.noSuggestionsNoSources') : t('jobs.noSuggestionsHasSources')}
          </EmptyState>
        </div>
      ) : (
        <div className="board" style={{ marginBottom: 'var(--space-5)' }}>
        {suggested.map(o => (
        <div key={o.id} className="board-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <a href={o.url} target="_blank" rel="noreferrer">{o.title || host(o.url)}</a>
              <Badge variant="lang">{o.lang}</Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 2 }}>
              <span className="match-flag">{t('jobs.match')}</span>
              <span className="muted-sm">{host(o.source_url)} · {t('jobs.foundOn', { date: formatDate(o.created_at) })}</span>
            </div>
            <Verdict digest={o.digest} reason={o.reason} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
            {accepted[o.id] ? (
              <>
                {/* Static, not a spinner: this page doesn't poll the generation
                    (Applications does), so an in-progress indicator here could
                    never resolve — it would spin forever on a failed job. */}
                <span className="muted-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <Check size={14} aria-hidden />{t('jobs.acceptedQueued')}
                </span>
                <Button variant="secondary" onClick={() => openCV(o)}>
                  <ExternalLink size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
                  {t('jobs.openCv')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" onClick={() => accept(o)} busy={busy === o.id}
                  title={t('jobs.acceptTitle')}>
                  <Check size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
                  {t('jobs.acceptGenerate')}
                </Button>
                <Button variant="ghost" className="btn-danger-hover" onClick={() => reject(o)} disabled={busy === o.id}>
                  <X size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
                  {t('jobs.reject')}
                </Button>
              </>
            )}
          </div>
        </div>
        ))}
        </div>
      )}


      {(sources.length > 0 || filtered.total > 0) && (
        <div ref={filteredTopRef} style={{ marginTop: 'var(--space-5)' }}>
          {/* Outside the drawer, and never gated: the promise that nothing is
              discarded has to be readable *before* you open the drawer, which is
              when the user wonders where their missing job went. Inside a
              collapsed panel it only answers a question you've already solved. */}
          <p className="muted-sm" style={{ marginBottom: 'var(--space-2)' }}>
            {t('jobs.filteredOutHelp')}{' '}
            {/* These verdicts come from Preferences — link to the page that
                actually changes them, rather than making the user recall it. */}
            <Link to="/preferences">{t('jobs.editPreferences')}</Link>
          </p>
          <Collapsible title={<span className="section-title">{t('jobs.filteredOut', { count: filtered.total })}</span>}>
            {filtered.total === 0 && (
              <p className="muted-sm" style={{ marginBottom: 'var(--space-3)' }}>{t('jobs.filteredOutNone')}</p>
            )}
            {filtered.items.length > 0 && (
            <div className="board" style={{ marginBottom: 'var(--space-3)' }}>
            {filtered.items.map(o => (
              <div key={o.id} className="board-row decided" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Filter size={14} color="var(--muted)" aria-hidden />
                    <a href={o.url} target="_blank" rel="noreferrer">{o.title || host(o.url)}</a>
                  </div>
                  <div className="muted-sm">{host(o.source_url)} · {t('jobs.filteredOutLabel')} · {t('jobs.foundOn', { date: formatDate(o.created_at) })}</div>
                  {/* Same evidence as a suggestion: you're being asked to
                      second-guess this row, so don't give it less to go on.
                      No reason AND no digest means the title prescreen dropped
                      it before the posting was ever fetched — fallbackReason
                      says so, rather than leaving the row silent under help
                      text that promises a reason. A row WITH a digest was read;
                      its reason may just have been dropped as junk. */}
                  <Verdict digest={o.digest} reason={o.reason}
                    fallbackReason={o.digest ? undefined : t('jobs.filteredByTitle')} />
                </div>
                <Button variant="ghost" onClick={() => suggestAnyway(o)} disabled={busy === o.id}
                  title={t('jobs.suggestAnywayTitle')} style={{ flexShrink: 0 }}>
                  <RotateCcw size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
                  {t('jobs.suggestAnyway')}
                </Button>
              </div>
            ))}
            </div>
            )}
            <Pager page={filtered.page} pageCount={Math.ceil(filtered.total / PAGE_LIMIT)}
              onChange={p => { loadGroup('filtered', p); filteredTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }} />
          </Collapsible>
          <div style={{ marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={recheck}
              disabled={busyScan || keySet === false || !recheckable}
              title={t('jobs.recheckTitle')}>
              <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />
              {t('jobs.recheck')}
            </Button>
            {profileChanged && lastScan && (
              /* --highlight, not --accent: accent at 13px is 4.33:1 (under AA),
                 and DESIGN.md assigns mustard to exactly this "nudge" role. */
              <span className="muted-sm" style={{ color: 'var(--highlight)' }}>{t('jobs.profileChanged')}</span>
            )}
          </div>
          {/* Visible, not a `title`: a disabled button suppresses pointer events,
              so a tooltip on it never renders. Mirrors the needEngine note above. */}
          {!recheckable && !busyScan && keySet !== false && (
            <p className="muted-sm" style={{ marginTop: 'var(--space-2)' }}>
              {filtered.total === 0 ? t('jobs.recheckNoneYet') : t('jobs.recheckNothing')}
            </p>
          )}
        </div>
      )}

      {history.total > 0 && (
        <>
          <h2 ref={historyTopRef} className="section-title" style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>{t('jobs.history')}</h2>
          <div className="board" style={{ marginBottom: 'var(--space-3)' }}>
          {history.items.map(o => {
            const rejected = o.status === 'rejected'
            return (
              <div key={o.id} className={`board-row${rejected ? ' decided' : ''}`}
                style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {rejected
                      ? <X size={14} color="var(--muted)" aria-hidden />
                      : <Check size={14} color="var(--mark)" aria-hidden />}
                    <a href={o.url} target="_blank" rel="noreferrer">{o.title || host(o.url)}</a>
                  </div>
                  <div className="muted-sm">
                    {host(o.source_url)} · {rejected ? t('jobs.rejected') : t('jobs.accepted')} · {t('jobs.foundOn', { date: formatDate(o.created_at) })}
                  </div>
                  {/* The user's own reject reason (when given) is why THEY
                      decided, and takes priority over the AI's verdict reason. */}
                  <Verdict digest={o.digest} reason={o.reason} userNote={rejected ? o.user_note : null} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flexShrink: 0 }}>
                  {rejected ? (
                    <Button variant="ghost" onClick={async () => {
                      try { await api.restoreOpening(o.id); reloadOpenings() } catch (e) { toast.error(errMsg(e)) }
                    }}>
                      <RotateCcw size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
                      {t('jobs.restore')}
                    </Button>
                  ) : (
                    <>
                      <Button variant="secondary" onClick={() => openCV(o)}>
                        <ExternalLink size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
                        {t('jobs.openCv')}
                      </Button>
                      <Button variant="ghost" className="btn-danger-hover" onClick={() => reject(o)} disabled={busy === o.id}>
                        {t('jobs.reject')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          </div>
          <Pager page={history.page} pageCount={Math.ceil(history.total / PAGE_LIMIT)}
            onChange={p => { loadGroup('history', p); historyTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }} />
        </>
      )}
    </div>
  )
}
