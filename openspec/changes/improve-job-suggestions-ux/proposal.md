# Improve Job Suggestions UX

## Why

The Job Suggestions page has accumulated six small but user-visible rough edges:
stale copy ("Accept → generate CV" — accept now also generates a cover-letter
guide and lands on Applications, not the old CV Generator), misaligned
Accept/Reject buttons, a scan whose progress silently vanishes when the user
navigates away (the server keeps scanning, but returning to the page shows an
idle button), no way to cancel a running scan (which, on the local engine,
blocks every other AI feature until it finishes), no per-source "last scanned"
visibility, and URL inputs whose text sticks to the left edge (a global CSS gap:
bare `<input>` and `input[type="search"]` match none of the styled selectors).

## What Changes

- **Copy**: shorten the accept button to "Accept" (redo to "Regenerate") and
  move the CV-and-letter explanation into their tooltips
  (`jobs.acceptTitle`/`jobs.regenerateTitle`); no copy may claim CV-only or
  name the retired CV Generator. (Shipped locales update via the pre-commit
  hook — never run translate_locales.py.)
- **Alignment**: vertically center the Accept/Reject button column within each
  suggestion card.
- **Scan survives navigation**: persist the active scan/recheck id client-side;
  on returning to the page, resume polling and show the running state (the
  server-side scan already keeps running; status stays queryable for 1h).
- **Cancel scan**: new `POST /api/jobs/scan/cancel/{scan_id}` sets a
  `threading.Event` the scan loop checks between sources/postings and threads
  into `complete()` via the existing `current_cancel` ContextVar, interrupting
  an in-flight local generation. Status becomes `cancelled`; the UI shows a
  Cancel button beside the progress text and treats `cancelled` as a quiet stop.
- **Cancelled work is reused**: the scan persists each posting's verdict as
  soon as it's determined (today a whole source's reviews are batch-written at
  the end, so a mid-source cancel discards paid LLM calls). A re-scan after
  cancel re-pays only the cheap link extraction; already-judged postings are
  deduped away and never re-reviewed.
- **Per-source last-scanned**: new `job_sources.last_scanned` column (stamped
  per source on each successful scan pass, including link-hash skips), returned
  by `GET /api/jobs/sources`, shown as a muted date in the source list.
- **Input CSS**: add `input:not([type])` and `input[type="search"]` to the
  global input rule in `index.css` so bare/search inputs get the same padding
  as typed ones (root-cause fix — covers Jobs and the Applications search box).

## Capabilities

### New Capabilities

- `job-scan-lifecycle`: the observable lifecycle of a scan/recheck — keeps
  running across navigation, resumable progress display, cancellable, and
  per-source last-scanned visibility.

### Modified Capabilities

<!-- No existing capability specs cover the Jobs page; suggestion-card copy,
alignment, and the input CSS fix are cosmetic and folded into the new
capability's scope where behavioural. -->

## Impact

- **Backend**: `app/api/jobs.py` (cancel endpoint, cancel checks in
  `_run_scan`/`_run_recheck`, `last_scanned` stamping), `app/db.py` (one
  `_add_column` migration).
- **Frontend**: `frontend/src/pages/Jobs.tsx` (copy keys, alignment, scan-state
  persistence + resume, Cancel button, last-scanned display),
  `frontend/src/index.css` (input selector), `frontend/src/locales/en.json`,
  `frontend/src/api.ts` (cancel + types).
- **No breaking API/DB changes**: one additive column, one additive endpoint.
