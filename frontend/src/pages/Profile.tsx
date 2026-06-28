import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../api'
import type {
  Profile, Experience, Education, Publication, Grant,
  FormalTeaching, GuestLecture, Collaborator, LanguageSkill,
  Project,
} from '../types'
import TagInput from '../components/TagInput'
import BulletListEditor from '../components/BulletListEditor'

// ── badges: tell the user where a section's data actually goes ───────────────
type BadgeKind = 'cv' | 'ai' | 'jobs'
const BADGES: Record<BadgeKind, { label: string; cls: string }> = {
  cv:   { label: 'On your CV',             cls: 'badge-cv' },
  ai:   { label: 'Helps the AI',           cls: 'badge-ai' },
  jobs: { label: 'Job matching & letters', cls: 'badge-jobs' },
}

// ── helpers ─────────────────────────────────────────────────────────────────

function Section({ title, badge, help, children, onHide, defaultOpen = true }: {
  title: string
  badge?: BadgeKind
  help?: string
  children: React.ReactNode
  onHide?: () => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card">
      <div className="section-header">
        <div className="section-head-left" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
          <span className="section-chevron">{open ? '▾' : '▸'}</span>
          <span className="section-title">{title}</span>
          {badge && <span className={`section-badge ${BADGES[badge].cls}`}>{BADGES[badge].label}</span>}
        </div>
        {onHide && (
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 'var(--fs-sm)' }} onClick={onHide}>Hide</button>
        )}
      </div>
      {open && (
        <div>
          {help && <p className="section-help">{help}</p>}
          {children}
        </div>
      )}
    </div>
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

// Reusable collapsible item card (Experience / Education / Publication / Project)
// with the chevron on the LEFT, larger, as the primary affordance.
function ItemCard({ summary, italic, open, setOpen, onRemove, children }: {
  summary: string
  italic?: boolean
  open: boolean
  setOpen: (o: boolean) => void
  onRemove: () => void
  children: React.ReactNode
}) {
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="section-header">
        <div className="section-head-left" style={{ cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={() => setOpen(!open)}>
          <span className="section-chevron">{open ? '▾' : '▸'}</span>
          <span style={{
            fontWeight: 600, fontStyle: italic ? 'italic' : 'normal',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{summary}</span>
        </div>
        <button className="btn-danger" style={{ flexShrink: 0, padding: '4px 10px' }} onClick={onRemove}>Remove</button>
      </div>
      {open && <div>{children}</div>}
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
      <div style={{ marginTop: 12 }}>
        <label style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 13, marginBottom: 4, display: 'block' }}>Relevance notes</label>
        <p className="section-help" style={{ margin: '0 0 8px' }}>Not printed — the AI uses these to pick which roles best fit a given job.</p>
        {(['teaching', 'research', 'leadership', 'interdisciplinarity'] as const).map(k => (
          <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
            <textarea
              value={exp.relevance[k] ?? ''}
              onChange={e => set('relevance', { ...exp.relevance, [k]: e.target.value || null })}
            />
          </Field>
        ))}
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
    <div className="card" style={{ marginBottom: 10, padding: '12px 18px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Field label="Name"><input type="text" value={grant.name} onChange={e => set('name', e.target.value)} /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text)', fontWeight: 400, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={range}
              onChange={e => {
                setRange(e.target.checked)
                // keep the data shape consistent with the chosen mode
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
        <button className="btn-danger" style={{ marginTop: 20 }} onClick={onRemove}>×</button>
      </div>
    </div>
  )
}

// ── Optional-section registry ────────────────────────────────────────────────

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

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [shown, setShown] = useState<Set<OptionalKey>>(new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  // Always-current profile ref: updated synchronously in set(), so save() never reads stale state
  // (fixes race where TagInput onBlur fires just before the Save button click)
  const latestProfile = useRef<Profile | null>(null)

  useEffect(() => {
    api.getProfile().then(p => {
      setProfile(p)
      latestProfile.current = p
      // An optional section starts visible only if it already has data.
      const s = new Set<OptionalKey>()
      OPTIONAL_ORDER.forEach(k => { if (optionalHasData(p, k)) s.add(k) })
      setShown(s)
    }).catch(e => setError(e.message))
  }, [])

  const save = useCallback(async () => {
    const p = latestProfile.current
    if (!p) return
    setSaving(true); setError(''); setSaved(false)
    try {
      await api.putProfile(p)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }, [])

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
      latestProfile.current = next  // keep ref in sync synchronously
      return next
    })
    if (latestProfile.current) {
      latestProfile.current = applyPath(latestProfile.current, parts, value) as Profile
    }
  }

  // Non-null alias: TS doesn't carry the `if (!profile) return` narrowing into the
  // nested renderOptional() closure, so use this provably-non-null const everywhere.
  const pf: Profile = profile

  const addSection = (k: OptionalKey) => { setShown(prev => new Set(prev).add(k)); setMenuOpen(false) }
  const hideSection = (k: OptionalKey) => setShown(prev => { const s = new Set(prev); s.delete(k); return s })

  const projects = pf.projects ?? []
  const certifications = pf.certifications ?? []
  const awards = pf.awards ?? []
  const hidden = OPTIONAL_ORDER.filter(k => !shown.has(k))

  // ── optional-section renderers ──
  function renderOptional(k: OptionalKey): React.ReactNode {
    const onHide = () => hideSection(k)
    switch (k) {
      case 'projects':
        return (
          <Section key={k} title="Projects" badge="cv" help="Optional. Notable projects or side work — shown on your CV." onHide={onHide}>
            {projects.map((p, i) => (
              <ProjectCard key={i} proj={p}
                onChange={u => { const next = [...projects]; next[i] = u; set('projects', next) }}
                onRemove={() => set('projects', projects.filter((_, idx) => idx !== i))} />
            ))}
            <button className="btn-secondary" onClick={() => set('projects', [...projects, { name: '', description: '', url: '', technologies: [] }])}>+ Add project</button>
          </Section>
        )
      case 'certifications':
        return (
          <Section key={k} title="Certifications" badge="cv" help="Optional. Professional certifications — shown on your CV." onHide={onHide}>
            {certifications.map((c, i) => (
              <div key={i} className="row" style={{ marginBottom: 8, alignItems: 'flex-end' }}>
                <Field label="Name"><input type="text" value={c.name} onChange={e => { const next = [...certifications]; next[i] = { ...c, name: e.target.value }; set('certifications', next) }} /></Field>
                <Field label="Issuer"><input type="text" value={c.issuer} onChange={e => { const next = [...certifications]; next[i] = { ...c, issuer: e.target.value }; set('certifications', next) }} /></Field>
                <Field label="Year"><input type="number" value={c.year ?? ''} onChange={e => { const next = [...certifications]; next[i] = { ...c, year: e.target.value ? +e.target.value : null }; set('certifications', next) }} /></Field>
                <button className="btn-danger" style={{ flexShrink: 0, padding: '7px 10px', marginBottom: 14 }} onClick={() => set('certifications', certifications.filter((_, idx) => idx !== i))}>×</button>
              </div>
            ))}
            <button className="btn-secondary" onClick={() => set('certifications', [...certifications, { name: '', issuer: '', year: null }])}>+ Add certification</button>
          </Section>
        )
      case 'awards':
        return (
          <Section key={k} title="Awards" badge="cv" help="Optional. Honours and awards (non-academic) — shown on your CV." onHide={onHide}>
            {awards.map((a, i) => (
              <div key={i} className="card" style={{ marginBottom: 8, padding: '12px 18px' }}>
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <Field label="Name"><input type="text" value={a.name} onChange={e => { const next = [...awards]; next[i] = { ...a, name: e.target.value }; set('awards', next) }} /></Field>
                  <Field label="Year"><input type="number" value={a.year ?? ''} onChange={e => { const next = [...awards]; next[i] = { ...a, year: e.target.value ? +e.target.value : null }; set('awards', next) }} /></Field>
                  <button className="btn-danger" style={{ flexShrink: 0, padding: '7px 10px', marginBottom: 14 }} onClick={() => set('awards', awards.filter((_, idx) => idx !== i))}>×</button>
                </div>
                <Field label="Description (optional)"><input type="text" value={a.description ?? ''} onChange={e => { const next = [...awards]; next[i] = { ...a, description: e.target.value || undefined }; set('awards', next) }} /></Field>
              </div>
            ))}
            <button className="btn-secondary" onClick={() => set('awards', [...awards, { name: '', year: null, description: '' }])}>+ Add award</button>
          </Section>
        )
      case 'publications':
        return (
          <Section key={k} title="Publications" badge="cv" help="For academic/research roles. Paste the full APA citation; the AI can drop this section for non-academic jobs." onHide={onHide}>
            {pf.publications.map((pub, i) => (
              <PublicationCard key={i} pub={pub}
                onChange={u => { const next = [...pf.publications]; next[i] = u; set('publications', next) }}
                onRemove={() => set('publications', pf.publications.filter((_, idx) => idx !== i))} />
            ))}
            <button className="btn-secondary" onClick={() => set('publications', [...pf.publications, { citation: '', description: '' }])}>+ Add publication</button>
          </Section>
        )
      case 'grants':
        return (
          <Section key={k} title="Grants & Fellowships" badge="cv" help="For academic/research roles — shown in the CV sidebar." onHide={onHide}>
            {pf.grants.map((g, i) => (
              <GrantCard key={i} grant={g}
                onChange={u => { const next = [...pf.grants]; next[i] = u; set('grants', next) }}
                onRemove={() => set('grants', pf.grants.filter((_, idx) => idx !== i))} />
            ))}
            <button className="btn-secondary" onClick={() => set('grants', [...pf.grants, { year: null, year_start: null, year_end: null, name: '' } as Grant])}>+ Add grant</button>
          </Section>
        )
      case 'academic':
        return (
          <Section key={k} title="Academic Background" badge="ai" help="Not printed on your CV — helps the AI tailor and match research-oriented roles." onHide={onHide}>
            <Field label="Research areas"><TagInput value={pf.academic.research_areas} onChange={v => set('academic.research_areas', v)} /></Field>
            <Field label="Neural / brain analysis methods"><TagInput value={pf.academic.methods.neural_analyses} onChange={v => set('academic.methods.neural_analyses', v)} /></Field>
            <Field label="Computational modelling methods"><TagInput value={pf.academic.methods.computational_modelling} onChange={v => set('academic.methods.computational_modelling', v)} /></Field>
            <Field label="Data types used"><TagInput value={pf.academic.datasets_tools.data_types} onChange={v => set('academic.datasets_tools.data_types', v)} /></Field>
            <Field label="Tools used"><TagInput value={pf.academic.datasets_tools.tools} onChange={v => set('academic.datasets_tools.tools', v)} /></Field>
            <Field label="Interdisciplinary work"><TagInput value={pf.academic.interdisciplinary_work} onChange={v => set('academic.interdisciplinary_work', v)} /></Field>
            <Field label="Collaborators">
              {pf.academic.collaborators.map((c, i) => (
                <div key={i} className="row" style={{ marginBottom: 8 }}>
                  <input type="text" value={c.name} placeholder="Name" onChange={e => { const next = [...pf.academic.collaborators]; next[i] = { ...c, name: e.target.value }; set('academic.collaborators', next) }} />
                  <input type="text" value={c.affiliation} placeholder="Affiliation" onChange={e => { const next = [...pf.academic.collaborators]; next[i] = { ...c, affiliation: e.target.value }; set('academic.collaborators', next) }} />
                  <button className="btn-danger" style={{ flexShrink: 0, padding: '7px 10px' }} onClick={() => set('academic.collaborators', pf.academic.collaborators.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
              <button className="btn-secondary" onClick={() => set('academic.collaborators', [...pf.academic.collaborators, { name: '', affiliation: '' } as Collaborator])}>+ Add collaborator</button>
            </Field>
          </Section>
        )
      case 'teaching':
        return (
          <Section key={k} title="Teaching" badge="ai" help="Not printed on your CV — helps the AI tailor and match teaching roles." onHide={onHide}>
            <Field label="Subjects you can teach"><TagInput value={pf.teaching.subjects_to_teach} onChange={v => set('teaching.subjects_to_teach', v)} /></Field>
            <Field label="Student supervision"><textarea value={pf.teaching.student_supervision} onChange={e => set('teaching.student_supervision', e.target.value)} /></Field>
            <Field label="Mentoring"><textarea value={pf.teaching.mentoring} onChange={e => set('teaching.mentoring', e.target.value)} /></Field>
            <Field label="Educational materials created"><textarea value={pf.teaching.educational_materials} onChange={e => set('teaching.educational_materials', e.target.value)} /></Field>
            <Field label="Formal teaching roles">
              {pf.teaching.formal_experience.map((t, i) => (
                <div key={i} className="card" style={{ marginBottom: 8 }}>
                  <div className="row">
                    <Field label="Type"><input type="text" value={t.type} onChange={e => { const next = [...pf.teaching.formal_experience]; next[i] = { ...t, type: e.target.value }; set('teaching.formal_experience', next) }} /></Field>
                    <Field label="Course"><input type="text" value={t.course} onChange={e => { const next = [...pf.teaching.formal_experience]; next[i] = { ...t, course: e.target.value }; set('teaching.formal_experience', next) }} /></Field>
                  </div>
                  <div className="row">
                    <Field label="Institution"><input type="text" value={t.institution} onChange={e => { const next = [...pf.teaching.formal_experience]; next[i] = { ...t, institution: e.target.value }; set('teaching.formal_experience', next) }} /></Field>
                    <Field label="Years"><input type="text" value={t.years} onChange={e => { const next = [...pf.teaching.formal_experience]; next[i] = { ...t, years: e.target.value }; set('teaching.formal_experience', next) }} /></Field>
                  </div>
                  <Field label="Description"><textarea value={t.description} onChange={e => { const next = [...pf.teaching.formal_experience]; next[i] = { ...t, description: e.target.value }; set('teaching.formal_experience', next) }} /></Field>
                  <button className="btn-danger" onClick={() => set('teaching.formal_experience', pf.teaching.formal_experience.filter((_, idx) => idx !== i))}>Remove</button>
                </div>
              ))}
              <button className="btn-secondary" onClick={() => set('teaching.formal_experience', [...pf.teaching.formal_experience, { type: '', course: '', institution: '', years: '', description: '' } as FormalTeaching])}>+ Add</button>
            </Field>
            <Field label="Guest lectures">
              {pf.teaching.guest_lectures.map((g, i) => (
                <div key={i} className="row" style={{ marginBottom: 8 }}>
                  <input type="text" value={g.course} placeholder="Course" onChange={e => { const next = [...pf.teaching.guest_lectures]; next[i] = { ...g, course: e.target.value }; set('teaching.guest_lectures', next) }} />
                  <input type="text" value={g.institution} placeholder="Institution" onChange={e => { const next = [...pf.teaching.guest_lectures]; next[i] = { ...g, institution: e.target.value }; set('teaching.guest_lectures', next) }} />
                  <button className="btn-danger" style={{ flexShrink: 0, padding: '7px 10px' }} onClick={() => set('teaching.guest_lectures', pf.teaching.guest_lectures.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
              <button className="btn-secondary" onClick={() => set('teaching.guest_lectures', [...pf.teaching.guest_lectures, { course: '', institution: '' } as GuestLecture])}>+ Add</button>
            </Field>
          </Section>
        )
      case 'career_context':
        return (
          <Section key={k} title="Career preferences & AI context" badge="ai" help="Not printed on your CV — guides how the AI tailors your CV and suggestions." onHide={onHide}>
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
      <h1 className="page-title" style={{ marginBottom: 24 }}>Profile</h1>

      {/* ── CORE ── */}

      {/* Personal */}
      <Section title="Personal Info" badge="cv" help="Your name, contact details and links — shown at the top of every CV.">
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

      {/* Professional summary (the CV summary line) */}
      <Section title="Professional Summary" badge="cv" help="2–4 sentences shown at the top of your CV. When tailoring for a job, the AI rewrites this; what you put here is your default.">
        <Field label="Summary"><textarea value={pf.narrative.target_roles_description} onChange={e => set('narrative.target_roles_description', e.target.value)} style={{ minHeight: 100 }} /></Field>
      </Section>

      {/* Experience */}
      <Section title="Experience" badge="cv" help="Your roles, newest first. The bullet points become the body of your CV.">
        {pf.experience.map((exp, i) => (
          <ExperienceCard
            key={exp.id || i}
            exp={exp}
            onChange={updated => { const next = [...pf.experience]; next[i] = updated; set('experience', next) }}
            onRemove={() => set('experience', pf.experience.filter((_, idx) => idx !== i))}
          />
        ))}
        <button className="btn-secondary" onClick={() => set('experience', [...pf.experience, {
          id: `job-${Date.now()}`, title: '', employer: '', location: '', start_date: '',
          end_date: null, is_current: false, full_time: true, team_size: 1,
          reporting_structure: '', responsibilities: [], technical_difficulty: '',
          impact: '', technologies: [], mentored: false, presentations: [],
          achievements: [], relevance: { teaching: null, research: null, leadership: null, interdisciplinarity: null },
        }])}>+ Add job</button>
      </Section>

      {/* Skills */}
      <Section title="Skills" badge="cv" help="Grouped skill tags shown in your CV sidebar.">
        <Field label="Programming — production"><TagInput value={pf.skills.programming.production} onChange={v => set('skills.programming.production', v)} /></Field>
        <Field label="Programming — research / academic"><TagInput value={pf.skills.programming.research} onChange={v => set('skills.programming.research', v)} /></Field>
        <Field label="Visualisation"><TagInput value={pf.skills.visualization} onChange={v => set('skills.visualization', v)} /></Field>
        <Field label="AWS services"><TagInput value={pf.skills.cloud_devops.aws} onChange={v => set('skills.cloud_devops.aws', v)} /></Field>
        <Field label="DevOps tools"><TagInput value={pf.skills.cloud_devops.tools} onChange={v => set('skills.cloud_devops.tools', v)} /></Field>
        <Field label="Databases"><TagInput value={pf.skills.databases} onChange={v => set('skills.databases', v)} /></Field>
        <Field label="Big data"><TagInput value={pf.skills.big_data} onChange={v => set('skills.big_data', v)} /></Field>
        <Field label="ML / Statistical"><TagInput value={pf.skills.ml_statistical} onChange={v => set('skills.ml_statistical', v)} /></Field>
        <Field label="Current tools"><TagInput value={pf.skills.current_tools} onChange={v => set('skills.current_tools', v)} /></Field>
        <Field label="Languages">
          {pf.skills.languages.map((l, i) => (
            <div key={i} className="row" style={{ marginBottom: 8, alignItems: 'center' }}>
              <input type="text" value={l.language} placeholder="Language" onChange={e => { const next = [...pf.skills.languages]; next[i] = { ...l, language: e.target.value }; set('skills.languages', next) }} />
              <input type="text" value={l.label} placeholder="Label (e.g. Fluent)" onChange={e => { const next = [...pf.skills.languages]; next[i] = { ...l, label: e.target.value }; set('skills.languages', next) }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ marginBottom: 2 }}>Level (1–5)</label>
                <input type="number" min={1} max={5} value={l.level} style={{ width: 70 }} onChange={e => { const next = [...pf.skills.languages]; next[i] = { ...l, level: +e.target.value }; set('skills.languages', next) }} />
              </div>
              <button className="btn-danger" style={{ flexShrink: 0, padding: '7px 10px', marginTop: 18 }} onClick={() => set('skills.languages', pf.skills.languages.filter((_, idx) => idx !== i))}>×</button>
            </div>
          ))}
          <button className="btn-secondary" onClick={() => set('skills.languages', [...pf.skills.languages, { language: '', level: 3, label: '' } as LanguageSkill])}>+ Add language</button>
        </Field>
      </Section>

      {/* Education */}
      <Section title="Education" badge="cv" help="Degrees, newest first — shown in your CV sidebar.">
        {pf.education.map((edu, i) => (
          <EducationCard
            key={i}
            edu={edu}
            onChange={updated => { const next = [...pf.education]; next[i] = updated; set('education', next) }}
            onRemove={() => set('education', pf.education.filter((_, idx) => idx !== i))}
          />
        ))}
        <button className="btn-secondary" onClick={() => set('education', [...pf.education, {
          degree: '', field: '', institution: '', location: '', start_year: new Date().getFullYear(), end_year: null, distinction: null,
        }])}>+ Add education</button>
      </Section>

      {/* Work Preferences (core — drives job matching & motivational letters) */}
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
        <div className="add-section">
          <button className="btn-secondary" onClick={() => setMenuOpen(o => !o)}>+ Add a section {menuOpen ? '▴' : '▾'}</button>
          {menuOpen && (
            <div className="add-section-menu">
              {hidden.map(k => (
                <button key={k} onClick={() => addSection(k)}>{OPTIONAL_LABELS[k]}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          position: 'sticky', bottom: 0, marginTop: 16,
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12,
          padding: '14px 16px',
          background: 'var(--surface)', borderTop: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        {saved && <span className="success-msg">Saved!</span>}
        {error && <span className="error-msg">{error}</span>}
        <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>
          Saves every section of your pf.
        </span>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving && <span className="spinner" />}{saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </div>
  )
}
