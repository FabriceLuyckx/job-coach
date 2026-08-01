// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useRef, useState, useEffect, useCallback, useId } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { ChevronRight, Download, ExternalLink, ImageOff, RefreshCw, Sparkles } from 'lucide-react'
import {
  api, pollCVJob,
  type CVResult, type CVPlan, type CVMutation, type CVJobStage, type PlanEdit,
} from '../../api'
import BulletListEditor from '../BulletListEditor'
import Button from '../Button'
import Modal from '../Modal'
import { useToast } from '../Toast'
import { errMsg } from '../../lib/errors'
import { LANGUAGE_NAMES } from '../../i18n'

const langLabel = (code: string) => LANGUAGE_NAMES[code] ?? code

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/** Full editor panel for one generated CV: one board listing the CV's sections
 * in CV order — each row owning both "is this on the CV" and the editor for its
 * content — above the preview, plus the two AI actions (re-tailor / rebuild).
 * Language is owned by the parent Applications row. */
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
  const [stage, setStage] = useState<CVJobStage | undefined>()
  const [showRegen, setShowRegen] = useState(false)
  const [error, setError] = useState('')
  // Accordion: one row open at a time, summary open on load (the most-edited
  // field stays in reach without a click).
  const [openRow, setOpenRow] = useState<string | null>('summary')
  const uid = useId()
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
    hidden_skills: p.hidden_skills,
    excluded_skills: p.excluded_skills,
  })

  // A saved edit re-renders the preview — except one whose effect is already in
  // the preview's DOM (a section toggle), where the reload would only undo and
  // redo its own work and cost the reader their scroll position.
  const needsRender = useRef(false)
  const keepScroll = useRef(0)
  const reloadPreview = useCallback(() => {
    keepScroll.current = iframeRef.current?.contentWindow?.scrollY ?? 0
    setPreviewKey(k => k + 1)
  }, [])

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
      if (needsRender.current) { needsRender.current = false; reloadPreview() }
    } catch (e) {
      setSaveState('error'); setError(errMsg(e))
    } finally {
      inFlight.current = false
      if (queued.current) { queued.current = false; runSave() }
    }
  }, [result.history_id, onSummaryUpdate, reloadPreview])

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

  /** Mutate the plan and schedule an auto-save. `render` marks the edit as one
   * the preview can only show by re-rendering. */
  function editPlan(updater: (p: CVPlan) => CVPlan, render = true) {
    if (render) needsRender.current = true
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

  // ── Section list ──
  // The list is whatever this CV actually renders — read from the preview, so a
  // section only gets a row when there's data behind it, and a new template
  // section needs no change here. Union across reloads because the server omits
  // sections that are off the CV, whoever took them off: once seen, a key keeps
  // its row (and its place in the list) while off.
  const [sections, setSections] = useState<string[]>([])
  const readSections = useCallback(() => {
    const d = iframeRef.current?.contentDocument
    if (!d) return
    const found = [...d.querySelectorAll<HTMLElement>('[data-section]')]
      .map(el => el.dataset.section!)
    // Nothing yet (iframe still blank) — wait, so the list keeps CV order rather
    // than leading with whatever was off the CV.
    if (!found.length) return
    setSections(prev => [...new Set([
      ...prev, ...found,
      ...(latestPlan.current?.hidden_sections ?? []),
      ...(latestPlan.current?.excluded_sections ?? []),
    ])])
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
  // The unscaled width is measured once per load, where zoom is still 1;
  // re-measuring on resize meant writing zoom:1, reading, and writing again —
  // a forced synchronous layout on every ResizeObserver callback.
  const unscaledW = useRef(0)
  const applyScale = useCallback(() => {
    const el = iframeRef.current
    const body = el?.contentDocument?.body
    if (!el || !body || !unscaledW.current) return
    body.style.setProperty('zoom', String(Math.min(1, el.clientWidth / unscaledW.current)))
  }, [])
  const measureAndScale = useCallback(() => {
    const body = iframeRef.current?.contentDocument?.body
    if (!body) return
    unscaledW.current = body.scrollWidth
    applyScale()
  }, [applyScale])

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

  // One control per section: on the CV → off (the user's call, hidden_sections),
  // off → back on (clearing whichever list holds it, so putting back something
  // the AI dropped is the same single tick). The shape `setSkills` has one level
  // down. Never the profile.
  function setSection(key: string, show: boolean) {
    // Instant DOM update for responsiveness; the auto-save persists it.
    const els = iframeRef.current?.contentDocument
      ?.querySelectorAll<HTMLElement>(`[data-section="${key}"]`)
    els?.forEach(el => { el.style.display = show ? '' : 'none' })
    editPlan(p => ({
      ...p,
      hidden_sections: show ? p.hidden_sections.filter(k => k !== key)
        : [...new Set([...p.hidden_sections, key])],
      excluded_sections: show ? p.excluded_sections.filter(k => k !== key) : p.excluded_sections,
    // The render omits a section that was off, so putting one back that isn't in
    // the document needs a fresh one; everything else is a pure DOM change.
    }), show && !els?.length)
  }

  // ── Skills ──
  // One control per skill in its own group: on the CV → off (the user's call,
  // hidden_skills), off → back on (clearing whichever list holds it, so putting
  // back something the AI dropped is the same single tap). Never the profile.
  function setSkills(names: string[], show: boolean) {
    editPlan(p => show
      ? {
        ...p,
        hidden_skills: p.hidden_skills.filter(s => !names.includes(s)),
        excluded_skills: p.excluded_skills.filter(s => !names.includes(s)),
      }
      : { ...p, hidden_skills: [...new Set([...p.hidden_skills, ...names])] })
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

  const busyAI = regenerating
  const stageText = stage ? t(`cv.stage.${stage}`) : ''
  const hidden = new Set(plan?.hidden_sections ?? [])
  const excluded = new Set(plan?.excluded_sections ?? [])
  const shownCount = sections.filter(k => !hidden.has(k) && !excluded.has(k)).length

  const excludedSkills = new Set(plan?.excluded_skills ?? [])
  const hiddenSkills = new Set(plan?.hidden_skills ?? [])
  const onCV = (s: string) => !excludedSkills.has(s) && !hiddenSkills.has(s)
  const skillGroups = plan?.skill_groups ?? []
  const skillTotal = skillGroups.reduce((n, g) => n + g.items.length, 0)
  const skillShown = skillGroups.reduce((n, g) => n + g.items.filter(onCV).length, 0)
  const aiLeftOutCount = excludedSkills.size

  const saveLabel = saveState === 'saving' || saveState === 'pending' ? t('cveditor.saving')
    : saveState === 'saved' ? t('cveditor.saved')
      : saveState === 'error' ? t('cveditor.saveError') : ''
  const saveSettled = saveState === 'saved' || saveState === 'error'

  // ── One row per CV section ──
  // Accordion: with the board sitting against the top of the preview, two tall
  // rows open at once would push the preview off screen.
  const rowBody = (key: string) => {
    if (!plan) return null
    switch (key) {
      case 'summary': return (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 6 }}>
            <label className="editor-cluster-label" htmlFor={`${uid}-summary`} style={{ marginBottom: 0 }}>
              {t('cveditor.professionalSummary')}
            </label>
            <Button variant="secondary" onClick={generateSummary} busy={generating}
              style={{ padding: '4px 10px', minHeight: 24, fontSize: 'var(--fs-xs)' }} title={t('cveditor.aiSummaryTooltip')}>
              {!generating && <Sparkles size={11} style={{ marginRight: 4, verticalAlign: -1 }} aria-hidden />}
              {generating ? t('cveditor.generatingSummary') : t('cveditor.aiSummary')}
            </Button>
          </div>
          <textarea
            id={`${uid}-summary`}
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
          <p className="muted-sm" style={{ margin: 0 }}>
            <Trans i18nKey="cveditor.summaryHelp" components={{ b: <strong /> }} />
          </p>
        </>
      )
      case 'experience': return (
        <>
          {plan.roles.map(role => (
            <div key={role.id} style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
                  {role.title}{role.employer && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {role.employer}</span>}
                </div>
                <span className="cluster-count">{t('cveditor.bulletsCount', { count: role.bullets.length })}</span>
              </div>
              <BulletListEditor
                value={role.bullets}
                onChange={v => setRoleBullets(role.id, v)}
                placeholder={t('cveditor.bulletPlaceholder')}
                reorder format max={4}
              />
            </div>
          ))}
        </>
      )
      case 'skills': return (
        <>
          <p className="muted-sm" style={{ marginTop: 0, marginBottom: 'var(--space-2)', maxWidth: '70ch' }}>
            {t('cveditor.skillsHelp')}
          </p>
          {skillGroups.map(g => {
            const shown = g.items.filter(onCV)
            return (
              <div key={g.label} className={`skill-group${shown.length ? '' : ' masked'}`}>
                {/* The group name is itself the group's control: unticking it
                    takes the whole group off the CV in one action, and ticking
                    it back brings every skill in it back (including the AI's). */}
                <label className="skill-group-name" title={t('cveditor.skillsGroupTip')}>
                  <input
                    type="checkbox" checked={shown.length > 0}
                    onChange={e => setSkills(g.items, e.target.checked)}
                  />
                  {g.label}
                </label>
                <div className="skill-tags">
                  {g.items.map(s => {
                    const ai = excludedSkills.has(s)
                    const off = !onCV(s)
                    return (
                      <button
                        key={s} type="button" aria-pressed={!off}
                        className={`skill-toggle${off ? (ai ? ' ai-off' : ' off') : ''}`}
                        title={t(off ? (ai ? 'cveditor.restoreAiSkillTip' : 'cveditor.restoreSkillTip')
                          : 'cveditor.hideSkillTip')}
                        onClick={() => setSkills([s], off)}
                      >
                        {s}
                        {/* Strike vs. dash is the visual vocabulary; the same
                            distinction has to reach a screen reader too. */}
                        {off && <span className="sr-only">
                          {' — '}{t(ai ? 'cveditor.offByAi' : 'cveditor.offByYou')}
                        </span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </>
      )
      default: return null
    }
  }
  const hasBody = (key: string) =>
    key === 'summary'
    || (key === 'experience' && (plan?.roles.length ?? 0) > 0)
    || (key === 'skills' && skillTotal > 0)
  const rowMeta = (key: string) => {
    if (excluded.has(key)) return t('cveditor.offByAi')
    if (hidden.has(key)) return t('cveditor.offByYou')
    if (key === 'experience' && plan?.roles.length) return t('cveditor.rolesCount', { count: plan.roles.length })
    if (key === 'skills' && skillTotal) {
      return t('cveditor.skillsShownCount', { shown: skillShown, total: skillTotal })
        + (aiLeftOutCount > 0 ? ` · ${t('cveditor.skillsAiLeftOut', { count: aiLeftOutCount })}` : '')
    }
    return ''
  }

  return (
    <div style={{ padding: 'var(--space-4)' }}>
      {error && <p className="error-msg" role="alert" style={{ marginBottom: 'var(--space-3)' }}>{error}</p>}

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

      {/* Actions on the document as a whole — above the editing board, so the
          board stays in direct contact with the preview it edits. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
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
        {/* Plain link: the endpoint already replies Content-Disposition: attachment,
            and platform web views can't download blob: URLs, so no fetch/blob dance. */}
        <a className="btn-secondary" href={result.preview_url.replace('/preview/', '/pdf/')}>
          <Download size={14} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />
          {t('cveditor.downloadPdf')}
        </a>
        <Button variant="ghost" icon onClick={reloadPreview}
          title={t('cveditor.refreshPreviewTip')} aria-label={t('cveditor.refreshPreviewTip')}>
          <RefreshCw size={15} aria-hidden />
        </Button>
      </div>

      {/* Tailoring notes */}
      {result.tailoring_notes && (
        <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-dim)', border: '1px solid var(--line)', borderRadius: 'var(--r-panel)' }}>
          <div className="editor-cluster-label" style={{ marginBottom: 6 }}>{t('cveditor.tailoringNotes')}</div>
          <p style={{ fontSize: 'var(--fs-base)', lineHeight: 1.65, margin: 0 }}>{result.tailoring_notes}</p>
        </div>
      )}

      {/* Every line below this point was written by a model against the user's
          own profile, and it is about to go to an employer over their name. */}
      <div className="callout" style={{ marginBottom: 'var(--space-4)' }}>
        <Sparkles size={16} className="callout-icon" aria-hidden />
        <span>{t('cveditor.aiCaveat')}</span>
      </div>

      {/* Photo nudge — a one-time state hint, not a control, so it stays visible
          rather than hiding inside the Photo row below. */}
      {!hasPhoto && (
        <div className="callout callout-highlight" style={{ marginBottom: 'var(--space-4)' }}>
          <ImageOff size={16} className="callout-icon" aria-hidden />
          <span>
            <Trans i18nKey="cveditor.photoDisabled" components={{ b: <strong /> }} />
            <Link to="/settings">{t('cveditor.addPhotoLink')}</Link> {t('cveditor.addPhotoSuffix')}
          </span>
        </div>
      )}

      {/* The editing board: one row per section the CV can carry, in CV order,
          each owning both its on/off control and the editor for its content —
          sitting directly above the preview so an edit and its effect share a
          viewport. */}
      {plan ? (
        <div className="cv-board" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="cv-board-header">
            <h3>{t('cveditor.boardTitle')}</h3>
            {sections.length > 0 && (
              <span className="cluster-count">
                {t('cveditor.sectionsCount', { shown: shownCount, total: sections.length })}
              </span>
            )}
            {/* Announce the settled states only: the transient "Saving…" tick
                would otherwise fire once per debounce cycle mid-typing. */}
            <span className={`cv-board-save${saveState === 'error' ? ' failed' : ''}`} role="status">
              {saveSettled ? saveLabel : <span aria-hidden>{saveLabel}</span>}
            </span>
          </div>

          {sections.map(key => {
            const ai = excluded.has(key)
            const off = ai || hidden.has(key)
            const label = t(`cveditor.sections.${key}`, key)
            const body = hasBody(key)
            const open = body && openRow === key
            const meta = rowMeta(key)
            const name = <span className="cv-row-label">{label}</span>
            return (
              <div key={key} className={`cv-row${off ? ` off ${ai ? 'off-ai' : 'off-user'}` : ''}`}>
                <div className="cv-row-head">
                  <label className="cv-row-check">
                    <input
                      type="checkbox" checked={!off}
                      aria-label={t('cveditor.showOnCv', { section: label })}
                      onChange={e => setSection(key, e.target.checked)}
                    />
                  </label>
                  {body ? (
                    <h4 className="cv-row-heading">
                      <button
                        type="button" className="cv-row-name"
                        aria-expanded={open} aria-controls={`${uid}-${key}`}
                        onClick={() => setOpenRow(open ? null : key)}
                      >
                        <ChevronRight size={16} className={`collapsible-chevron${open ? ' open' : ''}`} aria-hidden />
                        {name}
                      </button>
                    </h4>
                  ) : (
                    // No body: the row is a control, not a region — no heading,
                    // no chevron, nothing to expand.
                    <span className="cv-row-static">{name}</span>
                  )}
                  {meta && <span className="cv-row-meta">{meta}</span>}
                </div>
                {open && <div className="cv-row-body" id={`${uid}-${key}`}>{rowBody(key)}</div>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="callout" style={{ marginBottom: 'var(--space-4)' }}>
          <span><Trans i18nKey="cveditor.editingUnavailable" components={{ b: <strong /> }} /></span>
        </div>
      )}

      {/* Preview iframe — full width, natural scroll */}
      <div style={{ position: 'relative', border: '1px solid var(--line)', borderRadius: 'var(--r-panel)', overflow: 'hidden' }}>
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
          onLoad={() => {
            readSections(); applyVisibility(); measureAndScale()
            // Restore the reader's place: a save re-renders the document, and
            // landing back at the top of the CV after every edit is disorienting
            // now that the preview sits right under the editor.
            if (keepScroll.current) {
              iframeRef.current?.contentWindow?.scrollTo(0, keepScroll.current)
              keepScroll.current = 0
            }
          }}
          style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }}
          title={t('cveditor.cvPreview')}
        />
        {busyAI && (
          <div role="status" style={{
            position: 'absolute', inset: 0, zIndex: 9,
            background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)',
            fontSize: 'var(--fs-base)', fontWeight: 500, textAlign: 'center', padding: 'var(--space-4)',
          }}>
            <span className="spinner" aria-hidden />
            {t('cveditor.regeneratingCv')}
            <span className="muted-sm" style={{ fontWeight: 400 }}>
              {stageText || t('cveditor.reRunningNote')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
