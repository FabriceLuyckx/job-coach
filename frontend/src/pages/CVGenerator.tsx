import { useRef, useState, useEffect } from 'react'
import { api, type CvHistoryEntry, type CVResult, type CVPlan, type CVPlanRole } from '../api'
import BulletListEditor from '../components/BulletListEditor'
import Button from '../components/Button'
import SaveButton from '../components/SaveButton'

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

function CVEditor({ result: initialResult, hasPhoto, onSummaryUpdate, onLangUpdate }: {
  result: CVResult
  hasPhoto: boolean
  onSummaryUpdate?: (summary: string) => void
  onLangUpdate?: (lang: string) => void
}) {
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
  const [regenPrompt, setRegenPrompt] = useState(false)
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

  useEffect(loadPlan, [result.history_id])

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
      await api.rerenderCV(result.history_id)
      if (!result.has_plan) setResult(prev => ({ ...prev, has_plan: true }))  // re-tailor stored a plan
      loadPlan()
      setPreviewKey(k => k + 1)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRelanging(false)
      setPendingLang(null)
    }
  }

  async function regenerate(keepEdits: boolean) {
    setRegenPrompt(false)
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
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

  return (
    <div style={{ padding: 16 }}>
      {error && <p className="error-msg" style={{ marginBottom: 12 }}>{error}</p>}

      {regenPrompt && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setRegenPrompt(false)}
        >
          <div className="card" style={{ maxWidth: 440, margin: 0 }} onClick={e => e.stopPropagation()}>
            <div className="section-title" style={{ marginBottom: 10 }}>Regenerate this CV</div>
            <p style={{ fontSize: 'var(--fs-base)', color: 'var(--text)', lineHeight: 1.6, marginBottom: 16 }}>
              Re-run the AI for the <strong>{result.lang === 'nl' ? 'Dutch' : 'English'}</strong> version. Keep your edited
              summary and bullet points, or start fresh?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button variant="primary" onClick={() => regenerate(true)}>
                Keep my edits, regenerate the rest
              </Button>
              <Button variant="secondary" onClick={() => regenerate(false)}>
                Regenerate everything (discard my edits)
              </Button>
              <Button variant="secondary" onClick={() => setRegenPrompt(false)} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

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
        <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          {relanging && <span className="spinner" />}
          {relanging
            ? `Translating to ${pendingLang === 'nl' ? 'Dutch' : 'English'}…`
            : 'Language'}
          <select
            value={pendingLang ?? result.lang}
            disabled={relanging || !result.job_url}
            onChange={e => changeLang(e.target.value)}
            title={result.job_url
              ? 'Regenerate this CV in another language (re-runs the AI, ~30s)'
              : 'No job URL stored, so the language cannot be changed'}
            style={{ padding: '3px 6px', fontSize: 'var(--fs-sm)' }}
          >
            <option value="en">English</option>
            <option value="nl">Dutch</option>
          </select>
        </label>
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
        {(relanging || regenerating) && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 9,
            background: 'rgba(255,255,255,0.75)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
            color: 'var(--text)', fontSize: 'var(--fs-md)', fontWeight: 500,
          }}>
            <span className="spinner" />
            {relanging
              ? `Translating CV to ${pendingLang === 'nl' ? 'Dutch' : 'English'}…`
              : 'Regenerating CV…'}
            <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', fontWeight: 400 }}>
              Re-running the AI — this takes about 30 seconds.
            </span>
          </div>
        )}
      </div>

      {/* Primary actions — kept directly under the preview so they're never buried */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Button
          variant="primary"
          onClick={refreshPreview}
          busy={refreshing}
          title={planDirty ? 'Save edits and reload the preview' : 'Reload the CV preview'}
        >
          {refreshing ? 'Refreshing…' : planDirty ? 'Save & Refresh' : 'Refresh Preview'}
        </Button>
        <Button
          variant="secondary"
          onClick={updateFromProfile}
          busy={updating}
          disabled={!result.has_plan && !result.job_url}
          title={result.has_plan
            ? "Re-render this CV from the stored tailoring plan using your latest profile data"
            : result.job_url
              ? "Re-tailor this CV from the job listing using your latest profile data (calls the AI)"
              : "No tailoring plan or job URL stored — generate a new CV instead"}
        >
          {updating ? 'Updating…' : 'Update from Profile'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setRegenPrompt(true)}
          disabled={regenerating || relanging || !result.job_url}
          title={result.job_url
            ? "Re-run the AI to re-tailor this CV in its current language"
            : "No job URL stored, so this CV can't be regenerated"}
        >
          {regenerating ? 'Regenerating…' : '✦ Regenerate'}
        </Button>
        <Button variant="secondary" onClick={downloadPDF}>
          Download PDF
        </Button>
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

      {/* AI-generated content editor */}
      {plan ? (
        <div style={{ marginBottom: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            Edit generated content
            {planDirty && <span style={{ color: 'var(--highlight)', marginLeft: 8, fontWeight: 400 }}>● unsaved</span>}
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', marginBottom: 14 }}>
            Edit the summary and bullet points below; <strong>Save all edits</strong> applies everything at once.
            Select text and press <strong>⌘/Ctrl+B</strong> or <strong>⌘/Ctrl+I</strong> to make it bold or italic.
            Drag the <span style={{ fontSize: 13 }}>⠿</span> handle to reorder bullets.
          </div>

          {/* Professional summary */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Professional Summary
              </div>
              <Button
                variant="secondary"
                onClick={generateSummary}
                busy={generating}
                style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)' }}
                title="Ask the AI to write a new summary based on your profile and this job"
              >
                {generating ? 'Generating…' : '✦ AI Summary'}
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
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Per-role bullets (max 4 each), in CV order */}
          {plan.roles.map(role => (
            <div key={role.id} style={{ marginBottom: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)' }}>
                  {role.title}{role.employer && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {role.employer}</span>}
                </div>
                <span style={{ fontSize: 'var(--fs-xs)', color: role.bullets.length > 4 ? 'var(--highlight)' : 'var(--muted)' }}>
                  {role.bullets.length}/4 bullets
                </span>
              </div>
              <BulletListEditor value={role.bullets} onChange={v => setRole(role.id, { bullets: v })} placeholder="Bullet point…" reorder format />
            </div>
          ))}

          {/* Prominent save bar — covers the whole editor (summary + all jobs) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <SaveButton dirty={planDirty} onSave={saveEdits} idleLabel="Save all edits" />
            <span style={{ fontSize: 'var(--fs-sm)', color: planDirty ? 'var(--highlight)' : 'var(--muted)' }}>
              {planDirty ? 'Unsaved changes — saves the summary and all job bullets.' : 'All edits saved.'}
            </span>
          </div>
        </div>
      ) : (
        <div className="callout" style={{ marginBottom: 14 }}>
          <span>Editing isn't available for this CV yet — click <strong>Regenerate</strong> to create an editable tailoring plan.</span>
        </div>
      )}
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
    if (pendingId) {
      // Launched from "Accept" on the Job Suggestions page — show which URL is
      // being generated, then poll its progress.
      const pendingUrl = localStorage.getItem('cv_pending_job_url')
      if (pendingUrl) setUrl(pendingUrl)
      localStorage.removeItem('cv_pending_job_url')
      setLoading(true); startPolling(pendingId)
    }
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
        <Button variant="ghost" icon title="Close" onClick={e => { e.stopPropagation(); stopPolling(); onClose() }}>×</Button>
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
                <Button variant="primary" onClick={generate} busy={loading} disabled={!url.trim()}>
                  {loading ? (loadingMsg || 'Generating…') : 'Generate CV'}
                </Button>
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

function CVHistorySlot({ entry: initialEntry, hasPhoto, onDelete, initialExpanded = false }: {
  entry: CvHistoryEntry
  hasPhoto: boolean
  onDelete: (id: string) => void
  initialExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(initialExpanded)
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
        <Button variant="ghost" icon title="Remove" onClick={e => { e.stopPropagation(); onDelete(entry.id) }}>×</Button>
      </SlotHeader>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <CVEditor
            key={entry.id}
            result={result}
            hasPhoto={hasPhoto}
            onSummaryUpdate={s => setEntry(prev => ({ ...prev, summary: s }))}
            onLangUpdate={l => setEntry(prev => ({ ...prev, lang: l }))}
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
  // Set when arriving from "Open CV" on the Job Suggestions page — the matching
  // history entry (by job_url) is auto-expanded.
  const [openEntryId, setOpenEntryId] = useState<string | null>(null)

  useEffect(() => {
    api.getPhoto().then(r => setHasPhoto(r.exists)).catch(() => {})
    if (localStorage.getItem(JOB_ID_KEY)) setShowNew(true)
    const openUrl = localStorage.getItem('cv_open_url')
    localStorage.removeItem('cv_open_url')
    api.getCVHistory().then(h => {
      setHistory(h)
      if (openUrl) {
        const match = h.find(e => e.job_url === openUrl)
        if (match) setOpenEntryId(match.id)
      }
    }).catch(() => {})
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
          <Button variant="primary" onClick={() => setShowNew(true)}>+ New CV</Button>
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
              initialExpanded={entry.id === openEntryId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
