## 1. Backend — language detection

- [x] 1.1 Add `_DETECT_TOOL` (one field `lang`, forced tool) and
  `detect_language(url, cfg, job_text=None) -> str` to
  `app/services/cv_generator.py`, reusing `fetch_job_description` + `complete()`
  (small `max_tokens`), validating to a 2-letter code with `'en'` fallback like
  `review_posting`.
- [x] 1.2 Add `DetectRequest{url}` model + `POST /api/cv/detect-lang` in
  `app/api/cv.py` → `{"lang": detect_language(body.url, cfg)}` after
  `config.require_engine(cfg)`.
- [x] 1.3 Add a minimal test (`tests/`) asserting the code-validation/fallback of
  `detect_language` (mock `complete` / bad code → `'en'`).

## 2. Frontend — API client & LangSelect

- [x] 2.1 Add `detectLang(url) => request<{lang:string}>('/cv/detect-lang', POST {url})`
  to `frontend/src/api.ts`.
- [x] 2.2 Add optional `auto?: boolean` prop to
  `frontend/src/components/LangSelect.tsx` that prepends an
  `<option value="auto">` (Auto-detect) label.

## 3. Frontend — New application slot auto-detect

- [x] 3.1 In `NewApplicationSlot` default `lang` to `'auto'` and render
  `<LangSelect ... auto />`.
- [x] 3.2 In `generate()`, when `lang === 'auto'`, `await api.detectLang(url)`
  first (show a "detecting" busy state), set the resolved code, then call
  `launch({..., lang: resolved})`. Leave the resume-from-accept `useEffect` path
  unchanged.

## 4. Frontend — listing-level language control (ApplicationRow)

- [x] 4.1 Rename `createLang` → `lang` (same seed) and render ONE `<LangSelect>`
  above the `.seg` tab strip, with `extra` = existing artifact lang and a spinner
  while busy.
- [x] 4.2 Implement `changeListingLang(newLang)`: no-op if unchanged/busy; else run
  concurrently (`Promise.allSettled`) — relang the CV (`api.relangCV` → update `cv`)
  and regenerate the letter (`runLetter` → `onLetterGenerated` + `api.deleteLetter`
  of the old row); update `lang`; surface errors inline.
- [x] 4.3 Remove the `LangSelect` from `missingArtifact()` (keep only the Create
  button, using `lang`).
- [x] 4.4 Key `CVEditor` by `` `${cv.id}:${cv.lang}` `` and drop the `onLangUpdate`
  prop from the call site.

## 5. Frontend — parent & CVEditor cleanup

- [x] 5.1 In `ApplicationsPage.addLetter`, also dedupe by `job_url` (guarded to
  non-null `e.job_url`) so a language-changed letter drops the stale row.
- [x] 5.2 In `frontend/src/components/cv/CVEditor.tsx` remove the language
  `<label>` block, the relang machinery (`changeLang`, `relanging`, `pendingLang`,
  `onLangUpdate` prop) and the relang branch of the busy overlay; simplify
  `busyAI` to `regenerating`; remove the now-unused `LangSelect` import (keep
  `langLabel`/`LANGUAGE_NAMES` for the retailor modal).

## 6. i18n & docs

- [x] 6.1 Add English keys to `frontend/src/locales/en.json` only (Auto-detect
  option, "Detecting language…", listing "Changing language…" busy). Do NOT run
  `translate_locales.py` — the pre-commit hook handles translations.
- [x] 6.2 Update `README.md` and the Applications/Phase 4 notes in `CLAUDE.md` to
  describe the single per-listing language control + Auto-detect.

## 7. Cancellation guardrail (real interrupt, not just stop-waiting)

- [x] 7.1 Backend engine interrupt: add `GenerationCancelled` + a `_current_cancel`
  `ContextVar[threading.Event]` to `app/services/llm.py`; `complete(..., cancel=None)`
  resolves the event from the arg or the contextvar and passes it to the engine.
- [x] 7.2 `engines/local.py`: when a cancel event is present, run
  `create_chat_completion(stream=True)`, accumulate deltas, and check the event each
  chunk — raise `GenerationCancelled` (inside `with _lock`, so the lock frees) when
  set; also check right after acquiring the lock so a queued-then-cancelled job never
  generates. `engines/openrouter.py`: accept `cancel`, raise if already set before the
  remote call (ponytail: remote call is 120s-capped and off the user's CPU).
- [x] 7.3 `app/api/cv.py`: give each job a `threading.Event`; both worker paths
  (`run_async` + `_run_generation`) set the contextvar and map `GenerationCancelled`
  to status `"cancelled"`. Add `cancel_job()` + `POST /api/cv/cancel/{job_id}`. Strip
  the non-serializable `cancel` key from `GET /status`.
- [x] 7.4 Frontend: `api.ts` add `cancelCVJob(id)`, `JobStatus` gains `'cancelled'`,
  `pollCVJob` treats a `cancelled` status as `PollAbortedError`; `runCV`/`runLetter`
  report their `job_id` via an `onJobId` callback so a canceller can hit the server.
- [x] 7.5 Wire Cancel into all three long-running Applications flows — row
  `create()`, `changeListingLang()` (relang + letter regen), and the New slot
  `launch()` — each abort its poll(s) AND `cancelCVJob` its started job ids; add the
  Cancel buttons + an English hint that the local model is slow.
- [x] 7.6 A backend test: a cancel event set mid-generation surfaces as a
  `cancelled` job (local path mocked so no model needed).

## 8. Verify

- [x] 8.1 `uv run pytest` and `cd frontend && npm run build` (type check) pass.
- [x] 8.2 Manual end-to-end (per design/plan): New-slot Auto-detect on a
  non-English URL generates both artifacts in the detected language; one row-level
  control drives relang + letter regen; missing-sibling create uses the listing
  language.
- [x] 8.3 Cancel a running local generation and confirm it stops promptly and the
  engine is free for the next AI action (not blocked until it would have finished).
