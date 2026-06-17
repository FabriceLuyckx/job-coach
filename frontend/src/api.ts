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

export const api = {
  // Profile
  getProfile: () => request<Profile>('/profile'),
  putProfile: (p: Profile) =>
    request<{ ok: boolean }>('/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    }),

  // CV
  generateCV: (url: string, lang: string) =>
    request<{ slug: string; job_title: string; employer: string; tailoring_notes: string; preview_url: string }>(
      '/cv/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, lang }),
      }
    ),

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
