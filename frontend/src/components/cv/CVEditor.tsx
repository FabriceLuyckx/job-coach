import { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { Download, ExternalLink, ImageOff, RefreshCw, Sparkles } from 'lucide-react'
import { api, type CVResult, type CVPlan, type CVPlanRole } from '../../api'
import BulletListEditor from '../BulletListEditor'
import Button from '../Button'
import SaveButton from '../SaveButton'
import Modal from '../Modal'
import { errMsg } from '../../lib/errors'
import { LANGUAGE_NAMES } from '../../i18n'

const SECTIONS = [
  'summary', 'experience', 'publications', 'links', 'skills',
  'languages', 'education', 'grants', 'photo',
] as const

const langLabel = (code: string) => LANGUAGE_NAMES[code] ?? code

type SectionKey = (typeof SECTIONS)[number]

const ALL_VISIBLE = Object.fromEntries(SECTIONS.map(k => [k, true])) as Record<SectionKey, boolean>

/** Full editor panel for one generated CV: preview, update actions, language
 * switch, section toggles, and the editable AI content. */
export default function CVEditor({ result: initialResult, hasPhoto, onSummaryUpdate, onLangUpdate }: {
  result: CVResult
  hasPhoto: boolean
  onSummaryUpdate?: (summary: string) => void
  onLangUpdate?: (lang: string) => void
}) {
  const { t } = useTranslation()
  const [result, setResult] = useState(initialResult)
  const [plan, setPlan] = useState<CVPlan | null>(null)
  const [planDirty, setPlanDirty] = useState(false)
  const [visible, setVisible] = useState<Record<SectionKey, boolean>>(ALL_VISIBLE)
  const [previewKey, setPreviewKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [relanging, setRelanging] = useState(false)
  const [pendingLang, setPendingLang] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  // The one Update-CV entry point: 'menu' lists the three update kinds,
  // 'regen' asks keep-edits vs start-fresh for the AI re-run.
  const [updateModal, setUpdateModal] = useState<'closed' | 'menu' | 'regen'>('closed')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const summaryRef = useRef<HTMLTextAreaElement>(null)

  function wrapSummary(marker: string) {
    const el = summaryRef.current
    if (!el || !plan) return
    const s = el.selectionStart, e = el.selectionEnd
    const v = plan.summary
    setSummary(v.slice(0, s) + marker + v.slice(s, e) + marker + v.slice(e))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + marker.length, e + marker.length) })
  }

  // Load the editable AI content (summary + per-role bullets) for the current language.
  function loadPlan() {
    api.getCVPlan(result.history_id)
      .then(p => { setPlan(p); setPlanDirty(false) })
      .catch(() => setPlan(null))  // plan-less legacy entry → editor shows a hint
  }

  useEffect(() => { loadPlan() }, [result.history_id]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyVisibility() {
    const d = iframeRef.current?.contentDocument
    if (!d) return
    SECTIONS.forEach(key => {
      d.querySelectorAll<HTMLElement>(`[data-section="${key}"]`).forEach(el => {
        el.style.display = visible[key] ? '' : 'none'
      })
    })
  }

  // ── Plan editing ──
  function setSummary(text: string) {
    setPlan(prev => prev && { ...prev, summary: text })
    setPlanDirty(true)
  }

  function setRole(id: string, patch: Partial<CVPlanRole>) {
    setPlan(prev => prev && { ...prev, roles: prev.roles.map(r => r.id === id ? { ...r, ...patch } : r) })
    setPlanDirty(true)
  }

  function planPayload(p: CVPlan) {
    return { summary: p.summary, roles: p.roles.map(({ id, bullets }) => ({ id, bullets })) }
  }

  // Throws on failure so the SaveButton surfaces the error.
  async function saveEdits() {
    if (!plan) return
    await api.putCVPlan(result.history_id, planPayload(plan))
    setPlanDirty(false)
    setResult(prev => ({ ...prev, summary: plan.summary }))
    onSummaryUpdate?.(plan.summary)
    setPreviewKey(k => k + 1)
  }

  async function refreshPreview() {
    setUpdateModal('closed')
    setError('')
    setRefreshing(true)
    try {
      if (planDirty && plan) {
        await api.putCVPlan(result.history_id, planPayload(plan))
        setPlanDirty(false)
        onSummaryUpdate?.(plan.summary)
      } else if (result.has_plan) {
        // Re-render from the stored plan so profile/design edits (e.g. accent
        // colour) are baked in — cheap, no AI call.
        await api.rerenderCV(result.history_id)
      }
      setPreviewKey(k => k + 1)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setRefreshing(false)
    }
  }

  async function updateFromProfile() {
    setUpdateModal('closed')
    setError('')
    setUpdating(true)
    try {
      await api.rerenderCV(result.history_id)
      if (!result.has_plan) setResult(prev => ({ ...prev, has_plan: true }))  // re-tailor stored a plan
      loadPlan()
      setPreviewKey(k => k + 1)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setUpdating(false)
    }
  }

  async function changeLang(newLang: string) {
    if (newLang === result.lang || relanging) return
    setError('')
    setRelanging(true)
    setPendingLang(newLang)  // reflect the choice in the dropdown immediately
    try {
      const r = await api.relangCV(result.history_id, newLang)
      setResult(prev => ({
        ...prev, lang: r.lang, slug: r.slug, preview_url: r.preview_url,
        summary: r.summary, tailoring_notes: r.tailoring_notes, has_plan: true,
      }))
      onLangUpdate?.(r.lang)
      onSummaryUpdate?.(r.summary)
      loadPlan()
      setPreviewKey(k => k + 1)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setRelanging(false)
      setPendingLang(null)
    }
  }

  async function regenerate(keepEdits: boolean) {
    setUpdateModal('closed')
    setError('')
    setRegenerating(true)
    try {
      const r = await api.regenerateCV(result.history_id, keepEdits)
      setResult(prev => ({
        ...prev, slug: r.slug, preview_url: r.preview_url,
        summary: r.summary, tailoring_notes: r.tailoring_notes, has_plan: true,
      }))
      onSummaryUpdate?.(r.summary)
      loadPlan()
      setPreviewKey(k => k + 1)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setRegenerating(false)
    }
  }

  async function generateSummary() {
    setError('')
    setGenerating(true)
    try {
      const r = await api.generateCVSummary(result.history_id)
      setPlan(prev => prev && { ...prev, summary: r.summary })
      setResult(prev => ({ ...prev, summary: r.summary }))
      onSummaryUpdate?.(r.summary)
      setPreviewKey(k => k + 1)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setGenerating(false)
    }
  }

  function downloadPDF() {
    // preview_url is /api/cv/preview/<slug>/<lang>; the PDF route mirrors it.
    window.open(result.preview_url.replace('/preview/', '/pdf/'), '_blank')
  }

  function toggleSection(key: SectionKey, show: boolean) {
    setVisible(prev => ({ ...prev, [key]: show }))
    iframeRef.current?.contentDocument
      ?.querySelectorAll<HTMLElement>(`[data-section="${key}"]`)
      .forEach(el => { el.style.display = show ? '' : 'none' })
  }

  const busyUpdating = refreshing || updating || regenerating

  return (
    <div style={{ padding: 'var(--space-4)' }}>
      {error && <p className="error-msg" style={{ marginBottom: 'var(--space-3)' }}>{error}</p>}

      {updateModal === 'menu' && (
        <Modal title={t('cveditor.updateTitle')} onClose={() => setUpdateModal('closed')}>
          <button type="button" className="modal-option" onClick={refreshPreview}>
            <span className="modal-option-title">
              <RefreshCw size={15} aria-hidden />
              {planDirty ? t('cveditor.saveEditsRefresh') : t('cveditor.refreshPreview')}
            </span>
            <span className="modal-option-desc">{t('cveditor.refreshDesc')}</span>
          </button>
          <button
            type="button"
            className="modal-option"
            onClick={updateFromProfile}
            disabled={!result.has_plan && !result.job_url}
          >
            <span className="modal-option-title">
              <RefreshCw size={15} aria-hidden />
              {t('cveditor.pullProfile')}
            </span>
            <span className="modal-option-desc">
              {result.has_plan ? t('cveditor.pullProfileHasPlan') : t('cveditor.pullProfileNoPlan')}
            </span>
          </button>
          <button
            type="button"
            className="modal-option"
            onClick={() => setUpdateModal('regen')}
            disabled={!result.job_url}
          >
            <span className="modal-option-title">
              <Sparkles size={15} aria-hidden />
              {t('cveditor.askRetailor')}
            </span>
            <span className="modal-option-desc">
              {result.job_url ? t('cveditor.retailorHasUrl') : t('cveditor.retailorNoUrl')}
            </span>
          </button>
          <Button variant="ghost" onClick={() => setUpdateModal('closed')} style={{ marginTop: 'var(--space-1)' }}>
            {t('common.cancel')}
          </Button>
        </Modal>
      )}

      {updateModal === 'regen' && (
        <Modal title={t('cveditor.retailorTitle')} onClose={() => setUpdateModal('closed')}>
          <p style={{ lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
            <Trans i18nKey="cveditor.retailorPrompt" values={{ lang: langLabel(result.lang) }} components={{ b: <strong /> }} />
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Button variant="primary" onClick={() => regenerate(true)}>
              {t('cveditor.keepEdits')}
            </Button>
            <Button variant="secondary" onClick={() => regenerate(false)}>
              {t('cveditor.regenAll')}
            </Button>
            <Button variant="ghost" onClick={() => setUpdateModal('closed')} style={{ alignSelf: 'flex-start', marginTop: 'var(--space-1)' }}>
              {t('common.cancel')}
            </Button>
          </div>
        </Modal>
      )}

      {/* Job info strip */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--fs-lg)' }}>{result.job_title}</span>
        <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-md)' }}>{result.employer}</span>
        {result.job_url && (
          <a href={result.job_url} target="_blank" rel="noreferrer" style={{ fontSize: 'var(--fs-sm)' }}>
            {t('cveditor.viewListing')} <ExternalLink size={11} aria-hidden />
          </a>
        )}
        <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          {relanging && <span className="spinner" />}
          {relanging
            ? t('cveditor.translatingTo', { lang: langLabel(pendingLang ?? '') })
            : t('cveditor.language')}
          <select
            value={pendingLang ?? result.lang}
            disabled={relanging || !result.job_url}
            onChange={e => changeLang(e.target.value)}
            title={result.job_url ? t('cveditor.relangTooltipHasUrl') : t('cveditor.relangTooltipNoUrl')}
            style={{ padding: '3px 6px', fontSize: 'var(--fs-sm)', width: 'auto' }}
          >
            <option value="en">English</option>
            <option value="nl">Dutch</option>
          </select>
        </label>
      </div>

      {/* Tailoring notes — full width above preview */}
      {result.tailoring_notes && (
        <div style={{ marginBottom: 'var(--space-4)', padding: '10px 14px', background: 'var(--surface-dim)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {t('cveditor.tailoringNotes')}
          </div>
          <p style={{ fontSize: 'var(--fs-base)', lineHeight: 1.65, margin: 0 }}>{result.tailoring_notes}</p>
        </div>
      )}

      {/* Preview iframe */}
      <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 'var(--space-4)' }}>
        <a
          href={result.preview_url} target="_blank" rel="noreferrer"
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 10,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '5px 12px',
            fontSize: 'var(--fs-sm)', fontWeight: 500, textDecoration: 'none',
          }}
        >
          {t('cveditor.openNewTab')} <ExternalLink size={11} aria-hidden />
        </a>
        <iframe
          key={previewKey}
          ref={iframeRef}
          src={result.preview_url}
          onLoad={applyVisibility}
          style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }}
          title={t('cveditor.cvPreview')}
        />
        {(relanging || regenerating) && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 9,
            background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)',
            fontSize: 'var(--fs-md)', fontWeight: 500,
          }}>
            <span className="spinner" />
            {relanging
              ? t('cveditor.translatingCvTo', { lang: langLabel(pendingLang ?? '') })
              : t('cveditor.regeneratingCv')}
            <span className="muted-sm" style={{ fontWeight: 400 }}>
              {t('cveditor.reRunningNote')}
            </span>
          </div>
        )}
      </div>

      {/* Primary actions — one Update entry point + PDF download */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <Button variant="primary" onClick={() => setUpdateModal('menu')} busy={busyUpdating}>
          {!busyUpdating && <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />}
          {refreshing ? t('cveditor.refreshing') : updating ? t('cveditor.updating') : regenerating ? t('cveditor.regenerating')
            : planDirty ? t('cveditor.updateUnsaved') : t('cveditor.updateCv')}
        </Button>
        <Button variant="secondary" onClick={downloadPDF}>
          <Download size={14} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />
          {t('cveditor.downloadPdf')}
        </Button>
      </div>

      {/* Section toggles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {SECTIONS.map(key => {
          const disabled = key === 'photo' && !hasPhoto
          return (
            <label
              key={key}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                padding: '4px 10px', cursor: disabled ? 'default' : 'pointer',
                fontSize: 'var(--fs-sm)', color: disabled ? 'var(--muted)' : 'var(--ink)',
                opacity: disabled ? 0.45 : 1, fontWeight: 400, marginBottom: 0,
              }}
            >
              <input
                type="checkbox" checked={visible[key]} disabled={disabled}
                onChange={e => toggleSection(key, e.target.checked)}
                style={{ width: 'auto' }}
              />
              {t(`cveditor.sections.${key}`)}
            </label>
          )
        })}
      </div>

      {/* Photo CTA */}
      {!hasPhoto && (
        <div className="callout callout-highlight" style={{ marginBottom: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
          <ImageOff size={16} className="callout-icon" aria-hidden />
          <span>
            <Trans i18nKey="cveditor.photoDisabled" components={{ b: <strong /> }} />
            <Link to="/settings">{t('cveditor.addPhotoLink')}</Link> {t('cveditor.addPhotoSuffix')}
          </span>
        </div>
      )}

      {/* AI-generated content editor */}
      {plan ? (
        <div style={{ marginBottom: 'var(--space-3)', marginTop: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, marginBottom: 4 }}>
            {t('cveditor.editContent')}
            {planDirty && <span style={{ color: 'var(--highlight)', marginLeft: 8, fontWeight: 400 }}>● {t('cveditor.unsaved')}</span>}
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', marginBottom: 'var(--space-4)' }}>
            <Trans i18nKey="cveditor.editHelp" components={{ b: <strong /> }} />
          </div>

          {/* Professional summary */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('cveditor.professionalSummary')}
              </div>
              <Button
                variant="secondary"
                onClick={generateSummary}
                busy={generating}
                style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)' }}
                title={t('cveditor.aiSummaryTooltip')}
              >
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
                <span style={{ fontSize: 'var(--fs-xs)', color: role.bullets.length > 4 ? 'var(--highlight)' : 'var(--muted)' }}>
                  {t('cveditor.bulletsCount', { count: role.bullets.length })}
                </span>
              </div>
              <BulletListEditor value={role.bullets} onChange={v => setRole(role.id, { bullets: v })} placeholder={t('cveditor.bulletPlaceholder')} reorder format />
            </div>
          ))}

          {/* Prominent save bar — covers the whole editor (summary + all jobs) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)' }}>
            <SaveButton dirty={planDirty} onSave={saveEdits} idleLabel={t('cveditor.saveAllEdits')} />
            <span style={{ fontSize: 'var(--fs-sm)', color: planDirty ? 'var(--highlight)' : 'var(--muted)' }}>
              {planDirty ? t('cveditor.unsavedChangesNote') : t('cveditor.allEditsSaved')}
            </span>
          </div>
        </div>
      ) : (
        <div className="callout" style={{ marginBottom: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <span><Trans i18nKey="cveditor.editingUnavailable" components={{ b: <strong /> }} /></span>
        </div>
      )}
    </div>
  )
}
