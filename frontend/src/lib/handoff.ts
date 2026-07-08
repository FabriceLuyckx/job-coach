/**
 * Cross-page handoff between Job Suggestions and the CV Generator, via
 * localStorage. The single source of truth for these keys — do not inline the
 * string literals anywhere else.
 *
 * - pending job: set by "Accept" on Jobs; the CV Generator picks it up on
 *   mount, shows the URL being generated and polls the job to completion.
 * - open URL: set by "Open CV" on Jobs; the CV Generator auto-expands the
 *   history entry whose job_url matches.
 */

const PENDING_JOB_ID = 'cv_pending_job_id'
const PENDING_JOB_URL = 'cv_pending_job_url'
const OPEN_URL = 'cv_open_url'

export const handoff = {
  setPendingJob(jobId: string, jobUrl: string) {
    localStorage.setItem(PENDING_JOB_ID, jobId)
    localStorage.setItem(PENDING_JOB_URL, jobUrl)
  },
  /** The in-flight generation to resume, or null. Does not clear it. */
  pendingJobId(): string | null {
    return localStorage.getItem(PENDING_JOB_ID)
  },
  /** The URL of the pending generation; cleared on read (shown once). */
  takePendingJobUrl(): string | null {
    const url = localStorage.getItem(PENDING_JOB_URL)
    localStorage.removeItem(PENDING_JOB_URL)
    return url
  },
  clearPendingJob() {
    localStorage.removeItem(PENDING_JOB_ID)
    localStorage.removeItem(PENDING_JOB_URL)
  },

  setOpenUrl(url: string) {
    localStorage.setItem(OPEN_URL, url)
  },
  /** The CV to auto-open (matched by job_url); cleared on read. */
  takeOpenUrl(): string | null {
    const url = localStorage.getItem(OPEN_URL)
    localStorage.removeItem(OPEN_URL)
    return url
  },
}
