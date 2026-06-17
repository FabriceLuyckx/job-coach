export interface Location {
  city: string
  country: string
}

export interface Links {
  github?: string
  linkedin?: string
  google_scholar?: string
  [key: string]: string | undefined
}

export interface Personal {
  name: string
  location: Location
  email: string
  phone: string
  links: Links
  professional_title: string
  keywords: string[]
}

export interface Narrative {
  target_roles_description: string
  target_industries: string[]
  differentiation: string
  problems_enjoyed: string
  topics_to_teach: string[]
  research_themes: string
  work_to_avoid: string
}

export interface TeamSize {
  min: number
  max: number
}

export interface Relevance {
  teaching: string | null
  research: string | null
  leadership: string | null
  interdisciplinarity: string | null
}

export interface Experience {
  id: string
  title: string
  employer: string
  location: string
  start_date: string
  end_date: string | null
  is_current: boolean
  full_time: boolean
  team_size: number | TeamSize
  reporting_structure: string
  responsibilities: string[]
  technical_difficulty: string
  impact: string
  technologies: string[]
  mentored: boolean
  mentoring_detail?: string
  presentations: string[]
  presentations_detail?: string
  achievements: string[]
  relevance: Relevance
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

export interface Academic {
  research_areas: string[]
  methods: {
    neural_analyses: string[]
    computational_modelling: string[]
    [key: string]: string[]
  }
  datasets_tools: {
    data_types: string[]
    tools: string[]
  }
  interdisciplinary_work: string[]
  collaborators: Collaborator[]
}

export interface Publication {
  authors: string[]
  year: number
  title: string
  journal: string
  volume?: string
  issue?: string
  pages?: string
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

export interface LanguageSkill {
  language: string
  level: number
  label: string
}

export interface Skills {
  programming: {
    production: string[]
    research: string[]
  }
  languages: LanguageSkill[]
  cloud_devops: {
    aws: string[]
    tools: string[]
  }
  visualization: string[]
  databases: string[]
  big_data: string[]
  ml_statistical: string[]
  current_tools: string[]
}

export interface WorkPreferences {
  commute_radius: string[]
  remote_hybrid: string
  institution_type_preference: string
  research_vs_teaching: string
  leadership_interest: string
  salary_current_gross: number
  salary_mobility_budget: number
  schedule: string
  language_preferences: string[]
  relocation: string
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

export interface Profile {
  meta: { version: string; last_updated: string; schema: string }
  personal: Personal
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
}
