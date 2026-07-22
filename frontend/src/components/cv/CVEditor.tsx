// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useRef, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { Download, ExternalLink, ImageOff, RefreshCw, RotateCcw, Sparkles } from 'lucide-react'
import {
  api, pollCVJob,
  type CVResult, type CVPlan, type CVMutation, type CVJobStage, type PlanEdit,
} from '../../api'
import BulletListEditor from '../BulletListEditor'
import Button from '../Button'
import Collapsible from '../Collapsible'
import Modal from '../Modal'
import { useToast } from '../Toast'
import { errMsg } from '../../lib/errors'
import { LANGUAGE_NAMES } from '../../i18n'

const langLabel = (code: string) => LANGUAGE_NAMES[code] ?? code

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/** Full editor panel for one generated CV: full-width preview, auto-saved
 * content editor, section toggles, AI-decision chips, and the two AI actions
 * (re-tailor / rebuild). Language is owned by the parent Applications row. */
export default function CVEditor({ result: initialResult, hasPhoto, onSummaryUpdate }: {
  result: CVResult
  hasPhoto: boolean
  onSummaryUpdate?: (summary: string) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [result, setResult] = useState(initialResult)
  const [plan, setPlan] = useState<CVPlan | null>(null)
  const [previewKey, setPreviewKey] = useState(0)
  const [regenerating, setRegenerating] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [stage, setStage] = useState<CVJobStage | undefined>()
  const [showRegen, setShowRegen] = useState(false)
  const [error, setError] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const summaryRef = useRef<HTMLTextAreaElement>(null)

  // ── Auto-save (WS3), reusing the debounced single-flight pattern ──
  const latestPlan = useRef<CVPlan | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const queued = useRef(false)

  const planPayload = (p: CVPlan): PlanEdit => ({
    summary: p.summary,
    roles: p.roles.map(({ id, bullets }) => ({ id, bullets })),
    hidden_sections: p.hidden_sections,
    excluded_sections: p.excluded_sections,
  })

  const runSave = useCallback(async () => {
    if (inFlight.current) { queued.current = true; return }
    const cur = latestPlan.current
    if (!cur) return
    inFlight.current = true
    setSaveState('saving')
    try {
      await api.putCVPlan(result.history_id, planPayload(cur))
      setSaveState('saved'); setError('')
      setResult(prev => ({ ...prev, summary: cur.summary }))
      onSummaryUpdate?.(cur.summary)
      setPreviewKey(k => k + 1)
    } catch (e) {
      setSaveState('error'); setError(errMsg(e))
    } finally {
      inFlight.current = false
      if (queued.current) { queued.current = false; runSave() }
    }
  }, [result.history_id, onSummaryUpdate])

  const scheduleSave = useCallback(() => {
    setSaveState(s => (s === 'saving' ? s : 'pending'))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(runSave, 1500)
  }, [runSave])

  // Flush a pending save when the panel unmounts so edits aren't lost.
  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      const cur = latestPlan.current
      if (cur) api.putCVPlan(result.history_id, planPayload(cur)).catch(() => {})
    }
  }, [result.history_id])

  /** Mutate the plan and schedule an auto-save. */
  function editPlan(updater: (p: CVPlan) => CVPlan) {
    setPlan(prev => {
      if (!prev) return prev
      const next = updater(prev)
      latestPlan.current = next
      return next
    })
    scheduleSave()
  }

  // Load the editable plan for the current language, without scheduling a save.
  function loadPlan() {
    api.getCVPlan(result.history_id)
      .then(p => { setPlan(p); latestPlan.current = p; setSaveState('idle'); readSections() })
      .catch(() => { setPlan(null); latestPlan.current = null })
  }
  useEffect(() => { loadPlan() }, [result.history_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Section toggles ──
  // The togglable list is whatever this CV actually renders — read from the
  // preview, so a section only gets a checkbox when there's data behind it, and
  // a new template section needs no change here. Union across reloads because
  // the server omits hidden sections: once seen, a key keeps its checkbox (and
  // its place in the row) even while hidden.
  const [sections, setSections] = useState<string[]>([])
  const readSections = useCallback(() => {
    const d = iframeRef.current?.contentDocument
    if (!d) return
    const found = [...d.querySelectorAll<HTMLElement>('[data-section]')]
      .map(el => el.dataset.section!)
    // Nothing yet (iframe still blank) — wait, so the row keeps CV order rather
    // than leading with whatever was hidden.
    if (!found.length) return
    setSections(prev => [...new Set([...prev, ...found, ...(latestPlan.current?.hidden_sections ?? [])])])
  }, [])

  const applyVisibility = useCallback(() => {
    const d = iframeRef.current?.contentDocument
    if (!d) return
    const hidden = new Set(plan?.hidden_sections ?? [])
    d.querySelectorAll<HTMLElement>('[data-section]').forEach(el => {
      el.style.display = hidden.has(el.dataset.section!) ? 'none' : ''
    })
  }, [plan])

  // Re-apply when toggles change without a reload.
  useEffect(() => { applyVisibility() }, [applyVisibility])

  // The CV is a fixed-width A4 sheet (210mm ≈ 794px). In a narrower panel it
  // overflows and the iframe scrolls horizontally — scale it down to fit with
  // native zoom (template-agnostic: measured from the doc's own scrollWidth).
  const applyScale = useCallback(() => {
    const el = iframeRef.current
    const body = el?.contentDocument?.body
    if (!el || !body) return
    body.style.setProperty('zoom', '1')
    body.style.setProperty('zoom', String(Math.min(1, el.clientWidth / body.scrollWidth)))
  }, [])

  useEffect(() => {
    const el = iframeRef.current
    if (!el) return
    const ro = new ResizeObserver(applyScale)
    ro.observe(el)
    return () => ro.disconnect()
  }, [applyScale, previewKey])

  // ── Content editing ──
  function setSummary(text: string) { editPlan(p => ({ ...p, summary: text })) }
  function setRoleBullets(id: string, bullets: string[]) {
    editPlan(p => ({ ...p, roles: p.roles.map(r => r.id === id ? { ...r, bullets } : r) }))
  }

  function wrapSummary(marker: string) {
    const el = summaryRef.current
    if (!el || !plan) return
    const s = el.selectionStart, e = el.selectionEnd
    const v = plan.summary
    setSummary(v.slice(0, s) + marker + v.slice(s, e) + marker + v.slice(e))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + marker.length, e + marker.length) })
  }

  function toggleSection(key: string, show: boolean) {
    // Instant DOM hide for responsiveness; the auto-save persists it.
    iframeRef.current?.contentDocument
      ?.querySelectorAll<HTMLElement>(`[data-section="${key}"]`)
      .forEach(el => { el.style.display = show ? '' : 'none' })
    editPlan(p => ({
      ...p,
      hidden_sections: show ? p.hidden_sections.filter(k => k !== key)
        : [...new Set([...p.hidden_sections, key])],
    }))
  }

  function restoreSection(key: string) {
    editPlan(p => ({ ...p, excluded_sections: p.excluded_sections.filter(k => k !== key) }))
  }

  // ── AI actions (async, polled) ──
  async function regenerate(keepEdits: boolean) {
    setShowRegen(false); setError(''); setRegenerating(true); setStage(undefined)
    try {
      const { job_id } = await api.regenerateCV(result.history_id, keepEdits)
      const r = await pollCVJob<CVMutation>(job_id, setStage)
      setResult(prev => ({
        ...prev, slug: r.slug, preview_url: r.preview_url,
        summary: r.summary, tailoring_notes: r.tailoring_notes, has_plan: true,
      }))
      onSummaryUpdate?.(r.summary)
      loadPlan(); setPreviewKey(k => k + 1)
      toast.info(r.tailoring_notes || t('cveditor.regenDone'))  // WS5: what changed
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setRegenerating(false); setStage(undefined)
    }
  }

  async function generateSummary() {
    setError(''); setGenerating(true)
    try {
      const { job_id } = await api.generateCVSummary(result.history_id)
      const r = await pollCVJob<{ summary: string }>(job_id)
      setPlan(prev => {
        const next = prev && { ...prev, summary: r.summary }
        latestPlan.current = next
        return next
      })
      setResult(prev => ({ ...prev, summary: r.summary }))
      onSummaryUpdate?.(r.summary)
      setPreviewKey(k => k + 1)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setGenerating(false)
    }
  }

  async function downloadPDF() {
    // preview_url is /api/cv/preview/<slug>/<lang>; the PDF route mirrors it.
    setDownloading(true)
    try {
      const res = await fetch(result.preview_url.replace('/preview/', '/pdf/'))
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cv_${result.slug}_${result.lang}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(t('cveditor.pdfError', { error: errMsg(e) }))
    } finally {
      setDownloading(false)
    }
  }

  const busyAI = regenerating
  const stageText = stage ? t(`cv.stage.${stage}`) : ''
  const hidden = new Set(plan?.hidden_sections ?? [])
  const shownCount = sections.filter(k => !hidden.has(k)).length

  const saveLabel = saveState === 'saving' || saveState === 'pending' ? t('cveditor.saving')
    : saveState === 'saved' ? t('cveditor.saved')
      : saveState === 'error' ? t('cveditor.saveError') : ''

  return (
    <div style={{ padding: 'var(--space-4)' }}>
      {error && <p className="error-msg" style={{ marginBottom: 'var(--space-3)' }}>{error}</p>}

      {showRegen && (
        <Modal title={t('cveditor.retailorTitle')} onClose={() => setShowRegen(false)}>
          <p style={{ lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
            <Trans i18nKey="cveditor.retailorPrompt" values={{ lang: langLabel(result.lang) }} components={{ b: <strong /> }} />
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Button variant="primary" onClick={() => regenerate(true)}>{t('cveditor.keepEdits')}</Button>
            <Button variant="secondary" onClick={() => regenerate(false)}>{t('cveditor.regenAll')}</Button>
            <Button variant="ghost" onClick={() => setShowRegen(false)} style={{ alignSelf: 'flex-start', marginTop: 'var(--space-1)' }}>
              {t('common.cancel')}
            </Button>
          </div>
        </Modal>
      )}

      {/* Job info strip */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--fs-lg)' }}>{result.job_title}</span>
        <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-base)' }}>{result.employer}</span>
        {/* Only web URLs are worth linking — the generic application's sentinel
            job_url (generic:profile) would render as a dead link. */}
        {result.job_url.startsWith('http') && (
          <a href={result.job_url} target="_blank" rel="noreferrer" style={{ fontSize: 'var(--fs-sm)' }}>
            {t('cveditor.viewListing')} <ExternalLink size={11} aria-hidden />
          </a>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          {langLabel(result.lang)}
        </span>
      </div>

      {/* Tailoring notes — full width above preview */}
      {result.tailoring_notes && (
        <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-dim)', border: '1px solid var(--line)', borderRadius: 'var(--r-panel)' }}>
          <div className="editor-cluster-label" style={{ marginBottom: 6 }}>{t('cveditor.tailoringNotes')}</div>
          <p style={{ fontSize: 'var(--fs-base)', lineHeight: 1.65, margin: 0 }}>{result.tailoring_notes}</p>
        </div>
      )}

      {/* Preview iframe — full width, natural scroll */}
      <div style={{ position: 'relative', border: '1px solid var(--line)', borderRadius: 'var(--r-panel)', overflow: 'hidden', marginBottom: 'var(--space-4)' }}>
        <a
          href={result.preview_url} target="_blank" rel="noreferrer"
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 10,
            background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-btn)',
            padding: '5px 12px', fontSize: 'var(--fs-sm)', fontWeight: 500, textDecoration: 'none',
          }}
        >
          {t('cveditor.openNewTab')} <ExternalLink size={11} aria-hidden />
        </a>
        <iframe
          key={previewKey}
          ref={iframeRef}
          src={result.preview_url}
          onLoad={() => { readSections(); applyVisibility(); applyScale() }}
          style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }}
          title={t('cveditor.cvPreview')}
        />
        {busyAI && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 9,
            background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)',
            fontSize: 'var(--fs-base)', fontWeight: 500, textAlign: 'center', padding: 'var(--space-4)',
          }}>
            <span className="spinner" />
            {t('cveditor.regeneratingCv')}
            <span className="muted-sm" style={{ fontWeight: 400 }}>
              {stageText || t('cveditor.reRunningNote')}
            </span>
          </div>
        )}
      </div>

      {/* Primary actions */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        {result.has_plan ? (
          <Button variant="primary" onClick={() => setShowRegen(true)} busy={busyAI} disabled={!result.job_url}
            title={result.job_url ? undefined : t('cveditor.aiNeedsUrl')}>
            {!busyAI && <Sparkles size={14} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />}
            {t('cveditor.updateWithAi')}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => regenerate(false)} busy={regenerating} disabled={!result.job_url}
            title={result.job_url ? undefined : t('cveditor.aiNeedsUrl')}>
            {!regenerating && <Sparkles size={14} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />}
            {t('cveditor.rebuildFromUrl')}
          </Button>
        )}
        <Button variant="secondary" onClick={downloadPDF} busy={downloading}>
          {!downloading && <Download size={14} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />}
          {downloading ? t('cveditor.preparingPdf') : t('cveditor.downloadPdf')}
        </Button>
        <Button variant="ghost" icon onClick={() => { setPreviewKey(k => k + 1) }}
          title={t('cveditor.refreshPreviewTip')} aria-label={t('cveditor.refreshPreviewTip')}>
          <RefreshCw size={15} aria-hidden />
        </Button>
      </div>

      {/* Every line below this point was written by a model against the user's
          own profile, and it is about to go to an employer over their name. */}
      <div className="callout" style={{ marginBottom: 'var(--space-4)' }}>
        <Sparkles size={16} className="callout-icon" aria-hidden />
        <span>{t('cveditor.aiCaveat')}</span>
      </div>

      {/* Photo nudge — a one-time state hint (not a control), so it stays
          visible rather than hiding behind the section disclosure below. */}
      {!hasPhoto && (
        <div className="callout callout-highlight" style={{ marginBottom: 'var(--space-4)' }}>
          <ImageOff size={16} className="callout-icon" aria-hidden />
          <span>
            <Trans i18nKey="cveditor.photoDisabled" components={{ b: <strong /> }} />
            <Link to="/settings">{t('cveditor.addPhotoLink')}</Link> {t('cveditor.addPhotoSuffix')}
          </span>
        </div>
      )}

      {/* Section controls behind one disclosure — header names the payoff with a
          live count, so the CV tab opens on preview + actions + editor, not a wall. */}
      {plan && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Collapsible flat title={
            <span className="editor-cluster-label">
              {t('cveditor.sectionsTitle')}
              {sections.length > 0 && ` — ${t('cveditor.sectionsShownCount', { shown: shownCount, total: sections.length })}`}
            </span>
          }>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {sections.map(key => (
                <label key={key} className="chip-check">
                  <input
                    type="checkbox" checked={!hidden.has(key)}
                    onChange={e => toggleSection(key, e.target.checked)}
                  />
                  {t(`cveditor.sections.${key}`, key)}
                </label>
              ))}
            </div>

            {plan.excluded_sections.length > 0 && (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <span className="muted-sm">{t('cveditor.aiLeftOut')}: </span>
                {plan.excluded_sections.map(key => (
                  <button key={key} type="button" className="chip-restore" onClick={() => restoreSection(key)}
                    title={t('cveditor.restoreTip')}>
                    {t(`cveditor.sections.${key}`, key)} <RotateCcw size={11} aria-hidden />
                  </button>
                ))}
              </div>
            )}

          </Collapsible>
        </div>
      )}

      {/* AI-generated content editor */}
      {plan ? (
        <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-panel)', padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700 }}>{t('cveditor.editContent')}</div>
            {saveLabel && (
              <span style={{ fontSize: 'var(--fs-xs)', color: saveState === 'error' ? 'var(--danger)' : 'var(--muted)' }}>
                {saveLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', marginBottom: 'var(--space-4)' }}>
            <Trans i18nKey="cveditor.editHelp" components={{ b: <strong /> }} />
          </div>

          {/* Professional summary */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div className="editor-cluster-label">{t('cveditor.professionalSummary')}</div>
              <Button variant="secondary" onClick={generateSummary} busy={generating}
                style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)' }} title={t('cveditor.aiSummaryTooltip')}>
                {!generating && <Sparkles size={11} style={{ marginRight: 4, verticalAlign: -1 }} aria-hidden />}
                {generating ? t('cveditor.generatingSummary') : t('cveditor.aiSummary')}
              </Button>
            </div>
            <textarea
              ref={summaryRef}
              value={plan.summary}
              onChange={e => setSummary(e.target.value)}
              onKeyDown={e => {
                if (!(e.metaKey || e.ctrlKey)) return
                if (e.key === 'b' || e.key === 'B') { e.preventDefault(); wrapSummary('**') }
                else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); wrapSummary('*') }
              }}
              rows={5}
              style={{ width: '100%' }}
            />
          </div>

          {/* Per-role bullets (max 4 each), in CV order */}
          {plan.roles.map(role => (
            <div key={role.id} style={{ marginBottom: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
                  {role.title}{role.employer && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {role.employer}</span>}
                </div>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
                  {t('cveditor.bulletsCount', { count: role.bullets.length })}
                </span>
              </div>
              <BulletListEditor
                value={role.bullets}
                onChange={v => setRoleBullets(role.id, v)}
                placeholder={t('cveditor.bulletPlaceholder')}
                reorder format max={4}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="callout">
          <span><Trans i18nKey="cveditor.editingUnavailable" components={{ b: <strong /> }} /></span>
        </div>
      )}
    </div>
  )
}
