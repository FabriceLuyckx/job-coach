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
| `app/services/job_scanner.py` | Done | Phase 5 — extract openings from a page + profile-filter new ones |
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
│   │   └── jobs.py               # Job sources, scan, accept/reject (Phase 5)
│   └── services/
│       ├── llm.py                # Provider-neutral complete() + LLMResponse/ToolCall + response validation
│       ├── engines/              # AI providers: openrouter.py, local.py (llama.cpp), registry.py
│       ├── cv_generator.py       # OpenRouter-powered tailored CV generation
│       ├── cv_renderer.py        # Shared Jinja2 utilities (+ PHOTO_EXTS, load_profile)
│       ├── job_scanner.py        # Extract openings from a page + profile-filter (Phase 5)
│       └── job_matcher.py        # Job scoring/filtering via Claude (Phase 6)
├── tests/
│   └── test_hardening.py         # Upload/zip guards, slug + LLM-config helpers (uv run pytest)
├── frontend/                     # React + TypeScript SPA (Vite)
│   └── src/
│       ├── pages/
│       │   ├── Profile.tsx       # View/edit career profile (auto-saves as you type)
│       │   ├── CVGenerator.tsx   # Paste job URL → generate CV + history
│       │   ├── Jobs.tsx          # Job sources, AI suggestions, accept/reject (Phase 5)
│       │   └── Settings.tsx      # OpenRouter API key, model, photo; Advanced → AI prompts
│       ├── components/           # Shared UI: Button/SaveButton/RemoveButton, Toast,
│       │   │                     #   Modal, Collapsible, Badge, EmptyState, ErrorBoundary,
│       │   │                     #   KeyStatus (API-key onboarding), CreditChip
│       │   ├── cv/CVEditor.tsx   # Per-CV editor panel (preview, Update-CV modal, plan edits)
│       │   ├── TagInput.tsx
│       │   └── BulletListEditor.tsx
│       ├── lib/                  # handoff.ts (Jobs↔CV localStorage keys), usePoller.ts,
│       │   │                     #   errors.ts (errMsg), format.ts (dates)
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
- Profile editor split into always-visible **core** sections (Personal, Summary,
  Experience, Skills, Education, Work Preferences) and **optional** sections added via
  **+ Add a section**; each section badged by where its data goes (On your CV / Helps
  the AI / Job matching & letters)
- Inline editing of any field (text, lists, dates) with **auto-save** (debounced
  ~1.5s, single-flight; status shown in the page header; item removals get a 5s
  Undo toast) — there are no manual Save buttons on the Profile page
- Configure OpenRouter API key (stored in `config.json`, shown masked in UI);
  an app-wide banner guides first-run users to Settings until a key is set
- Trigger CV generation and preview from the browser
- History of previously generated CVs (persisted in `jobs/jobs.db`)
- Photo upload/delete via settings

**API endpoints**:
```
GET  /api/profile              Return full profile JSON (blank v2 skeleton if none yet)
PUT  /api/profile              Save updated profile JSON
POST /api/profile/import       Extract a v2 profile from a CV (PDF/text) → returned for review, not saved
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
GET  /api/cv/history           Return all generated CVs, newest first
GET  /api/cv/preview/{slug}    Return CV HTML for browser preview
GET  /api/cv/pdf/{slug}/{lang} Render CV to a real PDF (headless Chromium) for download
GET  /api/backup/export        Download a .zip of user data (config sans secrets, profile, photo, jobs.db, output)
POST /api/backup/import        Restore a backup .zip (full replace, API key preserved) → re-runs db migrations
```

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
2. **Find new listings** scans every source. Per source: read the page's actual `<a href>` links, have the LLM pick which are real openings, dedup against `job_openings` by URL, then AI-filter only the genuinely new ones against the profile (also detecting each posting's language). Last-scan time shows beside the button (`jobs_last_scan` in config.json).
3. Interesting openings show as **Suggestions** (info left, Accept/red-Reject right) with a one-line reason and detected language; the rest are stored as `seen` (dedup memory only).
4. **Accept** → marks `accepted`, kicks off CV generation from its URL in the *detected language* (reuses `cv.start_generation`), and hands off to the CV Generator (via `cv_pending_job_id` + `cv_pending_job_url` localStorage keys) which shows the build and the URL used. **Reject** greys it out.
5. **History** keeps accepted + rejected openings (full info, recency-first; rejected greyed). Accepted rows have **Open CV** (deep-links to the matching CV via `cv_open_url` → matched by `job_url`) and can still be rejected.

**Reading the page**: `fetch_listing_links()` uses httpx and falls back to a headless Playwright render when a page yields too few links (JS-built boards). The LLM only ever returns URLs that were actually on the page (hallucination guard). Verify a source with `uv run python scripts/scan_debug.py --url <page>`.

**Token-cost design**: link extraction carries no profile context; the expensive profile-filter call runs only on new openings and is skipped entirely when a scan finds nothing new.

**Editable prompts** (Settings → **Advanced — AI prompts**, collapsed by default): the link-extraction and relevance-filter prompts (`scan_extract_prompt`, `scan_filter_prompt`) mirror the CV Generator prompt. The CV prompt must keep the `{lang_name}` placeholder (validated client- and server-side).

**Key files**:
- `app/services/job_scanner.py` — `fetch_listing_links()`, `extract_openings()`, `filter_openings()` (returns `{url: {reason, lang}}`); `DEFAULT_EXTRACT_PROMPT`, `DEFAULT_SCAN_PROMPT`
- `app/api/jobs.py` — source CRUD, threaded `/scan`, `/last-scan`, openings list, accept/reject
- `frontend/src/pages/Jobs.tsx` — sources, scan, suggestions, history; `scripts/scan_debug.py` — verification CLI

**API endpoints**:
```
GET    /api/jobs/sources                List watched sources
POST   /api/jobs/sources                Add a source {url} (name derived from host)
DELETE /api/jobs/sources/{id}           Remove a source
POST   /api/jobs/scan                   Async scan of all sources → {scan_id}
GET    /api/jobs/scan/status/{scan_id}  Poll scan status
GET    /api/jobs/last-scan              Last scan timestamp
GET    /api/jobs/openings               Suggested + decided openings, newest first
POST   /api/jobs/openings/{id}/accept   Mark accepted + generate CV → {cv_job_id, job_url, lang}
POST   /api/jobs/openings/{id}/reject   Mark rejected (also works from History)
POST   /api/jobs/openings/{id}/restore  Back to 'suggested' (Undo for reject)
```

**Scan status** (`GET /api/jobs/scan/status/{scan_id}`) reports progress while
running (`current`/`total`/`source`) and, when done, `found` plus a per-source
`errors` map (`{source name: message}`) so a broken source is visible instead of
silently skipped.

**Data model** (SQLite):
```
job_sources:  id, url (UNIQUE), name, created_at
job_openings: id, url (UNIQUE), title, source_url,
              status (seen|suggested|accepted|rejected),
              reason, lang, cv_slug, created_at, decided_at
```

---

### Phase 6 — Job Matching & Filtering

**Goal**: Add explicit 0–10 scoring/ranking on top of the Phase 5 suggestions (which already AI-filter openings against the profile).

**Features**:
- Claude scores each unscored job against the career profile
- Scoring criteria derived from `work_preferences` and `narrative` in `profile.json`:
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
   (`app/services/cv_generator.py`) and `fetch_listing_links()`
   (`app/services/job_scanner.py`, incl. the Playwright fallback) fetch arbitrary
   URLs with redirects. Before fetching (and again after every redirect), resolve
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
applied at boot. Regenerate shipped locales after English changes with
`uv run python scripts/translate_locales.py` (diffs and translates only keys missing from
the target via the configured AI engine; `--full` forces a complete pass). CV **section
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

### profile.json — schema v2 (`career-profile-v2`)

The schema is **career-neutral**: it works for any field, not the original owner's
academic/data questionnaire. `load_profile()` runs every file through
`normalize_profile()` (in `app/services/cv_renderer.py`), which upgrades older v1
files to v2 **in memory** on load; the next auto-save persists the v2 shape. The
migration is idempotent, so v2 files pass through untouched.

| Key | Description |
|-----|-------------|
| `meta` | `version`, `schema`, `last_updated`, and **`enabled_sections[]`** — the optional sections the user has turned on (survives reload; this is section presence, not derived from data) |
| `personal` | Name, `professional_title`, optional `headline`, contact details, `keywords[]`, and **`links[]`** — an ordered list of `{label, url}` (was a fixed LinkedIn/GitHub/Scholar dict in v1) |
| `summary` | **Top-level** CV professional summary (was `narrative.target_roles_description`) |
| `narrative` | Career context for the AI: `looking_for`, `target_industries[]`, `differentiation`, `problems_enjoyed`, `work_to_avoid` |
| `experience[]` | `title`, `employer`, `location`, `start_date`, `end_date` (empty ⇒ current — the single source of truth), `responsibilities[]` (CV bullets), `technologies[]`, and two optional free-text notes: `relevance_note` + `ai_context` (never printed). v1's `is_current`, `full_time`, `team_size`, `reporting_structure`, `impact`, `mentored`, `presentations`, `achievements`, and the 4-axis `relevance` object are collapsed into these on migration |
| `education[]` | Degree, field, institution, years, distinction |
| `skills` | `groups[]` (user-named `{label, items[]}`, any field) + `languages[]` (`{language, level 1–5, label}`, CEFR star scale). Legacy fixed categories auto-migrate to groups |
| `work_preferences` | `commute_radius[]`, `remote_hybrid`, `relocation`, `contract_types[]`, `schedule`, `availability`, `travel`, `language_preferences[]`, free-text `organisation_preferences`, and `salary: {min, max, currency, period, notes}` (expected range, not v1's single current-salary number) |
| `academic` | (optional) `research_areas[]`, `methods[]` (user-named `{label, items[]}` groups — was fixed neural/computational buckets), `interdisciplinary_work[]`, `collaborators[]`, `research_themes`, `topics_to_teach[]` |
| `publications[]` | (optional) Full APA `citation` string + optional `description` |
| `grants[]` | (optional) Fellowships and scholarships |
| `teaching` | (optional) Formal teaching, guest lectures, supervision, mentoring, materials |
| `projects[]` | (optional) `name`, `description`, `url?`, `technologies[]` |
| `certifications[]` | (optional) `name`, `issuer`, `year?` |
| `courses[]` | (optional) Courses & training — `name`, `provider`, `year?` |
| `awards[]` | (optional) `name`, `year?`, `description?` |
| `volunteering[]` | (optional) `role`, `organisation`, `start_date`, `end_date`, `description` |
| `memberships[]` | (optional) Professional memberships — `name`, `role?`, `year?` |
| `custom_sections[]` | (optional) The escape hatch — `{title, items: [{heading, subheading?, date?, description?}]}`, each rendered as its own titled CV section |
| `cv_design_preferences` | Visual preferences for CV output |

**First-run onboarding** (`frontend/src/components/Onboarding.tsx`): a modal wizard
shown when `GET /api/engine` reports not-ready **and** config `onboarding_done` is
false. Three steps — pick a language, set up the AI engine (download the free local
model or paste an OpenRouter key), done. Skippable on every step (sets
`onboarding_done` so it never nags again); `SetupBanner`/`ApiKeyBanner` remain the
fallback prompt for a still-missing engine.

**Section presence** is driven by `meta.enabled_sections` and the frontend registry
`frontend/src/lib/profileSections.ts` (core vs optional, labels, badges,
descriptions). The Profile page can **hide** an optional section without deleting
its data (it just leaves `enabled_sections`). A brand-new install starts from
`blank_profile()` (empty skeleton) rather than seeding the example person.

**CV import** (`app/services/cv_importer.py`, `POST /api/profile/import`): extract a
v2 profile from an uploaded PDF (`pypdf`) or pasted text via one forced-tool LLM
call (`extracted_profile`), reshaped and normalized, then **returned for review**
(not saved) — the client persists it on the next auto-save.

**Tailoring gate**: the CV tailoring plan carries `excluded_sections[]` (enum of
optional printable sections) so the AI can drop sections irrelevant to a given job;
`apply_tailoring` empties those keys. `include_publications`/`include_teaching`
keep their dedicated gates.

### Job sources

Sources are added by the user via the Job Suggestions page and stored in the
`job_sources` table (no config file). Each is just a listing-page URL; the
scanner reads the page directly.

---

## Development Rules

- **Always update `README.md`** when making changes that affect how the project is run or used — new CLI flags, new setup steps, new usable phases. Do this as part of the same change, not as a follow-up.

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

**Why the editorial visual style?**
The app produces documents, so the UI borrows from print: warm paper background,
white cards with hairline borders (no drop shadows), a serif display face
(Fraunces) for headings with Inter for UI text, one terracotta accent, and a
single lucide-react icon set (no emoji). Tokens live in `frontend/src/index.css`
(`--paper/--ink/--accent/--space-1..8/--fs-*`); fonts are self-hosted via
fontsource so the packaged app needs no CDN. All feedback flows through one
Toast system (errors persist, successes auto-dismiss, destructive actions get
Undo); Modal/Collapsible/EmptyState/Badge are the shared primitives — pages
should not reimplement these patterns inline.

**Why SQLite for job data?**
File-based, no server needed locally, and the job data has no concurrent write requirements. SQLAlchemy abstracts the difference, so migrating to PostgreSQL for cloud deployment is a one-line change.
