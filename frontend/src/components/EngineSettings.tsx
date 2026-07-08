import { useEffect, useRef, useState } from 'react'
import { Cpu, Cloud, Download, Trash2, CheckCircle2 } from 'lucide-react'
import { api } from '../api'
import type { EngineProvider, LocalModel, DownloadStatus } from '../api'
import Button from './Button'
import { useToast } from './Toast'
import { usePoller } from '../lib/usePoller'
import { errMsg } from '../lib/errors'

const fmtGb = (b: number | null | undefined) => (b == null ? '—' : `${(b / 1e9).toFixed(1)} GB`)

/**
 * AI-engine chooser: the free local model vs OpenRouter. Handles downloading and
 * deleting the local GGUF with live progress. The OpenRouter key/model fields
 * live in the parent Settings page and show only when OpenRouter is selected.
 */
export default function EngineSettings({ provider, onProviderChange }: {
  provider: EngineProvider
  onProviderChange: (p: EngineProvider) => void
}) {
  const toast = useToast()
  const [model, setModel] = useState<LocalModel | null>(null)
  const [dl, setDl] = useState<DownloadStatus>({ state: 'idle' })
  const poller = usePoller(1000)
  const busy = dl.state === 'downloading' || dl.state === 'resuming' || dl.state === 'pending'
  const startedRef = useRef(false)

  function refreshModel() {
    api.listLocalModels().then(ms => setModel(ms[0] ?? null)).catch(() => {})
  }

  useEffect(() => {
    refreshModel()
    // Reconnect to an in-flight download if the user navigated away and back.
    api.getDownloadStatus().then(s => {
      setDl(s)
      if (s.state === 'downloading' || s.state === 'resuming' || s.state === 'pending') watch()
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function watch() {
    poller.start(async () => {
      const s = await api.getDownloadStatus()
      setDl(s)
      if (s.state === 'done') {
        if (startedRef.current) { toast.success('Model downloaded — the free AI engine is ready.'); startedRef.current = false }
        refreshModel()
        return true
      }
      if (s.state === 'error') {
        toast.error(`Download failed: ${s.error ?? 'unknown error'}`)
        return true
      }
      return false
    })
  }

  async function download(force = false) {
    try {
      startedRef.current = true
      await api.startModelDownload({ force })
      setDl({ state: 'pending' })
      watch()
    } catch (e) {
      startedRef.current = false
      const msg = errMsg(e)
      // The RAM pre-check is overridable — offer to proceed.
      if (/RAM/i.test(msg) && window.confirm(`${msg}\n\nDownload anyway?`)) return download(true)
      toast.error(msg)
    }
  }

  async function remove() {
    if (!window.confirm('Delete the downloaded model? You can download it again later.')) return
    try {
      await api.deleteLocalModel()
      setDl({ state: 'idle' })
      refreshModel()
      toast.success('Model deleted')
    } catch (e) { toast.error(errMsg(e)) }
  }

  const pct = dl.bytes_total ? Math.min(100, Math.round((dl.bytes_done ?? 0) / dl.bytes_total * 100)) : 0

  return (
    <div className="card">
      <div className="section-title" style={{ marginBottom: 'var(--space-4)' }}>AI Engine</div>
      <p className="help-text" style={{ marginBottom: 'var(--space-4)' }}>
        Choose how the app runs its AI (tailoring CVs, scanning jobs). You can switch anytime.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <EngineCard
          icon={<Cpu size={18} aria-hidden />}
          title="Free local model"
          desc="Free & private — runs on your computer. Good results; no account needed."
          selected={provider === 'local'}
          onClick={() => onProviderChange('local')}
        />
        <EngineCard
          icon={<Cloud size={18} aria-hidden />}
          title="OpenRouter"
          desc="Best quality — needs an API key, pay a few cents per use."
          selected={provider === 'openrouter'}
          onClick={() => onProviderChange('openrouter')}
        />
      </div>

      {provider === 'local' && (
        <div className="field" style={{ marginBottom: 0 }}>
          <div style={{ fontWeight: 600 }}>{model?.label ?? 'Recommended model'}</div>
          <p className="muted-sm" style={{ margin: '4px 0 var(--space-3)' }}>
            Download size ~{fmtGb(model?.size_bytes)} · recommended {model?.min_ram_gb ?? 8} GB RAM.
            Runs entirely offline once downloaded.
          </p>

          {model?.downloaded && !busy ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
                <CheckCircle2 size={16} aria-hidden /> Downloaded and ready
              </span>
              <Button variant="ghost" className="btn-icon-danger" onClick={remove}>
                <Trash2 size={15} aria-hidden /> Delete model
              </Button>
            </div>
          ) : busy ? (
            <div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width .3s' }} />
              </div>
              <p className="muted-sm" style={{ marginTop: 6 }}>
                {dl.state === 'resuming' ? 'Resuming… ' : 'Downloading… '}
                {fmtGb(dl.bytes_done)} / {fmtGb(dl.bytes_total)} ({pct}%)
              </p>
            </div>
          ) : (
            <Button onClick={() => download()}>
              <Download size={15} aria-hidden /> Download model
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function EngineCard({ icon, title, desc, selected, onClick }: {
  icon: React.ReactNode; title: string; desc: string; selected: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        textAlign: 'left', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        background: selected ? 'var(--accent-wash, var(--surface))' : 'var(--surface)',
        border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 4 }}>
        {icon} {title}
      </div>
      <div className="muted-sm">{desc}</div>
    </button>
  )
}
