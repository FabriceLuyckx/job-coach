// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cpu, Cloud, Download, Trash2, CheckCircle2 } from 'lucide-react'
import { api } from '../api'
import type { EngineProvider, LocalModel, DownloadStatus } from '../api'
import Button from './Button'
import ConfirmModal from './ConfirmModal'
import { useToast } from './Toast'
import { usePoller } from '../lib/usePoller'
import { errMsg } from '../lib/errors'
import { radioGroup } from '../lib/radiogroup'

const fmtGb = (b: number | null | undefined) => (b == null ? '—' : `${(b / 1e9).toFixed(1)} GB`)

/**
 * AI-engine chooser: the free local model vs OpenRouter. Handles downloading and
 * deleting the local GGUF with live progress. The OpenRouter key/model fields
 * live in the parent Settings page and show only when OpenRouter is selected.
 */
export default function EngineSettings({ provider, onProviderChange, children }: {
  provider: EngineProvider
  onProviderChange: (p: EngineProvider) => void
  /** The active provider's own settings (OpenRouter key/model), rendered inside
   *  this card — picking an engine and configuring it is one decision. */
  children?: React.ReactNode
}) {
  const toast = useToast()
  const { t } = useTranslation()
  const [model, setModel] = useState<LocalModel | null>(null)
  const [dl, setDl] = useState<DownloadStatus>({ state: 'idle' })
  const poller = usePoller(1000)
  const busy = dl.state === 'downloading' || dl.state === 'resuming' || dl.state === 'pending'
  const startedRef = useRef(false)
  const [confirm, setConfirm] = useState<null | { kind: 'force'; msg: string } | { kind: 'delete' }>(null)
  const titleId = useId()

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
        if (startedRef.current) { toast.success(t('engine.local.downloaded')); startedRef.current = false }
        refreshModel()
        return true
      }
      if (s.state === 'error') {
        toast.error(t('engine.local.downloadFailed', { error: s.error ?? 'unknown error' }))
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
      if (/RAM/i.test(msg)) { setConfirm({ kind: 'force', msg }); return }
      toast.error(msg)
    }
  }

  async function remove() {
    try {
      await api.deleteLocalModel()
      setDl({ state: 'idle' })
      refreshModel()
      toast.success(t('engine.local.deleted'))
    } catch (e) { toast.error(errMsg(e)) }
  }

  const pct = dl.bytes_total ? Math.min(100, Math.round((dl.bytes_done ?? 0) / dl.bytes_total * 100)) : 0
  const providers: EngineProvider[] = ['local', 'openrouter']
  const radio = radioGroup(providers, provider, onProviderChange)

  return (
    <div className="card">
      <h2 className="section-title" id={titleId} style={{ margin: '0 0 var(--space-4)' }}>{t('engine.title')}</h2>
      <p className="help-text" style={{ marginBottom: 'var(--space-4)' }}>{t('engine.help')}</p>

      <div
        {...radio.group}
        aria-labelledby={titleId}
        className="engine-grid"
        style={{ marginBottom: 'var(--space-4)' }}
      >
        <EngineCard
          {...radio.item(0)}
          icon={<Cpu size={18} aria-hidden />}
          title={t('engine.local.title')}
          desc={t('engine.local.desc')}
          onClick={() => onProviderChange('local')}
        />
        <EngineCard
          {...radio.item(1)}
          icon={<Cloud size={18} aria-hidden />}
          title={t('engine.openrouter.title')}
          desc={t('engine.openrouter.desc')}
          onClick={() => onProviderChange('openrouter')}
        />
      </div>

      {provider === 'local' && (
        <div className="field" style={{ marginBottom: 0 }}>
          <div style={{ fontWeight: 600 }}>{model?.label ?? t('engine.local.recommended')}</div>
          <p className="muted-sm" style={{ margin: '4px 0 var(--space-3)' }}>
            {t('engine.local.sizeNote', { size: fmtGb(model?.size_bytes), ram: model?.min_ram_gb ?? 8 })}
          </p>

          {model?.downloaded && !busy ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              {/* Success state, not an action — teal, so the accent stays on the
                  one thing that IS actionable here. */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--success)' }}>
                <CheckCircle2 size={16} aria-hidden /> {t('engine.local.ready')}
              </span>
              <Button variant="ghost" className="btn-icon-danger" onClick={() => setConfirm({ kind: 'delete' })}>
                <Trash2 size={15} aria-hidden /> {t('engine.local.deleteModel')}
              </Button>
            </div>
          ) : busy ? (
            <div>
              <div
                role="progressbar"
                aria-label={t('engine.local.progressLabel')}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{ height: 8, background: 'var(--surface-dim)', border: '1px solid var(--border)', overflow: 'hidden' }}
              >
                {/* scaleX rather than width: the bar ticks once a second for
                    minutes, and transform doesn't re-lay-out the card each time. */}
                <div style={{
                  width: '100%', height: '100%', background: 'var(--ink)',
                  transformOrigin: 'left', transform: `scaleX(${pct / 100})`, transition: 'transform .3s',
                }} />
              </div>
              {/* Deliberately NOT a live region: this text changes every second
                  for several minutes, and `polite` queues rather than drops —
                  it would read out a backlog of percentages. The progressbar
                  above already exposes the value on demand. */}
              <p className="muted-sm" style={{ marginTop: 6 }}>
                {t(dl.state === 'resuming' ? 'engine.local.resuming' : 'engine.local.downloading',
                   { done: fmtGb(dl.bytes_done), total: fmtGb(dl.bytes_total), pct })}
              </p>
            </div>
          ) : (
            <Button onClick={() => download()}>
              <Download size={15} aria-hidden /> {t('engine.local.download')}
            </Button>
          )}
        </div>
      )}

      {children}

      {confirm?.kind === 'force' && (
        <ConfirmModal
          title={t('engine.local.forceTitle')}
          body={t('engine.local.confirmForce', { msg: confirm.msg })}
          confirmLabel={t('engine.local.downloadAnyway')}
          onConfirm={() => { setConfirm(null); void download(true) }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmModal
          title={t('engine.local.deleteModel')}
          body={t('engine.local.confirmDelete')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => { setConfirm(null); void remove() }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

/** One engine option. Selection is an ink fill, not a border tint: a 2px accent
 *  border alone is a colour-only cue on the app's most consequential setting. */
function EngineCard({ icon, title, desc, onClick, ...aria }: {
  icon: React.ReactNode; title: string; desc: string; onClick: () => void
} & React.HTMLAttributes<HTMLButtonElement>) {
  const selected = aria['aria-checked'] === true
  return (
    <button
      type="button"
      onClick={onClick}
      {...aria}
      className="engine-card"
      data-selected={selected || undefined}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
        {icon} {title}
      </span>
      <span className="engine-card-desc">{desc}</span>
    </button>
  )
}
