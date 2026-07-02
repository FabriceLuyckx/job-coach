import { useEffect, useState, useRef, useCallback } from 'react'
import { Check, CloudUpload } from 'lucide-react'
import { api } from '../api'
import type {
  Profile, Experience, Education, Publication, Grant,
  FormalTeaching, GuestLecture, Collaborator,
  Project,
} from '../types'
import TagInput from '../components/TagInput'
import BulletListEditor from '../components/BulletListEditor'
import Button from '../components/Button'
import RemoveButton from '../components/RemoveButton'
import StarRating from '../components/StarRating'
import Badge from '../components/Badge'
import Collapsible from '../components/Collapsible'
import { useToast } from '../components/Toast'
import { errMsg } from '../lib/errors'

// Proficiency scale shown beneath the language stars (CEFR). The label is stored
// on each language for export but derived from the star count, never typed.
const CEFR_LABELS: Record<number, string> = {
  1: 'A1 Beginner', 2: 'A2 Elementary', 3: 'B1 Intermediate',
  4: 'B2/C1 Advanced', 5: 'C2 Native / Fluent',
}

// ── badges: tell the user where a section's data actually goes ───────────────
type BadgeKind = 'cv' | 'ai' | 'jobs'
const BADGE_LABELS: Record<BadgeKind, string> = {
  cv: 'On your CV',
  ai: 'Helps the AI',
  jobs: 'Job matching & letters',
}

// ── helpers ─────────────────────────────────────────────────────────────────

function Section({ title, badge, help, children, defaultOpen = false }: {
  title: string
  badge?: BadgeKind
  help?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span className="collapsible-title">{title}</span>
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

// Reusable collapsible item card (Experience / Education / Publication / Project).
function ItemCard({ summary, italic, open, setOpen, onRemove, children }: {
  summary: string
  italic?: boolean
  open: boolean
  setOpen: (o: boolean) => void
  onRemove: () => void
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
        extras={<RemoveButton onClick={onRemove} />}
      >
        {children}
      </Collapsible>
    </div>
  )
}

// ── Experience form ──────────────────────────────────────────────────────────

function ExperienceCard({
  exp, onChange, onRemove,
}: { exp: Experience; onChange: (e: Experience) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Experience, v: unknown) => onChange({ ...exp, [k]: v })

  return (
    <ItemCard summary={`${exp.title || '(untitled)'} — ${exp.employer || '…'}`} open={open} setOpen={setOpen} onRemove={onRemove}>
      <div className="row">
        <Field label="Job title"><input type="text" value={exp.title} onChange={e => set('title', e.target.value)} /></Field>
        <Field label="Employer"><input type="text" value={exp.employer} onChange={e => set('employer', e.target.value)} /></Field>
      </div>
      <Field label="Location"><input type="text" value={exp.location} onChange={e => set('location', e.target.value)} /></Field>
      <div className="row">
        <Field label="Start date (YYYY-MM)"><input type="text" value={exp.start_date} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label="End date (YYYY-MM or blank)"><input type="text" value={exp.end_date ?? ''} onChange={e => set('end_date', e.target.value || null)} /></Field>
      </div>
      <div className="row">
        <Field label="Current role">
          <select value={exp.is_current ? 'yes' : 'no'} onChange={e => set('is_current', e.target.value === 'yes')}>
            <option value="yes">Yes</option><option value="no">No</option>
          </select>
        </Field>
        <Field label="Full-time">
          <select value={exp.full_time ? 'yes' : 'no'} onChange={e => set('full_time', e.target.value === 'yes')}>
            <option value="yes">Yes</option><option value="no">No</option>
          </select>
        </Field>
      </div>
      <Field label="Reporting structure"><input type="text" value={exp.reporting_structure} onChange={e => set('reporting_structure', e.target.value)} /></Field>
      <Field label="Technical difficulty"><input type="text" value={exp.technical_difficulty} onChange={e => set('technical_difficulty', e.target.value)} /></Field>
      <Field label="Impact"><textarea value={exp.impact} onChange={e => set('impact', e.target.value)} /></Field>
      <Field label="Technologies"><TagInput value={exp.technologies} onChange={v => set('technologies', v)} /></Field>
      <Field label="Responsibilities (these become your CV bullets)">
        <BulletListEditor value={exp.responsibilities} onChange={v => set('responsibilities', v)} reorder format />
      </Field>
      <Field label="Achievements">
        <BulletListEditor value={exp.achievements} onChange={v => set('achievements', v)} reorder format />
      </Field>
      <Field label="Mentored">
        <select value={exp.mentored ? 'yes' : 'no'} onChange={e => set('mentored', e.target.value === 'yes')}>
          <option value="yes">Yes</option><option value="no">No</option>
        </select>
      </Field>
      {exp.mentored && (
        <Field label="Mentoring detail"><textarea value={exp.mentoring_detail ?? ''} onChange={e => set('mentoring_detail', e.target.value)} /></Field>
      )}
      <Field label="Presentations"><TagInput value={exp.presentations} onChange={v => set('presentations', v)} placeholder="internal / external" /></Field>
      <Field label="Presentations detail"><input type="text" value={exp.presentations_detail ?? ''} onChange={e => set('presentations_detail', e.target.value)} /></Field>
      {/* Relevance notes are AI-only metadata — tucked behind a disclosure so the
          form isn't overwhelming for everyday edits. */}
      <div style={{ marginTop: 'var(--space-3)' }}>
        <Collapsible
          flat
          title={<span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>Relevance notes (for the AI)</span>}
        >
          <p className="section-help" style={{ margin: '0 0 var(--space-2)' }}>Not printed — the AI uses these to pick which roles best fit a given job.</p>
          {(['teaching', 'research', 'leadership', 'interdisciplinarity'] as const).map(k => (
            <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
              <textarea
                value={exp.relevance[k] ?? ''}
                onChange={e => set('relevance', { ...exp.relevance, [k]: e.target.value || null })}
              />
            </Field>
          ))}
        </Collapsible>
      </div>
    </ItemCard>
  )
}

// ── Education form ───────────────────────────────────────────────────────────

function EducationCard({ edu, onChange, onRemove }: { edu: Education; onChange: (e: Education) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Education, v: unknown) => onChange({ ...edu, [k]: v })
  return (
    <ItemCard summary={`${edu.degree || '(degree)'} — ${edu.institution || '…'}`} open={open} setOpen={setOpen} onRemove={onRemove}>
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

// ── Publication form (APA citation + optional description) ───────────────────

function PublicationCard({ pub, onChange, onRemove }: { pub: Publication; onChange: (p: Publication) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Publication, v: unknown) => onChange({ ...pub, [k]: v })
  return (
    <ItemCard summary={pub.citation || '(new publication)'} italic open={open} setOpen={setOpen} onRemove={onRemove}>
      <Field label="APA citation">
        <textarea
          value={pub.citation}
          onChange={e => set('citation', e.target.value)}
          placeholder="Doe, J., & Smith, J. (2020). Title of the paper. Journal Name, 12(3), 45–67."
          style={{ minHeight: 70 }}
        />
      </Field>
      <Field label="Short description (optional)">
        <input type="text" value={pub.description ?? ''} onChange={e => set('description', e.target.value || undefined)} placeholder="One line on why this work matters" />
      </Field>
    </ItemCard>
  )
}

// ── Project form ─────────────────────────────────────────────────────────────

function ProjectCard({ proj, onChange, onRemove }: { proj: Project; onChange: (p: Project) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Project, v: unknown) => onChange({ ...proj, [k]: v })
  return (
    <ItemCard summary={proj.name || '(new project)'} open={open} setOpen={setOpen} onRemove={onRemove}>
      <div className="row">
        <Field label="Name"><input type="text" value={proj.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="URL (optional)"><input type="url" value={proj.url ?? ''} onChange={e => set('url', e.target.value || undefined)} /></Field>
      </div>
      <Field label="Description"><textarea value={proj.description} onChange={e => set('description', e.target.value)} /></Field>
      <Field label="Technologies"><TagInput value={proj.technologies} onChange={v => set('technologies', v)} /></Field>
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
            <input
              type="checkbox"
              checked={range}
              style={{ width: 'auto' }}
              onChange={e => {
                setRange(e.target.checked)
                if (e.target.checked) onChange({ ...grant, year: null })
                else onChange({ ...grant, year_start: null, year_end: null })
              }}
            />
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

// ── Optional sections ────────────────────────────────────────────────────────

type OptionalKey =
  | 'projects' | 'certifications' | 'awards'
  | 'publications' | 'grants' | 'academic' | 'teaching' | 'career_context'

const OPTIONAL_ORDER: OptionalKey[] = [
  'projects', 'certifications', 'awards',
  'publications', 'grants', 'academic', 'teaching', 'career_context',
]

const OPTIONAL_LABELS: Record<OptionalKey, string> = {
  projects: 'Projects',
  certifications: 'Certifications',
  awards: 'Awards',
  publications: 'Publications',
  grants: 'Grants & Fellowships',
  academic: 'Academic Background',
  teaching: 'Teaching',
  career_context: 'Career preferences & AI context',
}

function optionalHasData(p: Profile, k: OptionalKey): boolean {
  switch (k) {
    case 'projects': return (p.projects ?? []).length > 0
    case 'certifications': return (p.certifications ?? []).length > 0
    case 'awards': return (p.awards ?? []).length > 0
    case 'publications': return p.publications.length > 0
    case 'grants': return p.grants.length > 0
    case 'academic': {
      const a = p.academic
      return a.research_areas.length > 0 || a.interdisciplinary_work.length > 0 || a.collaborators.length > 0
        || a.methods.neural_analyses.length > 0 || a.methods.computational_modelling.length > 0
        || a.datasets_tools.data_types.length > 0 || a.datasets_tools.tools.length > 0
    }
    case 'teaching': {
      const t = p.teaching
      return t.subjects_to_teach.length > 0 || t.formal_experience.length > 0 || t.guest_lectures.length > 0
        || !!t.student_supervision || !!t.mentoring || !!t.educational_materials
    }
    case 'career_context': {
      const n = p.narrative
      return n.target_industries.length > 0 || n.topics_to_teach.length > 0
        || !!n.differentiation || !!n.problems_enjoyed || !!n.research_themes || !!n.work_to_avoid
    }
  }
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const toast = useToast()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [shown, setShown] = useState<Set<OptionalKey>>(new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  // Always-current profile ref: updated synchronously in set(), so a save never
  // reads stale state (fixes race where TagInput onBlur fires just before save).
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
      setSaveState('saved')
      setSaveError('')
    } catch (e) {
      setSaveError(errMsg(e))
      setSaveState('error')
    } finally {
      inFlight.current = false
      if (queued.current) {
        queued.current = false
        runSave()
      }
    }
  }, [])

  const scheduleSave = useCallback(() => {
    setSaveState(s => (s === 'saving' ? s : 'pending'))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(runSave, 1500)
  }, [runSave])

  // Flush a pending save when navigating away, so no edit is ever lost.
  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      const cur = latestProfile.current
      if (cur) api.putProfile(cur).catch(() => {})
    }
  }, [])

  useEffect(() => {
    api.getProfile().then(p => {
      setProfile(p)
      latestProfile.current = p
      const s = new Set<OptionalKey>()
      OPTIONAL_ORDER.forEach(k => { if (optionalHasData(p, k)) s.add(k) })
      setShown(s)
    }).catch(e => setError(errMsg(e)))
  }, [])

  // Close the add-a-section menu on outside click.
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

  // Remove a list item with a 5s Undo (restores the previous list for `path`).
  function removeItem(label: string, path: string, prevList: unknown[], index: number) {
    set(path, prevList.filter((_, i) => i !== index))
    toast.info(`Removed ${label}`, {
      duration: 5000,
      action: { label: 'Undo', onClick: () => set(path, prevList) },
    })
  }

  // Non-null alias: TS doesn't carry the `if (!profile) return` narrowing into the
  // nested renderOptional() closure, so use this provably-non-null const everywhere.
  const pf: Profile = profile

  const addSection = (k: OptionalKey) => { setShown(prev => new Set(prev).add(k)); setMenuOpen(false) }

  const projects = pf.projects ?? []
  const certifications = pf.certifications ?? []
  const awards = pf.awards ?? []
  const hidden = OPTIONAL_ORDER.filter(k => !shown.has(k))

  // ── optional-section renderers ──
  function renderOptional(k: OptionalKey): React.ReactNode {
    switch (k) {
      case 'projects':
        return (
          <Section key={k} title="Projects" badge="cv" help="Optional. Notable projects or side work — shown on your CV.">
            {projects.map((p, i) => (
              <ProjectCard key={i} proj={p}
                onChange={u => { const next = [...projects]; next[i] = u; set('projects', next) }}
                onRemove={() => removeItem(p.name || 'project', 'projects', projects, i)} />
            ))}
            <Button variant="secondary" onClick={() => set('projects', [...projects, { name: '', description: '', url: '', technologies: [] }])}>+ Add project</Button>
          </Section>
        )
      case 'certifications':
        return (
          <Section key={k} title="Certifications" badge="cv" help="Optional. Professional certifications — shown on your CV.">
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
      case 'awards':
        return (
          <Section key={k} title="Awards" badge="cv" help="Optional. Honours and awards (non-academic) — shown on your CV.">
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
      case 'publications':
        return (
          <Section key={k} title="Publications" badge="cv" help="For academic/research roles. Paste the full APA citation; the AI can drop this section for non-academic jobs.">
            {pf.publications.map((pub, i) => (
              <PublicationCard key={i} pub={pub}
                onChange={u => { const next = [...pf.publications]; next[i] = u; set('publications', next) }}
                onRemove={() => removeItem('publication', 'publications', pf.publications, i)} />
            ))}
            <Button variant="secondary" onClick={() => set('publications', [...pf.publications, { citation: '', description: '' }])}>+ Add publication</Button>
          </Section>
        )
      case 'grants':
        return (
          <Section key={k} title="Grants & Fellowships" badge="cv" help="For academic/research roles — shown in the CV sidebar.">
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
          <Section key={k} title="Academic Background" badge="ai" help="Not printed on your CV — helps the AI tailor and match research-oriented roles.">
            <Field label="Research areas"><TagInput value={pf.academic.research_areas} onChange={v => set('academic.research_areas', v)} /></Field>
            <Field label="Neural / brain analysis methods"><TagInput value={pf.academic.methods.neural_analyses} onChange={v => set('academic.methods.neural_analyses', v)} /></Field>
            <Field label="Computational modelling methods"><TagInput value={pf.academic.methods.computational_modelling} onChange={v => set('academic.methods.computational_modelling', v)} /></Field>
            <Field label="Data types used"><TagInput value={pf.academic.datasets_tools.data_types} onChange={v => set('academic.datasets_tools.data_types', v)} /></Field>
            <Field label="Tools used"><TagInput value={pf.academic.datasets_tools.tools} onChange={v => set('academic.datasets_tools.tools', v)} /></Field>
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
          </Section>
        )
      case 'teaching':
        return (
          <Section key={k} title="Teaching" badge="cv" help="Shown on your CV as a compact line when the role is teaching-related — the AI includes it only when relevant. Also helps tailoring & matching.">
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
          <Section key={k} title="Career preferences & AI context" badge="ai" help="Not printed on your CV — guides how the AI tailors your CV and suggestions.">
            <Field label="Target industries"><TagInput value={pf.narrative.target_industries} onChange={v => set('narrative.target_industries', v)} /></Field>
            <Field label="What differentiates you?"><textarea value={pf.narrative.differentiation} onChange={e => set('narrative.differentiation', e.target.value)} /></Field>
            <Field label="Problems you enjoy solving"><textarea value={pf.narrative.problems_enjoyed} onChange={e => set('narrative.problems_enjoyed', e.target.value)} /></Field>
            <Field label="Topics you like to teach"><TagInput value={pf.narrative.topics_to_teach} onChange={v => set('narrative.topics_to_teach', v)} /></Field>
            <Field label="Research themes"><textarea value={pf.narrative.research_themes} onChange={e => set('narrative.research_themes', e.target.value)} /></Field>
            <Field label="Work to avoid"><textarea value={pf.narrative.work_to_avoid} onChange={e => set('narrative.work_to_avoid', e.target.value)} /></Field>
          </Section>
        )
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Profile</h1>
        {/* Auto-save status — the page's only save UI. */}
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
      <p className="help-text" style={{ marginTop: 'calc(-1 * var(--space-4))' }}>
        Everything you enter here is saved automatically as you type.
      </p>

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
        <div className="row">
          <Field label="LinkedIn URL"><input type="url" value={pf.personal.links.linkedin ?? ''} onChange={e => set('personal.links.linkedin', e.target.value)} /></Field>
          <Field label="GitHub URL"><input type="url" value={pf.personal.links.github ?? ''} onChange={e => set('personal.links.github', e.target.value)} /></Field>
          <Field label="Google Scholar URL"><input type="url" value={pf.personal.links.google_scholar ?? ''} onChange={e => set('personal.links.google_scholar', e.target.value)} /></Field>
        </div>
      </Section>

      <Section title="Professional Summary" badge="cv" help="2–4 sentences shown at the top of your CV. When tailoring for a job, the AI rewrites this; what you put here is your default." defaultOpen>
        <Field label="Summary"><textarea value={pf.narrative.target_roles_description} onChange={e => set('narrative.target_roles_description', e.target.value)} style={{ minHeight: 100 }} /></Field>
      </Section>

      <Section title="Experience" badge="cv" help="Your roles, newest first. The bullet points become the body of your CV.">
        {pf.experience.map((exp, i) => (
          <ExperienceCard
            key={exp.id || i}
            exp={exp}
            onChange={updated => { const next = [...pf.experience]; next[i] = updated; set('experience', next) }}
            onRemove={() => removeItem(exp.title || 'job', 'experience', pf.experience, i)}
          />
        ))}
        <Button variant="secondary" onClick={() => set('experience', [...pf.experience, {
          id: `job-${Date.now()}`, title: '', employer: '', location: '', start_date: '',
          end_date: null, is_current: false, full_time: true, team_size: 1,
          reporting_structure: '', responsibilities: [], technical_difficulty: '',
          impact: '', technologies: [], mentored: false, presentations: [],
          achievements: [], relevance: { teaching: null, research: null, leadership: null, interdisciplinarity: null },
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

      <Section title="Education" badge="cv" help="Degrees, newest first — shown in your CV sidebar.">
        {pf.education.map((edu, i) => (
          <EducationCard
            key={i}
            edu={edu}
            onChange={updated => { const next = [...pf.education]; next[i] = updated; set('education', next) }}
            onRemove={() => removeItem(edu.degree || 'education entry', 'education', pf.education, i)}
          />
        ))}
        <Button variant="secondary" onClick={() => set('education', [...pf.education, {
          degree: '', field: '', institution: '', location: '', start_year: new Date().getFullYear(), end_year: null, distinction: null,
        }])}>+ Add education</Button>
      </Section>

      <Section title="Work Preferences" badge="jobs" help="Not shown on your CV — helps the Job Coach tailor suggested jobs and write motivational letters (coming soon).">
        <Field label="Commute radius (cities)"><TagInput value={pf.work_preferences.commute_radius} onChange={v => set('work_preferences.commute_radius', v)} /></Field>
        <Field label="Remote / hybrid / on-site">
          <select value={pf.work_preferences.remote_hybrid} onChange={e => set('work_preferences.remote_hybrid', e.target.value)}>
            <option>Remote</option><option>Hybrid</option><option>On-site</option>
          </select>
        </Field>
        <Field label="Institution type preference"><input type="text" value={pf.work_preferences.institution_type_preference} onChange={e => set('work_preferences.institution_type_preference', e.target.value)} /></Field>
        <Field label="Research vs teaching preference"><input type="text" value={pf.work_preferences.research_vs_teaching} onChange={e => set('work_preferences.research_vs_teaching', e.target.value)} /></Field>
        <Field label="Leadership interest"><input type="text" value={pf.work_preferences.leadership_interest} onChange={e => set('work_preferences.leadership_interest', e.target.value)} /></Field>
        <div className="row">
          <Field label="Schedule"><input type="text" value={pf.work_preferences.schedule} onChange={e => set('work_preferences.schedule', e.target.value)} /></Field>
          <Field label="Relocation"><input type="text" value={pf.work_preferences.relocation} onChange={e => set('work_preferences.relocation', e.target.value)} /></Field>
        </div>
        <Field label="Language preferences"><TagInput value={pf.work_preferences.language_preferences} onChange={v => set('work_preferences.language_preferences', v)} /></Field>
        <div className="row">
          <Field label="Current gross salary (€/month)"><input type="number" value={pf.work_preferences.salary_current_gross} onChange={e => set('work_preferences.salary_current_gross', +e.target.value)} /></Field>
          <Field label="Mobility budget (€/month)"><input type="number" value={pf.work_preferences.salary_mobility_budget} onChange={e => set('work_preferences.salary_mobility_budget', +e.target.value)} /></Field>
        </div>
      </Section>

      {/* ── OPTIONAL (shown on demand) ── */}
      {OPTIONAL_ORDER.filter(k => shown.has(k)).map(renderOptional)}

      {/* Add a section */}
      {hidden.length > 0 && (
        <div className="add-section" ref={menuRef}>
          <Button variant="secondary" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen}>
            + Add a section
          </Button>
          {menuOpen && (
            <div className="add-section-menu">
              {hidden.map(k => (
                <button key={k} type="button" onClick={() => addSection(k)}>{OPTIONAL_LABELS[k]}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="error-msg" style={{ marginBottom: 'var(--space-2)' }}>{error}</p>}
    </div>
  )
}
