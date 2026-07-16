# Design — Improve Job Suggestions UX

## 1. Copy fix (en.json only)

Accept has generated both a CV and a cover-letter guide since the Applications
merge; the copy still says CV-only and names the retired "CV Generator" page.
The button label must stay short — the explanation belongs in the tooltip
(`title=`), which the button already has.

- `jobs.acceptGenerate`: "Accept → generate CV" → **"Accept"** (the ✓ icon and
  the Reject counterpart make the meaning unambiguous)
- `jobs.acceptTitle` (tooltip): → "Generates a tailored CV and cover-letter
  guide and opens them on the Applications page"
- `jobs.regenerateCv`: "Regenerate CV" → **"Regenerate"** (the history redo
  button calls the same accept flow, so it also regenerates both)
- `jobs.regenerateTitle` (tooltip): → "Generate the CV and cover-letter guide
  for this opening again"

Edit `en.json` only; the pre-commit hook translates shipped locales.

## 2. Vertical centering of Accept/Reject

`Jobs.tsx` suggestion card is `display:flex; alignItems:'flex-start'`. Drop the
`alignItems: 'flex-start'` (flex default `stretch` makes the button column full
height) and add `justifyContent: 'center'` to the button column div. Suggestion
cards only — history/filtered-out rows keep their current top alignment (their
action stacks are taller and read better top-aligned; not part of the request).

## 3. Scan survives navigation (client-side resume)

The scan already survives server-side: `_run_scan` runs in a daemon thread and
its status stays queryable for `_SCAN_TTL` (1h). What's lost is purely client
state (`scanning`, `scanProgress`, the poller) on unmount.

Mirror the Applications-page pattern (module-level store, survives SPA
navigation, resets on full reload — acceptable):

```ts
// module scope in Jobs.tsx
let activeScan: { id: string; kind: 'scan' | 'recheck' } | null = null
```

- `scan()`/`recheck()` set `activeScan` before polling; `pollJob`'s
  done/error/cancelled paths clear it.
- On mount, if `activeScan` is set, immediately restore the busy flag for its
  kind and re-enter `pollJob(activeScan.id, …)`. `usePoller` is per-component,
  so re-entering on the new mount is the natural resume; the old component's
  poller died with its unmount.
- If the resumed poll 404s (server restarted; TTL passed after a reload), clear
  `activeScan` and reset the UI quietly — same as today's catch path but
  without the alarming toast when resuming.

ponytail: module-level only — swap to localStorage if reload-persistence is
ever wanted (status survives server-side for 1h, so it would work).

## 4. Cancel a running scan

Backend, mirroring the CV cancel design (`cancel_job` in `app/api/cv.py`):

- `_scans[scan_id]["cancel"] = threading.Event()` at creation. **Strip it in
  `scan_status()`** (`{k: v for k, v in s.items() if k != "cancel"}`) — an
  Event isn't JSON-serializable.
- `POST /api/jobs/scan/cancel/{scan_id}`: look up the event, `set()` it, 404 if
  unknown. Works for both scan and recheck (shared dict).
- `_run_scan`/`_run_recheck`: at thread start, `current_cancel.set(event)` so
  every `complete()` call inside (extract, prescreen, review) inherits
  interruptibility — the local engine already checks the event between stream
  chunks and raises `GenerationCancelled`. Additionally check
  `event.is_set()` at the top of the per-source and per-posting loops and break
  out.
- On cancellation (event set or `GenerationCancelled` caught): finalize status
  as `{"status": "cancelled"}`. Do NOT stamp `jobs_last_scan` on cancel — the
  scan didn't complete.
- ponytail: `fetch_texts()` itself isn't interruptible (parallel httpx pool);
  the event is checked right after it returns. Worst case a cancel waits out
  one network fetch round, not an LLM generation — acceptable.

### Incremental persistence — cancelled work is never re-paid

Today `_run_scan` reviews all of a source's survivors first and writes their
rows in one batch afterwards; a cancel mid-source discards every completed
per-posting review (the expensive call). Restructure so each row is written
the moment its verdict exists:

- Right after the prescreen, insert the `seen` rows for prescreened-out
  openings (their verdict is final — no review coming).
- Inside the per-posting loop, insert each survivor's row immediately after
  `_review_one` returns (and add its URL to `known`, bump `found`).
- Keep stamping `links_hash` + `last_scanned` only after the source's loop
  completes uncancelled — an interrupted source must be re-extracted next scan.

Token math on a re-scan after cancel: link extraction re-runs for the
interrupted source (cheap — no profile context), URL dedup drops every
already-inserted posting, and only the postings that never got a verdict are
prescreened + reviewed. No expensive per-posting call is ever paid twice —
preserving the "paid exactly once per opening ever" invariant from Phase 5.

`_run_recheck` already UPDATEs row-by-row inside its loop, so its partial
progress persists as-is; rescued rows leave `seen` status and naturally drop
out of the next recheck's query. No change needed.

Frontend:

- `api.ts`: `cancelScan(scanId)` → POST the new endpoint; add `'cancelled'` to
  the scan-status union.
- `pollJob` handles `status === 'cancelled'` like done-but-quiet: clear busy
  state and `activeScan`, no toast (cancellation isn't a failure), reload
  openings (partial results may exist).
- A ghost **Cancel** button appears next to the scanning/rechecking button
  while `busyScan`, calling `api.cancelScan(activeScan.id)` (fire-and-forget,
  errors ignored — the poll will resolve the true state).

## 5. Per-source "last scanned"

- `app/db.py`: `_add_column(conn, "job_sources", "last_scanned TEXT")`.
- `_run_scan`: after a source is processed successfully — including the
  links-hash skip (the source *was* checked; nothing new can exist) — stamp
  `UPDATE job_sources SET last_scanned = ? WHERE id = ?`. Skip the stamp on the
  per-source error path (a failed read isn't a scan).
- `GET /api/jobs/sources` already `SELECT *` — the column flows through. Add
  `last_scanned: string | null` to the `JobSource` type.
- `Jobs.tsx` source row: muted `formatDateTime(s.last_scanned)` between the
  name and the remove button; nothing shown when null. New key
  `jobs.sourceLastScanned` ("Scanned {{time}}") — or reuse the date bare;
  decide at implementation for space (the row already has error text competing
  for width; bare date is likely enough with a `title` tooltip).

## 6. Input padding root cause

`index.css:162` styles `input[type="text"], …[url], …` — a bare `<input>`
(Jobs add-source, check-job, suggestions search) and `input[type="search"]`
(Applications search) match nothing and render unpadded. Fix the rule once:

```css
input:not([type]), input[type="search"], input[type="text"], …existing list
```

No per-page margin hacks; every current and future bare input inherits the fix.

## Testing

- `tests/test_hardening.py`-style unit test not needed for CSS/copy; add one
  small test for the cancel endpoint contract (404 on unknown id, 200 + event
  set on known) if cheap — else rely on the runnable check below.
- Runnable check: `uv run pytest` + `cd frontend && npx tsc --noEmit`.
- Agent-verifiable behaviours only in tasks.md (no manual-QA checkboxes, per
  project convention).
