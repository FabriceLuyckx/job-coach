// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

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
  /** Optional free-text notes for the AI (when this role is most relevant, extra
   * context) — never printed on the CV. */
  ai_notes: string
}

export interface Education {
  degree: string
  field: string
  institution: string
  location: string
  /** null = not filled in. Mirrors end_year; writing 0 for "cleared"
   * put a year that predates the calendar into the profile and the AI prompt. */
  start_year: number | null
  end_year: number | null
  distinction: string | null
  /** Optional — thesis topic, specialisation, or relevant coursework. */
  description?: string
}

export interface Publication {
  /** Full pre-formatted APA reference, e.g. "Doe, J. (2020). Title. Journal, 1(2), 3-4." */
  citation: string
  /** Optional one-line note about the work's significance. */
  description?: string
  /** Optional DOI or link. */
  url?: string
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
  name: string
  years: string
  /** Optional — funding body. */
  funder: string
  /** Optional — free text, e.g. "€25 000". */
  amount: string
}

/** Enum select in the UI; "other" reveals type_other as a free-text input. */
export type TeachingType =
  | '' | 'course_instructor' | 'guest_lecture' | 'tutorials_seminars'
  | 'workshop_training' | 'supervision' | 'other'

export interface TeachingEntry {
  type: TeachingType
  /** Free text, used only when type === 'other'. */
  type_other: string
  subject: string
  institution: string
  years: string
  description: string
}

export interface Teaching {
  entries: TeachingEntry[]
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

/** Feeds the job-matching prompt only — never printed on the CV. */
export interface Preferences {
  target_roles: string[]
  looking_for: string
  avoid: string
  locations: string[]
  remote: string
  languages: string[]
  notes: string
}

export interface CVDesignPreferences {
  accent_color: string
  include_photo: boolean
  /** Built-in template id (see GET /api/cv/templates); unknown ids fall back to 'default'. */
  template: string
  /** Palette colour slots. Optional — a template falls back to its own defaults. */
  colors?: { ink?: string; paper?: string }
  /** How the photo is framed: zoom 1–3, x/y are object-position percentages. */
  photo_crop?: { zoom: number; x: number; y: number }
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
  experience: Experience[]
  education: Education[]
  publications: Publication[]
  grants: Grant[]
  teaching: Teaching
  skills: Skills
  preferences: Preferences
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

// Cover-letter writing skeleton (not a written letter).
export interface LetterGuide {
  job_title: string
  employer: string
  structure: { title: string; goal: string; evidence: string[] }[]
  tips: string[]
}

export interface LetterHistoryEntry {
  id: string
  job_title: string
  employer: string
  job_url: string | null
  lang: string
  guide: LetterGuide
  created_at: string
}
