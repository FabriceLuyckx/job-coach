## Context

`GET /api/jobs/openings?include_seen=true` returns one combined list — suggested +
all decided + the **50 newest** `seen` rows — which `Jobs.tsx` splits by status.
History pages client-side (`HISTORY_PAGE = 20` slice of the full decided list);
filtered-out has no paging and is truncated to 50 server-side (`_run_scan`'s
`_insert_opening` keeps every `seen` row, but `list_openings` only ships 50). Both
lists grow unbounded over months of scanning.

During a scan, `_run_scan` already fetches each changed source's current link set
(`links = fetch_listing_links(src["url"])`, hrefs absolute-resolved and deduped).
Stored opening URLs are drawn from exactly that set (`extract_openings` validates
each against `{l["href"] for l in links}`), so set membership against the fresh
`links` is a reliable "still listed?" check — no new fetch, no model call.

## Goals / Non-Goals

**Goals:**
- Page filtered-out and history server-side; remove the silent 50-cap.
- Hide filtered-out openings that are no longer on their source page, using only
  data the scan already has.

**Non-Goals:**
- Flagging availability of *suggested*, accepted, or rejected openings (out of
  scope — only the filtered-out list is de-cluttered).
- Deleting unavailable rows (kept for auditability; only hidden and excluded from
  re-check).
- Infinite scroll, virtualization, or a generic pagination framework — one
  "Show more" per list is enough for a local single-user app.

## Decisions

**1. One paginated endpoint, `/openings` narrowed to suggestions.**
`GET /api/jobs/openings` returns **suggested** only (the always-shown live board;
small). Add `GET /api/jobs/openings/page?group=filtered|history&offset=0&limit=20`
→ `{items, total}`. `filtered` = `status='seen' AND available=1`; `history` =
`status IN ('accepted','rejected')`; both `ORDER BY COALESCE(decided_at,
created_at) DESC`, `LIMIT ?/OFFSET ?`, with `total` from a matching `COUNT(*)`.
One handler, one query builder keyed by group.
- *Alternative — keep the combined endpoint, just drop the 50-cap and page
  client-side:* fewer lines, but ships every decided + seen row on every load,
  which is the unbounded-payload problem the change exists to fix. Rejected.
- *Alternative — two separate endpoints:* more surface for no gain over one
  group-parameterized handler.

**2. `available INTEGER NOT NULL DEFAULT 1` column on `job_openings`**, added via
the existing `_add_column` idempotent migration. A boolean column, not a new
`status` value: availability is orthogonal to seen/suggested/decided, and reusing
`status` would destroy the `seen` verdict the filtered-out list depends on.

**3. Availability swept during the scan's extraction branch only.** After a source
extracts openings (i.e. its link set changed — the link-hash-skip path removed
nothing, so it stays untouched), set `available=0` for that source's `seen` rows
whose URL is not in the current `links` href set. Guard on a healthy link set
(`len(links) >= _MIN_LINKS`) so a flaky/partial JS render doesn't false-flag live
jobs. Compare against raw `links` hrefs, **not** the LLM's `extract_openings`
output, to avoid the model non-deterministically dropping a still-listed URL.
Openings that reappear later are re-flagged available by the same sweep (`set
available = (url in links)` for the source's seen rows), so a transient miss
self-heals on the next scan.

**4. Re-check and the recheckable count exclude `available=0`.** Add `AND
available=1` to `_run_recheck`'s `SELECT` and to `/last-scan`'s `recheckable`
`COUNT(*)`. A taken-down job must never be promoted back to a suggestion, and the
count that gates the Re-check button must match what re-check will actually
examine (the existing invariant).

**5. Frontend: numbered pager, page = replace.** `Jobs.tsx` fetches suggestions
from `/openings` and each archival list from `/openings/page` with its own
`{items, total, page}` state. Each archival list renders one page (`items`
replaces on navigation, not appends) followed by a small reusable **`Pager`**
component (`frontend/src/components/Pager.tsx`): previous/next arrows plus
windowed numbered buttons. The pager takes `{page, pageCount, onChange}` and emits
a page index; `pageCount = Math.ceil(total / limit)`, offset = `page * limit`.
Windowing: show up to 5 page numbers around the current page, with a leading/
trailing `…` and the first/last page pinned when the range overflows; arrows
disabled at the ends; current page marked (`aria-current="page"`). Pager hidden
when `pageCount <= 1`. Built inline — no library — since nothing else in the app
paginates this way and the logic is ~30 lines.
- *Alternative — "Show more" append:* matches the app's existing history/CV-list
  pattern and is less code, but the user explicitly wants numbered page
  navigation that moves to a distinct page of items. Rejected.

After a mutation (accept/reject/restore/suggest-anyway/scan-done) the affected
list refetches its **current** page plus the recheckable count; if that page is
now empty and it was the last page, clamp `page` down one and refetch.

## Risks / Trade-offs

- **JS-rendered boards give an unstable link set → a live job flagged
  unavailable.** → Only sweep when `len(links) >= _MIN_LINKS`; the sweep is
  idempotent and re-marks available on the next scan, so a transient miss
  self-heals. Rows are hidden, never deleted, so a false flag loses nothing.
- **A source is removed/renamed, so its old openings never appear in any future
  link set.** → They stay `available=1` (never swept) and remain in the
  filtered-out list — acceptable; we only hide openings we positively observed
  gone from a source we still scan.
- **`/openings` no longer returns decided/seen (breaking).** → Only `Jobs.tsx`
  and `api.ts` consume it (confirmed by grep); both updated in this change.

## Migration Plan

- `_add_column` adds `available` defaulting to 1, so every existing opening starts
  available and nothing changes until the next scan sweeps a source. Idempotent;
  re-running `init_db()` is safe (backup/import path relies on this).
- Rollback: revert code; the unused `available` column is harmless if left.

## Open Questions

- Page size (`limit`): default 20, matching the current `HISTORY_PAGE`. No reason
  to make it configurable.
- Pager window width fixed at 5 numbered buttons (per the request). Not
  configurable.
