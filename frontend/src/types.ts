export interface Location {
  city: string
  country: string
}

/** A labelled profile/portfolio link, e.g. { label: "LinkedIn", url: "..." }. */
export interface Link {
  label: string
  url: string
}

export interface Personal {
  name: string
  location: Location
  email: string
  phone: string
  links: Link[]
  professional_title: string
  headline?: string
  keywords: string[]
}

export interface Narrative {
  /** What the candidate is looking for next — feeds job matching, not printed. */
  looking_for: string
  target_industries: string[]
  differentiation: string
  problems_enjoyed: string
  work_to_avoid: string
}

export interface Experience {
  id: string
  title: string
  employer: string
  location: string
  start_date: string
  /** null / empty ⇒ current role (single source of truth for "current"). */
  end_date: string | null
  responsibilities: string[]
  technologies: string[]
  /** Optional free-text: when this role is most relevant (for the AI). */
  relevance_note: string
  /** Optional free-text: any extra context for the AI, never printed. */
  ai_context: string
}

export interface Education {
  degree: string
  field: string
  institution: string
  location: string
  start_year: number
  end_year: number | null
  distinction: string | null
}

export interface Collaborator {
  name: string
  affiliation: string
}

/** A user-named group of tags, e.g. { label: "Design tools", items: [...] }. */
export interface Group {
  label: string
  items: string[]
}

export interface Academic {
  research_areas: string[]
  methods: Group[]
  interdisciplinary_work: string[]
  collaborators: Collaborator[]
  research_themes: string
  topics_to_teach: string[]
}

export interface Publication {
  /** Full pre-formatted APA reference, e.g. "Doe, J. (2020). Title. Journal, 1(2), 3-4." */
  citation: string
  /** Optional one-line note about the work's significance. */
  description?: string
}

export interface Project {
  name: string
  description: string
  url?: string
  technologies: string[]
}

export interface Certification {
  name: string
  issuer: string
  year?: number | null
}

export interface Award {
  name: string
  year?: number | null
  description?: string
}

export interface Grant {
  year: number | null
  year_start: number | null
  year_end: number | null
  name: string
}

export interface FormalTeaching {
  type: string
  course: string
  institution: string
  years: string
  description: string
}

export interface GuestLecture {
  course: string
  institution: string
}

export interface Teaching {
  formal_experience: FormalTeaching[]
  guest_lectures: GuestLecture[]
  subjects_to_teach: string[]
  student_supervision: string
  mentoring: string
  educational_materials: string
}

export interface Volunteering {
  role: string
  organisation: string
  start_date: string
  end_date: string | null
  description: string
}

export interface Course {
  name: string
  provider: string
  year?: number | null
}

export interface Membership {
  name: string
  role?: string
  year?: number | null
}

/** One entry inside a user-defined custom section. */
export interface CustomItem {
  heading: string
  subheading?: string
  date?: string
  description?: string
}

/** A fully user-defined CV section — the escape hatch for anything unforeseen. */
export interface CustomSection {
  title: string
  items: CustomItem[]
}

export interface LanguageSkill {
  language: string
  level: number
  /** Auto-derived from the CEFR scale; kept for export, not edited directly. */
  label?: string
}

/** A user-named group of skill tags, e.g. { label: "Design tools", items: [...] }. */
export interface SkillGroup {
  label: string
  items: string[]
}

export interface Skills {
  groups: SkillGroup[]
  languages: LanguageSkill[]
}

export interface Salary {
  min: number | null
  max: number | null
  currency: string
  period: string
  notes: string
}

export interface WorkPreferences {
  commute_radius: string[]
  remote_hybrid: string
  organisation_preferences: string
  salary: Salary
  schedule: string
  language_preferences: string[]
  relocation: string
  contract_types: string[]
  availability: string
  travel: string
}

export interface CVDesignPreferences {
  style: string
  aesthetic: string
  font_type: string
  layout: string
  spacing: string
  accent_color: string
  include_photo: boolean
  format_style: string
  typography: string
  paper_size: string
}

export interface ProfileMeta {
  version: string
  last_updated: string
  schema: string
  /** Which optional sections the user has enabled (survives reload). */
  enabled_sections: string[]
}

export interface Profile {
  meta: ProfileMeta
  personal: Personal
  /** CV professional summary, shown at the top of the CV. */
  summary: string
  narrative: Narrative
  experience: Experience[]
  education: Education[]
  academic: Academic
  publications: Publication[]
  grants: Grant[]
  teaching: Teaching
  skills: Skills
  work_preferences: WorkPreferences
  cv_design_preferences: CVDesignPreferences
  // Optional sections — always present as [] after normalization.
  projects: Project[]
  certifications: Certification[]
  awards: Award[]
  volunteering: Volunteering[]
  courses: Course[]
  memberships: Membership[]
  custom_sections: CustomSection[]
}
