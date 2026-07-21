## 1. Data model

- [x] 1.1 In `app/db.py` `init_db()`, add `_add_column(conn, "job_openings",
      "available INTEGER NOT NULL DEFAULT 1")`.

## 2. Backend — pagination

- [x] 2.1 Narrow `GET /api/jobs/openings` (`list_openings`) to return
      `status='suggested'` rows only; drop the `include_seen` param and its seen
      branch.
- [x] 2.2 Add `GET /api/jobs/openings/page?group=&offset=0&limit=20` → one handler
      returning `{items, total}`. `group='filtered'` → `status='seen' AND
      available=1`; `group='history'` → `status IN ('accepted','rejected')`. Both
      `ORDER BY COALESCE(decided_at, created_at) DESC LIMIT ? OFFSET ?`, with
      `total` from a matching `COUNT(*)`. Reject unknown `group` with 400.

## 3. Backend — availability sweep

- [x] 3.1 In `_run_scan`, after `extract_openings` succeeds for a source and when
      `len(links) >= _MIN_LINKS`, update that source's `seen` rows:
      `available = 1` if the row's URL is in `{l["href"] for l in links}`, else
      `0`. Run in the same `job_openings` write path already used per source.
- [x] 3.2 Add `AND available = 1` to `_run_recheck`'s `SELECT` of `seen` rows and
      to the `recheckable` `COUNT(*)` in `/last-scan`.

## 4. Frontend

- [x] 4.1 `api.ts`: change `getOpenings()` to take no args (suggestions only); add
      `getOpeningsPage(group, offset, limit)` returning `{ items: JobOpening[];
      total: number }`.
- [x] 4.2 Add `frontend/src/components/Pager.tsx`: props `{ page, pageCount,
      onChange }`. Previous/next arrows (disabled at first/last) + windowed numbered
      buttons — up to 5 around the current page, first/last pinned with `…` when
      the range overflows. Mark the current page `aria-current="page"`; render
      nothing when `pageCount <= 1`. i18n aria-labels for prev/next/page-n.
- [x] 4.3 `Jobs.tsx`: hold suggestions from `/openings`, and filtered-out + history
      each from `/openings/page` with their own `{items, total, page}` state
      (offset = `page * limit`). Replace the client-side `historyLimit` slice and
      the `filteredOut` derivation with per-page fetches; render one page of items
      (replace on navigation) followed by `<Pager>`.
- [x] 4.4 After accept/reject/restore/suggest-anyway/scan-done, refetch the
      affected list's **current** page + recheckable count (replacing today's
      `reloadOpenings`); if the page came back empty and it wasn't page 0, clamp
      `page` down one and refetch. Read the filtered-out count label from `total`,
      not the loaded slice length.

## 5. Verify

- [x] 5.1 Backend self-check: with >`limit` seen rows, `/openings/page?group=
      filtered` returns one page + correct `total`, and page 2 returns the rest;
      an unavailable seen row is absent from results and from `recheckable`.
- [x] 5.2 `uv run pytest` passes; manual scan of a source with a removed listing
      confirms the row leaves the filtered-out list after the next scan.
