## Context

The Applications page (`frontend/src/pages/Applications.tsx`) joins CV history and
letter history into rows keyed on `job_url`, each a collapsible with a CV | Letter
tab strip. Today three places pick language:

1. `NewApplicationSlot` — one `lang` state (default `'en'`) covering CV + letter.
2. `ApplicationRow.createLang` — one state, but its `LangSelect` is rendered
   inside each tab's `missingArtifact()` CTA, so it reads as per-tab.
3. `CVEditor` — its own relang dropdown → `api.relangCV`, propagating via
   `onLangUpdate`.

Language detection already exists only in the scanner (`review_posting`,
`job_scanner.py`), applied on accept (`jobs.py`). Manual CV/letter generation take
an explicit `lang` and do not detect. `POST /cv/generate` does not consult the
`job_openings.posting_text` cache (letters generation does).

## Goals / Non-Goals

**Goals:**
- One language control per application row governing both artifacts.
- Changing it re-tailors the CV (edits preserved) and regenerates the letter.
- Remove CVEditor's own language dropdown and the per-tab create pickers.
- Auto-detect language for manually-pasted URLs in the New slot.

**Non-Goals:**
- No change to the accepted-job path (already applies detected language).
- No new DB columns, migrations, or dependencies.
- No SSRF/auth work (tracked separately as Phase 7 prerequisites).
- Not caching the detected posting text into `job_openings`.

## Decisions

**D1 — Row owns language; CVEditor loses its dropdown.**
Move relang orchestration up to `ApplicationRow`. The single control's `onChange`
runs, concurrently: `api.relangCV(cv.id, newLang)` (poll → update `cv`) and
`runLetter(jobUrl, newLang)` (new entry → `api.deleteLetter(old.id)`). CVEditor is
keyed by `` `${cv.id}:${cv.lang}` `` so a relang (same history id, new lang/slug)
remounts it against the new preview. *Alternative rejected:* keeping relang inside
CVEditor and driving it via a ref — awkward and leaves the "per-tab" feel the user
objected to.

**D2 — Letter language change = regenerate + delete old.**
Letters have no in-place relang endpoint and are not user-editable, so regenerating
loses nothing. The new guide is a new `letter_history` row; the old-language row is
deleted. Parent `addLetter` also dedupes by `job_url` so the stale row leaves
client state immediately. *Alternative rejected:* adding a letter relang endpoint —
more surface for zero benefit since there are no edits to preserve.

**D3 — Detection is a dedicated lightweight endpoint, not folded into generation.**
Add `detect_language(url, cfg)` in `cv_generator.py` (reusing
`fetch_job_description` + one forced-tool `complete()` returning ISO-639-1) and
`POST /api/cv/detect-lang`. The New slot resolves `'auto'` → concrete code before
calling `runCV`/`runLetter`. *Alternatives rejected:* (a) reuse `review_posting`/
`checkOpening` — heavier call and side-effect `job_openings` row that would surface
in Job Suggestions; (b) `lang="auto"` inside `tailor()`/`build_guide()` — changes
the CV/letter tool schemas and makes each artifact detect independently.

**D4 — LangSelect gains an optional `auto` option.**
Add `auto?: boolean` to `LangSelect`; only the New slot passes it. The row-level
control uses concrete languages only (seeded from the existing artifact, with
`extra` to include a non-shipped detected code).

**D5 — Cancel is a real interrupt, not just stop-waiting.**
Because the local engine serializes every AI call behind one lock, an
uninterrupted slow generation blocks all AI features and pins the user's CPU — a
real problem on low-end laptops. So Cancel must free the engine, not only the UI.
Mechanism: each async job carries a `threading.Event`; the worker publishes it as a
`current_cancel` ContextVar so `complete()` reaches it without threading a `cancel`
arg through every service function. The local engine, when a cancel token is
present, generates with `create_chat_completion(stream=True)` and checks the event
between chunks — llama.cpp only computes a token when the next chunk is pulled, so
stopping the loop is a genuine interrupt (frees the lock within ~one token).
`create_chat_completion` has no `stopping_criteria` param (checked: llama-cpp-python
0.3.33), so streaming is the available interrupt path. `POST /api/cv/cancel/{job_id}`
sets the event; the job ends as status `cancelled`, which the client treats as an
abort (no error). The frontend canceller both aborts its poll(s) and calls the
endpoint for every started job id. *OpenRouter:* honoured only as a pre-call check —
it runs remotely (no local CPU) and is already 120s-capped, so streaming-to-interrupt
isn't worth it. *Alternative rejected:* threading `cancel` through `tailor`/
`build_guide`/etc. — many signature changes vs. one ContextVar.

## Risks / Trade-offs

- **Manual paste does two page reads** (detect + generation) → accepted as "one
  extra page-read"; no posting cache row to avoid a stray Job-Suggestions entry.
- **Independent poll of relang + letter regen** → run via `Promise.allSettled`;
  one failing leaves the other's result intact, error shown inline.
- **CV/letter detected in different languages** (same posting → same result in
  practice) → negligible; the row seeds from the CV and the user can re-sync with
  one change.
- **Stale letter row if delete-old fails** → merge dedupes by newest per URL for
  display, and a reload self-heals; delete is fire-and-forget.
- **Retry after partial failure/cancel** → the control reverts to the previous
  language when any task didn't land (a controlled `<select>` can't re-fire on
  the same value), and each artifact is skipped when already in the target
  language, so re-picking retries only what's still behind.

## Migration Plan

Pure additive backend endpoint + frontend refactor; no data migration. Rollback is
reverting the diff. Update `README.md` / `CLAUDE.md` notes on Applications language
behavior. Add English i18n keys to `en.json` only (pre-commit hook translates).

## Open Questions

None — behavior confirmed with the user (re-generate both on change; auto-detect
manual paste as well as accepted jobs).
