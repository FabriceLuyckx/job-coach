import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import type {
  Profile, Experience, Education, Publication, Grant,
  FormalTeaching, GuestLecture, Collaborator, LanguageSkill,
} from '../types'
import TagInput from '../components/TagInput'
import BulletListEditor from '../components/BulletListEditor'

// ── helpers ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="card">
      <div className="section-header" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span className="section-title">{title}</span>
        <span style={{ color: 'var(--muted)', fontSize: 18 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && <div>{children}</div>}
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

// ── Experience form ──────────────────────────────────────────────────────────

function ExperienceCard({
  exp, onChange, onRemove,
}: { exp: Experience; onChange: (e: Experience) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Experience, v: unknown) => onChange({ ...exp, [k]: v })

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="section-header" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontWeight: 600 }}>{exp.title || '(untitled)'} — {exp.employer || '…'}</span>
        <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
          <button className="btn-danger" onClick={onRemove}>Remove</button>
          <span style={{ cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }} onClick={() => setOpen(o => !o)}>{open ? '▾' : '▸'}</span>
        </div>
      </div>
      {open && (
        <div>
          <div className="row">
            <Field label="Job title"><input type="text" value={exp.title} onChange={e => set('title', e.target.value)} /></Field>
            <Field label="Employer"><input type="text" value={exp.employer} onChange={e => set('employer', e.target.value)} /></Field>
          </div>
          <div className="row">
            <Field label="Location"><input type="text" value={exp.location} onChange={e => set('location', e.target.value)} /></Field>
            <Field label="ID (slug)"><input type="text" value={exp.id} onChange={e => set('id', e.target.value)} /></Field>
          </div>
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
          <Field label="Responsibilities"><BulletListEditor value={exp.responsibilities} onChange={v => set('responsibilities', v)} /></Field>
          <Field label="Achievements"><BulletListEditor value={exp.achievements} onChange={v => set('achievements', v)} /></Field>
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
            <label style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 13, marginBottom: 8, display: 'block' }}>Relevance notes</label>
            {(['teaching', 'research', 'leadership', 'interdisciplinarity'] as const).map(k => (
              <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
                <textarea
                  value={exp.relevance[k] ?? ''}
                  onChange={e => set('relevance', { ...exp.relevance, [k]: e.target.value || null })}
                />
              </Field>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Education form ───────────────────────────────────────────────────────────

function EducationCard({ edu, onChange, onRemove }: { edu: Education; onChange: (e: Education) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Education, v: unknown) => onChange({ ...edu, [k]: v })
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="section-header" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontWeight: 600 }}>{edu.degree} — {edu.institution}</span>
        <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
          <button className="btn-danger" onClick={onRemove}>Remove</button>
          <span style={{ cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }}>{open ? '▾' : '▸'}</span>
        </div>
      </div>
      {open && (
        <div>
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
        </div>
      )}
    </div>
  )
}

// ── Publication form ─────────────────────────────────────────────────────────

function PublicationCard({ pub, onChange, onRemove }: { pub: Publication; onChange: (p: Publication) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Publication, v: unknown) => onChange({ ...pub, [k]: v })
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="section-header" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontWeight: 600, fontStyle: 'italic' }}>{pub.title || '(untitled)'}</span>
        <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
          <button className="btn-danger" onClick={onRemove}>Remove</button>
          <span style={{ cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }}>{open ? '▾' : '▸'}</span>
        </div>
      </div>
      {open && (
        <div>
          <Field label="Title"><input type="text" value={pub.title} onChange={e => set('title', e.target.value)} /></Field>
          <Field label="Authors (one per line)">
            <textarea
              value={pub.authors.join('\n')}
              onChange={e => set('authors', e.target.value.split('\n').filter(Boolean))}
            />
          </Field>
          <div className="row">
            <Field label="Year"><input type="number" value={pub.year} onChange={e => set('year', +e.target.value)} /></Field>
            <Field label="Journal"><input type="text" value={pub.journal} onChange={e => set('journal', e.target.value)} /></Field>
          </div>
          <div className="row">
            <Field label="Volume"><input type="text" value={pub.volume ?? ''} onChange={e => set('volume', e.target.value || undefined)} /></Field>
            <Field label="Issue"><input type="text" value={pub.issue ?? ''} onChange={e => set('issue', e.target.value || undefined)} /></Field>
            <Field label="Pages"><input type="text" value={pub.pages ?? ''} onChange={e => set('pages', e.target.value || undefined)} /></Field>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Grant form ───────────────────────────────────────────────────────────────

function GrantCard({ grant, onChange, onRemove }: { grant: Grant; onChange: (g: Grant) => void; onRemove: () => void }) {
  const set = (k: keyof Grant, v: unknown) => onChange({ ...grant, [k]: v })
  return (
    <div className="card" style={{ marginBottom: 10, padding: '12px 18px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Field label="Name"><input type="text" value={grant.name} onChange={e => set('name', e.target.value)} /></Field>
          <div className="row">
            <Field label="Year (single)"><input type="number" value={grant.year ?? ''} onChange={e => set('year', e.target.value ? +e.target.value : null)} /></Field>
            <Field label="Year start"><input type="number" value={grant.year_start ?? ''} onChange={e => set('year_start', e.target.value ? +e.target.value : null)} /></Field>
            <Field label="Year end"><input type="number" value={grant.year_end ?? ''} onChange={e => set('year_end', e.target.value ? +e.target.value : null)} /></Field>
          </div>
        </div>
        <button className="btn-danger" style={{ marginTop: 20 }} onClick={onRemove}>×</button>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api.getProfile().then(setProfile).catch(e => setError(e.message)) }, [])

  const save = useCallback(async () => {
    if (!profile) return
    setSaving(true); setError(''); setSaved(false)
    try {
      await api.putProfile(profile)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }, [profile])

  if (!profile) return <div style={{ padding: 32, color: 'var(--muted)' }}>{error || 'Loading…'}</div>

  const set = (path: string, value: unknown) => {
    setProfile(prev => {
      if (!prev) return prev
      const next = { ...prev }
      const parts = path.split('.')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let obj: any = next
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] }
        obj = obj[parts[i]]
      }
      obj[parts[parts.length - 1]] = value
      return next
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Profile</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saved && <span className="success-msg">Saved!</span>}
          {error && <span className="error-msg">{error}</span>}
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving && <span className="spinner" />}{saving ? 'Saving…' : 'Save all'}
          </button>
        </div>
      </div>

      {/* Personal */}
      <Section title="Personal Info">
        <div className="row">
          <Field label="Full name"><input type="text" value={profile.personal.name} onChange={e => set('personal.name', e.target.value)} /></Field>
          <Field label="Professional title"><input type="text" value={profile.personal.professional_title} onChange={e => set('personal.professional_title', e.target.value)} /></Field>
        </div>
        <div className="row">
          <Field label="Email"><input type="email" value={profile.personal.email} onChange={e => set('personal.email', e.target.value)} /></Field>
          <Field label="Phone"><input type="tel" value={profile.personal.phone} onChange={e => set('personal.phone', e.target.value)} /></Field>
        </div>
        <div className="row">
          <Field label="City"><input type="text" value={profile.personal.location.city} onChange={e => set('personal.location.city', e.target.value)} /></Field>
          <Field label="Country"><input type="text" value={profile.personal.location.country} onChange={e => set('personal.location.country', e.target.value)} /></Field>
        </div>
        <Field label="Keywords"><TagInput value={profile.personal.keywords} onChange={v => set('personal.keywords', v)} /></Field>
        <div className="row">
          <Field label="LinkedIn URL"><input type="url" value={profile.personal.links.linkedin ?? ''} onChange={e => set('personal.links.linkedin', e.target.value)} /></Field>
          <Field label="GitHub URL"><input type="url" value={profile.personal.links.github ?? ''} onChange={e => set('personal.links.github', e.target.value)} /></Field>
          <Field label="Google Scholar URL"><input type="url" value={profile.personal.links.google_scholar ?? ''} onChange={e => set('personal.links.google_scholar', e.target.value)} /></Field>
        </div>
      </Section>

      {/* Narrative */}
      <Section title="Narrative & Career Goals">
        <Field label="What kind of role do you want?"><textarea value={profile.narrative.target_roles_description} onChange={e => set('narrative.target_roles_description', e.target.value)} style={{ minHeight: 100 }} /></Field>
        <Field label="Target industries"><TagInput value={profile.narrative.target_industries} onChange={v => set('narrative.target_industries', v)} /></Field>
        <Field label="What differentiates you?"><textarea value={profile.narrative.differentiation} onChange={e => set('narrative.differentiation', e.target.value)} /></Field>
        <Field label="Problems you enjoy solving"><textarea value={profile.narrative.problems_enjoyed} onChange={e => set('narrative.problems_enjoyed', e.target.value)} /></Field>
        <Field label="Topics you like to teach"><TagInput value={profile.narrative.topics_to_teach} onChange={v => set('narrative.topics_to_teach', v)} /></Field>
        <Field label="Research themes"><textarea value={profile.narrative.research_themes} onChange={e => set('narrative.research_themes', e.target.value)} /></Field>
        <Field label="Work to avoid"><textarea value={profile.narrative.work_to_avoid} onChange={e => set('narrative.work_to_avoid', e.target.value)} /></Field>
      </Section>

      {/* Experience */}
      <Section title="Experience">
        {profile.experience.map((exp, i) => (
          <ExperienceCard
            key={exp.id || i}
            exp={exp}
            onChange={updated => {
              const next = [...profile.experience]
              next[i] = updated
              set('experience', next)
            }}
            onRemove={() => set('experience', profile.experience.filter((_, idx) => idx !== i))}
          />
        ))}
        <button className="btn-secondary" onClick={() => set('experience', [...profile.experience, {
          id: `job-${Date.now()}`, title: '', employer: '', location: '', start_date: '',
          end_date: null, is_current: false, full_time: true, team_size: 1,
          reporting_structure: '', responsibilities: [], technical_difficulty: '',
          impact: '', technologies: [], mentored: false, presentations: [],
          achievements: [], relevance: { teaching: null, research: null, leadership: null, interdisciplinarity: null },
        }])}>+ Add job</button>
      </Section>

      {/* Education */}
      <Section title="Education">
        {profile.education.map((edu, i) => (
          <EducationCard
            key={i}
            edu={edu}
            onChange={updated => {
              const next = [...profile.education]; next[i] = updated; set('education', next)
            }}
            onRemove={() => set('education', profile.education.filter((_, idx) => idx !== i))}
          />
        ))}
        <button className="btn-secondary" onClick={() => set('education', [...profile.education, {
          degree: '', field: '', institution: '', location: '', start_year: new Date().getFullYear(), end_year: null, distinction: null,
        }])}>+ Add education</button>
      </Section>

      {/* Academic */}
      <Section title="Academic Background">
        <Field label="Research areas"><TagInput value={profile.academic.research_areas} onChange={v => set('academic.research_areas', v)} /></Field>
        <Field label="Neural / brain analysis methods"><TagInput value={profile.academic.methods.neural_analyses} onChange={v => set('academic.methods.neural_analyses', v)} /></Field>
        <Field label="Computational modelling methods"><TagInput value={profile.academic.methods.computational_modelling} onChange={v => set('academic.methods.computational_modelling', v)} /></Field>
        <Field label="Data types used"><TagInput value={profile.academic.datasets_tools.data_types} onChange={v => set('academic.datasets_tools.data_types', v)} /></Field>
        <Field label="Tools used"><TagInput value={profile.academic.datasets_tools.tools} onChange={v => set('academic.datasets_tools.tools', v)} /></Field>
        <Field label="Interdisciplinary work"><TagInput value={profile.academic.interdisciplinary_work} onChange={v => set('academic.interdisciplinary_work', v)} /></Field>
        <Field label="Collaborators">
          {profile.academic.collaborators.map((c, i) => (
            <div key={i} className="row" style={{ marginBottom: 8 }}>
              <input type="text" value={c.name} placeholder="Name" onChange={e => {
                const next = [...profile.academic.collaborators]
                next[i] = { ...c, name: e.target.value }
                set('academic.collaborators', next)
              }} />
              <input type="text" value={c.affiliation} placeholder="Affiliation" onChange={e => {
                const next = [...profile.academic.collaborators]
                next[i] = { ...c, affiliation: e.target.value }
                set('academic.collaborators', next)
              }} />
              <button className="btn-danger" style={{ flexShrink: 0, padding: '7px 10px' }} onClick={() => set('academic.collaborators', profile.academic.collaborators.filter((_, idx) => idx !== i))}>×</button>
            </div>
          ))}
          <button className="btn-secondary" onClick={() => set('academic.collaborators', [...profile.academic.collaborators, { name: '', affiliation: '' } as Collaborator])}>+ Add collaborator</button>
        </Field>
      </Section>

      {/* Publications */}
      <Section title="Publications">
        {profile.publications.map((pub, i) => (
          <PublicationCard
            key={i}
            pub={pub}
            onChange={updated => { const next = [...profile.publications]; next[i] = updated; set('publications', next) }}
            onRemove={() => set('publications', profile.publications.filter((_, idx) => idx !== i))}
          />
        ))}
        <button className="btn-secondary" onClick={() => set('publications', [...profile.publications, {
          authors: [], year: new Date().getFullYear(), title: '', journal: '',
        }])}>+ Add publication</button>
      </Section>

      {/* Grants */}
      <Section title="Grants & Fellowships">
        {profile.grants.map((g, i) => (
          <GrantCard
            key={i}
            grant={g}
            onChange={updated => { const next = [...profile.grants]; next[i] = updated; set('grants', next) }}
            onRemove={() => set('grants', profile.grants.filter((_, idx) => idx !== i))}
          />
        ))}
        <button className="btn-secondary" onClick={() => set('grants', [...profile.grants, { year: null, year_start: null, year_end: null, name: '' } as Grant])}>+ Add grant</button>
      </Section>

      {/* Teaching */}
      <Section title="Teaching">
        <Field label="Subjects you can teach"><TagInput value={profile.teaching.subjects_to_teach} onChange={v => set('teaching.subjects_to_teach', v)} /></Field>
        <Field label="Student supervision"><textarea value={profile.teaching.student_supervision} onChange={e => set('teaching.student_supervision', e.target.value)} /></Field>
        <Field label="Mentoring"><textarea value={profile.teaching.mentoring} onChange={e => set('teaching.mentoring', e.target.value)} /></Field>
        <Field label="Educational materials created"><textarea value={profile.teaching.educational_materials} onChange={e => set('teaching.educational_materials', e.target.value)} /></Field>
        <Field label="Formal teaching roles">
          {profile.teaching.formal_experience.map((t, i) => (
            <div key={i} className="card" style={{ marginBottom: 8 }}>
              <div className="row">
                <Field label="Type"><input type="text" value={t.type} onChange={e => {
                  const next = [...profile.teaching.formal_experience]; next[i] = { ...t, type: e.target.value }; set('teaching.formal_experience', next)
                }} /></Field>
                <Field label="Course"><input type="text" value={t.course} onChange={e => {
                  const next = [...profile.teaching.formal_experience]; next[i] = { ...t, course: e.target.value }; set('teaching.formal_experience', next)
                }} /></Field>
              </div>
              <div className="row">
                <Field label="Institution"><input type="text" value={t.institution} onChange={e => {
                  const next = [...profile.teaching.formal_experience]; next[i] = { ...t, institution: e.target.value }; set('teaching.formal_experience', next)
                }} /></Field>
                <Field label="Years"><input type="text" value={t.years} onChange={e => {
                  const next = [...profile.teaching.formal_experience]; next[i] = { ...t, years: e.target.value }; set('teaching.formal_experience', next)
                }} /></Field>
              </div>
              <Field label="Description"><textarea value={t.description} onChange={e => {
                const next = [...profile.teaching.formal_experience]; next[i] = { ...t, description: e.target.value }; set('teaching.formal_experience', next)
              }} /></Field>
              <button className="btn-danger" onClick={() => set('teaching.formal_experience', profile.teaching.formal_experience.filter((_, idx) => idx !== i))}>Remove</button>
            </div>
          ))}
          <button className="btn-secondary" onClick={() => set('teaching.formal_experience', [...profile.teaching.formal_experience, { type: '', course: '', institution: '', years: '', description: '' } as FormalTeaching])}>+ Add</button>
        </Field>
        <Field label="Guest lectures">
          {profile.teaching.guest_lectures.map((g, i) => (
            <div key={i} className="row" style={{ marginBottom: 8 }}>
              <input type="text" value={g.course} placeholder="Course" onChange={e => {
                const next = [...profile.teaching.guest_lectures]; next[i] = { ...g, course: e.target.value }; set('teaching.guest_lectures', next)
              }} />
              <input type="text" value={g.institution} placeholder="Institution" onChange={e => {
                const next = [...profile.teaching.guest_lectures]; next[i] = { ...g, institution: e.target.value }; set('teaching.guest_lectures', next)
              }} />
              <button className="btn-danger" style={{ flexShrink: 0, padding: '7px 10px' }} onClick={() => set('teaching.guest_lectures', profile.teaching.guest_lectures.filter((_, idx) => idx !== i))}>×</button>
            </div>
          ))}
          <button className="btn-secondary" onClick={() => set('teaching.guest_lectures', [...profile.teaching.guest_lectures, { course: '', institution: '' } as GuestLecture])}>+ Add</button>
        </Field>
      </Section>

      {/* Skills */}
      <Section title="Skills">
        <Field label="Programming — production"><TagInput value={profile.skills.programming.production} onChange={v => set('skills.programming.production', v)} /></Field>
        <Field label="Programming — research / academic"><TagInput value={profile.skills.programming.research} onChange={v => set('skills.programming.research', v)} /></Field>
        <Field label="Visualisation"><TagInput value={profile.skills.visualization} onChange={v => set('skills.visualization', v)} /></Field>
        <Field label="AWS services"><TagInput value={profile.skills.cloud_devops.aws} onChange={v => set('skills.cloud_devops.aws', v)} /></Field>
        <Field label="DevOps tools"><TagInput value={profile.skills.cloud_devops.tools} onChange={v => set('skills.cloud_devops.tools', v)} /></Field>
        <Field label="Databases"><TagInput value={profile.skills.databases} onChange={v => set('skills.databases', v)} /></Field>
        <Field label="Big data"><TagInput value={profile.skills.big_data} onChange={v => set('skills.big_data', v)} /></Field>
        <Field label="ML / Statistical"><TagInput value={profile.skills.ml_statistical} onChange={v => set('skills.ml_statistical', v)} /></Field>
        <Field label="Current tools"><TagInput value={profile.skills.current_tools} onChange={v => set('skills.current_tools', v)} /></Field>
        <Field label="Languages">
          {profile.skills.languages.map((l, i) => (
            <div key={i} className="row" style={{ marginBottom: 8, alignItems: 'center' }}>
              <input type="text" value={l.language} placeholder="Language" onChange={e => {
                const next = [...profile.skills.languages]; next[i] = { ...l, language: e.target.value }; set('skills.languages', next)
              }} />
              <input type="text" value={l.label} placeholder="Label (e.g. Fluent)" onChange={e => {
                const next = [...profile.skills.languages]; next[i] = { ...l, label: e.target.value }; set('skills.languages', next)
              }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ marginBottom: 2 }}>Level (1–5)</label>
                <input type="number" min={1} max={5} value={l.level} style={{ width: 70 }} onChange={e => {
                  const next = [...profile.skills.languages]; next[i] = { ...l, level: +e.target.value }; set('skills.languages', next)
                }} />
              </div>
              <button className="btn-danger" style={{ flexShrink: 0, padding: '7px 10px', marginTop: 18 }} onClick={() => set('skills.languages', profile.skills.languages.filter((_, idx) => idx !== i))}>×</button>
            </div>
          ))}
          <button className="btn-secondary" onClick={() => set('skills.languages', [...profile.skills.languages, { language: '', level: 3, label: '' } as LanguageSkill])}>+ Add language</button>
        </Field>
      </Section>

      {/* Work Preferences */}
      <Section title="Work Preferences">
        <Field label="Commute radius (cities)"><TagInput value={profile.work_preferences.commute_radius} onChange={v => set('work_preferences.commute_radius', v)} /></Field>
        <Field label="Remote / hybrid / on-site">
          <select value={profile.work_preferences.remote_hybrid} onChange={e => set('work_preferences.remote_hybrid', e.target.value)}>
            <option>Remote</option><option>Hybrid</option><option>On-site</option>
          </select>
        </Field>
        <Field label="Institution type preference"><input type="text" value={profile.work_preferences.institution_type_preference} onChange={e => set('work_preferences.institution_type_preference', e.target.value)} /></Field>
        <Field label="Research vs teaching preference"><input type="text" value={profile.work_preferences.research_vs_teaching} onChange={e => set('work_preferences.research_vs_teaching', e.target.value)} /></Field>
        <Field label="Leadership interest"><input type="text" value={profile.work_preferences.leadership_interest} onChange={e => set('work_preferences.leadership_interest', e.target.value)} /></Field>
        <div className="row">
          <Field label="Schedule"><input type="text" value={profile.work_preferences.schedule} onChange={e => set('work_preferences.schedule', e.target.value)} /></Field>
          <Field label="Relocation"><input type="text" value={profile.work_preferences.relocation} onChange={e => set('work_preferences.relocation', e.target.value)} /></Field>
        </div>
        <Field label="Language preferences"><TagInput value={profile.work_preferences.language_preferences} onChange={v => set('work_preferences.language_preferences', v)} /></Field>
        <div className="row">
          <Field label="Current gross salary (€/month)"><input type="number" value={profile.work_preferences.salary_current_gross} onChange={e => set('work_preferences.salary_current_gross', +e.target.value)} /></Field>
          <Field label="Mobility budget (€/month)"><input type="number" value={profile.work_preferences.salary_mobility_budget} onChange={e => set('work_preferences.salary_mobility_budget', +e.target.value)} /></Field>
        </div>
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        {saved && <span className="success-msg">Saved!</span>}
        {error && <span className="error-msg">{error}</span>}
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving && <span className="spinner" />}{saving ? 'Saving…' : 'Save all'}
        </button>
      </div>
    </div>
  )
}
