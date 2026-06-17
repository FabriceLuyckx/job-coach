import { useRef, useState, useEffect } from 'react'
import { api, type CvHistoryEntry, type CVResult } from '../api'

const SECTIONS = [
  { key: 'summary', label: 'Summary' },
  { key: 'experience', label: 'Experience' },
  { key: 'publications', label: 'Publications' },
  { key: 'links', label: 'Links' },
  { key: 'skills', label: 'Skills' },
  { key: 'languages', label: 'Languages' },
  { key: 'education', label: 'Education' },
  { key: 'grants', label: 'Grants' },
  { key: 'photo', label: 'Photo' },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

const ALL_VISIBLE = Object.fromEntries(SECTIONS.map(s => [s.key, true])) as Record<SectionKey, boolean>
const JOB_ID_KEY = 'cv_pending_job_id'

// ─── Shared editor panel ──────────────────────────────────────────────────────

function CVEditor({ result: initialResult, hasPhoto, onSummaryUpdate }: {
  result: CVResult
  hasPhoto: boolean
  onSummaryUpdate?: (summary: string) => void
}) {
  const [result, setResult] = useState(initialResult)
  const [summary, setSummary] = useState(initialResult.summary ?? '')
  const [summaryDirty, setSummaryDirty] = useState(false)
  const [visible, setVisible] = useState<Record<SectionKey, boolean>>(ALL_VISIBLE)
  const [previewKey, setPreviewKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const prevPreviewKey = useRef(previewKey)

  // Fetch summary from backend on mount if state is empty (handles old entries with NULL in DB)
  useEffect(() => {
    if (summary) return
    api.getCVSummary(result.history_id)
      .then(r => { if (r.summary && !summaryDirty) setSummary(r.summary) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After updateFromProfile reloads the iframe, re-fetch the fresh summary
  useEffect(() => {
    if (previewKey === prevPreviewKey.current) return
    prevPreviewKey.current = previewKey
    if (!summary) {
      api.getCVSummary(result.history_id)
        .then(r => { if (r.summary) setSummary(r.summary) })
        .catch(() => {})
    }
  }, [previewKey, result.history_id, summary])

  function applyVisibility() {
    const d = iframeRef.current?.contentDocument
    if (!d) return
    SECTIONS.forEach(({ key }) => {
      d.querySelectorAll<HTMLElement>(`[data-section="${key}"]`).forEach(el => {
        el.style.display = visible[key] ? '' : 'none'
      })
    })
  }

  function onIframeLoad() {
    applyVisibility()
  }

  async function refreshPreview() {
    setError('')
    setRefreshing(true)
    try {
      if (summaryDirty) {
        await api.rerenderCV(result.history_id, summary)
        setResult(prev => ({ ...prev, summary }))
        setSummaryDirty(false)
        onSummaryUpdate?.(summary)
      }
      setPreviewKey(k => k + 1)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }

  async function updateFromProfile() {
    setError('')
    setUpdating(true)
    try {
      await api.rerenderCV(result.history_id, summaryDirty ? summary : undefined)
      if (summaryDirty) { setSummaryDirty(false); onSummaryUpdate?.(summary) }
      setSummary('')  // clear so the useEffect above re-fetches fresh summary after reload
      setPreviewKey(k => k + 1)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUpdating(false)
    }
  }

  async function generateSummary() {
    setError('')
    setGenerating(true)
    try {
      const r = await api.generateCVSummary(result.history_id)
      setSummary(r.summary)
      setSummaryDirty(false)
      setPreviewKey(k => k + 1)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  function printPDF() {
    window.open(result.preview_url + '?print=1', '_blank')
  }

  function toggleSection(key: SectionKey, show: boolean) {
    setVisible(prev => ({ ...prev, [key]: show }))
    iframeRef.current?.contentDocument
      ?.querySelectorAll<HTMLElement>(`[data-section="${key}"]`)
      .forEach(el => { el.style.display = show ? '' : 'none' })
  }

  return (
    <div style={{ padding: 16 }}>
      {error && <p className="error-msg" style={{ marginBottom: 12 }}>{error}</p>}

      {/* Job info strip */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--fs-lg)' }}>{result.job_title}</span>
        <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-md)' }}>{result.employer}</span>
        {result.job_url && (
          <a href={result.job_url} target="_blank" rel="noreferrer"
            style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent)', textDecoration: 'none' }}>
            View listing ↗
          </a>
        )}
      </div>

      {/* Tailoring notes — full width above preview */}
      {result.tailoring_notes && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Tailoring Notes
          </div>
          <p style={{ fontSize: 'var(--fs-base)', color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>{result.tailoring_notes}</p>
        </div>
      )}

      {/* Preview iframe */}
      <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 16 }}>
        <a
          href={result.preview_url} target="_blank" rel="noreferrer"
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 10,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '5px 12px',
            color: 'var(--accent)', fontSize: 'var(--fs-sm)', fontWeight: 500, textDecoration: 'none',
          }}
        >
          Open in new tab ↗
        </a>
        <iframe
          key={previewKey}
          ref={iframeRef}
          src={result.preview_url}
          onLoad={onIframeLoad}
          style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
          title="CV Preview"
        />
      </div>

      {/* Section toggles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {SECTIONS.map(({ key, label }) => {
          const disabled = key === 'photo' && !hasPhoto
          return (
            <label
              key={key}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                padding: '4px 10px', cursor: disabled ? 'default' : 'pointer',
                fontSize: 'var(--fs-sm)', color: disabled ? 'var(--muted)' : 'var(--text)',
                opacity: disabled ? 0.45 : 1, fontWeight: 400,
              }}
            >
              <input
                type="checkbox" checked={visible[key]} disabled={disabled}
                onChange={e => toggleSection(key, e.target.checked)}
              />
              {label}
            </label>
          )
        })}
      </div>

      {/* Photo CTA */}
      {!hasPhoto && (
        <div className="callout callout-highlight" style={{ marginBottom: 16 }}>
          <span className="callout-icon">◈</span>
          <span>
            The <strong>Photo</strong> section is disabled because no photo is on file.{' '}
            <a href="/settings">Add a photo in Settings</a> to enable it.
          </span>
        </div>
      )}

      {/* Professional Summary */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Professional Summary
            {summaryDirty && <span style={{ color: 'var(--highlight)', marginLeft: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>● unsaved</span>}
          </div>
          <button
            className="btn-secondary"
            onClick={generateSummary}
            disabled={generating}
            style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)' }}
            title="Ask the AI to write a new summary based on your profile and this job"
          >
            {generating ? 'Generating…' : '✦ AI Summary'}
          </button>
        </div>
        <textarea
          value={summary}
          onChange={e => { setSummary(e.target.value); setSummaryDirty(true) }}
          rows={5}
          style={{ width: '100%', boxSizing: 'border-box' }}
          placeholder="Loading…"
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn-primary"
          onClick={refreshPreview}
          disabled={refreshing}
          title={summaryDirty ? 'Save summary edits and reload the preview' : 'Reload the CV preview'}
        >
          {refreshing ? 'Refreshing…' : summaryDirty ? 'Apply & Refresh' : 'Refresh Preview'}
        </button>
        <button
          className="btn-secondary"
          onClick={updateFromProfile}
          disabled={updating || !result.has_plan}
          title={result.has_plan
            ? "Re-render this CV from the stored tailoring plan using your latest profile data"
            : "Re-generate this CV from scratch to enable profile-based updates"}
        >
          {updating ? 'Updating…' : 'Update from Profile'}
        </button>
        <button className="btn-secondary" onClick={printPDF}>
          Print / PDF
        </button>
      </div>
    </div>
  )
}

// ─── Slot header (shared chrome) ─────────────────────────────────────────────

function SlotHeader({ expanded, onToggle, children }: {
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', userSelect: 'none' }}
      onClick={onToggle}
    >
      <span style={{ fontSize: 10, color: 'var(--muted)', display: 'inline-block', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'none' }}>
        ▶
      </span>
      {children}
    </div>
  )
}

// ─── New CV slot ──────────────────────────────────────────────────────────────

function CVNewSlot({ hasPhoto, onGenerated, onClose }: {
  hasPhoto: boolean
  onGenerated: (entry: CvHistoryEntry) => void
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [url, setUrl] = useState('')
  const [lang, setLang] = useState<'en' | 'nl'>('en')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<CVResult | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onGeneratedRef = useRef(onGenerated)
  useEffect(() => { onGeneratedRef.current = onGenerated }, [onGenerated])

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  function startPolling(jobId: string) {
    stopPolling()
    setLoadingMsg('Fetching job listing…')
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.getCVJobStatus(jobId)
        if (status.status === 'running') {
          setLoadingMsg('Tailoring CV with AI…')
        } else if (status.status === 'done' && status.result) {
          stopPolling()
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
          localStorage.removeItem(JOB_ID_KEY)
        } else if (status.status === 'error') {
          stopPolling()
          setLoading(false)
          setLoadingMsg('')
          setError(status.error ?? 'Generation failed')
          localStorage.removeItem(JOB_ID_KEY)
        }
      } catch {
        stopPolling()
        setLoading(false)
        setLoadingMsg('')
        setError('Generation failed — the server may have restarted. Check the history list below.')
        localStorage.removeItem(JOB_ID_KEY)
      }
    }, 2000)
  }

  useEffect(() => {
    const pendingId = localStorage.getItem(JOB_ID_KEY)
    if (pendingId) { setLoading(true); startPolling(pendingId) }
    return stopPolling
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generate() {
    if (!url.trim()) return
    setLoading(true); setError(''); setLoadingMsg('Starting…')
    try {
      const { job_id } = await api.startGenerateCV(url.trim(), lang)
      localStorage.setItem(JOB_ID_KEY, job_id)
      startPolling(job_id)
    } catch (e: unknown) {
      setLoading(false); setLoadingMsg('')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const headerLabel = result
    ? `${result.job_title} @ ${result.employer}`
    : loading ? (loadingMsg || 'Generating…') : 'New CV'

  return (
    <div className="card" style={{ padding: 0, marginBottom: 6 }}>
      <SlotHeader expanded={expanded} onToggle={() => !loading && setExpanded(e => !e)}>
        <div style={{ flex: 1, fontWeight: 500, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && <span className="spinner" />}
          {headerLabel}
        </div>
        <button
          onClick={e => { e.stopPropagation(); stopPolling(); onClose() }}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
          title="Close"
        >×</button>
      </SlotHeader>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {result ? (
            <CVEditor result={result} hasPhoto={hasPhoto} />
          ) : (
            <div style={{ padding: 16 }}>
              <div className="field">
                <label>Job listing URL</label>
                <input
                  type="url" value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://..."
                  onKeyDown={e => e.key === 'Enter' && !loading && generate()}
                  disabled={loading}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: 12 }}>
                <div style={{ width: 120 }}>
                  <label>Language</label>
                  <select value={lang} onChange={e => setLang(e.target.value as 'en' | 'nl')} disabled={loading}>
                    <option value="en">English</option>
                    <option value="nl">Dutch</option>
                  </select>
                </div>
                <button className="btn-primary" onClick={generate} disabled={loading || !url.trim()}>
                  {loading && <span className="spinner" />}
                  {loading ? (loadingMsg || 'Generating…') : 'Generate CV'}
                </button>
              </div>
              {error && <p className="error-msg" style={{ marginTop: 10 }}>{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── History slot ─────────────────────────────────────────────────────────────

function CVHistorySlot({ entry: initialEntry, hasPhoto, onDelete }: {
  entry: CvHistoryEntry
  hasPhoto: boolean
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
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

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <SlotHeader expanded={expanded} onToggle={() => setExpanded(e => !e)}>
        <div style={{ flex: 1, fontSize: 14 }}>
          <span style={{ fontWeight: 500 }}>{entry.job_title}</span>
          <span style={{ color: 'var(--muted)', marginLeft: 6 }}>@ {entry.employer}</span>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(entry.created_at)}</span>
        <span style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 500 }}>
          {entry.lang}
        </span>
        {entry.job_url && (
          <a
            href={entry.job_url} target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: 'var(--accent)', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Listing ↗
          </a>
        )}
        <button
          onClick={e => { e.stopPropagation(); onDelete(entry.id) }}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
          title="Remove"
        >×</button>
      </SlotHeader>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <CVEditor
            key={entry.id}
            result={result}
            hasPhoto={hasPhoto}
            onSummaryUpdate={s => setEntry(prev => ({ ...prev, summary: s }))}
          />
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CVGeneratorPage() {
  const [showNew, setShowNew] = useState(false)
  const [history, setHistory] = useState<CvHistoryEntry[]>([])
  const [hasPhoto, setHasPhoto] = useState(false)
  const [newSlotResultId, setNewSlotResultId] = useState<string | null>(null)

  useEffect(() => {
    api.getCVHistory().then(setHistory).catch(() => {})
    api.getPhoto().then(r => setHasPhoto(r.exists)).catch(() => {})
    if (localStorage.getItem(JOB_ID_KEY)) setShowNew(true)
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

  async function onDelete(id: string) {
    try {
      await api.deleteCVHistory(id)
      setHistory(h => h.filter(e => e.id !== id))
    } catch { /* ignore */ }
  }

  const visibleHistory = history.filter(e => e.id !== newSlotResultId)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>CV Generator</h1>
        {!showNew && (
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ New CV</button>
        )}
      </div>

      {showNew && (
        <CVNewSlot
          hasPhoto={hasPhoto}
          onGenerated={onGenerated}
          onClose={onCloseNew}
        />
      )}

      {visibleHistory.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibleHistory.map(entry => (
            <CVHistorySlot
              key={entry.id}
              entry={entry}
              hasPhoto={hasPhoto}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
