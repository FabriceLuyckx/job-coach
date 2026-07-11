// Single source of truth for Profile page sections: page order, the add-a-section
// menu, badges, and descriptions. `core` sections are always shown; optional ones
// are toggled via meta.enabled_sections (persisted on the profile).
//
// `label`/`description` are not literal text — they resolve to i18n keys
// `sections.<key>.label` / `sections.<key>.description`; consumers wrap them in
// t(). `BADGE_LABELS` maps badges to their i18n keys similarly.

export type SectionBadge = 'cv' | 'ai'

export interface SectionDef {
  key: string
  /** i18n key for the section's display label (see t(sectionLabel(def))). */
  label: string
  badge: SectionBadge
  /** i18n key for the one-line add-a-section menu description. */
  description: string
  core: boolean
}

// Badge → i18n key.
export const BADGE_LABELS: Record<SectionBadge, string> = {
  cv: 'badges.cv',
  ai: 'badges.ai',
}

const def = (key: string, badge: SectionBadge, core: boolean): SectionDef => ({
  key, badge, core,
  label: `sections.${key}.label`,
  description: `sections.${key}.description`,
})

export const CORE_SECTIONS: SectionDef[] = [
  def('personal', 'cv', true),
  def('summary', 'cv', true),
  def('experience', 'cv', true),
  def('skills', 'cv', true),
  def('languages', 'cv', true),
  def('education', 'cv', true),
]

export const OPTIONAL_SECTIONS: SectionDef[] = [
  def('projects', 'cv', false),
  def('volunteering', 'cv', false),
  def('certifications', 'cv', false),
  def('courses', 'cv', false),
  def('awards', 'cv', false),
  def('memberships', 'cv', false),
  def('publications', 'cv', false),
  def('grants', 'cv', false),
  def('teaching', 'cv', false),
  def('custom_sections', 'cv', false),
]

export const ALL_OPTIONAL_KEYS = OPTIONAL_SECTIONS.map(s => s.key)

export const OPTIONAL_BY_KEY: Record<string, SectionDef> =
  Object.fromEntries(OPTIONAL_SECTIONS.map(s => [s.key, s]))
