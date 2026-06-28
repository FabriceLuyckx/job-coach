import type { Profile } from './types'

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export interface CVResult {
  history_id: string
  slug: string
  job_title: string
  employer: string
  tailoring_notes: string
  summary: string
  preview_url: string
  job_url: string
  lang: string
  has_plan: boolean
}

export interface CVPlanRole {
  id: string
  title: string
  employer: string
  bullets: string[]
}

export interface CVPlan {
  lang: string
  summary: string
  roles: CVPlanRole[]
}

export interface CvHistoryEntry {
  id: string
  slug: string
  job_title: string
  employer: string
  job_url: string | null
  lang: string
  tailoring_notes: string | null
  summary: string | null
  has_plan: boolean
  created_at: string
}

export interface JobSource {
  id: string
  url: string
  name: string
}

export interface JobOpening {
  id: string
  url: string
  title: string
  source_url: string
  status: 'suggested' | 'accepted' | 'rejected'
  reason: string | null
  lang: string
  created_at: string
  decided_at: string | null
}

export const api = {
  // Profile
  getProfile: () => request<Profile>('/profile'),
  putProfile: (p: Profile) =>
    request<{ ok: boolean }>('/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    }),

  // CV generation (async)
  startGenerateCV: (url: string, lang: string) =>
    request<{ job_id: string }>('/cv/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, lang }),
    }),

  getCVJobStatus: (jobId: string) =>
    request<{ status: string; result?: CVResult; error?: string }>(`/cv/status/${jobId}`),

  getCVHistory: () => request<CvHistoryEntry[]>('/cv/history'),

  deleteCVHistory: (id: string) =>
    request<{ ok: boolean }>(`/cv/history/${id}`, { method: 'DELETE' }),

  rerenderCV: (id: string, summary?: string) =>
    request<{ ok: boolean }>(`/cv/rerender/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    }),

  relangCV: (id: string, lang: string) =>
    request<{ lang: string; slug: string; summary: string; tailoring_notes: string; preview_url: string }>(
      `/cv/relang/${id}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      },
    ),

  regenerateCV: (id: string, keepEdits: boolean) =>
    request<{ lang: string; slug: string; summary: string; tailoring_notes: string; preview_url: string }>(
      `/cv/regenerate/${id}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keep_edits: keepEdits }) },
    ),

  getCVSummary: (id: string) =>
    request<{ summary: string }>(`/cv/summary/${id}`),

  getCVPlan: (id: string) =>
    request<CVPlan>(`/cv/plan/${id}`),

  putCVPlan: (id: string, plan: { summary: string; roles: { id: string; bullets: string[] }[] }) =>
    request<{ ok: boolean; summary: string }>(`/cv/plan/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan),
    }),

  generateCVSummary: (id: string) =>
    request<{ summary: string }>(`/cv/summary/${id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),

  // Jobs
  getJobSources: () => request<JobSource[]>('/jobs/sources'),
  addJobSource: (url: string) =>
    request<JobSource>('/jobs/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  deleteJobSource: (id: string) =>
    request<{ ok: boolean }>(`/jobs/sources/${id}`, { method: 'DELETE' }),

  startScan: () => request<{ scan_id: string }>('/jobs/scan', { method: 'POST' }),
  getScanStatus: (id: string) =>
    request<{ status: string; found?: number; error?: string }>(`/jobs/scan/status/${id}`),
  getLastScan: () => request<{ last_scan: string | null }>('/jobs/last-scan'),

  getOpenings: () => request<JobOpening[]>('/jobs/openings'),
  acceptOpening: (id: string) =>
    request<{ cv_job_id: string; job_url: string; lang: string }>(`/jobs/openings/${id}/accept`, { method: 'POST' }),
  rejectOpening: (id: string) =>
    request<{ ok: boolean }>(`/jobs/openings/${id}/reject`, { method: 'POST' }),

  // Settings
  getSettings: () =>
    request<{
      openrouter_api_key_set: boolean
      openrouter_api_key_preview: string
      openrouter_model: string
      cv_prompt: string
      cv_prompt_default: string
      scan_extract_prompt: string
      scan_extract_prompt_default: string
      scan_filter_prompt: string
      scan_filter_prompt_default: string
    }>('/settings'),
  putSettings: (data: { openrouter_api_key?: string; openrouter_model?: string; cv_prompt?: string; scan_extract_prompt?: string; scan_filter_prompt?: string }) =>
    request<{ ok: boolean }>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getOpenrouterUsage: () =>
    request<{ ok: boolean; balance: number | null; usage: number | null; remaining: number | null; is_free_tier: boolean | null }>('/settings/openrouter-usage'),

  // Photo
  getPhoto: () => request<{ exists: boolean; data_uri: string | null }>('/settings/photo'),
  uploadPhoto: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ ok: boolean; filename: string }>('/settings/photo', { method: 'POST', body: form })
  },
  deletePhoto: () => request<{ ok: boolean; deleted: boolean }>('/settings/photo', { method: 'DELETE' }),
}
