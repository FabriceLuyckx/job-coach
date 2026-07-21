## Why

The Job Suggestions page's two archival lists don't scale. **Filtered out** is
hard-capped at the 50 newest `seen` rows server-side — past 50, dropped openings
silently vanish, quietly breaking the page's stated promise that nothing is
discarded. **History** loads every accepted/rejected opening in one payload and
only slices it client-side. Both grow without bound as scanning continues, and
both keep showing filtered-out jobs that have since been taken down from the
source site — clutter the user can't act on.

## What Changes

- Server-side pagination for the **Filtered out** and **History** lists: a
  paginated endpoint returns one page (`{items, total}`) per group, and each list
  gains its own "Show more" that appends the next page. The hard 50-row cap on
  filtered-out is removed.
- **BREAKING** (internal API only): `GET /api/jobs/openings` returns **suggested**
  openings only; its `include_seen` param is removed. Filtered-out and history
  move to the new paginated endpoint. Only `frontend/src/pages/Jobs.tsx` consumes
  these.
- **Availability flagging**: during a scan of a changed source, any `seen`
  (filtered-out) opening whose URL is no longer among the source page's current
  links is marked unavailable. Unavailable filtered-out openings are hidden from
  the list and excluded from re-check (a job that no longer exists must not be
  promoted back to a suggestion). This reuses the link set the scan already fetches
  — no extra fetch or LLM call.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `job-scan-lifecycle`: adds paginated retrieval of the filtered-out and history
  lists, and availability flagging that hides taken-down openings from the
  filtered-out list and excludes them from re-check.

## Impact

- **Backend**: `app/api/jobs.py` (`/openings` narrowed; new paginated endpoint;
  scan sweep marks unavailable `seen` rows; recheck + `/last-scan` recheckable
  count exclude unavailable), `app/db.py` (new `available` column on
  `job_openings`).
- **Frontend**: `frontend/src/pages/Jobs.tsx` (per-list paging state + "Show
  more"), `frontend/src/api.ts` (new client method, `getOpenings` signature).
- **No new dependencies. No LLM cost added** — the availability check reuses data
  the scan already has.
