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

  getCVSummary: (id: string) =>
    request<{ summary: string }>(`/cv/summary/${id}`),

  generateCVSummary: (id: string) =>
    request<{ summary: string }>(`/cv/summary/${id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),

  // Settings
  getSettings: () =>
    request<{ openrouter_api_key_set: boolean; openrouter_api_key_preview: string; openrouter_model: string }>(
      '/settings'
    ),
  putSettings: (data: { openrouter_api_key?: string; openrouter_model?: string }) =>
    request<{ ok: boolean }>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  // Photo
  getPhoto: () => request<{ exists: boolean; data_uri: string | null }>('/settings/photo'),
  uploadPhoto: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ ok: boolean; filename: string }>('/settings/photo', { method: 'POST', body: form })
  },
  deletePhoto: () => request<{ ok: boolean; deleted: boolean }>('/settings/photo', { method: 'DELETE' }),
}
