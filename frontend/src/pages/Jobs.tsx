import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { Search, Inbox, RotateCcw, ExternalLink, Check, X,
  Building2, MapPin, Laptop, FileText, Banknote, CalendarClock, type LucideIcon } from 'lucide-react'
import { api, type JobSource, type JobOpening, type JobDigest } from '../api'
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

// Structured fields read from the posting (Phase 6). Shown as squared chips
// under the title; the ~50-word summary as muted text.
function Digest({ digest }: { digest: JobDigest | null }) {
  if (!digest) return null
  const chips: [LucideIcon, string | undefined][] = [
    [Building2, digest.employer],
    [MapPin, digest.location],
    [Laptop, digest.remote && digest.remote !== 'unknown' ? digest.remote : undefined],
    [FileText, digest.contract],
    [Banknote, digest.salary],
    [CalendarClock, digest.deadline],
  ]
  const shown = chips.filter(([, v]) => v)
  if (!shown.length && !digest.summary) return null
  return (
    <>
      {shown.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          {shown.map(([Icon, v], i) => (
            <Badge key={i} variant="neutral">
              <Icon size={12} style={{ marginRight: 4, verticalAlign: -2 }} aria-hidden />{v}
            </Badge>
          ))}
        </div>
      )}
      {digest.summary && (
        <div className="muted-sm" style={{ marginTop: 'var(--space-2)' }}>{digest.summary}</div>
      )}
    </>
  )
}

export default function JobsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useTranslation()
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
    setScanProgress(t('jobs.starting'))
    setSourceErrors({})
    try {
      const { scan_id } = await api.startScan()
      poller.start(async () => {
        try {
          const s = await api.getScanStatus(scan_id)
          if (s.status === 'running' && s.total) {
            setScanProgress(s.reading_total
              ? t('jobs.readingPosting', { current: s.reading_current, total: s.reading_total })
              : t('jobs.scanProgress', { source: s.source ?? '', current: s.current, total: s.total }))
            return false
          }
          if (s.status === 'done') {
            setScanning(false)
            setScanProgress('')
            setSourceErrors(s.errors ?? {})
            toast.success(s.found ? t('jobs.foundListings', { count: s.found }) : t('jobs.noNewListings'))
            reloadOpenings()
            api.getLastScan().then(r => setLastScan(r.last_scan)).catch(() => {})
            return true
          }
          if (s.status === 'error') {
            setScanning(false)
            setScanProgress('')
            toast.error(s.error ?? t('jobs.scanFailed'))
            return true
          }
          return false
        } catch {
          setScanning(false)
          setScanProgress('')
          toast.error(t('jobs.scanFailedRestart'))
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
      toast.info(t('jobs.rejectedToast', { title: o.title }), {
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
        <h1 className="page-title">{t('jobs.title')}</h1>
        <CreditChip />
      </div>

      {loadError && (
        <div className="load-error">
          <span style={{ flex: 1 }}>{t('jobs.loadError', { error: loadError })}</span>
          <Button variant="secondary" onClick={load}>{t('common.retry')}</Button>
        </div>
      )}

      <div className="card">
        <div className="section-title" style={{ marginBottom: 'var(--space-2)' }}>{t('jobs.sources')}</div>
        <p className="help-text" style={{ marginBottom: 'var(--space-3)' }}>{t('jobs.sourcesHelp')}</p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <input
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSource()}
            placeholder="https://example.com/jobs"
            aria-label={t('jobs.sourceUrlAria')}
            style={{ flex: 1 }}
          />
          <Button variant="secondary" onClick={addSource}>{t('jobs.add')}</Button>
        </div>
        {sources.length === 0 && <div className="muted-sm">{t('jobs.noSources')}</div>}
        {sources.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0' }}>
            <a href={s.url} target="_blank" rel="noreferrer" style={{ flex: 1 }}>{s.name}</a>
            {sourceErrors[s.name] && (
              <span className="muted-sm" style={{ color: 'var(--danger)' }}>{t('jobs.couldntRead')}</span>
            )}
            <RemoveButton onClick={() => removeSource(s.id)} title={t('jobs.removeSource', { name: s.name })} />
          </div>
        ))}
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            onClick={scan}
            busy={scanning}
            disabled={sources.length === 0 || keySet === false}
            title={keySet === false ? t('jobs.needEngine') : undefined}
          >
            {!scanning && <Search size={15} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />}
            {scanning ? (scanProgress || t('jobs.scanning')) : t('jobs.findNew')}
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
              {failedSources.map(([name, err]) => (
                <div key={name}><Trans i18nKey="jobs.couldntReadSource" values={{ name, err }} components={{ b: <strong /> }} /></div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="section-title" style={{ marginBottom: 'var(--space-3)' }}>{t('jobs.suggestions')}</div>
      {suggested.length === 0 ? (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <EmptyState icon={Inbox} title={t('jobs.noSuggestionsTitle')}>
            {sources.length === 0 ? t('jobs.noSuggestionsNoSources') : t('jobs.noSuggestionsHasSources')}
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
            <Digest digest={o.digest} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flexShrink: 0 }}>
            <Button variant="primary" onClick={() => accept(o)} busy={busy === o.id}
              title={t('jobs.acceptTitle')}>
              <Check size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
              {t('jobs.acceptGenerate')}
            </Button>
            <Button variant="secondary" onClick={() => reject(o)} disabled={busy === o.id}>
              <X size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
              {t('jobs.reject')}
            </Button>
          </div>
        </div>
      ))}

      {decided.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>{t('jobs.history')}</div>
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
                    {host(o.source_url)} · {rejected ? t('jobs.rejected') : t('jobs.accepted')}
                  </div>
                  {o.reason && <div style={{ fontSize: 'var(--fs-sm)', marginTop: 'var(--space-2)' }}>{o.reason}</div>}
                  <Digest digest={o.digest} />
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
                      <Button variant="ghost" onClick={() => accept(o, true)} busy={busy === o.id}
                        title={t('jobs.regenerateTitle')}>
                        <RotateCcw size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
                        {t('jobs.regenerateCv')}
                      </Button>
                      <Button variant="ghost" className="btn-icon-danger" onClick={() => reject(o)} disabled={busy === o.id}>
                        {t('jobs.reject')}
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
