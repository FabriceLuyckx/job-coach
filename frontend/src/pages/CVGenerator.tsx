import { useState, useEffect, useRef } from 'react'
import { ExternalLink, FileText, Plus, X } from 'lucide-react'
import { api, type CvHistoryEntry, type CVResult } from '../api'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Collapsible from '../components/Collapsible'
import EmptyState from '../components/EmptyState'
import CreditChip from '../components/CreditChip'
import CVEditor from '../components/cv/CVEditor'
import { useToast } from '../components/Toast'
import { useKeyStatus } from '../components/KeyStatus'
import { handoff } from '../lib/handoff'
import { errMsg } from '../lib/errors'
import { formatDate } from '../lib/format'
import { usePoller } from '../lib/usePoller'

// ─── New CV slot ──────────────────────────────────────────────────────────────

function CVNewSlot({ hasPhoto, onGenerated, onClose }: {
  hasPhoto: boolean
  onGenerated: (entry: CvHistoryEntry) => void
  onClose: () => void
}) {
  const { keySet } = useKeyStatus()
  const [expanded, setExpanded] = useState(true)
  const [url, setUrl] = useState('')
  const [lang, setLang] = useState<'en' | 'nl'>('en')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<CVResult | null>(null)
  const poller = usePoller()
  const onGeneratedRef = useRef(onGenerated)
  useEffect(() => { onGeneratedRef.current = onGenerated }, [onGenerated])

  function startPolling(jobId: string) {
    setLoadingMsg('Fetching job listing…')
    poller.start(async () => {
      try {
        const status = await api.getCVJobStatus(jobId)
        if (status.status === 'running') {
          setLoadingMsg('Tailoring CV with AI…')
          return false
        }
        if (status.status === 'done' && status.result) {
          setLoading(false)
          setLoadingMsg('')
          const res = status.result
          setResult(res)
          setExpanded(true)
          onGeneratedRef.current({
            id: res.history_id, slug: res.slug, job_title: res.job_title,
            employer: res.employer, job_url: res.job_url, lang: res.lang,
            tailoring_notes: res.tailoring_notes, summary: res.summary,
            has_plan: true, created_at: new Date().toISOString(),
          })
          handoff.clearPendingJob()
          return true
        }
        if (status.status === 'error') {
          setLoading(false)
          setLoadingMsg('')
          setError(status.error ?? 'Generation failed')
          handoff.clearPendingJob()
          return true
        }
        return false
      } catch {
        setLoading(false)
        setLoadingMsg('')
        setError('Generation failed — the server may have restarted. Check the history list below.')
        handoff.clearPendingJob()
        return true
      }
    })
  }

  useEffect(() => {
    const pendingId = handoff.pendingJobId()
    if (pendingId) {
      // Launched from "Accept" on the Job Suggestions page — show which URL is
      // being generated, then poll its progress.
      const pendingUrl = handoff.takePendingJobUrl()
      if (pendingUrl) setUrl(pendingUrl)
      setLoading(true)
      startPolling(pendingId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generate() {
    if (!url.trim()) return
    setLoading(true); setError(''); setLoadingMsg('Starting…')
    try {
      const { job_id } = await api.startGenerateCV(url.trim(), lang)
      handoff.setPendingJob(job_id, url.trim())
      handoff.takePendingJobUrl() // we already show it; keep only the id for reload-resume
      startPolling(job_id)
    } catch (e) {
      setLoading(false); setLoadingMsg('')
      setError(errMsg(e))
    }
  }

  const headerLabel = result
    ? `${result.job_title} @ ${result.employer}`
    : loading ? (loadingMsg || 'Generating…') : 'New CV'

  return (
    <div className="card" style={{ padding: 0, marginBottom: 'var(--space-2)' }}>
      <div style={{ padding: '11px 16px' }}>
        <Collapsible
          flat
          open={expanded}
          onToggle={o => { if (!loading) setExpanded(o) }}
          title={
            <span className="collapsible-title-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {loading && <span className="spinner" />}
              {headerLabel}
            </span>
          }
          extras={
            <Button variant="ghost" icon aria-label="Close" title="Close"
              onClick={() => { poller.stop(); onClose() }}><X size={16} aria-hidden /></Button>
          }
        >
          {result ? (
            <div style={{ borderTop: '1px solid var(--border)', margin: '0 -16px -11px' }}>
              <CVEditor result={result} hasPhoto={hasPhoto} />
            </div>
          ) : (
            <div>
              <div className="field">
                <label>Job listing URL</label>
                <input
                  type="url" value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://…"
                  onKeyDown={e => e.key === 'Enter' && !loading && generate()}
                  disabled={loading}
                />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
                <div style={{ width: 120 }}>
                  <label>Language</label>
                  <select value={lang} onChange={e => setLang(e.target.value as 'en' | 'nl')} disabled={loading}>
                    <option value="en">English</option>
                    <option value="nl">Dutch</option>
                  </select>
                </div>
                <Button
                  variant="primary" onClick={generate} busy={loading}
                  disabled={!url.trim() || keySet === false}
                  title={keySet === false ? 'Add your OpenRouter API key in Settings first' : undefined}
                >
                  {loading ? (loadingMsg || 'Generating…') : 'Generate CV'}
                </Button>
                {loading && <span className="muted-sm">Reading the listing and tailoring your CV — usually about 30 seconds.</span>}
              </div>
              {keySet === false && (
                <p className="muted-sm" style={{ marginTop: 'var(--space-2)' }}>
                  Generating needs an OpenRouter API key — add one in Settings.
                </p>
              )}
              {error && <p className="error-msg" style={{ marginTop: 10 }}>{error}</p>}
            </div>
          )}
        </Collapsible>
      </div>
    </div>
  )
}

// ─── History slot ─────────────────────────────────────────────────────────────

function CVHistorySlot({ entry: initialEntry, hasPhoto, onDelete, initialExpanded = false }: {
  entry: CvHistoryEntry
  hasPhoto: boolean
  onDelete: (entry: CvHistoryEntry) => void
  initialExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(initialExpanded)
  const [entry, setEntry] = useState(initialEntry)

  const result: CVResult = {
    history_id: entry.id,
    slug: entry.slug,
    job_title: entry.job_title,
    employer: entry.employer,
    tailoring_notes: entry.tailoring_notes ?? '',
    summary: entry.summary ?? '',
    preview_url: `/api/cv/preview/${entry.slug}/${entry.lang}`,
    job_url: entry.job_url ?? '',
    lang: entry.lang,
    has_plan: entry.has_plan,
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: '11px 16px' }}>
        <Collapsible
          flat
          open={expanded}
          onToggle={setExpanded}
          title={
            <span className="collapsible-title-sm" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.job_title}
              <span style={{ color: 'var(--muted)', marginLeft: 6, fontWeight: 400 }}>@ {entry.employer}</span>
            </span>
          }
          extras={
            <>
              <span className="muted-sm" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatDate(entry.created_at)}</span>
              <Badge variant="lang">{entry.lang}</Badge>
              {entry.job_url && (
                <a
                  href={entry.job_url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 'var(--fs-sm)', whiteSpace: 'nowrap' }}
                >
                  Listing <ExternalLink size={11} aria-hidden />
                </a>
              )}
              <Button variant="ghost" icon className="btn-icon-danger" aria-label={`Delete CV for ${entry.job_title}`} title="Delete"
                onClick={() => onDelete(entry)}><X size={16} aria-hidden /></Button>
            </>
          }
        >
          <div style={{ borderTop: '1px solid var(--border)', margin: '0 -16px -11px' }}>
            <CVEditor
              key={entry.id}
              result={result}
              hasPhoto={hasPhoto}
              onSummaryUpdate={s => setEntry(prev => ({ ...prev, summary: s }))}
              onLangUpdate={l => setEntry(prev => ({ ...prev, lang: l }))}
            />
          </div>
        </Collapsible>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CVGeneratorPage() {
  const toast = useToast()
  const [showNew, setShowNew] = useState(false)
  const [history, setHistory] = useState<CvHistoryEntry[]>([])
  const [hasPhoto, setHasPhoto] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [newSlotResultId, setNewSlotResultId] = useState<string | null>(null)
  // Set when arriving from "Open CV" on the Job Suggestions page — the matching
  // history entry (by job_url) is auto-expanded.
  const [openEntryId, setOpenEntryId] = useState<string | null>(null)

  function load() {
    setLoadError('')
    api.getPhoto().then(r => setHasPhoto(r.exists)).catch(() => {})
    if (handoff.pendingJobId()) setShowNew(true)
    const openUrl = handoff.takeOpenUrl()
    api.getCVHistory().then(h => {
      setHistory(h)
      if (openUrl) {
        const match = h.find(e => e.job_url === openUrl)
        if (match) {
          setOpenEntryId(match.id)
        } else {
          toast.info('No CV found for that job yet — its generation may have failed. Use “Regenerate CV” on the Job Suggestions page to try again.')
        }
      }
    }).catch(e => setLoadError(errMsg(e)))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  // Deletes waiting out their Undo window. Flushed (executed) on unmount so a
  // deletion the user didn't undo still happens when they navigate away.
  const pendingDeletes = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const pending = pendingDeletes.current
    return () => {
      pending.forEach((timer, id) => {
        clearTimeout(timer)
        api.deleteCVHistory(id).catch(() => {})
      })
      pending.clear()
    }
  }, [])

  function onGenerated(entry: CvHistoryEntry) {
    // Track which entry is showing in the new slot to avoid showing it in history simultaneously
    setNewSlotResultId(entry.id)
  }

  function onCloseNew() {
    setShowNew(false)
    if (newSlotResultId) {
      api.getCVHistory().then(setHistory).catch(() => {})
    }
    setNewSlotResultId(null)
  }

  // Deferred delete with Undo: the row vanishes from the UI immediately, but
  // the (permanent) API delete only fires after the toast window has passed.
  function onDelete(entry: CvHistoryEntry) {
    setHistory(h => h.filter(e => e.id !== entry.id))
    const timer = setTimeout(() => {
      pendingDeletes.current.delete(entry.id)
      api.deleteCVHistory(entry.id).catch(e => { toast.error(errMsg(e)); load() })
    }, 5000)
    pendingDeletes.current.set(entry.id, timer)
    toast.info(`Deleted the CV for “${entry.job_title}”`, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          const t = pendingDeletes.current.get(entry.id)
          if (t) { clearTimeout(t); pendingDeletes.current.delete(entry.id) }
          setHistory(h => [...h, entry].sort((a, b) => b.created_at.localeCompare(a.created_at)))
        },
      },
    })
  }

  const visibleHistory = history.filter(e => e.id !== newSlotResultId)

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">CV Generator</h1>
        <div className="page-head-actions">
          <CreditChip />
          {!showNew && (
            <Button variant="primary" onClick={() => setShowNew(true)}>
              <Plus size={15} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
              New CV
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="load-error">
          <span style={{ flex: 1 }}>Couldn't load your CVs: {loadError}</span>
          <Button variant="secondary" onClick={load}>Retry</Button>
        </div>
      )}

      {showNew && (
        <CVNewSlot
          hasPhoto={hasPhoto}
          onGenerated={onGenerated}
          onClose={onCloseNew}
        />
      )}

      {!showNew && visibleHistory.length === 0 && !loadError && (
        <EmptyState
          icon={FileText}
          title="No CVs yet"
          action={<Button variant="primary" onClick={() => setShowNew(true)}>
            <Plus size={15} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
            New CV
          </Button>}
        >
          Paste the URL of a job listing and the AI reads it, picks your most relevant
          experience, and writes a tailored CV — ready to preview, edit, and download as PDF.
        </EmptyState>
      )}

      {visibleHistory.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {visibleHistory.map(entry => (
            <CVHistorySlot
              key={entry.id}
              entry={entry}
              hasPhoto={hasPhoto}
              onDelete={onDelete}
              initialExpanded={entry.id === openEntryId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
