// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

/**
 * Cross-page handoff between Job Suggestions and the Applications page, via
 * localStorage. The single source of truth for these keys — do not inline the
 * string literals anywhere else.
 *
 * - pending application: set by "Accept" on Jobs (and by the Applications page's
 *   own "New" slot, so a reload mid-generation resumes). Carries the shared job
 *   URL plus the CV and/or letter poll job ids the Applications page picks up on
 *   mount to show progress and attach results.
 * - open URL: set by "Open application" on Jobs; the Applications page
 *   auto-expands the row whose job_url matches.
 */

const PENDING = 'application_pending'
const OPEN_URL = 'application_open_url'

export interface PendingApplication {
  jobUrl: string
  cvJobId?: string
  letterJobId?: string
}

export const handoff = {
  setPending(p: PendingApplication) {
    localStorage.setItem(PENDING, JSON.stringify(p))
  },
  /** The in-flight application to resume, or null. Does not clear it (so
   * navigating away and back keeps resuming until it completes). */
  peekPending(): PendingApplication | null {
    const raw = localStorage.getItem(PENDING)
    if (!raw) return null
    try { return JSON.parse(raw) as PendingApplication } catch { return null }
  },
  clearPending() {
    localStorage.removeItem(PENDING)
  },

  setOpenUrl(url: string) {
    localStorage.setItem(OPEN_URL, url)
  },
  /** The application to auto-open (matched by job_url); cleared on read. */
  takeOpenUrl(): string | null {
    const url = localStorage.getItem(OPEN_URL)
    localStorage.removeItem(OPEN_URL)
    return url
  },
}
