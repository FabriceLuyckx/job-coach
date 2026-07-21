## 1. Data model

- [x] 1.1 Add a `user_note TEXT` migration to `app/db.py` (idempotent column-add,
  mirroring the existing `available` migration pattern)
- [x] 1.2 Confirm `GET /api/jobs/openings` neither exposes `user_note` to the
  client by accident nor breaks its row shaping

## 2. Backend — capture the reject note

- [x] 2.1 `POST /api/jobs/openings/{id}/reject` accepts an optional JSON body
  `{note}`; store trimmed note into `user_note` (empty/omitted ⇒ leave NULL)
- [x] 2.2 Ensure restore/undo (`/restore`) does not clobber `user_note`

## 3. Backend — learned-preferences memo

- [x] 3.1 `build_preference_memo()` in `job_scanner.py`: read all decided
  openings (accepted `{title, reason}` + rejected `{title, user_note or reason}`),
  one forced/plain `complete()` call distilling them into a capped memo
  (~1200–1500 chars, deduplicated)
- [x] 3.2 `ensure_preference_memo()`: compute a cheap signature (decision count +
  latest `decided_at`); rebuild + cache in `config.json` (`job_preference_memo`,
  `job_preference_memo_sig`) only when it changed, else return cached text
- [x] 3.3 Thread the memo through `review_posting()` as a labelled, untrusted
  context block in the user message (omit when empty); keep the tool call forced
- [x] 3.4 Resolve the memo once in `_run_scan` / `_run_recheck` and pass it to
  every `_review_one`; wire `/check` to the same helper. No memo work on the
  reject/accept endpoints (action stays instant)
- [x] 3.5 Verify unchanged-source link-hash skip still makes zero LLM calls, and
  the memo is not rebuilt when no decision changed

## 4. Frontend — reject modal

- [x] 4.1 `api.ts`: `rejectOpening(id, note?)` sends the optional note
- [x] 4.2 `Jobs.tsx`: Reject (in suggestions and History) opens the shared
  `Modal` with an optional `textarea` + Reject/Cancel; confirm calls
  `rejectOpening`; Cancel leaves the row untouched; Undo toast still works
- [x] 4.3 Add `en.json` keys for the modal title, placeholder, help, and actions
  (do NOT run translate_locales.py — the pre-commit hook owns it)

## 5. Tests & docs

- [x] 5.1 Test `ensure_preference_memo()` caching: rebuilds when the signature
  changes, reuses the cache when it doesn't (stub the LLM call to count rebuilds)
- [x] 5.2 Test reject persists a note; empty note ⇒ NULL and plain reject
- [x] 5.3 Update `CLAUDE.md` (Phase 5/6 + data model: `user_note`, preference
  memo in `config.json`, memo-aware review) and `README.md` if usage changes
- [x] 5.4 `uv run pytest` green; manual scan sanity check that a review prompt
  includes the memo block once at least one opening is decided
