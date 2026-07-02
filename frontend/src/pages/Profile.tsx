import { useEffect, useState, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { Check, CloudUpload, EyeOff, FileUp, PencilLine, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type {
  Profile, Experience, Education, Publication, Grant,
  FormalTeaching, GuestLecture, Collaborator, Project,
  Volunteering, CustomSection, Link as ProfileLink,
} from '../types'
import TagInput from '../components/TagInput'
import BulletListEditor from '../components/BulletListEditor'
import Button from '../components/Button'
import RemoveButton from '../components/RemoveButton'
import StarRating from '../components/StarRating'
import Badge from '../components/Badge'
import Collapsible from '../components/Collapsible'
import ReorderableList from '../components/ReorderableList'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { useKeyStatus } from '../components/KeyStatus'
import { errMsg } from '../lib/errors'
import {
  OPTIONAL_SECTIONS, OPTIONAL_BY_KEY, ALL_OPTIONAL_KEYS,
  BADGE_LABELS, type SectionBadge,
} from '../lib/profileSections'

// Proficiency scale shown beneath the language stars (CEFR).
const CEFR_LABELS: Record<number, string> = {
  1: 'A1 Beginner', 2: 'A2 Elementary', 3: 'B1 Intermediate',
  4: 'B2/C1 Advanced', 5: 'C2 Native / Fluent',
}

const LINK_SUGGESTIONS = ['LinkedIn', 'GitHub', 'Portfolio', 'Website', 'Google Scholar', 'Behance', 'Dribbble', 'ORCID']

// ── helpers ─────────────────────────────────────────────────────────────────

function Section({ title, badge, help, count, onHide, children, defaultOpen = false }: {
  title: string
  badge?: SectionBadge
  help?: string
  count?: number
  onHide?: () => void
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      extras={onHide && (
        <button type="button" className="btn-ghost section-hide" onClick={onHide} title="Hide this section (keeps your data)">
          <EyeOff size={14} aria-hidden /> Hide
        </button>
      )}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span className="collapsible-title">{title}{typeof count === 'number' && count > 0 ? ` (${count})` : ''}</span>
          {badge && <Badge variant={badge}>{BADGE_LABELS[badge]}</Badge>}
        </span>
      }
    >
      {help && <p className="section-help">{help}</p>}
      {children}
    </Collapsible>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

// Reusable collapsible item card (Experience / Education / Publication / …).
function ItemCard({ summary, italic, open, setOpen, onRemove, handle, children }: {
  summary: string
  italic?: boolean
  open: boolean
  setOpen: (o: boolean) => void
  onRemove: () => void
  handle?: ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="card" style={{ marginBottom: 'var(--space-3)' }}>
      <Collapsible
        flat
        open={open}
        onToggle={setOpen}
        title={
          <span className="collapsible-title-sm" style={{
            fontStyle: italic ? 'italic' : 'normal', minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{summary}</span>
        }
        extras={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{handle}<RemoveButton onClick={onRemove} /></span>}
      >
        {children}
      </Collapsible>
    </div>
  )
}

// ── Experience form ──────────────────────────────────────────────────────────

function ExperienceCard({
  exp, onChange, onRemove, handle,
}: { exp: Experience; onChange: (e: Experience) => void; onRemove: () => void; handle?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Experience, v: unknown) => onChange({ ...exp, [k]: v })
  const current = !exp.end_date

  return (
    <ItemCard summary={`${exp.title || '(untitled)'} — ${exp.employer || '…'}`} open={open} setOpen={setOpen} onRemove={onRemove} handle={handle}>
      <div className="row">
        <Field label="Job title"><input type="text" value={exp.title} onChange={e => set('title', e.target.value)} /></Field>
        <Field label="Employer"><input type="text" value={exp.employer} onChange={e => set('employer', e.target.value)} /></Field>
      </div>
      <Field label="Location"><input type="text" value={exp.location} onChange={e => set('location', e.target.value)} /></Field>
      <div className="row">
        <Field label="Start date"><input type="month" value={exp.start_date} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label="End date">
          <input type="month" value={exp.end_date ?? ''} disabled={current}
            onChange={e => set('end_date', e.target.value || null)} />
        </Field>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={current} onChange={e => set('end_date', e.target.checked ? null : '')} />
        I currently work here
      </label>
      <Field label="What you did (these become your CV bullets)">
        <BulletListEditor value={exp.responsibilities} onChange={v => set('responsibilities', v)} reorder format />
      </Field>
      <Field label="Technologies / tools (optional)"><TagInput value={exp.technologies} onChange={v => set('technologies', v)} /></Field>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <Collapsible flat title={<span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>Notes for the AI (optional)</span>}>
          <p className="section-help" style={{ margin: '0 0 var(--space-2)' }}>Not printed — helps the AI decide when to feature this role and how to phrase it.</p>
          <Field label="When is this role most relevant?">
            <textarea value={exp.relevance_note} onChange={e => set('relevance_note', e.target.value)}
              placeholder="e.g. Best for leadership or data-heavy roles" />
          </Field>
          <Field label="Anything else worth knowing?">
            <textarea value={exp.ai_context} onChange={e => set('ai_context', e.target.value)}
              placeholder="e.g. Reported to the CTO; part-time; high-scale systems" />
          </Field>
        </Collapsible>
      </div>
    </ItemCard>
  )
}

// ── Education form ───────────────────────────────────────────────────────────

function EducationCard({ edu, onChange, onRemove, handle }: { edu: Education; onChange: (e: Education) => void; onRemove: () => void; handle?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Education, v: unknown) => onChange({ ...edu, [k]: v })
  return (
    <ItemCard summary={`${edu.degree || '(degree)'} — ${edu.institution || '…'}`} open={open} setOpen={setOpen} onRemove={onRemove} handle={handle}>
      <div className="row">
        <Field label="Degree"><input type="text" value={edu.degree} onChange={e => set('degree', e.target.value)} /></Field>
        <Field label="Field"><input type="text" value={edu.field} onChange={e => set('field', e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label="Institution"><input type="text" value={edu.institution} onChange={e => set('institution', e.target.value)} /></Field>
        <Field label="Location"><input type="text" value={edu.location} onChange={e => set('location', e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label="Start year"><input type="number" value={edu.start_year} onChange={e => set('start_year', +e.target.value)} /></Field>
        <Field label="End year"><input type="number" value={edu.end_year ?? ''} onChange={e => set('end_year', e.target.value ? +e.target.value : null)} /></Field>
      </div>
      <Field label="Distinction (optional)"><input type="text" value={edu.distinction ?? ''} onChange={e => set('distinction', e.target.value || null)} /></Field>
    </ItemCard>
  )
}

// ── Publication form ─────────────────────────────────────────────────────────

function PublicationCard({ pub, onChange, onRemove, handle }: { pub: Publication; onChange: (p: Publication) => void; onRemove: () => void; handle?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Publication, v: unknown) => onChange({ ...pub, [k]: v })
  return (
    <ItemCard summary={pub.citation || '(new publication)'} italic open={open} setOpen={setOpen} onRemove={onRemove} handle={handle}>
      <Field label="APA citation">
        <textarea value={pub.citation} onChange={e => set('citation', e.target.value)}
          placeholder="Doe, J., & Smith, J. (2020). Title of the paper. Journal Name, 12(3), 45–67."
          style={{ minHeight: 70 }} />
      </Field>
      <Field label="Short description (optional)">
        <input type="text" value={pub.description ?? ''} onChange={e => set('description', e.target.value || undefined)} placeholder="One line on why this work matters" />
      </Field>
    </ItemCard>
  )
}

// ── Project form ─────────────────────────────────────────────────────────────

function ProjectCard({ proj, onChange, onRemove, handle }: { proj: Project; onChange: (p: Project) => void; onRemove: () => void; handle?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Project, v: unknown) => onChange({ ...proj, [k]: v })
  return (
    <ItemCard summary={proj.name || '(new project)'} open={open} setOpen={setOpen} onRemove={onRemove} handle={handle}>
      <div className="row">
        <Field label="Name"><input type="text" value={proj.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="URL (optional)"><input type="url" value={proj.url ?? ''} onChange={e => set('url', e.target.value || undefined)} /></Field>
      </div>
      <Field label="Description"><textarea value={proj.description} onChange={e => set('description', e.target.value)} /></Field>
      <Field label="Technologies"><TagInput value={proj.technologies} onChange={v => set('technologies', v)} /></Field>
    </ItemCard>
  )
}

// ── Volunteering form ────────────────────────────────────────────────────────

function VolunteeringCard({ vol, onChange, onRemove, handle }: { vol: Volunteering; onChange: (v: Volunteering) => void; onRemove: () => void; handle?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Volunteering, v: unknown) => onChange({ ...vol, [k]: v })
  const current = !vol.end_date
  return (
    <ItemCard summary={`${vol.role || '(role)'} — ${vol.organisation || '…'}`} open={open} setOpen={setOpen} onRemove={onRemove} handle={handle}>
      <div className="row">
        <Field label="Role"><input type="text" value={vol.role} onChange={e => set('role', e.target.value)} /></Field>
        <Field label="Organisation"><input type="text" value={vol.organisation} onChange={e => set('organisation', e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label="Start date"><input type="month" value={vol.start_date} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label="End date"><input type="month" value={vol.end_date ?? ''} disabled={current} onChange={e => set('end_date', e.target.value || null)} /></Field>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={current} onChange={e => set('end_date', e.target.checked ? null : '')} />
        Currently volunteering here
      </label>
      <Field label="Description"><textarea value={vol.description} onChange={e => set('description', e.target.value)} /></Field>
    </ItemCard>
  )
}

// ── Grant form ───────────────────────────────────────────────────────────────

function GrantCard({ grant, onChange, onRemove }: { grant: Grant; onChange: (g: Grant) => void; onRemove: () => void }) {
  const isRange = grant.year == null && (grant.year_start != null || grant.year_end != null)
  const [range, setRange] = useState(isRange)
  const set = (k: keyof Grant, v: unknown) => onChange({ ...grant, [k]: v })
  return (
    <div className="card" style={{ marginBottom: 'var(--space-3)', padding: '12px 18px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Field label="Name"><input type="text" value={grant.name} onChange={e => set('name', e.target.value)} /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--ink)', fontWeight: 400, marginBottom: 'var(--space-2)' }}>
            <input type="checkbox" checked={range} style={{ width: 'auto' }}
              onChange={e => {
                setRange(e.target.checked)
                if (e.target.checked) onChange({ ...grant, year: null })
                else onChange({ ...grant, year_start: null, year_end: null })
              }} />
            Multi-year (date range)
          </label>
          {range ? (
            <div className="row">
              <Field label="Year start"><input type="number" value={grant.year_start ?? ''} onChange={e => set('year_start', e.target.value ? +e.target.value : null)} /></Field>
              <Field label="Year end"><input type="number" value={grant.year_end ?? ''} onChange={e => set('year_end', e.target.value ? +e.target.value : null)} /></Field>
            </div>
          ) : (
            <Field label="Year"><input type="number" value={grant.year ?? ''} onChange={e => set('year', e.target.value ? +e.target.value : null)} /></Field>
          )}
        </div>
        <div style={{ marginTop: 20 }}><RemoveButton onClick={onRemove} /></div>
      </div>
    </div>
  )
}

// ── Custom section editor ────────────────────────────────────────────────────

function CustomSectionCard({ sec, onChange, onRemove }: { sec: CustomSection; onChange: (s: CustomSection) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(true)
  const setItem = (i: number, patch: Partial<CustomSection['items'][number]>) => {
    const items = [...sec.items]; items[i] = { ...items[i], ...patch }; onChange({ ...sec, items })
  }
  return (
    <ItemCard summary={sec.title || '(untitled section)'} open={open} setOpen={setOpen} onRemove={onRemove}>
      <Field label="Section title"><input type="text" value={sec.title} onChange={e => onChange({ ...sec, title: e.target.value })} placeholder="e.g. Licences, Exhibitions, Military service" /></Field>
      {sec.items.map((it, i) => (
        <div key={i} className="card" style={{ marginBottom: 'var(--space-2)', padding: '12px 18px' }}>
          <div className="row">
            <Field label="Heading"><input type="text" value={it.heading} onChange={e => setItem(i, { heading: e.target.value })} /></Field>
            <Field label="Subheading (optional)"><input type="text" value={it.subheading ?? ''} onChange={e => setItem(i, { subheading: e.target.value || undefined })} /></Field>
            <Field label="Date (optional)"><input type="text" value={it.date ?? ''} onChange={e => setItem(i, { date: e.target.value || undefined })} placeholder="2023" /></Field>
          </div>
          <Field label="Description (optional)"><textarea value={it.description ?? ''} onChange={e => setItem(i, { description: e.target.value || undefined })} /></Field>
          <RemoveButton onClick={() => onChange({ ...sec, items: sec.items.filter((_, idx) => idx !== i) })} />
        </div>
      ))}
      <Button variant="secondary" onClick={() => onChange({ ...sec, items: [...sec.items, { heading: '' }] })}>+ Add entry</Button>
    </ItemCard>
  )
}

// ── CV import modal ──────────────────────────────────────────────────────────

function ImportCVModal({ hasContent, onClose, onImported }: {
  hasContent: boolean
  onClose: () => void
  onImported: (p: Profile) => void
}) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!text.trim() && !file) { setErr('Paste your CV text or choose a PDF.'); return }
    setBusy(true); setErr('')
    try {
      const p = await api.importProfile(file ? { file } : { text })
      onImported(p)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Import from an existing CV" onClose={onClose}>
      <p className="help-text" style={{ marginTop: 0 }}>
        Upload a PDF or paste your CV text. The AI extracts your details into the profile
        for you to review and edit — nothing is saved until you check it.
      </p>
      {hasContent && (
        <p className="callout callout-warn" style={{ marginBottom: 'var(--space-3)' }}>
          This replaces the details currently in your profile.
        </p>
      )}
      <div className="field">
        <label>Upload a PDF</label>
        <input type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="field">
        <label>…or paste your CV text</label>
        <textarea value={text} onChange={e => setText(e.target.value)} disabled={!!file}
          style={{ minHeight: 160 }} placeholder="Paste the full text of your CV here" />
      </div>
      {err && <p className="error-msg">{err}</p>}
      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? <><span className="spinner" style={{ width: 13, height: 13, marginRight: 6 }} />Importing…</> : <><Upload size={15} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />Import</>}
        </Button>
      </div>
    </Modal>
  )
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const toast = useToast()
  const { keySet } = useKeyStatus()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [manualStart, setManualStart] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const latestProfile = useRef<Profile | null>(null)

  // ── Auto-save: debounced, single-flight, latest-wins ──
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const queued = useRef(false)

  const runSave = useCallback(async () => {
    if (inFlight.current) { queued.current = true; return }
    const cur = latestProfile.current
    if (!cur) return
    inFlight.current = true
    setSaveState('saving')
    try {
      await api.putProfile(cur)
      setSaveState('saved'); setSaveError('')
    } catch (e) {
      setSaveError(errMsg(e)); setSaveState('error')
    } finally {
      inFlight.current = false
      if (queued.current) { queued.current = false; runSave() }
    }
  }, [])

  const scheduleSave = useCallback(() => {
    setSaveState(s => (s === 'saving' ? s : 'pending'))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(runSave, 1500)
  }, [runSave])

  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      const cur = latestProfile.current
      if (cur) api.putProfile(cur).catch(() => {})
    }
  }, [])

  useEffect(() => {
    api.getProfile().then(p => {
      setProfile(p); latestProfile.current = p
    }).catch(e => setError(errMsg(e)))
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  if (!profile) return <div style={{ padding: 32, color: 'var(--muted)' }}>{error || 'Loading…'}</div>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyPath(obj: any, parts: string[], value: unknown): any {
    if (parts.length === 0) return value
    const [head, ...tail] = parts
    return { ...obj, [head]: applyPath(obj[head] ?? {}, tail, value) }
  }

  const set = (path: string, value: unknown) => {
    const parts = path.split('.')
    setProfile(prev => {
      if (!prev) return prev
      const next = applyPath(prev, parts, value) as Profile
      latestProfile.current = next
      return next
    })
    if (latestProfile.current) {
      latestProfile.current = applyPath(latestProfile.current, parts, value) as Profile
    }
    scheduleSave()
  }

  function removeItem(label: string, path: string, prevList: unknown[], index: number) {
    set(path, prevList.filter((_, i) => i !== index))
    toast.info(`Removed ${label}`, {
      duration: 5000,
      action: { label: 'Undo', onClick: () => set(path, prevList) },
    })
  }

  const pf: Profile = profile
  const enabled = new Set(pf.meta.enabled_sections ?? [])
  const hidden = OPTIONAL_SECTIONS.filter(s => !enabled.has(s.key))
  const pristine = !pf.personal.name.trim() && pf.experience.length === 0
  const showForm = !pristine || manualStart

  function onImported(p: Profile) {
    setProfile(p); latestProfile.current = p; scheduleSave()
    setShowImport(false); setManualStart(true)
    toast.success('Imported — review each section and fix anything the AI got wrong.')
  }

  function showSection(key: string) {
    set('meta.enabled_sections', [...ALL_OPTIONAL_KEYS.filter(k => enabled.has(k) || k === key)])
    setMenuOpen(false)
  }
  function hideSection(key: string) {
    set('meta.enabled_sections', ALL_OPTIONAL_KEYS.filter(k => k !== key && enabled.has(k)))
    toast.info(`Hid ${OPTIONAL_BY_KEY[key].label}`, {
      duration: 5000,
      action: { label: 'Undo', onClick: () => showSection(key) },
    })
  }

  // Whether a hidden section still holds data (shown as a hint in the add-menu).
  function hasData(key: string): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyPf = pf as any
    if (['projects', 'certifications', 'awards', 'publications', 'grants',
         'volunteering', 'courses', 'memberships', 'custom_sections'].includes(key)) {
      return (anyPf[key] ?? []).length > 0
    }
    if (key === 'academic') {
      const a = pf.academic
      return a.research_areas.length > 0 || a.methods.length > 0 || a.collaborators.length > 0
        || a.interdisciplinary_work.length > 0 || !!a.research_themes || a.topics_to_teach.length > 0
    }
    if (key === 'teaching') {
      const t = pf.teaching
      return t.subjects_to_teach.length > 0 || t.formal_experience.length > 0 || t.guest_lectures.length > 0
        || !!t.student_supervision || !!t.mentoring || !!t.educational_materials
    }
    if (key === 'career_context') {
      const n = pf.narrative
      return n.target_industries.length > 0 || !!n.differentiation || !!n.problems_enjoyed
        || !!n.work_to_avoid || !!n.looking_for
    }
    return false
  }

  const projects = pf.projects ?? []
  const certifications = pf.certifications ?? []
  const awards = pf.awards ?? []
  const volunteering = pf.volunteering ?? []
  const courses = pf.courses ?? []
  const memberships = pf.memberships ?? []
  const customSections = pf.custom_sections ?? []

  // ── optional-section renderers ──
  function renderOptional(key: string): React.ReactNode {
    const def = OPTIONAL_BY_KEY[key]
    const hideProps = { onHide: () => hideSection(key) }
    switch (key) {
      case 'projects':
        return (
          <Section key={key} title={def.label} badge="cv" count={projects.length} help="Notable projects or side work — shown on your CV." {...hideProps}>
            <ReorderableList items={projects} keyOf={(_, i) => i} onReorder={v => set('projects', v)}
              renderItem={(p, i, handle) => (
                <ProjectCard proj={p} handle={handle}
                  onChange={u => { const next = [...projects]; next[i] = u; set('projects', next) }}
                  onRemove={() => removeItem(p.name || 'project', 'projects', projects, i)} />
              )} />
            <Button variant="secondary" onClick={() => set('projects', [...projects, { name: '', description: '', url: '', technologies: [] }])}>+ Add project</Button>
          </Section>
        )
      case 'volunteering':
        return (
          <Section key={key} title={def.label} badge="cv" count={volunteering.length} help="Volunteer roles and community work — shown on your CV." {...hideProps}>
            <ReorderableList items={volunteering} keyOf={(_, i) => i} onReorder={v => set('volunteering', v)}
              renderItem={(v, i, handle) => (
                <VolunteeringCard vol={v} handle={handle}
                  onChange={u => { const next = [...volunteering]; next[i] = u; set('volunteering', next) }}
                  onRemove={() => removeItem(v.role || 'volunteering entry', 'volunteering', volunteering, i)} />
              )} />
            <Button variant="secondary" onClick={() => set('volunteering', [...volunteering, { role: '', organisation: '', start_date: '', end_date: null, description: '' }])}>+ Add volunteering</Button>
          </Section>
        )
      case 'certifications':
        return (
          <Section key={key} title={def.label} badge="cv" count={certifications.length} help="Professional certifications — shown on your CV." {...hideProps}>
            {certifications.map((c, i) => (
              <div key={i} className="row" style={{ marginBottom: 'var(--space-2)', alignItems: 'flex-end' }}>
                <Field label="Name"><input type="text" value={c.name} onChange={e => { const next = [...certifications]; next[i] = { ...c, name: e.target.value }; set('certifications', next) }} /></Field>
                <Field label="Issuer"><input type="text" value={c.issuer} onChange={e => { const next = [...certifications]; next[i] = { ...c, issuer: e.target.value }; set('certifications', next) }} /></Field>
                <Field label="Year"><input type="number" value={c.year ?? ''} onChange={e => { const next = [...certifications]; next[i] = { ...c, year: e.target.value ? +e.target.value : null }; set('certifications', next) }} /></Field>
                <RemoveButton onClick={() => removeItem(c.name || 'certification', 'certifications', certifications, i)} />
              </div>
            ))}
            <Button variant="secondary" onClick={() => set('certifications', [...certifications, { name: '', issuer: '', year: null }])}>+ Add certification</Button>
          </Section>
        )
      case 'courses':
        return (
          <Section key={key} title={def.label} badge="cv" count={courses.length} help="Courses and training without a formal certificate — shown on your CV." {...hideProps}>
            {courses.map((c, i) => (
              <div key={i} className="row" style={{ marginBottom: 'var(--space-2)', alignItems: 'flex-end' }}>
                <Field label="Course / training"><input type="text" value={c.name} onChange={e => { const next = [...courses]; next[i] = { ...c, name: e.target.value }; set('courses', next) }} /></Field>
                <Field label="Provider"><input type="text" value={c.provider} onChange={e => { const next = [...courses]; next[i] = { ...c, provider: e.target.value }; set('courses', next) }} /></Field>
                <Field label="Year"><input type="number" value={c.year ?? ''} onChange={e => { const next = [...courses]; next[i] = { ...c, year: e.target.value ? +e.target.value : null }; set('courses', next) }} /></Field>
                <RemoveButton onClick={() => removeItem(c.name || 'course', 'courses', courses, i)} />
              </div>
            ))}
            <Button variant="secondary" onClick={() => set('courses', [...courses, { name: '', provider: '', year: null }])}>+ Add course</Button>
          </Section>
        )
      case 'awards':
        return (
          <Section key={key} title={def.label} badge="cv" count={awards.length} help="Honours and awards — shown on your CV." {...hideProps}>
            {awards.map((a, i) => (
              <div key={i} className="card" style={{ marginBottom: 'var(--space-2)', padding: '12px 18px' }}>
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <Field label="Name"><input type="text" value={a.name} onChange={e => { const next = [...awards]; next[i] = { ...a, name: e.target.value }; set('awards', next) }} /></Field>
                  <Field label="Year"><input type="number" value={a.year ?? ''} onChange={e => { const next = [...awards]; next[i] = { ...a, year: e.target.value ? +e.target.value : null }; set('awards', next) }} /></Field>
                  <RemoveButton onClick={() => removeItem(a.name || 'award', 'awards', awards, i)} />
                </div>
                <Field label="Description (optional)"><input type="text" value={a.description ?? ''} onChange={e => { const next = [...awards]; next[i] = { ...a, description: e.target.value || undefined }; set('awards', next) }} /></Field>
              </div>
            ))}
            <Button variant="secondary" onClick={() => set('awards', [...awards, { name: '', year: null, description: '' }])}>+ Add award</Button>
          </Section>
        )
      case 'memberships':
        return (
          <Section key={key} title={def.label} badge="cv" count={memberships.length} help="Associations and professional bodies you belong to — shown on your CV." {...hideProps}>
            {memberships.map((m, i) => (
              <div key={i} className="row" style={{ marginBottom: 'var(--space-2)', alignItems: 'flex-end' }}>
                <Field label="Organisation"><input type="text" value={m.name} onChange={e => { const next = [...memberships]; next[i] = { ...m, name: e.target.value }; set('memberships', next) }} /></Field>
                <Field label="Role (optional)"><input type="text" value={m.role ?? ''} onChange={e => { const next = [...memberships]; next[i] = { ...m, role: e.target.value || undefined }; set('memberships', next) }} /></Field>
                <Field label="Since (year)"><input type="number" value={m.year ?? ''} onChange={e => { const next = [...memberships]; next[i] = { ...m, year: e.target.value ? +e.target.value : null }; set('memberships', next) }} /></Field>
                <RemoveButton onClick={() => removeItem(m.name || 'membership', 'memberships', memberships, i)} />
              </div>
            ))}
            <Button variant="secondary" onClick={() => set('memberships', [...memberships, { name: '', role: '', year: null }])}>+ Add membership</Button>
          </Section>
        )
      case 'publications':
        return (
          <Section key={key} title={def.label} badge="cv" count={pf.publications.length} help="For academic/research roles. Paste the full APA citation; the AI can drop this section for non-academic jobs." {...hideProps}>
            <ReorderableList items={pf.publications} keyOf={(_, i) => i} onReorder={v => set('publications', v)}
              renderItem={(pub, i, handle) => (
                <PublicationCard pub={pub} handle={handle}
                  onChange={u => { const next = [...pf.publications]; next[i] = u; set('publications', next) }}
                  onRemove={() => removeItem('publication', 'publications', pf.publications, i)} />
              )} />
            <Button variant="secondary" onClick={() => set('publications', [...pf.publications, { citation: '', description: '' }])}>+ Add publication</Button>
          </Section>
        )
      case 'grants':
        return (
          <Section key={key} title={def.label} badge="cv" count={pf.grants.length} help="For academic/research roles — shown in the CV sidebar." {...hideProps}>
            {pf.grants.map((g, i) => (
              <GrantCard key={i} grant={g}
                onChange={u => { const next = [...pf.grants]; next[i] = u; set('grants', next) }}
                onRemove={() => removeItem(g.name || 'grant', 'grants', pf.grants, i)} />
            ))}
            <Button variant="secondary" onClick={() => set('grants', [...pf.grants, { year: null, year_start: null, year_end: null, name: '' } as Grant])}>+ Add grant</Button>
          </Section>
        )
      case 'academic':
        return (
          <Section key={key} title={def.label} badge="ai" help="Not printed on your CV — helps the AI tailor and match research-oriented roles." {...hideProps}>
            <Field label="Research areas"><TagInput value={pf.academic.research_areas} onChange={v => set('academic.research_areas', v)} /></Field>
            <Field label="Research themes"><textarea value={pf.academic.research_themes} onChange={e => set('academic.research_themes', e.target.value)} /></Field>
            <Field label="Topics you like to teach"><TagInput value={pf.academic.topics_to_teach} onChange={v => set('academic.topics_to_teach', v)} /></Field>
            <label style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', margin: 'var(--space-3) 0 var(--space-1)', display: 'block' }}>Methods & techniques</label>
            <p className="section-help" style={{ marginTop: 0 }}>Group any methods, techniques or tools under headings that fit your field.</p>
            {pf.academic.methods.map((g, i) => (
              <div key={i} className="card" style={{ marginBottom: 'var(--space-2)', padding: '12px 18px' }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <input type="text" value={g.label} placeholder="Group name (e.g. Statistical methods)" style={{ fontWeight: 600 }}
                    onChange={e => { const next = [...pf.academic.methods]; next[i] = { ...g, label: e.target.value }; set('academic.methods', next) }} />
                  <RemoveButton onClick={() => set('academic.methods', pf.academic.methods.filter((_, idx) => idx !== i))} />
                </div>
                <TagInput value={g.items} onChange={v => { const next = [...pf.academic.methods]; next[i] = { ...g, items: v }; set('academic.methods', next) }} />
              </div>
            ))}
            <Button variant="secondary" onClick={() => set('academic.methods', [...pf.academic.methods, { label: '', items: [] }])}>+ Add method group</Button>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Field label="Interdisciplinary work"><TagInput value={pf.academic.interdisciplinary_work} onChange={v => set('academic.interdisciplinary_work', v)} /></Field>
              <Field label="Collaborators">
                {pf.academic.collaborators.map((c, i) => (
                  <div key={i} className="row" style={{ marginBottom: 'var(--space-2)' }}>
                    <input type="text" value={c.name} placeholder="Name" onChange={e => { const next = [...pf.academic.collaborators]; next[i] = { ...c, name: e.target.value }; set('academic.collaborators', next) }} />
                    <input type="text" value={c.affiliation} placeholder="Affiliation" onChange={e => { const next = [...pf.academic.collaborators]; next[i] = { ...c, affiliation: e.target.value }; set('academic.collaborators', next) }} />
                    <RemoveButton onClick={() => set('academic.collaborators', pf.academic.collaborators.filter((_, idx) => idx !== i))} />
                  </div>
                ))}
                <Button variant="secondary" onClick={() => set('academic.collaborators', [...pf.academic.collaborators, { name: '', affiliation: '' } as Collaborator])}>+ Add collaborator</Button>
              </Field>
            </div>
          </Section>
        )
      case 'teaching':
        return (
          <Section key={key} title={def.label} badge="cv" help="Shown on your CV as a compact line when the role is teaching-related — the AI includes it only when relevant. Also helps tailoring & matching." {...hideProps}>
            <Field label="Subjects you can teach"><TagInput value={pf.teaching.subjects_to_teach} onChange={v => set('teaching.subjects_to_teach', v)} /></Field>
            <Field label="Student supervision"><textarea value={pf.teaching.student_supervision} onChange={e => set('teaching.student_supervision', e.target.value)} /></Field>
            <Field label="Mentoring"><textarea value={pf.teaching.mentoring} onChange={e => set('teaching.mentoring', e.target.value)} /></Field>
            <Field label="Educational materials created"><textarea value={pf.teaching.educational_materials} onChange={e => set('teaching.educational_materials', e.target.value)} /></Field>
            <Field label="Formal teaching roles">
              {pf.teaching.formal_experience.map((t, i) => (
                <div key={i} className="card" style={{ marginBottom: 'var(--space-2)' }}>
                  <div className="row">
                    <Field label="Type"><input type="text" value={t.type} onChange={e => { const next = [...pf.teaching.formal_experience]; next[i] = { ...t, type: e.target.value }; set('teaching.formal_experience', next) }} /></Field>
                    <Field label="Course"><input type="text" value={t.course} onChange={e => { const next = [...pf.teaching.formal_experience]; next[i] = { ...t, course: e.target.value }; set('teaching.formal_experience', next) }} /></Field>
                  </div>
                  <div className="row">
                    <Field label="Institution"><input type="text" value={t.institution} onChange={e => { const next = [...pf.teaching.formal_experience]; next[i] = { ...t, institution: e.target.value }; set('teaching.formal_experience', next) }} /></Field>
                    <Field label="Years"><input type="text" value={t.years} onChange={e => { const next = [...pf.teaching.formal_experience]; next[i] = { ...t, years: e.target.value }; set('teaching.formal_experience', next) }} /></Field>
                  </div>
                  <Field label="Description"><textarea value={t.description} onChange={e => { const next = [...pf.teaching.formal_experience]; next[i] = { ...t, description: e.target.value }; set('teaching.formal_experience', next) }} /></Field>
                  <RemoveButton onClick={() => set('teaching.formal_experience', pf.teaching.formal_experience.filter((_, idx) => idx !== i))} />
                </div>
              ))}
              <Button variant="secondary" onClick={() => set('teaching.formal_experience', [...pf.teaching.formal_experience, { type: '', course: '', institution: '', years: '', description: '' } as FormalTeaching])}>+ Add</Button>
            </Field>
            <Field label="Guest lectures">
              {pf.teaching.guest_lectures.map((g, i) => (
                <div key={i} className="row" style={{ marginBottom: 'var(--space-2)' }}>
                  <input type="text" value={g.course} placeholder="Course" onChange={e => { const next = [...pf.teaching.guest_lectures]; next[i] = { ...g, course: e.target.value }; set('teaching.guest_lectures', next) }} />
                  <input type="text" value={g.institution} placeholder="Institution" onChange={e => { const next = [...pf.teaching.guest_lectures]; next[i] = { ...g, institution: e.target.value }; set('teaching.guest_lectures', next) }} />
                  <RemoveButton onClick={() => set('teaching.guest_lectures', pf.teaching.guest_lectures.filter((_, idx) => idx !== i))} />
                </div>
              ))}
              <Button variant="secondary" onClick={() => set('teaching.guest_lectures', [...pf.teaching.guest_lectures, { course: '', institution: '' } as GuestLecture])}>+ Add</Button>
            </Field>
          </Section>
        )
      case 'career_context':
        return (
          <Section key={key} title={def.label} badge="ai" help="Not printed on your CV — guides how the AI tailors your CV and suggestions." {...hideProps}>
            <Field label="What are you looking for next?"><textarea value={pf.narrative.looking_for} onChange={e => set('narrative.looking_for', e.target.value)} /></Field>
            <Field label="Target industries"><TagInput value={pf.narrative.target_industries} onChange={v => set('narrative.target_industries', v)} /></Field>
            <Field label="What differentiates you?"><textarea value={pf.narrative.differentiation} onChange={e => set('narrative.differentiation', e.target.value)} /></Field>
            <Field label="Problems you enjoy solving"><textarea value={pf.narrative.problems_enjoyed} onChange={e => set('narrative.problems_enjoyed', e.target.value)} /></Field>
            <Field label="Work to avoid"><textarea value={pf.narrative.work_to_avoid} onChange={e => set('narrative.work_to_avoid', e.target.value)} /></Field>
          </Section>
        )
      case 'custom_sections':
        return (
          <Section key={key} title={def.label} badge="cv" count={customSections.length} help="Add any section your field needs — each becomes its own titled block on your CV." {...hideProps}>
            {customSections.map((s, i) => (
              <CustomSectionCard key={i} sec={s}
                onChange={u => { const next = [...customSections]; next[i] = u; set('custom_sections', next) }}
                onRemove={() => removeItem(s.title || 'section', 'custom_sections', customSections, i)} />
            ))}
            <Button variant="secondary" onClick={() => set('custom_sections', [...customSections, { title: '', items: [{ heading: '' }] }])}>+ Add custom section</Button>
          </Section>
        )
    }
  }

  const links = pf.personal.links ?? []
  const setLink = (i: number, patch: Partial<ProfileLink>) => {
    const next = [...links]; next[i] = { ...next[i], ...patch }; set('personal.links', next)
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Profile</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {showForm && (
            <Button variant="secondary" onClick={() => setShowImport(true)} disabled={keySet === false}
              title={keySet === false ? 'Add your OpenRouter API key in Settings first' : 'Extract your details from an existing CV'}
              style={{ padding: '4px 10px', fontSize: 'var(--fs-sm)' }}>
              <FileUp size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />Import from CV
            </Button>
          )}
          <span className="muted-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} role="status">
            {(saveState === 'pending' || saveState === 'saving') && <><span className="spinner" style={{ width: 13, height: 13 }} />Saving…</>}
            {saveState === 'saved' && <><Check size={14} color="var(--success)" aria-hidden />All changes saved</>}
            {saveState === 'error' && (
              <>
                <span style={{ color: 'var(--danger)' }}>Couldn't save: {saveError}</span>
                <Button variant="secondary" onClick={runSave} style={{ padding: '3px 10px', fontSize: 'var(--fs-sm)' }}>
                  <CloudUpload size={13} style={{ marginRight: 4, verticalAlign: -2 }} aria-hidden />Retry
                </Button>
              </>
            )}
          </span>
        </div>
      </div>

      {showImport && <ImportCVModal hasContent={!pristine} onClose={() => setShowImport(false)} onImported={onImported} />}
      <p className="help-text" style={{ marginTop: 'calc(-1 * var(--space-4))' }}>
        Everything you enter here is saved automatically as you type.
      </p>

      {!showForm && (
        <EmptyState icon={FileUp} title="Let's build your profile"
          action={
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button onClick={() => setShowImport(true)} disabled={keySet === false}
                title={keySet === false ? 'Add your OpenRouter API key in Settings first' : undefined}>
                <FileUp size={15} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />Import from an existing CV
              </Button>
              <Button variant="secondary" onClick={() => setManualStart(true)}>
                <PencilLine size={15} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />Fill it in manually
              </Button>
            </div>
          }>
          Import a PDF or paste your CV to get a head start, or fill in each section yourself.
          {keySet === false && <><br /><Link to="/settings">Add your OpenRouter API key</Link> to enable CV import.</>}
        </EmptyState>
      )}

      {showForm && (<>
      {/* ── CORE ── */}

      <Section title="Personal Info" badge="cv" help="Your name, contact details and links — shown at the top of every CV." defaultOpen>
        <div className="row">
          <Field label="Full name"><input type="text" value={pf.personal.name} onChange={e => set('personal.name', e.target.value)} /></Field>
          <Field label="Professional title"><input type="text" value={pf.personal.professional_title} onChange={e => set('personal.professional_title', e.target.value)} /></Field>
        </div>
        <Field label="Headline / tagline (optional)"><input type="text" value={pf.personal.headline ?? ''} onChange={e => set('personal.headline', e.target.value || undefined)} placeholder="A short line shown under your name on the CV" /></Field>
        <div className="row">
          <Field label="Email"><input type="email" value={pf.personal.email} onChange={e => set('personal.email', e.target.value)} /></Field>
          <Field label="Phone"><input type="tel" value={pf.personal.phone} onChange={e => set('personal.phone', e.target.value)} /></Field>
        </div>
        <div className="row">
          <Field label="City"><input type="text" value={pf.personal.location.city} onChange={e => set('personal.location.city', e.target.value)} /></Field>
          <Field label="Country"><input type="text" value={pf.personal.location.country} onChange={e => set('personal.location.country', e.target.value)} /></Field>
        </div>
        <Field label="Keywords"><TagInput value={pf.personal.keywords} onChange={v => set('personal.keywords', v)} /></Field>
        <Field label="Links">
          <p className="section-help" style={{ marginTop: 0 }}>Add any profiles or portfolio links relevant to your field.</p>
          <datalist id="link-labels">{LINK_SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
          {links.map((l, i) => (
            <div key={i} className="row" style={{ marginBottom: 'var(--space-2)', alignItems: 'center' }}>
              <input type="text" list="link-labels" value={l.label} placeholder="Label (e.g. LinkedIn)" style={{ maxWidth: 200 }} onChange={e => setLink(i, { label: e.target.value })} />
              <input type="url" value={l.url} placeholder="https://…" onChange={e => setLink(i, { url: e.target.value })} />
              <RemoveButton onClick={() => removeItem(l.label || 'link', 'personal.links', links, i)} />
            </div>
          ))}
          <Button variant="secondary" onClick={() => set('personal.links', [...links, { label: '', url: '' }])}>+ Add link</Button>
        </Field>
      </Section>

      <Section title="Professional Summary" badge="cv" help="2–4 sentences shown at the top of your CV. When tailoring for a job, the AI rewrites this; what you put here is your default." defaultOpen>
        <Field label="Summary"><textarea value={pf.summary} onChange={e => set('summary', e.target.value)} style={{ minHeight: 100 }} /></Field>
      </Section>

      <Section title="Experience" badge="cv" count={pf.experience.length} help="Your roles, newest first. The bullet points become the body of your CV.">
        <ReorderableList items={pf.experience} keyOf={(e, i) => e.id || i} onReorder={v => set('experience', v)}
          renderItem={(exp, i, handle) => (
            <ExperienceCard exp={exp} handle={handle}
              onChange={updated => { const next = [...pf.experience]; next[i] = updated; set('experience', next) }}
              onRemove={() => removeItem(exp.title || 'job', 'experience', pf.experience, i)} />
          )} />
        <Button variant="secondary" onClick={() => set('experience', [...pf.experience, {
          id: `job-${Date.now()}`, title: '', employer: '', location: '', start_date: '',
          end_date: null, responsibilities: [], technologies: [], relevance_note: '', ai_context: '',
        }])}>+ Add job</Button>
      </Section>

      <Section title="Skills" badge="cv" help="Group your skills under any headings that fit your field (e.g. Technical skills, Clinical skills, Design tools) — each group with content shows on your CV.">
        {pf.skills.groups.map((g, i) => (
          <div key={i} className="card" style={{ marginBottom: 'var(--space-3)', padding: '12px 18px' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <input type="text" value={g.label} placeholder="Group name (e.g. Technical skills)" style={{ fontWeight: 600 }}
                onChange={e => { const next = [...pf.skills.groups]; next[i] = { ...g, label: e.target.value }; set('skills.groups', next) }} />
              <RemoveButton title="Remove group" onClick={() => removeItem(g.label || 'skill group', 'skills.groups', pf.skills.groups, i)} />
            </div>
            <TagInput value={g.items} onChange={v => { const next = [...pf.skills.groups]; next[i] = { ...g, items: v }; set('skills.groups', next) }} placeholder="Add a skill and press Enter" maxLength={32} />
          </div>
        ))}
        <Button variant="secondary" onClick={() => set('skills.groups', [...pf.skills.groups, { label: '', items: [] }])}>+ Add skill group</Button>

        <div style={{ marginTop: 'var(--space-5)' }}>
          <label style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', marginBottom: 'var(--space-1)', display: 'block' }}>Languages</label>
          {pf.skills.languages.map((l, i) => (
            <div key={i} className="row" style={{ marginBottom: 'var(--space-2)', alignItems: 'center' }}>
              <input type="text" value={l.language} placeholder="Language" onChange={e => { const next = [...pf.skills.languages]; next[i] = { ...l, language: e.target.value }; set('skills.languages', next) }} />
              <StarRating value={l.level} onChange={n => { const next = [...pf.skills.languages]; next[i] = { ...l, level: n, label: CEFR_LABELS[n] ?? '' }; set('skills.languages', next) }} />
              <RemoveButton onClick={() => set('skills.languages', pf.skills.languages.filter((_, idx) => idx !== i))} />
            </div>
          ))}
          <div className="skill-scale-legend">★ A1 Beginner · ★★ A2 Elementary · ★★★ B1 Intermediate · ★★★★ B2/C1 Advanced · ★★★★★ C2 Native/Fluent</div>
          <Button variant="secondary" onClick={() => set('skills.languages', [...pf.skills.languages, { language: '', level: 3, label: CEFR_LABELS[3] }])}>+ Add language</Button>
        </div>
      </Section>

      <Section title="Education" badge="cv" count={pf.education.length} help="Degrees, newest first — shown in your CV sidebar.">
        <ReorderableList items={pf.education} keyOf={(_, i) => i} onReorder={v => set('education', v)}
          renderItem={(edu, i, handle) => (
            <EducationCard edu={edu} handle={handle}
              onChange={updated => { const next = [...pf.education]; next[i] = updated; set('education', next) }}
              onRemove={() => removeItem(edu.degree || 'education entry', 'education', pf.education, i)} />
          )} />
        <Button variant="secondary" onClick={() => set('education', [...pf.education, {
          degree: '', field: '', institution: '', location: '', start_year: new Date().getFullYear(), end_year: null, distinction: null,
        }])}>+ Add education</Button>
      </Section>

      <Section title="Work Preferences" badge="jobs" help="Not shown on your CV — helps the Job Coach tailor suggested jobs and write motivational letters (coming soon).">
        <Field label="Preferred locations / commute (cities)"><TagInput value={pf.work_preferences.commute_radius} onChange={v => set('work_preferences.commute_radius', v)} /></Field>
        <div className="row">
          <Field label="Remote / hybrid / on-site">
            <select value={pf.work_preferences.remote_hybrid} onChange={e => set('work_preferences.remote_hybrid', e.target.value)}>
              <option>Remote</option><option>Hybrid</option><option>On-site</option><option>No preference</option>
            </select>
          </Field>
          <Field label="Relocation"><input type="text" value={pf.work_preferences.relocation} onChange={e => set('work_preferences.relocation', e.target.value)} placeholder="e.g. Open to discussion" /></Field>
        </div>
        <Field label="Contract types you'd consider"><TagInput value={pf.work_preferences.contract_types} onChange={v => set('work_preferences.contract_types', v)} placeholder="Permanent, Freelance, Part-time…" /></Field>
        <div className="row">
          <Field label="Schedule"><input type="text" value={pf.work_preferences.schedule} onChange={e => set('work_preferences.schedule', e.target.value)} placeholder="e.g. Full-time, 4/5" /></Field>
          <Field label="Availability / notice period"><input type="text" value={pf.work_preferences.availability} onChange={e => set('work_preferences.availability', e.target.value)} placeholder="e.g. Two months' notice" /></Field>
        </div>
        <Field label="Willingness to travel"><input type="text" value={pf.work_preferences.travel} onChange={e => set('work_preferences.travel', e.target.value)} placeholder="e.g. Occasional travel is fine" /></Field>
        <Field label="Language preferences"><TagInput value={pf.work_preferences.language_preferences} onChange={v => set('work_preferences.language_preferences', v)} /></Field>
        <Field label="Organisation preferences (optional)"><textarea value={pf.work_preferences.organisation_preferences} onChange={e => set('work_preferences.organisation_preferences', e.target.value)} placeholder="Type of employer, culture, mission you're drawn to…" /></Field>
        <label style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', margin: 'var(--space-3) 0 var(--space-1)', display: 'block' }}>Expected salary (optional)</label>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="From"><input type="number" value={pf.work_preferences.salary.min ?? ''} onChange={e => set('work_preferences.salary.min', e.target.value ? +e.target.value : null)} /></Field>
          <Field label="To"><input type="number" value={pf.work_preferences.salary.max ?? ''} onChange={e => set('work_preferences.salary.max', e.target.value ? +e.target.value : null)} /></Field>
          <Field label="Currency"><input type="text" value={pf.work_preferences.salary.currency} onChange={e => set('work_preferences.salary.currency', e.target.value)} style={{ maxWidth: 90 }} placeholder="EUR" /></Field>
          <Field label="Per">
            <select value={pf.work_preferences.salary.period} onChange={e => set('work_preferences.salary.period', e.target.value)}>
              <option value="month">Month</option><option value="year">Year</option><option value="hour">Hour</option><option value="day">Day</option>
            </select>
          </Field>
        </div>
        <Field label="Salary notes (optional)"><input type="text" value={pf.work_preferences.salary.notes} onChange={e => set('work_preferences.salary.notes', e.target.value)} placeholder="e.g. Flexible for the right role; benefits matter" /></Field>
      </Section>

      {/* ── OPTIONAL (shown on demand, in registry order) ── */}
      {OPTIONAL_SECTIONS.filter(s => enabled.has(s.key)).map(s => renderOptional(s.key))}

      {/* Add a section */}
      {hidden.length > 0 && (
        <div className="add-section" ref={menuRef}>
          <Button variant="secondary" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen}>
            + Add a section
          </Button>
          {menuOpen && (
            <div className="add-section-menu wide">
              {hidden.map(s => (
                <button key={s.key} type="button" onClick={() => showSection(s.key)}>
                  <span className="add-section-menu-head">
                    <span className="add-section-menu-label">{s.label}</span>
                    <Badge variant={s.badge}>{BADGE_LABELS[s.badge]}</Badge>
                    {hasData(s.key) && <span className="add-section-menu-hint">has content</span>}
                  </span>
                  <span className="add-section-menu-desc">{s.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      </>)}

      {error && <p className="error-msg" style={{ marginBottom: 'var(--space-2)' }}>{error}</p>}
    </div>
  )
}
