// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import type { Profile, LetterHistoryEntry } from './types'

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export interface SetupStatus {
  chromium_ready: boolean
  installing: boolean
  error: string | null
}

// First-run status of the one-time PDF-engine (Chromium) download.
export const getSetupStatus = () => request<SetupStatus>('/setup/status')

export type JobStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled'

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

/** Shared return shape of relang / regenerate. */
export interface CVMutation {
  lang: string
  slug: string
  summary: string
  tailoring_notes: string
  preview_url: string
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
  hidden_sections: string[]       // sections the user toggled off
  excluded_sections: string[]     // sections the AI judged irrelevant and dropped
  highlighted_skills: string[]    // skills the AI chose to emphasise (read-only)
}

/** Coarse progress stage reported by async CV jobs. */
export type CVJobStage = 'fetching' | 'thinking' | 'rendering'

/** Payload for PUT /cv/plan — the whole editable plan, auto-saved on every edit. */
export interface PlanEdit {
  summary: string
  roles: { id: string; bullets: string[] }[]
  hidden_sections: string[]
  excluded_sections: string[]
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
  last_scanned?: string | null // when this source was last successfully scanned
}

export interface JobDigest {
  employer?: string
  location?: string
  remote?: string
  contract?: string
  salary?: string
  deadline?: string
  summary?: string
  requirements?: string[]
}

export interface JobOpening {
  id: string
  url: string
  title: string
  source_url: string
  status: 'suggested' | 'accepted' | 'rejected' | 'seen' // 'seen' = filtered out
  reason: string | null
  lang: string
  digest: JobDigest | null // structured fields read from the posting (Phase 6)
  created_at: string
  decided_at: string | null
}

export type EngineProvider = 'openrouter' | 'local'

export interface EngineStatus {
  provider: EngineProvider
  ready: boolean
  detail: string
  model: { id: string; label: string; size_bytes: number | null; min_ram_gb: number | null } | null
}

export interface LocalModel {
  id: string
  label: string
  size_bytes: number
  min_ram_gb: number
  downloaded: boolean
  /** The model config currently points at. */
  active: boolean
  /** User-added by URL rather than shipped in the registry. */
  custom: boolean
  recommended: boolean
}

export interface DownloadStatus {
  state: 'idle' | 'pending' | 'downloading' | 'resuming' | 'done' | 'error'
  bytes_done?: number
  bytes_total?: number
  error?: string
  model_id?: string
}

export interface CVPalette {
  id: string
  accent_color: string
  colors: { ink: string; paper: string }
}

export interface CVTemplateRegistry {
  templates: string[]
  // One shared palette list — same set and order for every template.
  palettes: CVPalette[]
}

export interface ScanStart { scan_id: string; kind: 'scan' | 'recheck'; already_running: boolean }

export const api = {
  // Built-in CV template ids + the shared palettes. Display names are i18n keys
  // (settings.template.names.<id> / .palettes.<id>), never server strings.
  getTemplates: () => request<CVTemplateRegistry>('/cv/templates'),
  // Profile
  getProfile: () => request<Profile>('/profile'),
  putProfile: (p: Profile) =>
    request<{ ok: boolean }>('/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    }),
  // Extract a profile from an existing CV (PDF upload or pasted text). Returns the
  // normalized profile for review; it is not saved server-side.
  importProfile: (input: { text?: string; file?: File }) => {
    const form = new FormData()
    if (input.file) form.append('file', input.file)
    if (input.text) form.append('text', input.text)
    return request<Profile>('/profile/import', { method: 'POST', body: form })
  },
  // Candidate target-role titles derived from the profile. On demand only.
  suggestTitles: () =>
    request<{ titles: string[] }>('/profile/suggest-titles', { method: 'POST' }),

  // CV generation (async)
  startGenerateCV: (url: string, lang: string) =>
    request<{ job_id: string }>('/cv/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, lang }),
    }),

  getCVJobStatus: <T = CVResult>(jobId: string) =>
    request<{ status: JobStatus; stage?: CVJobStage; result?: T; error?: string }>(`/cv/status/${jobId}`),

  // Ask the server to stop a running generation (Cancel) so it frees the engine.
  cancelCVJob: (jobId: string) =>
    request<{ ok: boolean }>(`/cv/cancel/${jobId}`, { method: 'POST' }),

  // Detect a posting's language (for the Applications 'New' slot Auto-detect).
  detectLang: (url: string) =>
    request<{ lang: string }>('/cv/detect-lang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),

  // Generic (untargeted) application — no URL: the server builds a role brief
  // from the profile's preferences. 400s when the profile isn't ready. Omitting
  // lang lets the server use the app's own language (there's no posting to
  // detect one from); JSON.stringify drops the undefined key.
  generateGenericCV: (lang?: string) =>
    request<{ job_id: string }>('/cv/generic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang }),
    }),

  getCVHistory: () => request<CvHistoryEntry[]>('/cv/history'),

  deleteCVHistory: (id: string) =>
    request<{ ok: boolean }>(`/cv/history/${id}`, { method: 'DELETE' }),

  rerenderCV: (id: string, summary?: string) =>
    request<{ ok: boolean }>(`/cv/rerender/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    }),

  // relang / regenerate / summary are async: they return a job_id to poll via
  // getCVJobStatus (pollCVJob wraps that loop), so a slow engine never times out.
  relangCV: (id: string, lang: string) =>
    request<{ job_id: string }>(`/cv/relang/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang }),
    }),

  regenerateCV: (id: string, keepEdits: boolean) =>
    request<{ job_id: string }>(`/cv/regenerate/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keep_edits: keepEdits }),
    }),

  getCVPlan: (id: string) =>
    request<CVPlan>(`/cv/plan/${id}`),

  putCVPlan: (id: string, plan: PlanEdit) =>
    request<{ ok: boolean; summary: string }>(`/cv/plan/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan),
    }),

  generateCVSummary: (id: string) =>
    request<{ job_id: string }>(`/cv/summary/${id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),

  // Cover-letter guide (async; poll via getCVJobStatus / pollCVJob)
  generateLetter: (url: string, lang: string) =>
    request<{ job_id: string }>('/letters/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, lang }),
    }),
  generateGenericLetter: (lang?: string) =>
    request<{ job_id: string }>('/letters/generic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang }),
    }),
  getLetterHistory: () => request<LetterHistoryEntry[]>('/letters/history'),
  deleteLetter: (id: string) =>
    request<{ ok: boolean }>(`/letters/history/${id}`, { method: 'DELETE' }),

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

  // `kind`/`already_running`: the server hands back the job already in flight
  // rather than starting a second one (see _start_or_attach).
  startScan: () => request<ScanStart>('/jobs/scan', { method: 'POST' }),
  recheckOpenings: () => request<ScanStart>('/jobs/recheck', { method: 'POST' }),
  getScanStatus: (id: string) =>
    request<{
      status: JobStatus
      found?: number
      error?: string
      errors?: Record<string, string> // per-source failures: source id → message
      current?: number // 1-based index of the source being scanned
      total?: number
      source?: string // name of the source being scanned
      phase?: 'links' | 'openings' | 'filter' // slow pre-reading stage for the current source
      reading_current?: number // 1-based index of the posting being read in Stage 2
      reading_total?: number // postings to read for the current source (0 if none)
    }>(`/jobs/scan/status/${id}`),
  cancelScan: (id: string) => request<{ ok: boolean }>(`/jobs/scan/cancel/${id}`, { method: 'POST' }),
  getLastScan: () => request<{ last_scan: string | null; profile_changed: boolean; recheckable: number }>('/jobs/last-scan'),

  getOpenings: () => request<JobOpening[]>('/jobs/openings'),
  // One page of an archival list: 'filtered' (available seen rows) or 'history'.
  getOpeningsPage: (group: 'filtered' | 'history', offset: number, limit: number) =>
    request<{ items: JobOpening[]; total: number }>(
      `/jobs/openings/page?group=${group}&offset=${offset}&limit=${limit}`),
  checkOpening: (url: string) =>
    request<JobOpening>('/jobs/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  acceptOpening: (id: string) =>
    request<{ cv_job_id: string; letter_job_id: string; job_url: string; lang: string }>(`/jobs/openings/${id}/accept`, { method: 'POST' }),
  rejectOpening: (id: string, note?: string) =>
    request<{ ok: boolean }>(`/jobs/openings/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note || null }),
    }),
  restoreOpening: (id: string) =>
    request<{ ok: boolean }>(`/jobs/openings/${id}/restore`, { method: 'POST' }),

  // Settings
  getSettings: () =>
    request<{
      openrouter_api_key_set: boolean
      openrouter_api_key_preview: string
      openrouter_model: string
      cv_prompt: string
      cv_prompt_default: string
      letter_prompt: string
      letter_prompt_default: string
      scan_extract_prompt: string
      scan_extract_prompt_default: string
      scan_filter_prompt: string
      scan_filter_prompt_default: string
      llm_provider: EngineProvider
      local_model_id: string
      app_language: string
      onboarding_done: boolean
    }>('/settings'),
  putSettings: (data: { openrouter_api_key?: string; openrouter_model?: string; cv_prompt?: string; letter_prompt?: string; scan_extract_prompt?: string; scan_filter_prompt?: string; llm_provider?: EngineProvider; local_model_id?: string; app_language?: string; onboarding_done?: boolean }) =>
    request<{ ok: boolean }>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getOpenrouterUsage: () =>
    request<{ balance: number | null; usage: number | null; remaining: number | null; is_free_tier: boolean | null }>('/settings/openrouter-usage'),

  // Photo
  getPhoto: () => request<{ exists: boolean; data_uri: string | null }>('/settings/photo'),
  uploadPhoto: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ ok: boolean; filename: string }>('/settings/photo', { method: 'POST', body: form })
  },
  deletePhoto: () => request<{ ok: boolean; deleted: boolean }>('/settings/photo', { method: 'DELETE' }),

  // On-device UI translation (Tier-2 languages)
  generateLocale: (lang: string) =>
    request<{ lang: string; status: string }>('/i18n/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang }),
    }),
  getLocaleGenStatus: (lang: string) =>
    request<{ status: 'idle' | 'running' | 'done' | 'error'; current?: number; total?: number; error?: string }>(`/i18n/generate/status/${lang}`),

  // AI engine (OpenRouter key vs local model)
  getEngine: () => request<EngineStatus>('/engine'),
  listLocalModels: () => request<LocalModel[]>('/engine/models'),
  startModelDownload: (opts?: { model_id?: string; url?: string; force?: boolean }) =>
    request<{ download_id: string }>('/engine/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts ?? {}),
    }),
  getDownloadStatus: () => request<DownloadStatus>('/engine/download/status'),
  deleteLocalModel: (modelId?: string) =>
    request<{ ok: boolean }>(`/engine/model${modelId ? `?model_id=${encodeURIComponent(modelId)}` : ''}`, { method: 'DELETE' }),

  // Backup & restore
  backupExportUrl: `${BASE}/backup/export`,
  importBackup: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ ok: boolean }>('/backup/import', { method: 'POST', body: form })
  },
}

/** Thrown by pollCVJob when its AbortSignal fires or the job reports status
 * 'cancelled'. Callers treat this as a user cancellation, not a failure. Pair
 * the abort with api.cancelCVJob so the server also interrupts the generation
 * and frees the engine (see makeCanceller in Applications.tsx). */
export class PollAbortedError extends Error {
  constructor() { super('aborted'); this.name = 'PollAbortedError' }
}

/** Poll an async CV job to completion. Reports each stage; tolerates up to 3
 * consecutive transient poll failures before giving up (WS6/L3). Pass a signal
 * to stop waiting — it throws PollAbortedError. */
export async function pollCVJob<T>(jobId: string, onStage?: (s: CVJobStage) => void, signal?: AbortSignal): Promise<T> {
  let misses = 0
  for (;;) {
    if (signal?.aborted) throw new PollAbortedError()
    await new Promise(r => setTimeout(r, 1500))
    if (signal?.aborted) throw new PollAbortedError()
    let st: { status: JobStatus; stage?: CVJobStage; result?: T; error?: string }
    try {
      st = await api.getCVJobStatus<T>(jobId)
      misses = 0
    } catch (e) {
      if (++misses >= 3) throw e
      continue
    }
    if (st.stage) onStage?.(st.stage)
    if (st.status === 'done') return st.result as T
    if (st.status === 'cancelled') throw new PollAbortedError()
    if (st.status === 'error') throw new Error(st.error ?? 'Job failed')
  }
}
