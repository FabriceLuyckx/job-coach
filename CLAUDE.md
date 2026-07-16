# Job Coach — Project Plan & Documentation

## Overview

An AI-powered career assistant with two main pipelines:

1. **CV Generator** — Build tailored CVs from a career profile, targeted at specific job openings
2. **Job Suggestions** — Scan user-added job-listing pages, AI-filter new openings against the profile, and accept/reject them (accept generates a tailored CV)

The app runs locally first, designed for easy cloud deployment. AI is powered via OpenRouter (routing to Anthropic Claude models). The UI is browser-based and should be usable by non-technical people.

---

## Current State (as of 2026-06-23)

| Artifact | Status | Notes |
|----------|--------|-------|
| `profile/profile.json` | Done | Full structured career data from questionnaire |
| `templates/cv/default.html` | Done | Two-column Jinja2 CV template with language support and photo slot |
| `scripts/generate_cv.py` | Done | CLI: `--lang`, `--job`, photo support, job-slug output dirs |
| `app/services/cv_generator.py` | Done | `tailor()` + `apply_tailoring()` — called by CLI and API |
| `app/services/cv_renderer.py` | Done | Shared Jinja2 utilities (LABELS, filters, photo) |
| `app/services/job_scanner.py` | Done | Phase 5/6 — extract openings, link-hash skip, title prescreen, per-posting read → verdict + digest |
| `app/services/letter_guide.py` | Done | Cover-letter **writing skeleton** (3–5 sections with per-section evidence + writing tips) from a posting URL — never writes the letter |
| `app/api/letters.py` | Done | `/api/letters/*` — generate (async, reuses cv job store) + history CRUD |
| `scripts/tailor_cv.py` | Done | CLI: fetch URL → Claude → tailored HTML |
| `app/db.py` | Done | SQLite: `cv_history` (P4), `job_sources` + `job_openings` (P5) |
| FastAPI backend | Done | Phases 4–5 — all endpoints live |
| React frontend | Done | Phases 4–5 — Profile editor, CV Generator, Job Suggestions, Settings |
| Job Suggestions | Done | Phase 5 — user-added sources, AI scan + filter, accept/reject |
| Job matching | Not started | Phase 6 |
| Cloud deployment | Not started | Phase 7 |

---

## Architecture

### Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend | Python / FastAPI | User knows Python well |
| Frontend | React (TypeScript) | Simple SPA, served by FastAPI locally. Fully internationalized via react-i18next (English source catalog `frontend/src/locales/en.json`; shipped locales nl/fr/de/es/it/pt/pl) |
| Profile data | `profile/profile.json` | Human-readable, version-controllable |
| Jobs data | SQLite → PostgreSQL | SQLite locally, Postgres for cloud |
| AI | Pluggable engine (`app/services/llm.py` → `engines/`) | **OpenRouter** (Claude, default) or a **free local GGUF** run in-process via llama-cpp-python. Every call goes through `complete()`; provider chosen by `llm_provider` in `config.json` |
| CV output | HTML → PDF (headless Chromium) | Jinja2 templates; PDF rendered server-side via Playwright |
| Local run | uvicorn | `uvicorn app.main:app --reload` |
| Cloud (future) | Railway (backend) + Vercel (frontend) | Phase 6 |

### Target Directory Structure

```
job-coach/
├── profile/
│   ├── profile.example.json      # Sanitized sample profile (committed; seeds profile.json)
│   ├── profile.json              # Career data source of truth (gitignored — personal)
│   └── photo.jpg                 # Optional CV photo (jpg/jpeg/png/webp accepted)
├── templates/
│   └── cv/
│       ├── default.html          # Base CV Jinja2 template (two-column, dark blue)
│       └── academic.html         # (future) Academic-focused variant
├── output/                       # Generated CVs — gitignored
│   ├── cv_en.html                # Generic English CV
│   ├── cv_nl.html                # Generic Dutch CV
│   └── <job-slug>/               # Per-opening directory
│       ├── cv_en.html
│       └── cv_nl.html
├── scripts/
│   └── generate_cv.py            # CLI: profile.json → CV HTML
├── jobs/
│   └── jobs.db                   # SQLite: cv_history, job_sources, job_openings
├── app/                          # FastAPI backend
│   ├── main.py
│   ├── config.py                 # Persistent config (config.json) for API key & model
│   ├── db.py                     # SQLite setup: init_db(), get_db()
│   ├── api/
│   │   ├── profile.py            # Profile CRUD endpoints
│   │   ├── cv.py                 # CV generation, history, preview endpoints
│   │   ├── settings.py           # Settings + photo upload endpoints
│   │   ├── letters.py            # Cover-letter guide: generate (async) + history
│   │   └── jobs.py               # Job sources, scan, accept/reject (Phase 5)
│   └── services/
│       ├── llm.py                # Provider-neutral complete() + LLMResponse/ToolCall + response validation
│       ├── engines/              # AI providers: openrouter.py, local.py (llama.cpp), registry.py
│       ├── cv_generator.py       # OpenRouter-powered tailored CV generation
│       ├── letter_guide.py       # Posting URL → cover-letter writing guide (not a letter)
│       ├── cv_renderer.py        # Shared Jinja2 utilities (+ PHOTO_EXTS, load_profile)
│       ├── job_scanner.py        # Extract openings from a page + profile-filter (Phase 5)
│       └── job_matcher.py        # Job scoring/filtering via Claude (Phase 6)
├── tests/
│   └── test_hardening.py         # Upload/zip guards, slug + LLM-config helpers (uv run pytest)
├── frontend/                     # React + TypeScript SPA (Vite)
│   └── src/
│       ├── pages/
│       │   ├── Profile.tsx       # View/edit CV data only (auto-saves as you type)
│       │   ├── Preferences.tsx   # Five-question job-matching form (flat, no collapsibles)
│       │   ├── Applications.tsx  # One row per job (CV + cover-letter guide joined on job_url), CV|Letter tabs; replaces the old CVGenerator + Letters pages
│       │   ├── Jobs.tsx          # Job sources, AI suggestions, accept/reject (Phase 5)
│       │   └── Settings.tsx      # OpenRouter API key, model, photo; Advanced → AI prompts
│       ├── components/           # Shared UI: Button/SaveButton/RemoveButton, Toast,
│       │   │                     #   Modal, Collapsible, Badge, EmptyState, ErrorBoundary,
│       │   │                     #   KeyStatus (API-key onboarding), CreditChip
│       │   ├── cv/CVEditor.tsx   # Per-CV editor panel (preview, Update-CV modal, plan edits)
│       │   ├── letters/GuideView.tsx # Renders one cover-letter guide (+ Copy as Markdown); reused by future Application view
│       │   ├── ProfileSection.tsx # Section/Field primitives shared by Profile + Preferences
│       │   ├── TagInput.tsx
│       │   └── BulletListEditor.tsx
│       ├── lib/                  # handoff.ts (Jobs↔CV localStorage keys), usePoller.ts,
│       │   │                     #   errors.ts (errMsg), format.ts (dates),
│       │   │                     #   useProfileAutosave.ts (debounced save, shared by
│       │   │                     #   Profile + Preferences), profileSections.ts (registry)
│       ├── api.ts                # Typed API client
│       └── types.ts              # TypeScript models for profile data
├── setup.sh                      # One-command macOS dev setup (deps + seed config/profile)
├── config.json.example           # Template for config.json (committed)
├── config.json                   # API keys & model — never commit (gitignored)
├── pyproject.toml                # uv-managed dependencies
├── CLAUDE.md                     # This file
└── README.md
```

---

## Phases

### Phase 1 — Data Foundation ✅ Complete

**Goal**: Translate questionnaire into structured data and generate a first CV.

**Deliverables**:
- `profile/profile.json` — complete structured career data (all sections from the questionnaire)
- `templates/cv/default.html` — CV HTML template (two-column, dark blue, A4, spacious, sans-serif)
- `scripts/generate_cv.py` — CLI to render an HTML CV from profile.json

---

### Phase 2 — Adaptable CVs ✅ Complete

**Goal**: Make CV generation flexible — per-language output, optional photo, job-specific tracking.

**Features**:
- `--lang en|nl` flag (default: `en`) — section titles translated per language
- `--job "Company Role"` flag — output goes to `output/<slug>/cv_<lang>.html` for tracking per opening
- Optional photo: place `profile/photo.jpg` (or `.png`/`.webp`) and set `include_photo: true` in `profile.json` — embedded as a base64 data URI so the HTML is self-contained
- `strip_scheme` filter for clean URL display in the template

**Usage**:
```bash
# Generic CV in English
uv run python scripts/generate_cv.py

# Dutch CV for a specific opening
uv run python scripts/generate_cv.py --lang nl --job "UGent Data Science Lecturer"
# → output/ugent-data-science-lecturer/cv_nl.html
```

**Output convention**:
```
output/
├── cv_en.html                     # Generic English CV
├── cv_nl.html                     # Generic Dutch CV
└── <job-slug>/
    ├── cv_en.html                 # English CV tailored for this opening
    └── cv_nl.html                 # Dutch CV tailored for this opening
```

**Adding a new language**: Add a key to the `LABELS` dict in `scripts/generate_cv.py` and add it to the `--lang` choices.

---

### Phase 3 — AI CV Generator ✅ Complete

**Goal**: Use Claude to tailor the CV content for a specific job opening — as a CLI script, no UI needed yet.

**User flow**:
1. Run `scripts/tailor_cv.py --url <job posting URL>`
2. Script fetches the job page and strips navigation/boilerplate
3. Claude reads `profile.json` + the cleaned job text and returns a structured tailoring plan
4. Plan is applied to the Jinja2 template; output saved to `output/<slug>/cv_<lang>.html`

**Key files**:
- `app/services/cv_generator.py` — `tailor()` and `apply_tailoring()` (also called by Phase 4 FastAPI endpoint)
- `app/services/cv_renderer.py` — shared Jinja2 rendering utilities (LABELS, filters, load_photo)
- `scripts/tailor_cv.py` — thin CLI wrapper

**Claude tool use schema** (`cv_tailoring_plan`):
```json
{
  "summary": "3-4 sentence summary tailored to this role",
  "selected_experience_ids": ["realo-immoweb-em", "realo-data-storyteller"],
  "adjusted_responsibilities": {
    "realo-immoweb-em": ["Rewritten bullet matching job language..."]
  },
  "highlighted_skills": ["Python", "Data analysis"],
  "slug": "ugent-data-scientist",
  "tailoring_notes": "Why this role matches and what was emphasised"
}
```

**CLI**:
```bash
# Set openrouter_api_key via the Settings page (saved to config.json) or:
#   echo '{"openrouter_api_key":"sk-or-..."}' > config.json
uv run python scripts/tailor_cv.py --url https://example.com/jobs/123
uv run python scripts/tailor_cv.py --url https://... --lang nl
# → output/<slug>/cv_<lang>.html
```

**AI provider**: OpenRouter (`https://openrouter.ai/api/v1`), using OpenAI SDK.  
**Default model**: `anthropic/claude-sonnet-4-6` (configurable via Settings page or `config.json`).

---

### Phase 4 — Profile Web UI ✅ Complete

**Goal**: Browser-based interface to view and edit the career profile without touching JSON directly.

**Features**:
- Profile editor (CV data only, since the v3 restructure — see Data Formats below)
  split into always-visible **core** sections (Personal, Summary, Experience,
  Skills, Languages, Education) and **optional** sections added via **+ Add a section**; each
  section badged by where its data goes (On your CV / Helps the AI). The separate
  **Preferences** page is a flat five-question form (numbered cards, no
  collapsibles): target job titles, where/how to work (locations, a segmented
  working-style control, languages), what makes a great match, dealbreakers
  (with one-tap example chips), and practical notes — the data that drives job
  matching, not the CV
- Inline editing of any field (text, lists, dates) with **auto-save** (debounced
  ~1.5s, single-flight; status shown in the page header; item removals get a 5s
  Undo toast) — there are no manual Save buttons on the Profile or Preferences page
- Configure OpenRouter API key (stored in `config.json`, shown masked in UI);
  an app-wide banner guides first-run users to Settings until a key is set
- Trigger CV generation and preview from the browser
- History of previously generated CVs (persisted in `jobs/jobs.db`)
- Photo upload/delete via settings

**API endpoints**:
```
GET  /api/profile              Return full profile JSON (blank skeleton if none yet)
PUT  /api/profile              Save updated profile JSON
POST /api/profile/import       Extract a profile from a CV (PDF/text) → returned for review, not saved
GET  /api/settings             Return app settings (API key masked; incl. llm_provider, app_language)
PUT  /api/settings             Update settings (key, model, llm_provider, app_language, onboarding_done)
GET  /api/engine               AI-engine status {provider, ready, detail, model} — the app-wide "AI ready" check
GET  /api/engine/models        Local-model registry (label, size, RAM, downloaded?)
POST /api/engine/download      Start downloading the local GGUF (disk/RAM pre-checks; force overrides RAM) → {download_id}
GET  /api/engine/download/status[/{id}]  Download progress {state, bytes_done, bytes_total, error}
DELETE /api/engine/model       Delete the downloaded GGUF
POST /api/i18n/generate        Translate the UI catalog + CV labels into a language on-device → runs in background
GET  /api/i18n/generate/status/{lang}  On-device translation progress
GET  /api/i18n/{lang}          Serve a UI locale catalog (shipped bundle or generated)
POST /api/settings/photo       Upload profile photo
GET  /api/settings/photo       Return photo as base64 data URI
DELETE /api/settings/photo     Remove photo
POST /api/cv/generate          Generate tailored CV → saves HTML + history row
POST /api/cv/detect-lang       Detect a posting's language (ISO 639-1) from its URL — Applications 'New' slot Auto-detect
GET  /api/cv/history           Return all generated CVs, newest first
GET  /api/cv/preview/{slug}    Return CV HTML for browser preview
GET  /api/cv/pdf/{slug}/{lang} Render CV to a real PDF (headless Chromium) for download
POST /api/letters/generate     Async: posting URL → cover-letter writing guide (poll via /api/cv/status/{job_id})
GET  /api/letters/history      Generated guides, newest first (guide JSON parsed)
DELETE /api/letters/history/{id} Delete a guide
GET  /api/backup/export        Download a .zip of user data (config sans secrets, profile, photo, jobs.db, output)
POST /api/backup/import        Restore a backup .zip (full replace, API key preserved) → re-runs db migrations
```

**Cover Letter** (`app/api/letters.py`, `app/services/letter_guide.py`): given a
posting URL, one forced-tool LLM call (`letter_guide`) returns a lean *writing
skeleton* — a 3–5 section `structure` (each `{title, goal, evidence}`, where
`evidence` is the real profile facts to cite in that section) plus a short `tips`
list (address a real person, quantify impact, ~250–350 words, tone/language) —
**never a written letter** (a deliberate product stance, surfaced in the page's
explainer). `GuideView` tolerates pre-simplification stored rows (old
angle/evidence-map/gaps/tone + per-section `pointers`) by ignoring unknown fields
and falling back to `pointers`.
Reuses the CV router's async job store (`run_async` + `/api/cv/status`), reuses a
scan's cached `posting_text` when the URL was seen before (no re-scrape), and passes
the profile minus `meta`/`cv_design_preferences` (keeping `preferences`, the
motivation data a letter needs — unlike `profile_for_tailoring`). Stored in
`letter_history` (pure JSON, one row per generation). `job_url` is the join key the
**Applications** page uses to pair a guide with its CV; `GuideView` is standalone and
rendered there in the Letter tab. `start_letter_generation()` is the reusable async
starter (shared by `POST /api/letters/generate` and the Jobs accept flow). Editable
prompt: `letter_prompt` (Settings → Advanced), `{lang_name}`-guarded.

**Applications page** (`frontend/src/pages/Applications.tsx`) merges the former CV
Generator and Cover Letter pages into one: it client-side-joins `GET /api/cv/history`
and `GET /api/letters/history` on `job_url` into one row per job, each row a
`Collapsible` with a `.seg` **CV | Letter** tab strip (only one artifact rendered at a
time, so neither editor gets denser). Reuses `CVEditor` and `GuideView`. **Language is
one setting per listing**: a single `LangSelect` above the tab strip owns the whole
application's language — changing it re-tailors the existing CV (via `relangCV`, edits
preserved) *and* regenerates the existing letter (`runLetter`, deleting the old-language
row), in parallel; a missing artifact adopts it when created. `CVEditor` no longer has
its own language dropdown (it's keyed by `` `${cv.id}:${cv.lang}` `` so a relang result
remounts it). The **New** slot's language defaults to **Auto-detect**: a manually-pasted
URL is language-detected (`POST /api/cv/detect-lang` → `detect_language()` in
`cv_generator.py`, one fetch + one small forced-tool call) before generating; accepted
jobs already carry their server-detected language. The **New** slot generates CV and/or
letter (checkboxes, both default on), polled independently. Handoff from Jobs lands here
via the `application_pending` localStorage key. Old `/cv` and `/letters` routes redirect
here. Every long generation (create, New slot, language change) shows a **Cancel** that
both aborts the client poll and calls `POST /api/cv/cancel/{job_id}` to **interrupt the
engine** — the local provider serializes all AI behind one lock, so a runaway generation
would otherwise block every feature. Cancellation plumbing: a per-job `threading.Event`
surfaced to `complete()` via the `current_cancel` ContextVar (`app/services/llm.py`); the
local engine streams (`create_chat_completion(stream=True)`) and checks the event between
chunks, raising `GenerationCancelled` → job status `cancelled` (client treats it as an
abort, not an error).

**Backup & restore** (`app/api/backup.py`): export bundles the writable data dir —
`config.json` (with `openrouter_api_key` stripped), `profile/profile.json` + photo,
`jobs/jobs.db`, and `output/` — into one `.zip` with a `manifest.json` marker. Import
validates the marker, guards against path traversal, clears the existing profile photo +
`output/`, extracts under `DATA_DIR`, and **merges** config (so the destination's API key
survives) rather than overwriting it, then re-runs `db.init_db()`. Read-only bundled assets
(templates, frontend) are intentionally excluded. Surfaced in **Settings → Backup & Restore**.

**cv_history table** (`jobs/jobs.db`):
```
id              TEXT PRIMARY KEY (UUID)
slug            TEXT
job_title       TEXT
employer        TEXT
job_url         TEXT
lang            TEXT
tailoring_notes TEXT
created_at      TEXT (ISO 8601)
```

**Run locally**:
```bash
# Terminal 1 — backend
uvicorn app.main:app --reload

# Terminal 2 — frontend dev server
cd frontend && npm run dev
# Frontend: http://localhost:5173  Backend: http://localhost:8000
```

---

### Phase 5 — Job Suggestions ✅ Complete

**Goal**: Watch user-added job-listing pages and surface openings that match the profile, without re-paying for pages already seen.

**User flow** (Job Suggestions page):
1. Add job-listing page URLs one by one (stored in `job_sources`).
2. **Find new listings** scans every source. Per source, in cost order: (a) read the page's actual `<a href>` links; if their hash equals last scan's (`job_sources.links_hash`), skip the source entirely — nothing new can exist. (b) LLM picks which links are real openings; dedup against `job_openings` by URL. (c) **Title prescreen** — a high-recall LLM triage drops only clearly off-target new openings (skipped, keep-all, at ≤5 new). (d) For each survivor: **fetch the posting page once** and make **one LLM call** returning a match verdict *and* a structured digest (employer, location, remote, contract, salary, deadline, ~50-word summary, top requirements). This is what lets preferences a title can't express (`avoid`, `notes`, `remote`) actually filter. Last-scan time shows beside the button (`jobs_last_scan` in config.json).
3. Matching openings show as **Suggestions** (info left, Accept/red-Reject right) with a one-line reason, detected language, and the digest fields as chips + summary (the deadline chip is accented). Non-matches are stored as `seen` **with their reason kept** and their scraped text/digest cached — surfaced in a collapsible **Filtered out** section (each with **Suggest anyway** → restore). A posting whose page can't be read still shows as a suggestion with a "couldn't read the posting page" caveat rather than being buried. Past the 5th suggestion, a search box + source filter appear.
4. **Accept** → marks `accepted`, kicks off **both** CV generation (reuses `cv.start_generation`, passing the cached `posting_text` so the page is **not** re-scraped) **and** cover-letter-guide generation (`letters.start_letter_generation`, which reuses the same cached posting itself) from its URL in the *detected language*, and hands off to the **Applications** page (via the `application_pending` localStorage key holding `{jobUrl, cvJobId, letterJobId}`) which shows both artifacts building. **Reject** greys it out.
5. **History** keeps accepted + rejected openings (full info, recency-first, paged with "Show more"; rejected greyed). Accepted rows have **Open CV** (deep-links to the matching CV via `cv_open_url` → matched by `job_url`) and can still be rejected.
6. **Re-check filtered jobs** re-judges the cached `seen` openings against the current profile (rescuing ones improved Preferences now match); **Check a specific job** runs any pasted URL through the same review — for a posting found off-platform.

**Reading the page** (`app/services/headless.py` — the one place HTTP+headless fetching lives): `http_get()` tries plain httpx; `render_html(url, browser=None)` falls back to a headless render (reusing a passed-in browser when given). `fetch_listing_links()` uses these when a page yields too few links (JS-built boards). During a scan, all surviving postings are fetched via `fetch_texts()` — parallel httpx (pool of 4), then the too-short ones rendered sequentially through **one** shared browser — so a scan launches Chromium at most once, not per posting. LLM review stays sequential (the local engine serialises it behind a lock). The LLM only ever returns URLs actually on the page (hallucination guard). Verify a source with `uv run python scripts/scan_debug.py --url <page>`.

**Token-cost design**: unchanged sources cost **zero** LLM calls (link-hash skip). For a changed source, link extraction carries no profile context; the title prescreen runs only when >5 new openings survive dedup; the expensive per-posting call is paid **exactly once per opening ever** (URL dedup + `posting_text`/`posting_json` cache) and only for openings that survive the prescreen. The expensive text is read at the moment it can change a decision, and never again.

**Editable prompts** (Settings → **Advanced — AI prompts**, collapsed by default): the link-extraction and relevance-filter prompts (`scan_extract_prompt`, `scan_filter_prompt`) mirror the CV Generator prompt. `scan_filter_prompt` now drives the per-posting verdict+digest call; the title prescreen has its own non-editable default (`DEFAULT_PRESCREEN_PROMPT`) — no third Settings prompt. The CV prompt must keep the `{lang_name}` placeholder (validated client- and server-side).

**Key files**:
- `app/services/headless.py` — `http_get()`, `render_html(url, browser=)`, `text_from_html()`, `fetch_text()` (one URL) and `fetch_texts()` (many, parallel + shared browser). Both `job_scanner` and `cv_generator.fetch_job_description()` fetch through here (no import cycle).
- `app/services/job_scanner.py` — `fetch_listing_links()`, `links_hash()`, `extract_openings(…, links=)`, `prescreen_openings()` (high-recall title triage → survivor list), `review_posting()` (judge one posting → `{match, reason, lang, digest}`); `DEFAULT_EXTRACT_PROMPT`, `DEFAULT_PRESCREEN_PROMPT`, `DEFAULT_SCAN_PROMPT`.
- `app/api/jobs.py` — source CRUD; `_review_one()` (shared shape-a-row helper: empty text/review error ⇒ suggested-with-caveat); threaded `/scan` + `/recheck`; `/check`; `/last-scan`; openings list; accept/reject/restore
- `frontend/src/pages/Jobs.tsx` — sources, scan, **check a specific job**, suggestions (with search/source filter past 5), **filtered-out** collapsible, history (paged); `scripts/scan_debug.py` — verification CLI

**API endpoints**:
```
GET    /api/jobs/sources                List watched sources
POST   /api/jobs/sources                Add a source {url} (name derived from host)
DELETE /api/jobs/sources/{id}           Remove a source
POST   /api/jobs/scan                   Async scan of all sources → {scan_id}
POST   /api/jobs/recheck                Async re-judge of 'filtered out' openings against the current profile → {scan_id}
GET    /api/jobs/scan/status/{scan_id}  Poll scan/recheck status (shared dict)
POST   /api/jobs/scan/cancel/{scan_id}  Signal a running scan/recheck to stop (interrupts the in-flight local generation); status → 'cancelled'; 404 if unknown
GET    /api/jobs/last-scan              {last_scan, profile_changed} (nudge to re-check after profile edits)
GET    /api/jobs/openings[?include_seen] Suggested + decided openings; include_seen also appends the 50 newest 'filtered out'
POST   /api/jobs/check                  Judge one pasted URL {url} → the opening row (existing rows returned as-is, no LLM call)
POST   /api/jobs/openings/{id}/accept   Mark accepted + generate CV AND cover-letter guide (both reuse cached posting_text) → {cv_job_id, letter_job_id, job_url, lang}
POST   /api/jobs/openings/{id}/reject   Mark rejected (also works from History)
POST   /api/jobs/openings/{id}/restore  Back to 'suggested' (Undo for reject; also "Suggest anyway" for filtered rows)
```

**Scan status** (`GET /api/jobs/scan/status/{scan_id}`, shared by scan +
recheck) reports progress while running (`current`/`total`/`source` for the
source loop, `reading_current`/`reading_total` for the per-posting loop) and,
when done, `found` plus a per-source `errors` map (`{source name: message}`) so
a broken source is visible instead of silently skipped. The scan runs in a
daemon thread whose status stays queryable for 1h, so navigating away from the
page and back **resumes** the running display (the frontend remembers the active
scan id module-side and re-attaches its poller on mount). A **Cancel** button
(mirroring CV generation) hits `POST /api/jobs/scan/cancel/{scan_id}`, which sets
a `threading.Event` published via the `current_cancel` ContextVar so the local
engine interrupts the in-flight generation (status → `cancelled`, no
`jobs_last_scan` stamp). **Cancelled work is never re-paid**: `_run_scan`
persists each opening's verdict the moment it exists (prescreened-out rows right
after the prescreen, each survivor immediately after its review) and stamps a
source's `links_hash` + `last_scanned` only once it completes uncancelled — so a
re-scan re-runs only cheap link extraction and reviews nothing already judged
(the "paid exactly once per opening ever" invariant survives cancellation). The
source list shows each source's `last_scanned` time (stamped on every successful
pass, including the link-hash skip).

**Trust & recall**: a review's `reason` is stored even for non-matches, so the
`seen` rows are auditable. The **Filtered out** UI section (a collapsible fed by
`?include_seen`) shows them with **Suggest anyway** (→ restore). **Re-check
filtered jobs** (`/recheck`) re-runs `review_posting` on the cached
`posting_text` of up to 100 recent `seen` rows against the current profile — no
fetching — so improved Preferences can rescue past openings for free.
`PUT /api/profile` stamps `meta.last_updated`; `/last-scan` compares it to the
newest of `jobs_last_scan`/`jobs_last_recheck` (config keys) to nudge a
re-check — running either clears the nudge. A review failure during recheck
keeps the row's old verdict (the suggested-with-caveat fallback is scan-only,
where a new opening must not be buried).

**Data model** (SQLite):
```
job_sources:  id, url (UNIQUE), name, created_at, links_hash, last_scanned
job_openings: id, url (UNIQUE), title, source_url,
              status (seen|suggested|accepted|rejected),
              reason, lang, cv_slug, created_at, decided_at,
              posting_text (scrape cache, ≤20k chars),
              posting_json (digest: employer/location/remote/contract/
                            salary/deadline/summary/requirements)
```
`GET /api/jobs/openings` parses `posting_json` into a `digest` object and never
ships `posting_text` to the client. Scan status also reports
`reading_current`/`reading_total` during the per-posting Stage-2 loop.

---

### Phase 6 — Job Matching & Filtering

**Goal**: Add explicit 0–10 scoring/ranking on top of the Phase 5 suggestions (which already AI-filter openings against the profile).

**Features**:
- Claude scores each unscored job against the career profile
- Scoring criteria derived from `preferences` in `profile.json`:
  - Role type (research/education/data focus)
  - Location match (Ghent/Brussels, hybrid)
  - Language (Dutch/English)
  - ESG / social-impact alignment
  - Anti-criteria (purely administrative, revenue-only focus)
- Jobs listed with score (0–10) and one-line match reasoning
- UI filters: by source, date range, score threshold, flagged/unflagged
- User can flag jobs as "Interested" or "Not interested"

**Scoring output from Claude** (per job, via tool use):
```json
{
  "score": 8.5,
  "reasoning": "Strong research focus, Ghent-based hybrid, data science angle...",
  "pros": ["Research institution", "Data science role", "Ghent location"],
  "cons": ["English-only job listing"]
}
```

---

### Phase 7 — Cloud Deployment

**Goal**: Deploy so non-technical users can access the app from any browser.

**Stack**:
- Backend: Railway (Python/FastAPI + Postgres add-on)
- Frontend: Vercel (React SPA)
- Secrets: Railway environment variables

**Steps**:
1. Migrate SQLite → PostgreSQL (update SQLAlchemy connection string via `DATABASE_URL` env var)
2. Containerise backend with Dockerfile
3. Push to GitHub → Railway auto-deploys from `main` branch
4. Build React frontend → Vercel auto-deploys from `main` branch
5. Add basic authentication (username + password) to protect the app from public access
6. Write a non-technical setup guide (README for the cloud version)

**Cost estimate (rough)**:
- Railway starter plan: ~$5/month
- Vercel: free tier sufficient
- Anthropic API: pay-per-use, ~$0.01–0.10 per CV generation

**Security prerequisites — MUST be done before any networked deployment.**
The app is currently localhost-only, where these are low-risk; on a public host
they are exploitable:
1. **Authentication on every `/api/*` route.** All endpoints are open today.
2. **SSRF protection on user-supplied URLs.** `fetch_job_description()`
   (`app/services/cv_generator.py`, **incl. its Playwright fallback**) and
   `fetch_listing_links()` (`app/services/job_scanner.py`, incl. the Playwright
   fallback) fetch arbitrary URLs with redirects. Before fetching (and again after every redirect), resolve
   the host and reject private/loopback/link-local ranges and cloud metadata IPs
   (`169.254.169.254`).
3. **Real CORS policy** — `app/main.py` currently allows only the Vite dev origin.
4. **Untrusted-content note in LLM prompts** — scraped page text goes into model
   calls; keep tool schemas forced (`tool_choice`) and never let scraped content
   select actions beyond the constrained schema.

---

## Configuration

### AI engine setup
Two ways to power the AI features, chosen in **Settings → AI Engine** (or the first-run
wizard):

* **Free local model** — download a GGUF (default: Qwen3-4B-Instruct, ~2.5 GB) that runs
  in-process via llama-cpp-python. No account, no cost, fully offline. Requires the `local`
  extra: `uv sync --extra local` (the packaged app bundles it). Uses schema-constrained
  JSON so even a small model returns valid tool output.
* **OpenRouter** — best quality; paste an API key (saved to `config.json`, gitignored).

For CLI use without the web UI, create `config.json` manually:
```json
{
  "openrouter_api_key": "sk-or-...",
  "openrouter_model": "anthropic/claude-sonnet-4-6"
}
```
(Or set `"llm_provider": "local"` after downloading the model via the UI.)

### Language / i18n
The UI is fully internationalized. English is the source catalog
(`frontend/src/locales/en.json`); reviewed **shipped** locales (nl, fr, de, es, it, pt, pl)
sit beside it and are loaded on demand. `app_language` (config) is server-stored and
applied at boot.

**Translation is automatic on commit — you (Claude) MUST NOT run it after editing
`en.json`.** A pre-commit hook (`scripts/hooks/pre-commit`, enabled by `setup.sh`
via `git config core.hooksPath scripts/hooks`) runs
`scripts/translate_locales.py --changed`, which translates every key whose English
text is **new or changed since HEAD** into all shipped locales and stages them.
So: just edit `en.json` and stop; the localized files update themselves at commit
time. **Do not run `translate_locales.py` yourself — not even when
`tests/test_i18n.py`'s shipped-catalog parity test fails after you edit
`en.json`.** That failure is EXPECTED between an `en.json` edit and the commit that
triggers the hook; it is not a regression to fix and not a reason to translate.
Leave the catalogs alone. (Manual runs exist only for a human doing an out-of-band
refresh — `uv run python scripts/translate_locales.py` for new keys or `--full` to
re-translate everything — never Claude's job.) `--changed` compares the
working-tree `en.json` against HEAD, so stage `en.json` as a whole. CV **section
labels** are separate: reviewed sets for every shipped locale live in
`app/i18n/cv_labels.json`, resolved by `cv_labels(lang)` in `cv_renderer.py` with per-key
English fallback; for any other CV language, `ensure_cv_labels()` (app/api/i18n.py)
translates the label set once at CV-generation time. Backend API error
messages stay English on the wire except a small coded set (Phase D). Any non-shipped
language is generated on-device by the engine (Phase D).

### config.json reference
| Key | Description | Default |
|-----|-------------|---------|
| `llm_provider` | AI engine: `openrouter` or `local` (free, downloaded GGUF via llama.cpp) | `openrouter` |
| `openrouter_api_key` | OpenRouter API key (get one at openrouter.ai) | Required when provider is `openrouter` |
| `openrouter_model` | Model string passed to OpenRouter | `anthropic/claude-sonnet-4-6` |
| `local_model_id` | Registry key of the local model (see `engines/registry.py`) | `qwen3-4b-instruct` |
| `app_language` | UI language (ISO 639-1); `en` is the native source language | `en` |
| `onboarding_done` | First-run wizard completion marker | `false` |

---

## Data Formats

### profile.json — schema v5 (`career-profile-v5`)

The schema is **career-neutral**: it works for any field, not the original owner's
academic/data questionnaire. `load_profile()` runs every file through
`normalize_profile()` (in `app/services/cv_renderer.py`), which upgrades older
v1/v2/v3/v4 files to v5 **in memory** on load (v1→v2→v3→v4→v5); the next auto-save
persists the v5 shape. The migration is idempotent, so v5 files pass through
untouched.

v5 (2026-07) dissolves the `academic` section — the schema's last non-printable,
academic-specific holdout. Its `research_areas[]` migrate into a **"Research
areas" skills group** (printable, tag-shaped, deduped against an existing group of
that name); its free-text `research_themes` append to **`preferences.notes`**
(AI-only prose — skill chips can't hold paragraphs). See
`docs/plans/remove-academic-section.md`.

v4 (2026-07) is a per-section refinement on top of the v3 CV/preferences split:
every section keeps (or gains) structure **tailored to its topic** rather than
generic heading/subheading strings — structured, topic-shaped data is easier for
the AI to process than free text. `teaching` gets a `type` enum instead of a
free-text type; `grants` drops its year-triple + multi-year checkbox for one
free-text `years`, with new optional `funder`/`amount`; `personal.headline` is
gone (folds into `summary`); `education[]`/`publications[]` gain small optional
fields; `narrative` + `work_preferences` collapse into one `preferences` object
(its only consumer is the job-matching prompt, so free text is fine there — unlike
CV sections, whose structure is consumed by template/tailoring-plan code). See
`docs/plans/profile-v4-radical-simplification.md` for the full rationale; the only
generic/free-form section is (and remains) `custom_sections`, the escape hatch.

| Key | Description |
|-----|-------------|
| `meta` | `version`, `schema`, `last_updated`, and **`enabled_sections[]`** — the optional sections the user has turned on (survives reload; this is section presence, not derived from data) |
| `personal` | Name, `professional_title`, contact details, and **`links[]`** — an ordered list of `{label, url}` (was a fixed LinkedIn/GitHub/Scholar dict in v1; `keywords[]` was dropped in v3, `headline` dropped in v4 — folds into `summary` on migration) |
| `summary` | **Top-level** CV professional summary (was `narrative.target_roles_description` in v1/v2) |
| `preferences` | **Preferences page.** `target_roles[]` (job titles the user would apply for — the cheapest job-filter signal, matchable from a listing title alone; additive v5 field, defaulted to `[]` in `normalize_profile`), `looking_for`, `avoid` (free text), `locations[]`, `remote` (Remote/Hybrid/On-site/No preference), `languages[]`, and one free-text `notes` catch-all (contract type, schedule, salary, travel, relocation, organisation fit — v3's `narrative` + `work_preferences`, including the salary widget, collapse into this on migration) |
| `experience[]` | `title`, `employer`, `location`, `start_date`, `end_date` (empty ⇒ current — the single source of truth), `responsibilities[]` (CV bullets), `technologies[]`, and one optional free-text `ai_notes` field (never printed — v3 merged the old `relevance_note` + `ai_context` pair) |
| `education[]` | Degree, field, institution, years, distinction, optional `description` (thesis topic/specialisation/coursework — v4, for early-career users) |
| `skills` | `groups[]` (user-named `{label, items[]}`, any field) + `languages[]` (`{language, level 1–5, label}`, CEFR star scale — its own always-visible Profile section). Legacy fixed categories auto-migrate to groups; v4's `academic.research_areas[]` migrate into a "Research areas" group on v5 load |
| `publications[]` | (optional) Full APA `citation` string, optional `description`, optional `url` (DOI/link — v4) |
| `grants[]` | (optional) `{name, years, funder?, amount?}` — `years` is free text ("2021" or "2019–2021"); `funder`/`amount` are optional and print only when set |
| `teaching` | (optional) `entries[]` only — each `{type, type_other, subject, institution, years, description}`. `type` is an enum (`course_instructor`, `guest_lecture`, `tutorials_seminars`, `workshop_training`, `supervision`, `other` + free-text `type_other`); `subject` was `course` in v3. Prints on the CV as a real entry list (not an AI one-liner); the model can still drop the whole section via `excluded_sections`. v3's `subjects_to_teach[]` moved to `preferences.looking_for`, its `notes` moved (via the now-removed `academic.research_themes`) to `preferences.notes` — forward-looking/free-form data doesn't belong in a CV history section |
| `projects[]` | (optional) `name`, `description`, `url?`, `technologies[]` |
| `certifications[]` | (optional) `name`, `issuer`, `year?` |
| `courses[]` | (optional) Courses & training — `name`, `provider`, `year?` |
| `awards[]` | (optional) `name`, `year?`, `description?` |
| `volunteering[]` | (optional) `role`, `organisation`, `start_date`, `end_date`, `description` |
| `memberships[]` | (optional) Professional memberships — `name`, `role?`, `year?` |
| `custom_sections[]` | (optional) The escape hatch — `{title, items: [{heading, subheading?, date?, description?}]}`, each rendered as its own titled CV section |
| `cv_design_preferences` | `{accent_color, include_photo}` — the only two keys ever read (Settings UI + the CV template) |

**First-run onboarding** (`frontend/src/components/Onboarding.tsx`): a modal wizard
shown when `GET /api/engine` reports not-ready **and** config `onboarding_done` is
false. Three steps — pick a language, set up the AI engine (download the free local
model or paste an OpenRouter key), done. Skippable on every step (sets
`onboarding_done` so it never nags again); `SetupBanner`/`ApiKeyBanner` remain the
fallback prompt for a still-missing engine.

**Section presence** is driven by `meta.enabled_sections` and the frontend registry
`frontend/src/lib/profileSections.ts` (core vs optional, labels, badges,
descriptions — Profile only; the Preferences page's two sections aren't in this
registry, they're not hideable). The Profile page can **hide** an optional section
without deleting its data (it just leaves `enabled_sections`). A brand-new install
starts from `blank_profile()` (empty skeleton) rather than seeding the example
person.

**What the AI sees**: `app/services/cv_renderer.py`'s `profile_for_tailoring()`
strips `preferences`, `cv_design_preferences`, and `meta` before a profile goes
into a CV-tailoring or summary-writing prompt (`cv_generator.py`'s `tailor()`,
`app/api/cv.py`'s `generate_cv_summary`) — that page's data is for job matching and
app config, not for the CV. The job-relevance filter in `job_scanner.py`'s
`filter_openings()` does the inverse: it hand-picks only `preferences`,
`summary`, `skills`, and `professional_title` to keep that call's tokens down.

**CV import** (`app/services/cv_importer.py`, `POST /api/profile/import`): extract a
profile from an uploaded PDF (`pypdf`) or pasted text via one forced-tool LLM
call (`extracted_profile`), reshaped and normalized, then **returned for review**
(not saved) — the client persists it on the next auto-save.

**Tailoring gate**: the CV tailoring plan carries `excluded_sections[]` (enum of
optional printable sections, including `publications` and `teaching`) so the AI
can drop sections irrelevant to a given job; `apply_tailoring` empties those keys
(teaching to `{entries: []}`, everything else to `[]`). This is the single
exclusion mechanism — there are no more dedicated `include_publications`/
`include_teaching` flags.

### Job sources

Sources are added by the user via the Job Suggestions page and stored in the
`job_sources` table (no config file). Each is just a listing-page URL; the
scanner reads the page directly.

---

## Development Rules

- **Always update `README.md`** when making changes that affect how the project is run or used — new CLI flags, new setup steps, new usable phases. Do this as part of the same change, not as a follow-up.
- **Plan non-trivial changes with OpenSpec** (`openspec/` + the `/opsx:*` slash commands / `openspec-*` skills): `/opsx:propose` to draft proposal/design/tasks, `/opsx:apply` to implement, `/opsx:archive` when done. Project context for artifact generation lives in `openspec/config.yaml`. Small fixes don't need a change — go straight to code.
- **Archive OpenSpec changes proactively, but only once truly done**: once a
  change's tasks are complete *and* the work has been reviewed/tested and
  committed, run `/opsx:archive` without waiting to be asked. Do NOT trigger
  on tasks.md hitting N/N alone — a change can show all tasks checked while
  still hiding real bugs (this happened on the `add-agpl-license` change: a
  code review after 12/12 found two real bugs and two broken tests). Task
  completion is necessary, not sufficient.
- **License**: the project is AGPL-3.0-or-later (see `LICENSE`). Every tracked
  `.py`/`.ts`/`.tsx`/`.sh` file carries a 2-line SPDX header
  (`SPDX-License-Identifier: AGPL-3.0-or-later` + copyright); this is
  maintained automatically by `scripts/hooks/pre-commit`, which runs
  `scripts/add_license_headers.py` on staged source files — don't add headers
  by hand or write a second hook for this. The app footer's link to the GitHub
  repo satisfies AGPL §13 (network use → offer source); don't remove it.

---

## Design Decisions

**Why JSON for profile data?**
Human-readable, version-controllable with git, easy to inspect and edit directly, and trivial to pass to an LLM as context. The profile changes infrequently and doesn't need a relational database.

**Why HTML → PDF for CVs?**
Fully automatable, exact visual control via CSS, no accounts required, and the user can open the file in any editor for manual tweaks. PDFs are rendered server-side with headless Chromium (Playwright) rather than the browser's print dialog: the print dialog paginated the two-column layout badly (header on its own page, clipped content, edge margins). The template uses a fixed, repeating sidebar with the main column flowing across pages so multi-page CVs export cleanly. Figma would require manual updates for every tailored variant and a Figma account.

**Why Claude for AI features?**
Best-in-class long-form text generation and document understanding. The user already uses it daily. Keeping a single provider avoids credential management complexity.

**Why local-first?**
Zero hosting cost to start, full data privacy (CV data is sensitive), and simpler to develop and test. The architecture is cloud-ready from day one — adding a `DATABASE_URL` env var and a Dockerfile is all that's needed.

**Why the Bauhaus/Swiss poster style?**
The UI borrows from mid-century festival posters (2026-07-08 redesign, replacing
the earlier editorial/serif direction): the app shell (body + sidebar) is a muted
teal wall (`--frame`) and each page renders as a cream poster sheet on it
(`.page-container`), with ink-black hairline borders and rules, bold uppercase
Inter headings (one grotesque family — no serif), a vermilion accent with a teal
counterpoint, zero border-radius, squared chips instead of pills, and hard offset
shadows on the sheet and menus/modals only. A thick ink bar underlines every page
title; the active nav item reads as a cream tab cut from the sheet. Icons stay lucide-react (no emoji). Tokens live in
`frontend/src/index.css` (`--paper/--ink/--accent/--teal/--space-1..8/--fs-*`);
Inter is self-hosted via fontsource so the packaged app needs no CDN. All
feedback flows through one Toast system (errors persist, successes auto-dismiss,
destructive actions get Undo); Modal/Collapsible/EmptyState/Badge are the shared
primitives — pages should not reimplement these patterns inline.

**Why SQLite for job data?**
File-based, no server needed locally, and the job data has no concurrent write requirements. SQLAlchemy abstracts the difference, so migrating to PostgreSQL for cloud deployment is a one-line change.
