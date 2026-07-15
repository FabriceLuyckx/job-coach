## Why

On the Applications page, language is chosen in several places at once: the CV
editor has its own re-translate dropdown, and each tab's "create missing
artifact" CTA has a separate language picker. Language is really one property of
the whole application, so scattering it per-tab is confusing and lets a CV and
its cover letter drift into different languages. This change is a Phase 4
(Applications UI) refinement — no new phase.

## What Changes

- Applications rows get **one language control per listing**, shown above the
  CV | Letter tab strip, that governs both artifacts.
- Changing the listing language **re-tailors the existing CV** (preserving edits,
  via the existing relang path) **and regenerates the existing cover-letter
  guide** in the new language (replacing the old-language guide).
- **BREAKING (UI):** the CV editor's own per-CV language dropdown is removed; the
  per-tab "create" language pickers are removed. Language lives only at the row
  level.
- The **New application slot** defaults to **Auto-detect**: a manually-pasted job
  URL has its language detected before generating, so CV + letter come out in the
  posting's language without the user guessing.
- New backend endpoint **`POST /api/cv/detect-lang`** returns the posting's
  ISO-639-1 language from its URL (one page fetch + one forced-tool LLM call).
- Listings accepted from Job Suggestions are unchanged: their language is already
  detected server-side and applied on accept.

## Capabilities

### New Capabilities
- `applications-language`: how the Applications page presents and applies the
  language of an application — a single per-listing control that re-generates
  both the CV and the cover-letter guide, plus auto-detection of a pasted
  posting's language when creating a new application.

### Modified Capabilities
<!-- none — no existing specs in openspec/specs/ -->

## Impact

- **Backend**: `app/services/cv_generator.py` (new `detect_language()` helper +
  tool schema), `app/api/cv.py` (new `POST /api/cv/detect-lang` endpoint). Reuses
  `fetch_job_description()` and `complete()`. No DB or model changes.
- **Frontend**: `frontend/src/pages/Applications.tsx` (listing-level control,
  relang+regenerate on change, Auto-detect in New slot),
  `frontend/src/components/cv/CVEditor.tsx` (remove relang dropdown + machinery,
  drop `onLangUpdate`), `frontend/src/components/LangSelect.tsx` (optional
  Auto-detect option), `frontend/src/api.ts` (new `detectLang` client),
  `frontend/src/locales/en.json` (new English keys only — the pre-commit hook
  translates).
- **Cost**: manual-paste detection adds one extra page read + one small LLM call
  before generating. Accepted-job flow cost is unchanged.
- **Docs**: update README/CLAUDE.md notes on the Applications language behavior.
- No dependency, schema, or auth/SSRF surface changes.
