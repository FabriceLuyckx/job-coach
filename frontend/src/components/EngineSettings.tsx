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
import { useKeyStatus } from './KeyStatus'
import { usePoller } from '../lib/usePoller'
import { errMsg } from '../lib/errors'
import { radioGroup } from '../lib/radiogroup'

export const fmtGb = (b: number | null | undefined) => (b == null ? '—' : `${(b / 1e9).toFixed(1)} GB`)

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
  const { refresh: refreshKeyStatus } = useKeyStatus()
  const [models, setModels] = useState<LocalModel[]>([])
  const [listErr, setListErr] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [urlErr, setUrlErr] = useState('')
  const [dl, setDl] = useState<DownloadStatus>({ state: 'idle' })
  const poller = usePoller(1000)
  const busy = dl.state === 'downloading' || dl.state === 'resuming' || dl.state === 'pending'
  const startedRef = useRef(false)
  // What the last download attempt asked for, so the RAM override retries the
  // same model (or URL) rather than falling back to the selection.
  const lastReq = useRef<{ model_id?: string; url?: string }>({})
  const [confirm, setConfirm] = useState<null | { kind: 'force'; msg: string } | { kind: 'delete' }>(null)
  const titleId = useId()
  const modelsId = useId()
  const urlId = useId()

  function refreshModel() {
    // Every path that can change engine readiness — activate, download, delete —
    // ends here, so this is the one place the app-wide banner has to be told.
    refreshKeyStatus()
    api.listLocalModels()
      .then(ms => {
        setModels(ms)
        setListErr('')
        // Follow the active model until the user picks something else.
        setSelected(s => (s && ms.some(m => m.id === s) ? s : ms.find(m => m.active)?.id ?? ms[0]?.id ?? null))
      })
      .catch(e => setListErr(errMsg(e)))
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
        // A finished download becomes the active model — switching earlier would
        // report "not ready" for the whole download while a working model sits
        // on disk.
        if (s.model_id) { try { await api.putSettings({ local_model_id: s.model_id }) } catch { /* keeps the old one */ } }
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

  async function download(force = false, opts: { model_id?: string; url?: string } = {}) {
    const req = opts.url ? { url: opts.url } : { model_id: opts.model_id ?? selected ?? undefined }
    try {
      startedRef.current = true
      lastReq.current = opts
      await api.startModelDownload({ ...req, force })
      setDl({ state: 'pending' })
      if (opts.url) setUrl('')
      watch()
    } catch (e) {
      startedRef.current = false
      const msg = errMsg(e)
      // The RAM pre-check is overridable — offer to proceed.
      if (/RAM/i.test(msg)) { setConfirm({ kind: 'force', msg }); return }
      // A rejected URL is a problem with the field, so it belongs at the field.
      if (opts.url) { setUrlErr(msg); return }
      toast.error(msg)
    }
  }

  /** Make the selected model the one the app runs on. Deliberately an explicit
   *  action rather than a side effect of selecting: selection also moves with
   *  the arrow keys, which would otherwise re-point the engine at every model
   *  the user passes over. */
  async function activate() {
    if (!sel) return
    try {
      await api.putSettings({ local_model_id: sel.id })
      refreshModel()
      toast.success(t('engine.local.nowUsing', { model: nameOf(sel) }))
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function addCustom() {
    setUrlErr('')
    if (!url.trim()) return
    await download(false, { url: url.trim() })
  }

  async function remove() {
    if (!sel) return
    const name = nameOf(sel)  // the row is gone from `models` by the time we report
    try {
      await api.deleteLocalModel(sel.id)
      setDl({ state: 'idle' })
      refreshModel()
      toast.success(t('engine.local.deleted', { model: name }))
    } catch (e) { toast.error(errMsg(e)) }
  }

  const pct = dl.bytes_total ? Math.min(100, Math.round((dl.bytes_done ?? 0) / dl.bytes_total * 100)) : 0
  const providers: EngineProvider[] = ['local', 'openrouter']
  const radio = radioGroup(providers, provider, onProviderChange)
  const sel = models.find(m => m.id === selected) ?? null
  const modelRadio = radioGroup(models.map(m => m.id), selected, id => { if (id) setSelected(id) })
  // A custom model's label is the filename the user supplied — untranslatable.
  const nameOf = (m: LocalModel) =>
    m.custom ? m.label : t(`engine.models.${m.id}.name`, { defaultValue: m.label })
  const selLabel = sel ? nameOf(sel) : ''
  const downloading = models.find(m => m.id === dl.model_id)
  const downloadingLabel = downloading ? nameOf(downloading) : selLabel

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
          <h3 className="section-title" id={modelsId} style={{ margin: '0 0 var(--space-2)' }}>
            {t('engine.local.pickModel')}
          </h3>

          {listErr ? (
            <div>
              <p className="error-msg" style={{ marginTop: 0 }}>{t('engine.local.listFailed', { error: listErr })}</p>
              <Button variant="ghost" onClick={refreshModel}>{t('common.retry')}</Button>
            </div>
          ) : (
            <>
              <div {...modelRadio.group} aria-labelledby={modelsId} className="model-list"
                   style={{ marginBottom: 'var(--space-3)' }}>
                {models.map((m, i) => (
                  <ModelRow
                    key={m.id}
                    {...modelRadio.item(i)}
                    model={m}
                    name={nameOf(m)}
                    onClick={() => setSelected(m.id)}
                  />
                ))}
              </div>

              {busy ? (
                <div>
                  <div
                    role="progressbar"
                    aria-label={t('engine.local.progressLabelFor', { model: downloadingLabel })}
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
              ) : sel ? (
                /* One action row for the selected model. Its state decides what
                   is offered, so there is never a button whose effect the reader
                   has to work out from the row above. */
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {!sel.downloaded && (
                    <Button onClick={() => void download()}>
                      <Download size={15} aria-hidden /> {t('engine.local.download')}
                    </Button>
                  )}
                  {sel.downloaded && !sel.active && (
                    <Button onClick={() => void activate()}>{t('engine.local.useModel')}</Button>
                  )}
                  {sel.downloaded && (
                    <Button variant="ghost" className="btn-icon-danger" onClick={() => setConfirm({ kind: 'delete' })}>
                      <Trash2 size={15} aria-hidden /> {t('engine.local.deleteModel')}
                    </Button>
                  )}
                </div>
              ) : null}

              <div className="field" style={{ marginTop: 'var(--space-4)', marginBottom: 0 }}>
                <label htmlFor={urlId}>{t('engine.local.customLabel')}</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <input
                    id={urlId}
                    type="url"
                    spellCheck={false}
                    value={url}
                    onChange={e => { setUrl(e.target.value); setUrlErr('') }}
                    placeholder={t('engine.local.customPlaceholder')}
                    style={{ flex: 1, minWidth: 240 }}
                  />
                  <Button variant="ghost" onClick={() => void addCustom()} disabled={busy || !url.trim()}>
                    {t('engine.local.customAdd')}
                  </Button>
                </div>
                {urlErr && <p className="error-msg">{urlErr}</p>}
                <p className="help-text">
                  {t('engine.local.customHelp')}{' '}
                  <a href="https://huggingface.co/models?library=gguf&sort=trending" target="_blank" rel="noreferrer">
                    {t('engine.local.customBrowse')}
                  </a>
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {children}

      {confirm?.kind === 'force' && (
        <ConfirmModal
          title={t('engine.local.forceTitle')}
          body={t('engine.local.confirmForce', { msg: confirm.msg })}
          confirmLabel={t('engine.local.downloadAnyway')}
          onConfirm={() => { setConfirm(null); void download(true, lastReq.current) }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmModal
          title={t('engine.local.deleteModel')}
          body={t('engine.local.confirmDelete', { model: selLabel, size: fmtGb(sel?.size_bytes) })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => { setConfirm(null); void remove() }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

/** One local model, as a row in a ruled list. Selecting a row is only selecting
 *  it — "in use" is a separate state with its own column, because a highlighted
 *  row that might or might not be the running engine is exactly the ambiguity
 *  this list has to remove. Shared with onboarding. */
export function ModelRow({ model, name, onClick, ...aria }: {
  model: LocalModel; name: string; onClick: () => void
} & React.HTMLAttributes<HTMLButtonElement>) {
  const { t } = useTranslation()
  const selected = aria['aria-checked'] === true
  const desc = model.custom ? t('engine.local.customDesc')
                            : t(`engine.models.${model.id}.desc`, { defaultValue: '' })
  return (
    <button type="button" onClick={onClick} {...aria} className="model-row" data-selected={selected || undefined}>
      <span className="model-row-main">
        <span style={{ display: 'block', fontWeight: 700 }}>{name}</span>
        {desc && <span className="model-row-desc">{desc}</span>}
        <span className="model-row-desc" style={{ marginTop: 2 }}>
          {t('engine.local.sizeRam', { size: fmtGb(model.size_bytes), ram: model.min_ram_gb })}
        </span>
      </span>
      {/* "In use" is claimed only by a model that is both pointed at AND on disk:
          config can name a model that was never downloaded, and calling that one
          in use would report a working engine where there is none. */}
      {model.downloaded && (
        /* Teal, not vermilion: this is a good state, not the one thing to act
           on. Inherits the row's paper ink when selected, where teal on ink
           would fail contrast. */
        <span className="model-row-state" style={{
          color: selected ? 'inherit' : model.active ? 'var(--success)' : 'var(--muted)',
        }}>
          {model.active && <CheckCircle2 size={15} aria-hidden />}
          {t(model.active ? 'engine.local.inUse' : 'engine.local.onDisk')}
        </span>
      )}
    </button>
  )
}

/** One engine option. Selection is an ink fill, not a border tint: a 2px accent
 *  border alone is a colour-only cue on the app's most consequential setting.
 *  Exported so onboarding presents the same choice in the same vocabulary. */
export function EngineCard({ icon, title, desc, onClick, ...aria }: {
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
