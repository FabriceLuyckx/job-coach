import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Inbox, RotateCcw, ExternalLink, Check, X } from 'lucide-react'
import { api, type JobSource, type JobOpening } from '../api'
import Button from '../components/Button'
import RemoveButton from '../components/RemoveButton'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import CreditChip from '../components/CreditChip'
import { useToast } from '../components/Toast'
import { useKeyStatus } from '../components/KeyStatus'
import { handoff } from '../lib/handoff'
import { errMsg } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { usePoller } from '../lib/usePoller'

function host(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

export default function JobsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { keySet } = useKeyStatus()
  const [sources, setSources] = useState<JobSource[]>([])
  const [openings, setOpenings] = useState<JobOpening[]>([])
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [newUrl, setNewUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState('')
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const poller = usePoller()

  const load = useCallback(() => {
    setLoadError('')
    Promise.all([api.getJobSources(), api.getOpenings(), api.getLastScan()])
      .then(([s, o, l]) => { setSources(s); setOpenings(o); setLastScan(l.last_scan) })
      .catch(e => setLoadError(errMsg(e)))
  }, [])

  useEffect(load, [load])

  function reloadOpenings() {
    api.getOpenings().then(setOpenings).catch(e => toast.error(errMsg(e)))
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

  async function scan() {
    setScanning(true)
    setScanProgress('Starting…')
    setSourceErrors({})
    try {
      const { scan_id } = await api.startScan()
      poller.start(async () => {
        try {
          const s = await api.getScanStatus(scan_id)
          if (s.status === 'running' && s.total) {
            setScanProgress(`Scanning ${s.source ?? ''} (${s.current} of ${s.total})…`)
            return false
          }
          if (s.status === 'done') {
            setScanning(false)
            setScanProgress('')
            setSourceErrors(s.errors ?? {})
            toast.success(s.found ? `Found ${s.found} new listing${s.found === 1 ? '' : 's'}` : 'No new listings found')
            reloadOpenings()
            api.getLastScan().then(r => setLastScan(r.last_scan)).catch(() => {})
            return true
          }
          if (s.status === 'error') {
            setScanning(false)
            setScanProgress('')
            toast.error(s.error ?? 'Scan failed')
            return true
          }
          return false
        } catch {
          setScanning(false)
          setScanProgress('')
          toast.error('Scan failed — the server may have restarted.')
          return true
        }
      })
    } catch (e) {
      setScanning(false)
      setScanProgress('')
      toast.error(errMsg(e))
    }
  }

  async function accept(o: JobOpening, retry = false) {
    setBusy(o.id)
    try {
      const { cv_job_id, job_url } = await api.acceptOpening(o.id)
      // Hand off to the CV Generator, which polls this pending job on mount.
      handoff.setPendingJob(cv_job_id, job_url)
      navigate('/cv')
    } catch (e) {
      setBusy(null)
      toast.error(errMsg(e))
    }
    if (retry) return
  }

  async function reject(o: JobOpening) {
    setBusy(o.id)
    try {
      await api.rejectOpening(o.id)
      reloadOpenings()
      toast.info(`Rejected “${o.title}”`, {
        action: {
          label: 'Undo',
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

  function openCV(o: JobOpening) {
    handoff.setOpenUrl(o.url)
    navigate('/cv')
  }

  const suggested = openings.filter(o => o.status === 'suggested')
  const decided = openings.filter(o => o.status !== 'suggested')
  const failedSources = Object.entries(sourceErrors)

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Job Suggestions</h1>
        <CreditChip />
      </div>

      {loadError && (
        <div className="load-error">
          <span style={{ flex: 1 }}>Couldn't load this page: {loadError}</span>
          <Button variant="secondary" onClick={load}>Retry</Button>
        </div>
      )}

      <div className="card">
        <div className="section-title" style={{ marginBottom: 'var(--space-2)' }}>Sources</div>
        <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>
          Add job-listing pages to watch. Finding new listings scans each for openings
          and filters them against your profile.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <input
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSource()}
            placeholder="https://example.com/jobs"
            aria-label="Job listing page URL"
            style={{ flex: 1 }}
          />
          <Button variant="secondary" onClick={addSource}>Add</Button>
        </div>
        {sources.length === 0 && <div className="muted-sm">No sources yet — paste a careers-page URL above.</div>}
        {sources.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0' }}>
            <a href={s.url} target="_blank" rel="noreferrer" style={{ flex: 1 }}>{s.name}</a>
            {sourceErrors[s.name] && (
              <span className="muted-sm" style={{ color: 'var(--danger)' }}>couldn't be read</span>
            )}
            <RemoveButton onClick={() => removeSource(s.id)} title={`Remove ${s.name}`} />
          </div>
        ))}
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            onClick={scan}
            busy={scanning}
            disabled={sources.length === 0 || keySet === false}
            title={keySet === false ? 'Set up an AI engine in Settings first' : undefined}
          >
            {!scanning && <Search size={15} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />}
            {scanning ? (scanProgress || 'Scanning…') : 'Find new listings'}
          </Button>
          <span className="muted-sm">
            {lastScan ? `Last scan: ${formatDateTime(lastScan)}` : 'Never scanned'}
          </span>
        </div>
        {keySet === false && (
          <p className="muted-sm" style={{ marginTop: 'var(--space-2)' }}>
            Scanning needs an OpenRouter API key — add one in Settings.
          </p>
        )}
        {failedSources.length > 0 && (
          <div className="load-error" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
            <div style={{ flex: 1 }}>
              {failedSources.map(([name, err]) => (
                <div key={name}>Couldn't read <strong>{name}</strong> — {err}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="section-title" style={{ marginBottom: 'var(--space-3)' }}>Suggestions</div>
      {suggested.length === 0 ? (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <EmptyState icon={Inbox} title="No suggestions yet">
            {sources.length === 0
              ? 'Add a job-listing page above, then find new listings — openings that match your profile will appear here.'
              : 'Run “Find new listings” — openings that match your profile will appear here with a short reason.'}
          </EmptyState>
        </div>
      ) : suggested.map(o => (
        <div key={o.id} className="card" style={{ marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <a href={o.url} target="_blank" rel="noreferrer">{o.title}</a>
              <Badge variant="lang">{o.lang}</Badge>
            </div>
            <div className="muted-sm">{host(o.source_url)}</div>
            {o.reason && <div style={{ fontSize: 'var(--fs-sm)', marginTop: 'var(--space-2)' }}>{o.reason}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flexShrink: 0 }}>
            <Button variant="primary" onClick={() => accept(o)} busy={busy === o.id}
              title="Generates a tailored CV for this job and opens it in the CV Generator">
              <Check size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
              Accept → generate CV
            </Button>
            <Button variant="secondary" onClick={() => reject(o)} disabled={busy === o.id}>
              <X size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
              Reject
            </Button>
          </div>
        </div>
      ))}

      {decided.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>History</div>
          {decided.map(o => {
            const rejected = o.status === 'rejected'
            return (
              <div key={o.id} className="card"
                style={{ marginBottom: 'var(--space-2)', opacity: rejected ? 0.55 : 1, display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {rejected
                      ? <X size={14} color="var(--muted)" aria-hidden />
                      : <Check size={14} color="var(--success)" aria-hidden />}
                    <a href={o.url} target="_blank" rel="noreferrer">{o.title}</a>
                  </div>
                  <div className="muted-sm">
                    {host(o.source_url)} · {rejected ? 'Rejected' : 'Accepted'}
                  </div>
                  {o.reason && <div style={{ fontSize: 'var(--fs-sm)', marginTop: 'var(--space-2)' }}>{o.reason}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flexShrink: 0 }}>
                  {rejected ? (
                    <Button variant="ghost" onClick={async () => {
                      try { await api.restoreOpening(o.id); reloadOpenings() } catch (e) { toast.error(errMsg(e)) }
                    }}>
                      <RotateCcw size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
                      Restore
                    </Button>
                  ) : (
                    <>
                      <Button variant="secondary" onClick={() => openCV(o)}>
                        <ExternalLink size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
                        Open CV
                      </Button>
                      <Button variant="ghost" onClick={() => accept(o, true)} busy={busy === o.id}
                        title="Run the CV generation for this opening again">
                        <RotateCcw size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
                        Regenerate CV
                      </Button>
                      <Button variant="ghost" className="btn-icon-danger" onClick={() => reject(o)} disabled={busy === o.id}>
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
