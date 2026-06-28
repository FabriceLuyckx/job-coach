import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type JobSource, type JobOpening } from '../api'
import Button from '../components/Button'
import RemoveButton from '../components/RemoveButton'

// Must match JOB_ID_KEY in CVGenerator.tsx — the CV Generator picks up these
// pending keys on mount: it polls the in-progress generation and shows its URL.
const CV_JOB_KEY = 'cv_pending_job_id'
const CV_JOB_URL_KEY = 'cv_pending_job_url'
const CV_OPEN_URL_KEY = 'cv_open_url'  // open the existing CV whose job_url matches

function host(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

export default function JobsPage() {
  const navigate = useNavigate()
  const [sources, setSources] = useState<JobSource[]>([])
  const [openings, setOpenings] = useState<JobOpening[]>([])
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [newUrl, setNewUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function reloadOpenings() { api.getOpenings().then(setOpenings).catch(() => {}) }
  useEffect(() => {
    api.getJobSources().then(setSources).catch(() => {})
    api.getLastScan().then(r => setLastScan(r.last_scan)).catch(() => {})
    reloadOpenings()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function addSource() {
    const url = newUrl.trim()
    if (!url) return
    setError('')
    try {
      await api.addJobSource(url)
      setNewUrl('')
      api.getJobSources().then(setSources).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function removeSource(id: string) {
    await api.deleteJobSource(id).catch(() => {})
    setSources(s => s.filter(x => x.id !== id))
  }

  async function refresh() {
    setError(''); setScanning(true); setScanMsg('')
    try {
      const { scan_id } = await api.startScan()
      pollRef.current = setInterval(async () => {
        try {
          const s = await api.getScanStatus(scan_id)
          if (s.status === 'done') {
            clearInterval(pollRef.current!)
            setScanning(false)
            setScanMsg(s.found ? `Found ${s.found} new listing(s)` : 'No new listings')
            reloadOpenings()
            api.getLastScan().then(r => setLastScan(r.last_scan)).catch(() => {})
          } else if (s.status === 'error') {
            clearInterval(pollRef.current!)
            setScanning(false); setScanMsg('')
            setError(s.error ?? 'Scan failed')
          }
        } catch {
          clearInterval(pollRef.current!)
          setScanning(false); setScanMsg('')
          setError('Scan failed — the server may have restarted.')
        }
      }, 2000)
    } catch (e) {
      setScanning(false); setScanMsg('')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function accept(o: JobOpening) {
    setBusy(o.id); setError('')
    try {
      const { cv_job_id, job_url } = await api.acceptOpening(o.id)
      // Hand off to the CV Generator, which polls this pending job on mount.
      localStorage.setItem(CV_JOB_KEY, cv_job_id)
      localStorage.setItem(CV_JOB_URL_KEY, job_url)
      navigate('/cv')
    } catch (e) {
      setBusy(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function reject(o: JobOpening) {
    setBusy(o.id)
    await api.rejectOpening(o.id).catch(() => {})
    setBusy(null)
    reloadOpenings()
  }

  function openCV(o: JobOpening) {
    localStorage.setItem(CV_OPEN_URL_KEY, o.url)
    navigate('/cv')
  }

  const suggested = openings.filter(o => o.status === 'suggested')
  const decided = openings.filter(o => o.status !== 'suggested')

  return (
    <div>
      <h1 className="page-title">Job Suggestions</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 10 }}>Sources</div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
          Add job-listing pages to watch. Finding new listings scans each for openings
          and filters them against your profile.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSource()}
            placeholder="https://example.com/jobs"
            style={{ flex: 1 }}
          />
          <Button variant="secondary" onClick={addSource}>+ Add</Button>
        </div>
        {sources.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>No sources yet.</div>
        )}
        {sources.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <a href={s.url} target="_blank" rel="noreferrer" style={{ flex: 1 }}>{s.name}</a>
            <RemoveButton onClick={() => removeSource(s.id)} />
          </div>
        ))}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button variant="primary" onClick={refresh} busy={scanning} disabled={sources.length === 0}>
            {scanning ? 'Scanning…' : '🔍 Find new listings'}
          </Button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            {scanMsg && !scanning ? scanMsg + ' · ' : ''}
            {lastScan ? `Last scan: ${new Date(lastScan).toLocaleString()}` : 'Never scanned'}
          </span>
        </div>
      </div>

      {error && <p className="error-msg" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="section-title" style={{ marginBottom: 10 }}>Suggestions</div>
      {suggested.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          No pending suggestions. Add a source and find new listings.
        </div>
      )}
      {suggested.map(o => (
        <div key={o.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>
              <a href={o.url} target="_blank" rel="noreferrer">{o.title}</a>
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{o.lang}</span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>{host(o.source_url)}</div>
            {o.reason && <div style={{ fontSize: 13, marginTop: 6 }}>{o.reason}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <Button variant="primary" onClick={() => accept(o)} busy={busy === o.id}
              title="Generates a tailored CV for this job and opens it in the CV Generator">
              ✓ Accept → generate CV
            </Button>
            <Button variant="danger" onClick={() => reject(o)} disabled={busy === o.id}>
              ✕ Reject
            </Button>
          </div>
        </div>
      ))}

      {decided.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 24, marginBottom: 10 }}>History</div>
          {decided.map(o => {
            const rejected = o.status === 'rejected'
            return (
              <div key={o.id} className="card"
                style={{ marginBottom: 6, opacity: rejected ? 0.5 : 1, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>
                    <span style={{ marginRight: 6 }}>{rejected ? '✕' : '✓'}</span>
                    <a href={o.url} target="_blank" rel="noreferrer">{o.title}</a>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {host(o.source_url)} · {rejected ? 'Rejected' : 'Accepted'}
                  </div>
                  {o.reason && <div style={{ fontSize: 13, marginTop: 6 }}>{o.reason}</div>}
                </div>
                {!rejected && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                    <Button variant="secondary" onClick={() => openCV(o)}>Open CV</Button>
                    <Button variant="danger" onClick={() => reject(o)} disabled={busy === o.id}>✕ Reject</Button>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
