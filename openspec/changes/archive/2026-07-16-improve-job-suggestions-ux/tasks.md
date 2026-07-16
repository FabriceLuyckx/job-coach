## 1. Copy & CSS

- [x] 1.1 Update `jobs.acceptGenerate` (→ "Accept"), `jobs.acceptTitle`
  (tooltip: CV + letter, opens Applications), `jobs.regenerateCv`
  (→ "Regenerate"), `jobs.regenerateTitle` in `frontend/src/locales/en.json`
  per design — short labels, detail in tooltips. Do NOT run translate_locales.py.
- [x] 1.2 Add `input:not([type])` and `input[type="search"]` to the global input
  rule in `frontend/src/index.css` (line ~162).
- [x] 1.3 In `Jobs.tsx` suggestion cards: remove `alignItems: 'flex-start'` from
  the card flex container and add `justifyContent: 'center'` to the
  Accept/Reject button column.

## 2. Backend — cancel + last_scanned

- [x] 2.1 `app/db.py`: add `_add_column(conn, "job_sources", "last_scanned TEXT")`.
- [x] 2.2 `app/api/jobs.py`: create a `threading.Event` per scan/recheck entry;
  strip it from the `scan_status()` response.
- [x] 2.3 Add `POST /api/jobs/scan/cancel/{scan_id}` (set the event; 404 unknown).
- [x] 2.4 `_run_scan`/`_run_recheck`: set `current_cancel` for the thread, check
  the event at the top of the per-source and per-posting loops, catch
  `GenerationCancelled`, and finalize status `cancelled` (no
  `jobs_last_scan`/`jobs_last_recheck` stamp on cancel).
- [x] 2.5 `_run_scan` incremental persistence: insert `seen` rows for
  prescreened-out openings right after the prescreen; insert each survivor's
  row immediately after its review (update `known`/`found` as you go); stamp
  `links_hash` + `last_scanned` only when the source completes uncancelled —
  so a re-scan after cancel re-reviews nothing already judged.
- [x] 2.6 `_run_scan`: stamp `job_sources.last_scanned` per source on success,
  including the links-hash skip path; not on the error/cancel paths.
- [x] 2.7 Add a small pytest covering the cancel endpoint (404 unknown id; known
  id sets the event) and, if cheap, the last_scanned stamp on the skip path.

## 3. Frontend — resume, cancel, last-scanned display

- [x] 3.1 `api.ts`: add `cancelScan(scanId)`, `last_scanned` on `JobSource`,
  `'cancelled'` in the scan-status type.
- [x] 3.2 `Jobs.tsx`: module-level `activeScan` store; set on scan/recheck
  start, clear on done/error/cancelled; on mount, resume polling and busy state
  when set; a resumed poll that 404s resets quietly (no error toast).
- [x] 3.3 `Jobs.tsx`: handle `cancelled` status in `pollJob` as a quiet stop
  (clear busy, reload openings, no toast).
- [x] 3.4 `Jobs.tsx`: ghost Cancel button beside the scan/recheck progress while
  running, calling `api.cancelScan` fire-and-forget. New `en.json` key if the
  shared `common.cancel` doesn't fit.
- [x] 3.5 `Jobs.tsx`: show muted `last_scanned` date on each source row (bare
  date or `jobs.sourceLastScanned` key per design; omit when null).

## 4. Verify

- [x] 4.1 `uv run pytest` passes (new cancel test included).
- [x] 4.2 `cd frontend && npx tsc --noEmit` clean.
- [x] 4.3 Update the Phase 5 section of `CLAUDE.md` (scan cancel endpoint,
  per-source last_scanned) and README if it documents the scan flow.
