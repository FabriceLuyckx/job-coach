// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useState, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FileUp, PencilLine, Upload } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import type {
  Profile, Experience, Education, Publication, Grant,
  TeachingEntry, Project,
  Volunteering, CustomSection, Link as ProfileLink,
} from '../types'
import TagInput from '../components/TagInput'
import BulletListEditor from '../components/BulletListEditor'
import Button from '../components/Button'
import RemoveButton from '../components/RemoveButton'
import SaveStatus from '../components/SaveStatus'
import StarRating from '../components/StarRating'
import Collapsible from '../components/Collapsible'
import ReorderableList from '../components/ReorderableList'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { Section, Field } from '../components/ProfileSection'
import { useToast } from '../components/Toast'
import { useKeyStatus } from '../components/KeyStatus'
import { errMsg } from '../lib/errors'
import { useProfileAutosave } from '../lib/useProfileAutosave'
import { OPTIONAL_SECTIONS, OPTIONAL_BY_KEY } from '../lib/profileSections'

// CEFR levels. The CODE is what gets stored on the profile — it's an
// international standard, so it reads correctly on a CV in any language. The
// English descriptor that used to be written here ("B2/C1 Advanced") is profile
// *data* printed on the CV, so it leaked English onto Dutch CVs; the descriptor
// is now UI-only and translated (`profile.skills.cefr.<n>`).
const CEFR_CODES: Record<number, string> = {
  1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2/C1', 5: 'C2',
}

const LINK_SUGGESTIONS = ['LinkedIn', 'GitHub', 'Portfolio', 'Website', 'Google Scholar', 'Behance', 'Dribbble', 'ORCID']

const SKILL_GROUP_SUGGESTIONS = ['Technical skills', 'Tools & software', 'Soft skills', 'Methods', 'Certifiable skills']

const TEACHING_TYPES = [
  'course_instructor', 'guest_lecture', 'tutorials_seminars',
  'workshop_training', 'supervision', 'other',
] as const

// ── helpers ─────────────────────────────────────────────────────────────────

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
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const set = (k: keyof Experience, v: unknown) => onChange({ ...exp, [k]: v })
  // Derived, not seeded state: `end_date === null` IS "currently here" per the
  // schema. Held in useState it desynced from the row on reorder (index-keyed
  // lists reuse instances by position), locking a finished role's End date.
  // Note `''` is deliberately NOT current — that's "not finished typing yet",
  // which is what unchecking the box writes.
  const current = exp.end_date === null

  return (
    <ItemCard summary={`${exp.title || t('profile.untitled')} — ${exp.employer || '…'}`} open={open} setOpen={setOpen} onRemove={onRemove} handle={handle}>
      <div className="row">
        <Field label={t('profile.fields.jobTitle')}><input type="text" value={exp.title} onChange={e => set('title', e.target.value)} /></Field>
        <Field label={t('profile.fields.employer')}><input type="text" value={exp.employer} onChange={e => set('employer', e.target.value)} /></Field>
      </div>
      <Field label={t('profile.fields.location')}><input type="text" value={exp.location} onChange={e => set('location', e.target.value)} /></Field>
      <div className="row">
        <Field label={t('profile.fields.startDate')}><input type="month" placeholder={t('profile.fields.monthPlaceholder')} value={exp.start_date} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label={t('profile.fields.endDate')}>
          <input type="month" placeholder={t('profile.fields.monthPlaceholder')} value={exp.end_date ?? ''} disabled={current}
            onChange={e => set('end_date', e.target.value || null)} />
        </Field>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={current} onChange={e => set('end_date', e.target.checked ? null : '')} />
        {t('profile.currentlyWorkHere')}
      </label>
      <Field label={t('profile.fields.whatYouDid')}>
        <BulletListEditor value={exp.responsibilities} onChange={v => set('responsibilities', v)} placeholder={t('profile.fields.responsibilityPlaceholder')} reorder format />
      </Field>
    </ItemCard>
  )
}

// ── Education form ───────────────────────────────────────────────────────────

function EducationCard({ edu, onChange, onRemove, handle }: { edu: Education; onChange: (e: Education) => void; onRemove: () => void; handle?: ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const set = (k: keyof Education, v: unknown) => onChange({ ...edu, [k]: v })
  return (
    <ItemCard summary={`${edu.degree || t('profile.fields.degreePlaceholder')} — ${edu.institution || '…'}`} open={open} setOpen={setOpen} onRemove={onRemove} handle={handle}>
      <div className="row">
        <Field label={t('profile.fields.degree')}><input type="text" value={edu.degree} onChange={e => set('degree', e.target.value)} /></Field>
        <Field label={t('profile.fields.field')}><input type="text" value={edu.field} onChange={e => set('field', e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label={t('profile.fields.institution')}><input type="text" value={edu.institution} onChange={e => set('institution', e.target.value)} /></Field>
        <Field label={t('profile.fields.location')}><input type="text" value={edu.location} onChange={e => set('location', e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label={t('profile.fields.startYear')}>{/* `|| ''` so a cleared field shows blank, not the 0 that `+''` yields */}
          <input type="number" min={1900} max={2100} value={edu.start_year ?? ''}
            onChange={e => set('start_year', e.target.value ? +e.target.value : null)} /></Field>
        <Field label={t('profile.fields.endYear')}><input type="number" min={1900} max={2100} value={edu.end_year ?? ''} onChange={e => set('end_year', e.target.value ? +e.target.value : null)} /></Field>
      </div>
      <Field label={t('profile.fields.distinctionOptional')}><input type="text" value={edu.distinction ?? ''} onChange={e => set('distinction', e.target.value || null)} /></Field>
      <Field label={t('profile.fields.educationDescriptionOptional')}>
        <textarea value={edu.description ?? ''} onChange={e => set('description', e.target.value)} placeholder={t('profile.fields.educationDescriptionPlaceholder')} />
      </Field>
    </ItemCard>
  )
}

// ── Publication form ─────────────────────────────────────────────────────────

function PublicationCard({ pub, onChange, onRemove, handle }: { pub: Publication; onChange: (p: Publication) => void; onRemove: () => void; handle?: ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const set = (k: keyof Publication, v: unknown) => onChange({ ...pub, [k]: v })
  return (
    <ItemCard summary={pub.citation || t('profile.newPublication')} italic open={open} setOpen={setOpen} onRemove={onRemove} handle={handle}>
      <Field label={t('profile.fields.apaCitation')}>
        <textarea value={pub.citation} onChange={e => set('citation', e.target.value)}
          placeholder="Doe, J., & Smith, J. (2020). Title of the paper. Journal Name, 12(3), 45–67."
          style={{ minHeight: 70 }} />
      </Field>
      <Field label={t('profile.fields.shortDescription')}>
        <input type="text" value={pub.description ?? ''} onChange={e => set('description', e.target.value || undefined)} placeholder={t('profile.fields.whyMatters')} />
      </Field>
      <Field label={t('profile.fields.url')}>
        <input type="url" value={pub.url ?? ''} onChange={e => set('url', e.target.value || undefined)} placeholder="https://doi.org/…" />
      </Field>
    </ItemCard>
  )
}

// ── Project form ─────────────────────────────────────────────────────────────

function ProjectCard({ proj, onChange, onRemove, handle }: { proj: Project; onChange: (p: Project) => void; onRemove: () => void; handle?: ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const set = (k: keyof Project, v: unknown) => onChange({ ...proj, [k]: v })
  return (
    <ItemCard summary={proj.name || t('profile.newProject')} open={open} setOpen={setOpen} onRemove={onRemove} handle={handle}>
      <div className="row">
        <Field label={t('profile.fields.name')}><input type="text" value={proj.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label={t('profile.fields.url')}><input type="url" value={proj.url ?? ''} onChange={e => set('url', e.target.value || undefined)} /></Field>
      </div>
      <Field label={t('profile.fields.description')}><textarea value={proj.description} placeholder={t('profile.fields.projectDescriptionPlaceholder')} onChange={e => set('description', e.target.value)} /></Field>
      <Field label={t('profile.fields.technologies')}><TagInput value={proj.technologies} onChange={v => set('technologies', v)} /></Field>
    </ItemCard>
  )
}

// ── Volunteering form ────────────────────────────────────────────────────────

function VolunteeringCard({ vol, onChange, onRemove, handle }: { vol: Volunteering; onChange: (v: Volunteering) => void; onRemove: () => void; handle?: ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const set = (k: keyof Volunteering, v: unknown) => onChange({ ...vol, [k]: v })
  // Derived, not seeded state: `end_date === null` IS "currently here" per the
  // schema. Held in useState it desynced from the row on reorder (index-keyed
  // lists reuse instances by position), locking a finished role's End date.
  // Note `''` is deliberately NOT current — that's "not finished typing yet",
  // which is what unchecking the box writes.
  const current = vol.end_date === null
  return (
    <ItemCard summary={`${vol.role || t('profile.fields.role')} — ${vol.organisation || '…'}`} open={open} setOpen={setOpen} onRemove={onRemove} handle={handle}>
      <div className="row">
        <Field label={t('profile.fields.role')}><input type="text" value={vol.role} onChange={e => set('role', e.target.value)} /></Field>
        <Field label={t('profile.fields.organisation')}><input type="text" value={vol.organisation} onChange={e => set('organisation', e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label={t('profile.fields.startDate')}><input type="month" placeholder={t('profile.fields.monthPlaceholder')} value={vol.start_date} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label={t('profile.fields.endDate')}><input type="month" placeholder={t('profile.fields.monthPlaceholder')} value={vol.end_date ?? ''} disabled={current} onChange={e => set('end_date', e.target.value || null)} /></Field>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={current} onChange={e => set('end_date', e.target.checked ? null : '')} />
        {t('profile.currentlyVolunteering')}
      </label>
      <Field label={t('profile.fields.description')}><textarea value={vol.description} onChange={e => set('description', e.target.value)} /></Field>
    </ItemCard>
  )
}

// ── Grant form ───────────────────────────────────────────────────────────────

function GrantCard({ grant, onChange, onRemove }: { grant: Grant; onChange: (g: Grant) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const set = (k: keyof Grant, v: unknown) => onChange({ ...grant, [k]: v })
  return (
    <div className="card" style={{ marginBottom: 'var(--space-3)', padding: '12px 18px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="row">
            <Field label={t('profile.fields.name')}><input type="text" value={grant.name} onChange={e => set('name', e.target.value)} /></Field>
            <Field label={t('profile.fields.years')}><input type="text" value={grant.years} placeholder="2021 or 2019–2021" onChange={e => set('years', e.target.value)} /></Field>
          </div>
          <div className="row">
            <Field label={t('profile.fields.funderOptional')}><input type="text" value={grant.funder} onChange={e => set('funder', e.target.value)} /></Field>
            <Field label={t('profile.fields.amountOptional')}><input type="text" value={grant.amount} placeholder="€25 000" onChange={e => set('amount', e.target.value)} /></Field>
          </div>
        </div>
        <div style={{ marginTop: 20 }}><RemoveButton onClick={onRemove} /></div>
      </div>
    </div>
  )
}

// ── Custom section editor ────────────────────────────────────────────────────

function CustomSectionCard({ sec, onChange, onRemove }: { sec: CustomSection; onChange: (s: CustomSection) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const setItem = (i: number, patch: Partial<CustomSection['items'][number]>) => {
    const items = [...sec.items]; items[i] = { ...items[i], ...patch }; onChange({ ...sec, items })
  }
  return (
    <ItemCard summary={sec.title || t('profile.untitledSection')} open={open} setOpen={setOpen} onRemove={onRemove}>
      <Field label={t('profile.fields.sectionTitle')}><input type="text" value={sec.title} onChange={e => onChange({ ...sec, title: e.target.value })} placeholder="e.g. Licences, Exhibitions, Military service" /></Field>
      {sec.items.map((it, i) => (
        <div key={i} className="card" style={{ marginBottom: 'var(--space-2)', padding: '12px 18px', position: 'relative', paddingRight: 'var(--space-8)' }}>
          <div style={{ position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)' }}>
            <RemoveButton onClick={() => onChange({ ...sec, items: sec.items.filter((_, idx) => idx !== i) })} />
          </div>
          <div className="row">
            <Field label={t('profile.fields.heading')}><input type="text" value={it.heading} onChange={e => setItem(i, { heading: e.target.value })} /></Field>
            <Field label={t('profile.fields.subheading')}><input type="text" value={it.subheading ?? ''} onChange={e => setItem(i, { subheading: e.target.value || undefined })} /></Field>
            <Field label={t('profile.fields.dateOptional')}><input type="text" value={it.date ?? ''} onChange={e => setItem(i, { date: e.target.value || undefined })} placeholder="2023" /></Field>
          </div>
          <Field label={t('profile.fields.descriptionOptional')}><textarea value={it.description ?? ''} onChange={e => setItem(i, { description: e.target.value || undefined })} /></Field>
        </div>
      ))}
      <Button variant="secondary" onClick={() => onChange({ ...sec, items: [...sec.items, { heading: '' }] })}>{t('profile.addEntry')}</Button>
    </ItemCard>
  )
}

// ── CV import modal ──────────────────────────────────────────────────────────

function ImportCVModal({ hasContent, localEngine, onClose, onImported }: {
  hasContent: boolean
  localEngine: boolean
  onClose: () => void
  onImported: (p: Profile) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!text.trim() && !file) { setErr(t('profile.import.chooseError')); return }
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
    <Modal title={t('profile.import.title')} onClose={onClose}>
      <p className="help-text" style={{ marginTop: 0 }}>{t('profile.import.help')}</p>
      {hasContent && (
        <p className="callout callout-warn" style={{ marginBottom: 'var(--space-3)' }}>
          {t('profile.import.replaceWarn')}
        </p>
      )}
      {localEngine && (
        <p className="callout callout-warn" style={{ marginBottom: 'var(--space-3)' }}>
          {t('profile.import.localWarn')}
        </p>
      )}
      <div className="field">
        <label htmlFor="cv-import-file">{t('profile.import.uploadPdf')}</label>
        <input id="cv-import-file" type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="field">
        <label htmlFor="cv-import-text">{t('profile.import.pasteText')}</label>
        <textarea id="cv-import-text" value={text} onChange={e => setText(e.target.value)} disabled={!!file}
          style={{ minHeight: 160 }} placeholder={t('profile.import.pastePlaceholder')} />
      </div>
      {err && <p className="error-msg">{err}</p>}
      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
        <Button variant="secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? <><span className="spinner" style={{ width: 13, height: 13, marginRight: 6 }} />{t('profile.import.importing')}</> : <><Upload size={15} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />{t('profile.import.importBtn')}</>}
        </Button>
      </div>
    </Modal>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const toast = useToast()
  const { t } = useTranslation()
  const { keySet, provider } = useKeyStatus()
  const {
    profile, setProfile, latestProfile, error, saveState, saveError, runSave, scheduleSave, set,
  } = useProfileAutosave()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [manualStart, setManualStart] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // Deep link into one section (`/profile#languages`). The browser can't do this
  // itself: the sections don't exist until the profile has loaded, long after
  // it gave up looking for the anchor.
  const { hash } = useLocation()
  const anchor = hash.slice(1)

  useEffect(() => {
    if (!anchor || !profile) return
    document.getElementById(anchor)?.scrollIntoView({ block: 'start' })
  }, [anchor, profile])

  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  if (!profile) return <div style={{ padding: 32, color: 'var(--muted)' }}>{error || t('profile.loading')}</div>

  function removeItem(label: string, path: string, prevList: unknown[], index: number) {
    set(path, prevList.filter((_, i) => i !== index))
    toast.info(t('profile.removedToast', { label }), {
      duration: 5000,
      action: { label: t('cv.undo'), onClick: () => set(path, prevList) },
    })
  }

  const pf: Profile = profile
  const enabled = new Set(pf.meta.enabled_sections ?? [])
  const hidden = OPTIONAL_SECTIONS.filter(s => !enabled.has(s.key))
  // "Pristine" must mean the profile is genuinely untouched, not just missing a
  // name and a job. Judging it on those two alone sent anyone who started with
  // Education/Skills/Languages back to the empty-state wall on reload, with the
  // work they'd already done rendered nowhere — indistinguishable from data loss.
  const pristine = !pf.personal.name.trim()
    && !pf.personal.email?.trim()
    && !pf.summary.trim()
    && pf.experience.length === 0
    && pf.education.length === 0
    // A blank profile is seeded with one *empty* language row, so presence of a
    // row says nothing — only a filled-in name does.
    && !pf.skills.languages.some(l => l.language.trim())
    && pf.skills.groups.every(g => g.items.length === 0)
    && (pf.meta?.enabled_sections?.length ?? 0) === 0
  const showForm = !pristine || manualStart

  function onImported(p: Profile) {
    setProfile(p); latestProfile.current = p; scheduleSave()
    setShowImport(false); setManualStart(true)
    toast.success(t('profile.importedToast'))
  }

  function showSection(key: string) {
    set('meta.enabled_sections', [...(pf.meta.enabled_sections ?? []).filter(k => k !== key), key])
    setMenuOpen(false)
  }
  function hideSection(key: string) {
    set('meta.enabled_sections', (pf.meta.enabled_sections ?? []).filter(k => k !== key))
    toast.info(t('profile.hidToast', { label: t(OPTIONAL_BY_KEY[key].label) }), {
      duration: 5000,
      action: { label: t('cv.undo'), onClick: () => showSection(key) },
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
    if (key === 'teaching') {
      return pf.teaching.entries.length > 0
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
          <Section key={key} title={t(def.label)} count={projects.length} help={t('profile.help.projects')} {...hideProps}>
            <ReorderableList items={projects} keyOf={(_, i) => i} onReorder={v => set('projects', v)}
              renderItem={(p, i, handle) => (
                <ProjectCard proj={p} handle={handle}
                  onChange={u => { const next = [...projects]; next[i] = u; set('projects', next) }}
                  onRemove={() => removeItem(p.name || t('sections.projects.label'), 'projects', projects, i)} />
              )} />
            <Button variant="secondary" onClick={() => set('projects', [...projects, { name: '', description: '', url: '', technologies: [] }])}>{t('profile.add.project')}</Button>
          </Section>
        )
      case 'volunteering':
        return (
          <Section key={key} title={t(def.label)} count={volunteering.length} help={t('profile.help.volunteering')} {...hideProps}>
            <ReorderableList items={volunteering} keyOf={(_, i) => i} onReorder={v => set('volunteering', v)}
              renderItem={(v, i, handle) => (
                <VolunteeringCard vol={v} handle={handle}
                  onChange={u => { const next = [...volunteering]; next[i] = u; set('volunteering', next) }}
                  onRemove={() => removeItem(v.role || t('sections.volunteering.label'), 'volunteering', volunteering, i)} />
              )} />
            <Button variant="secondary" onClick={() => set('volunteering', [...volunteering, { role: '', organisation: '', start_date: '', end_date: null, description: '' }])}>{t('profile.add.volunteering')}</Button>
          </Section>
        )
      case 'certifications':
        return (
          <Section key={key} title={t(def.label)} count={certifications.length} help={t('profile.help.certifications')} {...hideProps}>
            {certifications.map((c, i) => (
              <div key={i} className="row" style={{ marginBottom: 'var(--space-2)', alignItems: 'flex-end' }}>
                <Field label={t('profile.fields.name')}><input type="text" value={c.name} onChange={e => { const next = [...certifications]; next[i] = { ...c, name: e.target.value }; set('certifications', next) }} /></Field>
                <Field label={t('profile.fields.issuer')}><input type="text" value={c.issuer} onChange={e => { const next = [...certifications]; next[i] = { ...c, issuer: e.target.value }; set('certifications', next) }} /></Field>
                <Field label={t('profile.fields.year')}><input type="number" value={c.year ?? ''} onChange={e => { const next = [...certifications]; next[i] = { ...c, year: e.target.value ? +e.target.value : null }; set('certifications', next) }} /></Field>
                <RemoveButton onClick={() => removeItem(c.name || t('sections.certifications.label'), 'certifications', certifications, i)} />
              </div>
            ))}
            <Button variant="secondary" onClick={() => set('certifications', [...certifications, { name: '', issuer: '', year: null }])}>{t('profile.add.certification')}</Button>
          </Section>
        )
      case 'courses':
        return (
          <Section key={key} title={t(def.label)} count={courses.length} help={t('profile.help.courses')} {...hideProps}>
            {courses.map((c, i) => (
              <div key={i} className="row" style={{ marginBottom: 'var(--space-2)', alignItems: 'flex-end' }}>
                <Field label={t('profile.fields.courseTraining')}><input type="text" value={c.name} onChange={e => { const next = [...courses]; next[i] = { ...c, name: e.target.value }; set('courses', next) }} /></Field>
                <Field label={t('profile.fields.provider')}><input type="text" value={c.provider} onChange={e => { const next = [...courses]; next[i] = { ...c, provider: e.target.value }; set('courses', next) }} /></Field>
                <Field label={t('profile.fields.year')}><input type="number" value={c.year ?? ''} onChange={e => { const next = [...courses]; next[i] = { ...c, year: e.target.value ? +e.target.value : null }; set('courses', next) }} /></Field>
                <RemoveButton onClick={() => removeItem(c.name || t('sections.courses.label'), 'courses', courses, i)} />
              </div>
            ))}
            <Button variant="secondary" onClick={() => set('courses', [...courses, { name: '', provider: '', year: null }])}>{t('profile.add.course')}</Button>
          </Section>
        )
      case 'awards':
        return (
          <Section key={key} title={t(def.label)} count={awards.length} help={t('profile.help.awards')} {...hideProps}>
            {awards.map((a, i) => (
              <div key={i} className="card" style={{ marginBottom: 'var(--space-2)', padding: '12px 18px' }}>
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <Field label={t('profile.fields.name')}><input type="text" value={a.name} onChange={e => { const next = [...awards]; next[i] = { ...a, name: e.target.value }; set('awards', next) }} /></Field>
                  <Field label={t('profile.fields.year')}><input type="number" value={a.year ?? ''} onChange={e => { const next = [...awards]; next[i] = { ...a, year: e.target.value ? +e.target.value : null }; set('awards', next) }} /></Field>
                  <RemoveButton onClick={() => removeItem(a.name || t('sections.awards.label'), 'awards', awards, i)} />
                </div>
                <Field label={t('profile.fields.descriptionOptional')}><input type="text" value={a.description ?? ''} onChange={e => { const next = [...awards]; next[i] = { ...a, description: e.target.value || undefined }; set('awards', next) }} /></Field>
              </div>
            ))}
            <Button variant="secondary" onClick={() => set('awards', [...awards, { name: '', year: null, description: '' }])}>{t('profile.add.award')}</Button>
          </Section>
        )
      case 'memberships':
        return (
          <Section key={key} title={t(def.label)} count={memberships.length} help={t('profile.help.memberships')} {...hideProps}>
            {memberships.map((m, i) => (
              <div key={i} className="row" style={{ marginBottom: 'var(--space-2)', alignItems: 'flex-end' }}>
                <Field label={t('profile.fields.organisation')}><input type="text" value={m.name} onChange={e => { const next = [...memberships]; next[i] = { ...m, name: e.target.value }; set('memberships', next) }} /></Field>
                <Field label={t('profile.fields.roleOptional')}><input type="text" value={m.role ?? ''} onChange={e => { const next = [...memberships]; next[i] = { ...m, role: e.target.value || undefined }; set('memberships', next) }} /></Field>
                <Field label={t('profile.fields.since')}><input type="number" value={m.year ?? ''} onChange={e => { const next = [...memberships]; next[i] = { ...m, year: e.target.value ? +e.target.value : null }; set('memberships', next) }} /></Field>
                <RemoveButton onClick={() => removeItem(m.name || t('sections.memberships.label'), 'memberships', memberships, i)} />
              </div>
            ))}
            <Button variant="secondary" onClick={() => set('memberships', [...memberships, { name: '', role: '', year: null }])}>{t('profile.add.membership')}</Button>
          </Section>
        )
      case 'publications':
        return (
          <Section key={key} title={t(def.label)} count={pf.publications.length} help={t('profile.help.publications')} {...hideProps}>
            <ReorderableList items={pf.publications} keyOf={(_, i) => i} onReorder={v => set('publications', v)}
              renderItem={(pub, i, handle) => (
                <PublicationCard pub={pub} handle={handle}
                  onChange={u => { const next = [...pf.publications]; next[i] = u; set('publications', next) }}
                  onRemove={() => removeItem(t('sections.publications.label'), 'publications', pf.publications, i)} />
              )} />
            <Button variant="secondary" onClick={() => set('publications', [...pf.publications, { citation: '', description: '', url: '' }])}>{t('profile.add.publication')}</Button>
          </Section>
        )
      case 'grants':
        return (
          <Section key={key} title={t(def.label)} count={pf.grants.length} help={t('profile.help.grants')} {...hideProps}>
            {pf.grants.map((g, i) => (
              <GrantCard key={i} grant={g}
                onChange={u => { const next = [...pf.grants]; next[i] = u; set('grants', next) }}
                onRemove={() => removeItem(g.name || t('sections.grants.label'), 'grants', pf.grants, i)} />
            ))}
            <Button variant="secondary" onClick={() => set('grants', [...pf.grants, { name: '', years: '', funder: '', amount: '' } as Grant])}>{t('profile.add.grant')}</Button>
          </Section>
        )
      case 'teaching': {
        const entries = pf.teaching.entries
        return (
          <Section key={key} title={t(def.label)} help={t('profile.help.teaching')} {...hideProps}>
            {entries.map((te, i) => (
              <div key={i} className="card" style={{ marginBottom: 'var(--space-2)', position: 'relative', paddingRight: 'var(--space-8)' }}>
                <div style={{ position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)' }}>
                  <RemoveButton onClick={() => set('teaching.entries', entries.filter((_, idx) => idx !== i))} />
                </div>
                <div className="row">
                  <Field label={t('profile.teaching.type')}>
                    <select value={te.type} onChange={e => { const next = [...entries]; next[i] = { ...te, type: e.target.value as TeachingEntry['type'] }; set('teaching.entries', next) }}>
                      <option value="">{t('profile.teaching.typePlaceholder')}</option>
                      {TEACHING_TYPES.map(k => <option key={k} value={k}>{t(`profile.teaching.types.${k}`)}</option>)}
                    </select>
                  </Field>
                  {te.type === 'other' && (
                    <Field label={t('profile.teaching.typeOther')}><input type="text" value={te.type_other} onChange={e => { const next = [...entries]; next[i] = { ...te, type_other: e.target.value }; set('teaching.entries', next) }} /></Field>
                  )}
                  <Field label={t('profile.teaching.subject')}><input type="text" value={te.subject} onChange={e => { const next = [...entries]; next[i] = { ...te, subject: e.target.value }; set('teaching.entries', next) }} /></Field>
                </div>
                <div className="row">
                  <Field label={t('profile.fields.institution')}><input type="text" value={te.institution} onChange={e => { const next = [...entries]; next[i] = { ...te, institution: e.target.value }; set('teaching.entries', next) }} /></Field>
                  <Field label={t('profile.teaching.years')}><input type="text" value={te.years} onChange={e => { const next = [...entries]; next[i] = { ...te, years: e.target.value }; set('teaching.entries', next) }} /></Field>
                </div>
                <Field label={t('profile.fields.description')}>
                  <textarea value={te.description} placeholder={t('profile.teaching.descriptionPlaceholder')} onChange={e => { const next = [...entries]; next[i] = { ...te, description: e.target.value }; set('teaching.entries', next) }} />
                </Field>
              </div>
            ))}
            <Button variant="secondary" onClick={() => set('teaching.entries', [...entries, { type: '', type_other: '', subject: '', institution: '', years: '', description: '' } as TeachingEntry])}>{t('profile.add.generic')}</Button>
          </Section>
        )
      }
      case 'custom_sections':
        return (
          <Section key={key} title={t(def.label)} count={customSections.length} help={t('profile.help.customSections')} {...hideProps}>
            {customSections.map((s, i) => (
              <CustomSectionCard key={i} sec={s}
                onChange={u => { const next = [...customSections]; next[i] = u; set('custom_sections', next) }}
                onRemove={() => removeItem(s.title || t('sections.custom_sections.label'), 'custom_sections', customSections, i)} />
            ))}
            <Button variant="secondary" onClick={() => set('custom_sections', [...customSections, { title: '', items: [{ heading: '' }] }])}>{t('profile.add.customSection')}</Button>
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
        <h1 className="page-title">{t('profile.title')}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {showForm && (
            <Button variant="secondary" onClick={() => setShowImport(true)} disabled={keySet === false}
              title={keySet === false ? t('profile.needEngineTooltip') : t('profile.importTooltip')}
              style={{ padding: '4px 10px', fontSize: 'var(--fs-sm)' }}>
              <FileUp size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />{t('profile.importFromCv')}
            </Button>
          )}
          <SaveStatus state={saveState} error={saveError} onRetry={runSave} />
        </div>
      </div>

      {/* Directly under the head; the modal renders as an overlay, so its DOM
          position below is immaterial. */}
      <p className="help-text">{t('profile.autoSaveNote')}</p>
      {showImport && <ImportCVModal hasContent={!pristine} localEngine={provider === 'local'} onClose={() => setShowImport(false)} onImported={onImported} />}

      {!showForm && (
        <EmptyState icon={FileUp} title={t('profile.emptyTitle')}
          action={
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button onClick={() => setShowImport(true)} disabled={keySet === false}
                title={keySet === false ? t('profile.needEngineTooltip') : undefined}>
                <FileUp size={15} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />{t('profile.importExisting')}
              </Button>
              <Button variant="secondary" onClick={() => setManualStart(true)}>
                <PencilLine size={15} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden />{t('profile.fillManually')}
              </Button>
            </div>
          }>
          {t('profile.emptyBody')}
          {keySet === false && <><br /><Link to="/settings">{t('profile.enableImportLink')}</Link> {t('profile.enableImportSuffix')}</>}
        </EmptyState>
      )}

      {showForm && (<>
      {/* ── CORE ── */}

      <Section title={t('sections.personal.label')} help={t('profile.help.personal')} defaultOpen>
        <div className="row">
          <Field label={t('profile.fields.fullName')}><input type="text" value={pf.personal.name} onChange={e => set('personal.name', e.target.value)} /></Field>
          <Field label={t('profile.fields.professionalTitle')}><input type="text" value={pf.personal.professional_title} onChange={e => set('personal.professional_title', e.target.value)} /></Field>
        </div>
        <div className="row">
          <Field label={t('profile.fields.email')}><input type="email" value={pf.personal.email} onChange={e => set('personal.email', e.target.value)} /></Field>
          <Field label={t('profile.fields.phone')}><input type="tel" value={pf.personal.phone} onChange={e => set('personal.phone', e.target.value)} /></Field>
        </div>
        <div className="row">
          <Field label={t('profile.fields.city')}><input type="text" value={pf.personal.location.city} onChange={e => set('personal.location.city', e.target.value)} /></Field>
          <Field label={t('profile.fields.country')}><input type="text" value={pf.personal.location.country} onChange={e => set('personal.location.country', e.target.value)} /></Field>
        </div>
        <Field label={t('profile.fields.links')}>
          <p className="section-help" style={{ marginTop: 0 }}>{t('profile.help.linksHelp')}</p>
          <datalist id="link-labels">{LINK_SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
          {links.map((l, i) => (
            <div key={i} className="row" style={{ marginBottom: 'var(--space-2)', alignItems: 'center' }}>
              {/* Placeholders aren't accessible names, and the group label
                  ("Links") can't disambiguate two fields per row × N rows. */}
              <input type="text" list="link-labels" value={l.label} placeholder="LinkedIn" style={{ maxWidth: 200 }}
                aria-label={t('profile.fields.linkLabel', { n: i + 1 })} onChange={e => setLink(i, { label: e.target.value })} />
              <input type="url" value={l.url} placeholder="https://…"
                aria-label={t('profile.fields.linkUrl', { n: i + 1 })} onChange={e => setLink(i, { url: e.target.value })} />
              <RemoveButton onClick={() => removeItem(l.label || t('profile.fields.links'), 'personal.links', links, i)} />
            </div>
          ))}
          <Button variant="secondary" onClick={() => set('personal.links', [...links, { label: '', url: '' }])}>{t('profile.add.link')}</Button>
        </Field>
      </Section>

      <Section title={t('sections.summary.label')} help={t('profile.help.summary')} defaultOpen>
        <Field label={t('profile.fields.summary')}><textarea value={pf.summary} placeholder={t('profile.fields.summaryPlaceholder')} onChange={e => set('summary', e.target.value)} style={{ minHeight: 100 }} /></Field>
      </Section>

      <Section title={t('sections.experience.label')} count={pf.experience.length} help={t('profile.help.experience')}>
        <ReorderableList items={pf.experience} keyOf={(e, i) => e.id || i} onReorder={v => set('experience', v)}
          renderItem={(exp, i, handle) => (
            <ExperienceCard exp={exp} handle={handle}
              onChange={updated => { const next = [...pf.experience]; next[i] = updated; set('experience', next) }}
              onRemove={() => removeItem(exp.title || t('profile.fields.jobTitle'), 'experience', pf.experience, i)} />
          )} />
        {/* The one accent-weight action on the form: with no roles yet, this is
            the single thing the user most needs to do next. Once there's at
            least one, it steps back down to secondary. */}
        <Button variant={pf.experience.length === 0 ? 'primary' : 'secondary'}
          onClick={() => set('experience', [...pf.experience, {
          id: `job-${Date.now()}`, title: '', employer: '', location: '', start_date: '',
          end_date: null, responsibilities: [], technologies: [], ai_notes: '',
        }])}>{t('profile.add.job')}</Button>
      </Section>

      <Section title={t('sections.skills.label')} help={t('profile.help.skills')}>
        {pf.skills.groups.map((g, i) => (
          <div key={i} className="card" style={{ marginBottom: 'var(--space-3)', padding: '12px 18px' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <datalist id="skill-group-labels">{SKILL_GROUP_SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
              <input type="text" list="skill-group-labels" value={g.label} placeholder={t('profile.skills.groupNamePlaceholder')}
                aria-label={t('profile.skills.groupNamePlaceholder')} style={{ fontWeight: 600 }}
                onChange={e => { const next = [...pf.skills.groups]; next[i] = { ...g, label: e.target.value }; set('skills.groups', next) }} />
              <RemoveButton title={t('profile.skills.removeGroup')} onClick={() => removeItem(g.label || t('sections.skills.label'), 'skills.groups', pf.skills.groups, i)} />
            </div>
            <TagInput value={g.items} onChange={v => { const next = [...pf.skills.groups]; next[i] = { ...g, items: v }; set('skills.groups', next) }} placeholder={t('profile.skills.addSkillPlaceholder')} maxLength={32} />
          </div>
        ))}
        <Button variant="secondary" onClick={() => set('skills.groups', [...pf.skills.groups, { label: '', items: [] }])}>{t('profile.add.skillGroup')}</Button>
      </Section>

      <Section id="languages" title={t('sections.languages.label')} count={pf.skills.languages.length}
        help={t('profile.help.languages')} defaultOpen={anchor === 'languages'}
        required={!pf.skills.languages.some(l => l.language.trim())}>
        {pf.skills.languages.map((l, i) => (
          <div key={i} className="row" style={{ marginBottom: 'var(--space-2)', alignItems: 'center' }}>
            <input type="text" value={l.language} placeholder={t('profile.skills.languagePlaceholder')}
              aria-label={t('profile.skills.languagePlaceholder')} onChange={e => { const next = [...pf.skills.languages]; next[i] = { ...l, language: e.target.value }; set('skills.languages', next) }} />
            <StarRating value={l.level}
              groupLabel={t('profile.skills.proficiencyIn', { language: l.language || t('sections.languages.label') })}
              labelFor={n => `${CEFR_CODES[n]} ${t(`profile.skills.cefr.${n}`)}`}
              onChange={n => { const next = [...pf.skills.languages]; next[i] = { ...l, level: n, label: CEFR_CODES[n] ?? '' }; set('skills.languages', next) }} />
            <RemoveButton onClick={() => removeItem(l.language || t('sections.languages.label'), 'skills.languages', pf.skills.languages, i)} />
          </div>
        ))}
        <div className="skill-scale-legend">{t('profile.skills.scaleLegend')}</div>
        {/* level 0 = unrated: a new row must not claim B1 for a language the
            user hasn't even named yet. */}
        <Button variant="secondary" onClick={() => set('skills.languages', [...pf.skills.languages, { language: '', level: 0, label: '' }])}>{t('profile.add.language')}</Button>
      </Section>

      <Section title={t('sections.education.label')} count={pf.education.length} help={t('profile.help.education')}>
        <ReorderableList items={pf.education} keyOf={(_, i) => i} onReorder={v => set('education', v)}
          renderItem={(edu, i, handle) => (
            <EducationCard edu={edu} handle={handle}
              onChange={updated => { const next = [...pf.education]; next[i] = updated; set('education', next) }}
              onRemove={() => removeItem(edu.degree || t('sections.education.label'), 'education', pf.education, i)} />
          )} />
        {/* start_year null, not the current year — a prefilled year is a wrong
            answer the user has to notice and correct, not a helpful default. */}
        <Button variant="secondary" onClick={() => set('education', [...pf.education, {
          degree: '', field: '', institution: '', location: '', start_year: null, end_year: null, distinction: null, description: '',
        }])}>{t('profile.add.education')}</Button>
      </Section>

      {/* ── OPTIONAL (shown on demand, in the order the user added them) ── */}
      {(pf.meta.enabled_sections ?? []).map(key => renderOptional(key))}

      {/* Add a section */}
      {hidden.length > 0 && (
        <div className="add-section" ref={menuRef}>
          <Button variant="secondary" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen}>
            {t('profile.addSection')}
          </Button>
          {menuOpen && (
            <div className="add-section-menu wide">
              {hidden.map(s => (
                <button key={s.key} type="button" onClick={() => showSection(s.key)}>
                  <span className="add-section-menu-head">
                    <span className="add-section-menu-label">{t(s.label)}</span>
                    {/* No CV badge here: every one of these ten rows carried an
                        identical vermilion chip, which is decoration, not
                        information — and ten accent blocks in a floating panel
                        outrank the page's single primary action. The row's real
                        differentiator is its description, below. */}
                    {hasData(s.key) && <span className="add-section-menu-hint">{t('profile.hasContent')}</span>}
                  </span>
                  <span className="add-section-menu-desc">{t(s.description)}</span>
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
