# MyJobCoach — Project Plan & Documentation

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
| `templates/cv/*.html` | Done | Five selectable Jinja2 CV templates (`default`/`classic`/`banner`/`compact`/`minimal`) + `_sections.html` macros; palettes in `manifest.json` |
| `scripts/generate_cv.py` | Done | CLI: `--lang`, `--job`, photo support, job-slug output dirs |
| `app/services/cv_generator.py` | Done | `tailor()` + `apply_tailoring()` — called by CLI and API |
| `app/services/cv_renderer.py` | Done | Shared Jinja2 utilities (LABELS, filters, photo) |
| `app/services/job_scanner.py` | Done | Phase 5/6 — extract openings, link-hash skip, title prescreen, per-posting read → verdict + digest |
| `app/services/letter_guide.py` | Done | Cover-letter **writing skeleton** (3–5 sections with per-section evidence) from a posting URL — never writes the letter |
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
│   ├── profile.example.json      # Sanitized sample profile (committed; schema reference only — never seeded)
│   ├── profile.json              # Career data source of truth (gitignored — personal)
│   └── photo.jpg                 # Optional CV photo (jpg/jpeg/png/webp accepted)
├── templates/
│   └── cv/
│       ├── manifest.json         # Template registry: ids + curated palettes (one source of truth)
│       ├── _sections.html        # Shared Jinja macros: ALL section markup + the contract
│       ├── default.html          # Two-column, left sidebar (the default)
│       ├── classic.html          # Single column, centered header, serif headings
│       ├── banner.html           # Full-width accent header band, single column
│       ├── compact.html          # Right sidebar, dense — for long CVs
│       └── minimal.html          # Typographic, no filled blocks
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
│       │   │                     #   KeyStatus (API-key onboarding), CreditChip, About
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
├── README.md
├── PRODUCT.md                    # impeccable: register, users, principles — "who/what/why"
├── DESIGN.md                     # impeccable: palette, type, components — "how it looks"
└── .impeccable/                  # impeccable skill state: design.json, critique/ snapshots
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
  "tailoring_notes": "Why this role matches and what was emphasised",
  "sidebar_translations": {"Programming": "Programmeren", "Dutch": "Nederlands"}
}
```

`sidebar_translations` carries the CV's static text (skill group headings, language
names, education fields, distinctions, grant names, custom-section titles) into a
non-English CV; `apply_tailoring` substitutes it **by exact string match**. The tool
schema is therefore built per call by `_tool_for()`, which enumerates those exact
profile strings as `properties` with `additionalProperties: false` (and drops the
field entirely for an English CV) — `_translatable()` is the one list, and it must
stay in step with what `apply_tailoring` swaps (`tests/test_tailoring_translations.py`
pins both). Left free-form, the local 4B model answered with category buckets
(`{"languages": "Nederlands, Engels…"}`), every key missed, and Dutch CVs silently
kept their English headings — the enumerated schema compiles to a grammar locally, so
that is now unrepresentable. Degree titles, institutions and skill/tool names are
deliberately never offered.

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
  **Preferences** page is a flat five-question form (no collapsibles, and no
  step numbers — they promised a wizard with no progress or completion state,
  and spent the rationed vermilion five times on ordinals): target job titles,
  where/how to work (locations, a segmented working-style control, languages),
  what makes a great match, dealbreakers, and
  practical notes — the data that drives job matching, not the CV. Each question
  is an `<h2>` labelling its control. **Working languages are read-only here**:
  `skills.languages` on the Profile is the one source of truth (it carries CEFR
  levels too), shown as `Badge variant="lang"` chips with a plain inline link to
  `/profile`; the Profile's languages section is marked with a mustard
  `Badge variant="required"` while no entry has a name. Three questions offer
  **one-tap suggestion chips** via the shared `Suggestions` component
  (`{items, added, onPick, label}` — the caller owns what "added" means, so the
  same chips serve a tag list and a free-text box through `appendPhrase`): Q1's
  titles come from `POST /api/profile/suggest-titles` on explicit request only
  (then cached in `localStorage` under `preferences_suggested_titles` and restored
  on mount — a return trip must not re-pay for the same call; the cache is
  **never** auto-invalidated, so a profile edit leaves the old titles in place and
  only the button regenerates), Q3 and Q4 are static i18n examples. Each row carries its **own** group label —
  three identically-named groups would be useless to a screen reader — and the
  added state is `aria-disabled`, not `disabled`, so activating a chip doesn't
  drop focus to `<body>`. An answered/blank marker per card was
  tried and **removed**: on a five-card page the answer is already visible in
  the control right below it, and stamping "not answered" on four optional
  questions turned an explicitly calm page into a compliance checklist. The
  page ends with a **conditional** card (`.q-end`): with `target_roles` set it
  names the next step and links to Job Suggestions, and without it drops the
  primary action for a mustard line pointing back at Q1 — claiming the matcher
  is ready would send someone to a page that can't help them yet. The
  working-style control is a real `role="radiogroup"` (roving tabIndex, arrow
  keys, `aria-labelledby`), not four toggle buttons
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
POST /api/profile/suggest-titles  Candidate target-role titles from the profile (sync, one forced-tool call; 400 with no experience/title)
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
GET  /api/cv/templates         Built-in CV templates + their curated palettes (no LLM)
POST /api/cv/generate          Generate tailored CV → saves HTML + history row
POST /api/cv/detect-lang       Detect a posting's language (ISO 639-1) from its URL — Applications 'New' slot Auto-detect
GET  /api/cv/history           Return all generated CVs, newest first
GET  /api/cv/preview/{slug}    Return CV HTML for browser preview
GET  /api/cv/pdf/{slug}/{lang} Render CV to a real PDF (headless Chromium) for download
POST /api/cv/generic           Async: untargeted CV from the profile's role brief (no fetch); 400 if the profile isn't ready
POST /api/letters/generate     Async: posting URL → cover-letter writing guide (poll via /api/cv/status/{job_id})
POST /api/letters/generic      Async: untargeted cover-letter guide from the same role brief
GET  /api/letters/history      Generated guides, newest first (guide JSON parsed)
DELETE /api/letters/history/{id} Delete a guide
GET  /api/backup/export        Download a .zip of user data (config sans secrets, profile, photo, jobs.db, output)
POST /api/backup/import        Restore a backup .zip (full replace, API key preserved) → re-runs db migrations
GET  /api/version              Running app version {version} (system router; pyproject metadata → tomllib → "unknown") — feeds the About modal
GET  /api/update/check         Latest GitHub Release vs running version → {available, current, latest, notes_url, installable, reason}
POST /api/update/install       Start the guarded self-update (202); 400 with the blocker reason, 409 when one is already in flight
GET  /api/update/status        Update progress {state, bytes_done, bytes_total, error}
POST /api/update/cancel        Abort the in-flight download (installation left untouched)
```

**About modal** (`frontend/src/components/About.tsx`): an "About" `<button>` in the
sidebar-footer app-menu cluster (beside the Settings `NavLink`, `.nav-item` class,
lucide `Info`) opens the shared `Modal` showing app name, version (fetched from
`GET /api/version` on open), description, copyright, and AGPL-3.0/source links (same
URLs as the footer). `app_version()` lives on the `system` router. The cluster is the
home for future app-level actions (e.g. "Check for updates…").

**Cover Letter** (`app/api/letters.py`, `app/services/letter_guide.py`): given a
posting URL, one forced-tool LLM call (`letter_guide`) returns a lean *writing
skeleton* — a 3–5 section `structure` (each `{title, goal, evidence}`, where
`evidence` is the real profile facts to cite in that section) —
**never a written letter** (a deliberate product stance, surfaced in the page's
explainer). Generic writing reminders (address a real person, quantify impact,
~250–350 words, tone/language) are **not** generated per letter — they were the
same under every one — but shown once as a static block in the letter explainer
(`letters.explainer.tips`). `GuideView` tolerates pre-simplification stored rows
(old angle/evidence-map/gaps/tone + per-section `pointers`, and the old generated
`tips`) by ignoring unknown fields and falling back to `pointers`.
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
row), in parallel; a missing artifact adopts it when created. Because that letter
regeneration deletes the old-language guide, picking a new language when a letter
already exists first shows a confirmation modal naming both effects (letter replaced,
CV re-tailored with edits kept) — declining leaves the control and both artifacts
untouched; a CV-only change (no letter yet) runs immediately with no prompt, since
nothing is destroyed. `CVEditor` no longer has
its own language dropdown (it's keyed by `` `${cv.id}:${cv.lang}` `` so a relang result
remounts it). The **New** slot's language defaults to **Auto-detect**: a manually-pasted
URL is language-detected (`POST /api/cv/detect-lang` → `detect_language()` in
`cv_generator.py`, one fetch + one small forced-tool call) before generating; accepted
jobs already carry their server-detected language. The **New** slot generates CV and/or
letter (checkboxes, both default on), polled independently. Handoff from Jobs lands here
via the `application_pending` localStorage key. Old `/cv` and `/letters` routes redirect
here.

The **generic application** is pinned above every listing row: an untargeted CV +
cover-letter guide for when there is no posting in hand. It is **user-triggered**,
never auto-created, and gated on profile readiness — `profile_ready()` requires at
least one `preferences.target_roles` entry and one `experience` entry (enforced
server-side; the client mirrors it in `frontend/src/lib/generic.ts` only to avoid
offering a button that would 400). It reuses the entire pipeline by swapping the
fetched posting for `role_brief(profile)` (`cv_renderer.py`) — a posting-shaped
plain-text brief synthesized from the preferences — passed as the `job_text` that
`tailor()` and `build_guide()` already accept. Its rows are stored under the
reserved `job_url` sentinel `GENERIC_URL = "generic:profile"` (not an http(s) URL,
so no scanned listing can collide and a stray fetch fails loudly), which keeps the
URL join, history, editor, relang, PDF and delete paths completely unchanged.
`_retailor` and `letters._cached_posting_text` each carry one guard: for the
sentinel they rebuild the brief from the **current** profile instead of fetching,
so a regenerate picks up preference edits. Its language defaults to the app's own
`app_language` (there is no posting to detect one from) — the client omits `lang`
and `generic_lang()` resolves it server-side; after creation the row's normal
language control takes over. One click builds **both** artifacts in parallel, and
the create card stays mounted with a per-artifact progress line until both land —
the CV finishes first, and swapping to the finished row at that moment erased the
letter's progress entirely (fixed 2026-07-19). Its stored `job_title` is whatever
the model guessed from the brief, so the UI overrides it with the i18n label
`applications.generic.title` in both the row header and the CV editor. Only one
generic application exists at a time; it is excluded from the search filter and the
date sort.

Every long generation (create, New slot, language change) shows a **Cancel** that
both aborts the client poll and calls `POST /api/cv/cancel/{job_id}` to **interrupt the
engine** — the local provider serializes all AI behind one lock, so a runaway generation
would otherwise block every feature. Cancellation plumbing: a per-job `threading.Event`
surfaced to `complete()` via the `current_cancel` ContextVar (`app/services/llm.py`); the
local engine streams (`create_chat_completion(stream=True)`) and checks the event between
chunks, raising `GenerationCancelled` → job status `cancelled` (client treats it as an
abort, not an error).

**CV templates** (`templates/cv/`, Settings → **Visual preferences**): five built-in
layouts — `default` (two-column, left sidebar), `classic` (single column, centered
serif header), `banner` (full-width accent band), `compact` (right sidebar, dense),
`minimal` (typographic, no filled blocks) — picked from a grid of `TemplateThumb`
schematics (abstract div mockups drawn in React and recoloured live by the selected
palette; no screenshots, no image assets, no AI). **`_sections.html` owns every
section's markup as Jinja macros** (`{% import '_sections.html' as S with context %}`),
so the contract — `data-section` tags, `hidden_sections`, the photo guard — lives in
one file and a template only decides layout + CSS. Macros are `sec_`-prefixed because
a bare `education()` would shadow the `education` context variable. **Every** section
honours `hidden_sections` under its own `data-section` key, and `CVEditor` derives its
checkbox row from the keys it finds in the rendered preview (union'd with the
currently-hidden ones, which the server omits) — so a section can never render
without a way to remove it, and a new one needs no frontend change beyond a
`cveditor.sections.<key>` label. A hardcoded list is what left Teaching (and every
other optional section) un-removable until 2026-07.
`manifest.json` is the registry — `{templates: [ids], palettes: [...]}` with **one
shared palette list** (same set and order for every template, so the swatch row
never reorders when switching templates; includes a `myjobcoach` palette echoing the
app's own cream/ink/vermilion) — served verbatim by `GET /api/cv/templates` and
used as the server-side allowlist; display names are i18n keys
(`settings.template.names.<id>`), never manifest strings. A **palette** sets
`accent_color` + `colors {ink, paper}` together; below the swatch row the three
colours are shown as labelled editable rows (native color picker + hex input), so
overwriting any slot makes a custom palette — there is no separate accent-preset
picker. Templates read the slots with their own value as the fallback and derive
shades via `color-mix()`, so a profile without `colors` renders exactly as before. Print CSS is per-template: single-column layouts
paginate natively, while `compact` mirrors `default`'s fixed-band trick (`position:
fixed` band repeats per page, sidebar content absolute on page 1, `box-decoration-break:
clone` on the main column). The **photo** is placed deliberately per template — always a **circle** (sidebar,
in-band, top-center, top-right) — via one shared crop frame (`photo_frame` in
`_sections.html`, the only place the photo's fit is decided; templates just size
the frame): `photo_crop {zoom, x, y}` is applied as pure CSS (`object-fit: contain`
on a `var(--paper)` backdrop + `translate` + `scale`), so the upload is
**never re-encoded** — lossless and re-editable. `contain` letterboxes every photo
into the same square canvas, so `zoom` floors at **0.5** (pull back past the image's
own edges) and the backdrop sits on the frame, not the img (at zoom < 1 the img box
shrinks away from the frame edge and both gaps must be the same paper). x/y pan via
`translate((x-50)%, (y-50)%)` — **not** `object-position`, which can only shift the
photo through its slack inside the box and so couldn't move a portrait photo
vertically at all under `contain` (its height exactly fills the frame). translate is
measured against the unscaled box, so it pans freely on both axes at any zoom and
runs in the same direction as the drag
(`PhotoCropModal`: drag to pan, slider/wheel to zoom, circular mask showing what
gets cropped, frame painted in the CV's own paper colour; opens automatically after
an upload, and via the pencil overlay on the Settings preview).
**Photo visibility is per-CV**: `_render_html` always passes the photo when one
exists; `include_photo` only seeds `'photo'` into a new CV's `plan.hidden_sections`
at generation time, which the CV editor's photo toggle then owns (gating rendering
on the global flag made that toggle a no-op — fixed 2026-07). Slugs are deduped at
generation (`_unique_slug`) because a slug is a CV's whole identity
(output dir, preview URL, `_current_html`'s plan lookup). No preview endpoint:
`_current_html` re-renders from the live profile, so design changes show up on any open
CV immediately. Zero LLM tokens in the whole feature.

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
3. Matching openings show as **Suggestions** (info left, Accept/red-Reject right) with detected language, digest fields as chips, then the digest's neutral ≤3-sentence `summary` (description of the job), then the model's `reason` — its own one-sentence *judgement* — as an explicitly labelled `Reason:` line (`jobs.reasonLabel`). The `_REVIEW_TOOL` schema (`app/services/job_scanner.py`) keeps these two fields deliberately distinct — `summary` is neutral description, `reason` must name the specific preference/title/location/dealbreaker that decided the verdict, never restate the posting — because a `reason` that just re-describes the job gives no way to tell whether the verdict was actually reasoned or a title-only guess. The shared `Verdict` component (`frontend/src/pages/Jobs.tsx`, one definition, three call sites: suggestions/filtered/history) renders chips → summary → reason line. Non-matches are stored as `seen` **with their reason kept** and their scraped text/digest cached — surfaced in a collapsible **Filtered out** section (each with **Suggest anyway** → restore); a row with no `reason` at all means the title prescreen dropped it before the posting was ever read, shown via `Verdict`'s `fallbackReason` (`jobs.filteredByTitle`) rather than a silent row. A posting whose page can't be read still shows as a suggestion with a "couldn't read the posting page" caveat rather than being buried. Past the 5th suggestion, a search box + source filter appear.
4. **Accept** → marks `accepted`, kicks off **both** CV generation (reuses `cv.start_generation`, passing the cached `posting_text` so the page is **not** re-scraped) **and** cover-letter-guide generation (`letters.start_letter_generation`, which reuses the same cached posting itself) from its URL in the *detected language*, and writes the `application_pending` localStorage key (`{jobUrl, cvJobId, letterJobId}`) so the **Applications** page shows both artifacts building. Accepting **stays on this page** — the row marks accepted in place with a "Generating…" state and an explicit *Open application* link, so a queue can be triaged in one pass; the toast's **Undo** cancels both generations (`cancelCVJob`) and restores the opening, since the AI work is already running. **Reject** marks it rejected (also undoable).
5. **History** keeps accepted + rejected openings (full info, recency-first, paged with "Show more"; rejected greyed). Accepted rows have **Open CV** (deep-links to the matching CV via `cv_open_url` → matched by `job_url`) and can still be rejected.
6. **Re-check filtered jobs** re-judges the cached `seen` openings against the current profile (rescuing ones improved Preferences now match); **Check a specific job** runs any pasted URL through the same review — for a posting found off-platform.

**Reading the page** (`app/services/headless.py` — the one place HTTP+headless fetching lives): `http_get()` tries plain httpx; `render_html(url, browser=None)` falls back to a headless render (reusing a passed-in browser when given). `fetch_listing_links()` **renders first** and falls back to httpx only when the render fails or is thin — a JS board can serve nav-only chrome over plain HTTP (enough links to pass a count check while carrying zero postings, which hid imec's jobs), so link *count* is the wrong signal. `extract_openings()` truncates the link list to `_MAX_LISTING_CHARS` (40k) before the LLM call — small caps hid job links behind a page's nav/facet links (euraxess front-loaded ~120 facet links, pushing every job link past a 14k cap). During a scan, all surviving postings are fetched via `fetch_texts()` — parallel httpx (pool of 4), then the too-short ones rendered sequentially through **one** shared browser — so a scan launches Chromium at most once, not per posting. LLM review stays sequential (the local engine serialises it behind a lock). The LLM only ever returns URLs actually on the page (hallucination guard). Verify a source with `uv run python scripts/scan_debug.py --url <page>`.

**Token-cost design**: unchanged sources cost **zero** LLM calls (link-hash skip). For a changed source, link extraction carries no profile context; the title prescreen runs only when >5 new openings survive dedup; the expensive per-posting call is paid **exactly once per opening ever** (URL dedup + `posting_text`/`posting_json` cache) and only for openings that survive the prescreen. The expensive text is read at the moment it can change a decision, and never again. The link-hash skip is guarded by `_has_stored_openings` — a matching hash only skips a source if at least one already-stored opening is still on the page, so a hash stamped without ever capturing the openings (which silently hid every euraxess job) re-scans instead of skipping forever.

**Learning from accept/reject** (learn-from-job-feedback): rejecting a suggestion opens a modal for an **optional** free-text reason (accept stays one-click), stored in `job_openings.user_note` — fed to the preference memo (below) and, for a rejected row in **History**, shown by `Verdict` on the `Reason:` line **instead of** the AI's own `reason` (the user's stated reason for their own decision outranks the model's), via the `userNote` prop. The per-posting review (`review_posting`) is steered by a compact **learned-preferences memo** — the LLM distils the user's *whole* accept/reject history (accepted titles + why they matched; rejected titles + the user's note) into a short deduplicated summary. `_preference_memo()` (in `jobs.py`) rebuilds it via `build_preference_memo()` **only when a cheap signature changes** (decision count + latest `decided_at`), caching it in `config.json` (`job_preference_memo` + `job_preference_memo_sig`); resolved once per scan/recheck/check and threaded into every `_review_one`. So: no LLM call on the reject/accept action (rebuild is lazy, at most once per scan when something changed), one bounded memo injected as untrusted context (tool call stays forced), and the unchanged-source zero-LLM path holds. The memo is always rebuilt from scratch (never folded on itself) so the raw rows stay the source of truth and it can't accumulate drift.

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
POST   /api/jobs/openings/{id}/reject   Mark rejected, optional {note} (also works from History)
POST   /api/jobs/openings/{id}/restore  Back to 'suggested' (Undo for reject; also "Suggest anyway" for filtered rows)
```

**Scan status** (`GET /api/jobs/scan/status/{scan_id}`, shared by scan +
recheck) reports progress while running (`current`/`total`/`source` for the
source loop, `reading_current`/`reading_total` for the per-posting loop) and,
when done, `found` plus a per-source `errors` map (`{source id: message}` — keyed
by **id**, not name: names are hostname-derived, so two sources on one host would
collide) so a broken source is visible instead of silently skipped. The scan runs in a
daemon thread whose status stays queryable for 1h, so navigating away from the
page and back **resumes** the running display (the frontend remembers the active
scan id module-side and re-attaches its poller on mount). `POST /scan` and
`POST /recheck` go through `_start_or_attach()`, which **hands back the job
already in flight** (with its real `kind`) instead of starting a second one —
that module-side memory is lost on a hard refresh, so the next click would
otherwise run two scans at once against the single serialised local engine
(`tests/test_scan_concurrency.py`). Progress lives in **one
`role="status"` strip** under the page title — not inside the button that started
it (whose label stays stable and just shows `busy`) and not inside any results
list, so it stays visible when scrolled away and can't vanish when a recheck
empties the list it used to sit in. A **Cancel** button in that strip
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
                            salary/deadline/summary/requirements),
              user_note (optional free-text reject reason — feeds the memo)
```
`GET /api/jobs/openings` parses `posting_json` into a `digest` object and never
ships the bulky `posting_text` cache to the client (`user_note` is shipped — see
learn-from-job-feedback above). `GET /api/jobs/last-scan` also returns a
**`recheckable`** count (same `WHERE` as `_run_recheck`): title-prescreened rows
have no `posting_text`, so a re-check can't re-judge them — the client gates the
button on that count rather than guessing from the 50 `seen` rows it can see. Scan status also reports
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

**Release versioning** (`add-release-versioning`): the app version lives in exactly
one place — `pyproject.toml` — which `add-about-modal`'s `GET /api/version`
(`app_version()`) reads at runtime, and it is **bumped automatically**, never by
hand. **`main`** is the development branch; **`stable`** is the sole release/build
source (no release is cut from `main`). Merging `main` → `stable` triggers
`.github/workflows/release-please.yml` (`googleapis/release-please-action`,
`release-type: python` via `release-please-config.json` +
`.release-please-manifest.json`), which reads the [Conventional
Commits](https://www.conventionalcommits.org) since the last release, computes the
SemVer bump (`feat:`→minor, `fix:`/`chore:`→patch, `!`/`BREAKING CHANGE:`→major),
and maintains a rolling **release PR** that bumps `pyproject.toml` + `CHANGELOG.md`.
That PR **auto-merges itself** — a second step in the same workflow finds the open
`release-please--branches--stable` PR and calls `gh pr merge --auto`, so promoting
`main` → `stable` (still a manual, reviewed PR) is the only human step in the whole
release; the version bump is never a separate click. Merging it tags `vX.Y.Z` and
creates the GitHub Release with notes; release-please then **dispatches** the
binaries-only `release.yml` against that tag, whose `action-gh-release` step
**upserts** the `.dmg`/`.zip` onto that same release (no duplicate). The dispatch
is not decoration: `release.yml`'s `on: push: tags` **cannot** fire here, because
GitHub never triggers a `push` workflow for a tag pushed with `GITHUB_TOKEN` — so
every automated release shipped with zero binaries until v0.3.1 made it obvious.
`workflow_dispatch` is one of the two events exempt from that rule, hence
`gh workflow run release.yml --ref <tag>` (the tag trigger stays for hand-pushed
tags). A final step **back-merges `stable` → `main`** via PR, because
release-please bumps `pyproject.toml` on `stable` only and nothing carried it
back — leaving `main` (and its `GET /api/version`) a release behind. `uv.lock`'s
root-package version is deliberately *not* synced by CI; uv re-locks it on the
next `uv run`. A `commit-msg` hook
(`scripts/hooks/`, under the existing
`core.hooksPath`) **warns but never blocks** on non-conventional subjects so the
bump signal stays healthy.

**App self-update** (`add-app-updater`, `app/services/updater.py`): the packaged
app checks `api.github.com/repos/FabriceLuyckx/job-coach/releases/latest` (strict
`vX.Y.Z` 3-tuple compare; "unknown" ⇒ no update), selects the platform asset by
its **stable, versionless name** (`MyJobCoach-macos.dmg` / `MyJobCoach-windows.zip`
— the release-versioning naming contract) and, on explicit approval, streams it to
`DATA_DIR/updates/`, verifies the byte size, stages it (macOS `hdiutil`+`ditto`,
Windows `unpack_archive`), then launches a detached helper script that waits for
the app's PID, moves the install aside (never deletes first), copies the staged
bundle in, restores on failure, clears macOS quarantine, and relaunches; the app
exits via a delayed `os._exit(0)`. Download URLs are pinned to
`https://github.com/FabriceLuyckx/job-coach/releases/download/` — never followed
on trust from release JSON. `install_blocker()` refuses **before any download**:
source checkout (not `FROZEN` — which also makes the endpoints inert on any
server deployment), unresolvable install root, non-writable parent dir, or a
macOS translocated/`/Volumes/` path — each with a readable reason and the release
page as fallback. One update in flight ever (module-level state dict, no id
keying, mirroring `engine.py`'s download tracking). Frontend:
`components/Updater.tsx` (`UpdateBanner` — automatic on-mount check gated on the
`auto_update_check` setting, dismissible per session; `UpdateDialog` — shared by
the banner and the sidebar's always-checking "Check for updates…" button in
`App.tsx`'s app-menu cluster). Settings → Updates holds the auto-check toggle.
The swap itself is verified manually against real builds; `tests/test_updater.py`
covers version compare, asset selection, URL pinning, and every refusal.

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
   This explicitly includes the `/api/update/*` endpoints — they trigger code
   download/execution. (They are already inert on a server via the `FROZEN`
   guard, but must still be auth-gated.)
2. **SSRF protection on user-supplied URLs.** `fetch_job_description()`
   (`app/services/cv_generator.py`, **incl. its Playwright fallback**) and
   `fetch_listing_links()` (`app/services/job_scanner.py`, incl. the Playwright
   fallback) fetch arbitrary URLs with redirects. Before fetching (and again after every redirect), resolve
   the host and reject private/loopback/link-local ranges and cloud metadata IPs
   (`169.254.169.254`). The same applies to the custom-model URL —
   `register_custom_model()` (`app/api/engine.py`) HEADs and then streams a
   user-supplied HTTPS URL with redirects; it validates the scheme and sanitizes
   the filename, but does **not** resolve the host.
3. **Real CORS policy** — `app/main.py` currently allows only the Vite dev origin.
4. **Untrusted-content note in LLM prompts** — scraped page text goes into model
   calls; keep tool schemas forced (`tool_choice`) and never let scraped content
   select actions beyond the constrained schema.

---

## Configuration

### AI engine setup
Two ways to power the AI features, chosen in **Settings → AI Engine** (or the first-run
wizard):

* **Free local model** — download a GGUF that runs in-process via llama-cpp-python. No
  account, no cost, fully offline. Requires the `local` extra: `uv sync --extra local`
  (the packaged app bundles it). Uses schema-constrained JSON so even a small model
  returns valid tool output. Three curated models are offered (`engines/registry.py`),
  sized for the real target machine — a 16 GB laptop with no dedicated GPU, doing CPU
  inference: **`qwen3-4b-instruct` (~2.5 GB, the default)**, `gemma-3-4b-it` (~2.5 GB,
  same weight class, different family) and `qwen3-8b` (~5.0 GB, better writing, ~half
  the speed). The 12B/14B entries were dropped on 2026-07-20 — they swap and crawl on
  that machine. A user can also add any `.gguf` by HTTPS URL;
  `register_custom_model()` (`app/api/engine.py`) validates it, HEADs it for its size and
  stores the entry under `local_custom_models` — `registry.all_models()` merges those over
  the curated set, so download, delete, status and engine load need no custom-model case.
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
| `local_custom_models` | User-added local models by URL, `{id: registry entry}` — merged over the curated set by `registry.all_models()` | `{}` |
| `app_language` | UI language (ISO 639-1); `en` is the native source language | `en` |
| `onboarding_done` | First-run wizard completion marker | `false` |
| `auto_update_check` | Check GitHub Releases for a newer version on app start (the banner); the sidebar's manual check ignores this | `true` |
| `job_preference_memo` | Cached learned-preferences memo distilled from accept/reject history; injected into the job-review prompt | `""` |
| `job_preference_memo_sig` | Signature (decision count + latest `decided_at`) gating memo rebuilds | absent |

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
| `preferences` | **Preferences page.** `target_roles[]` (job titles the user would apply for — the cheapest job-filter signal, matchable from a listing title alone; additive v5 field, defaulted to `[]` in `normalize_profile`), `looking_for`, `avoid` (free text), `locations[]`, `remote` (Remote/Hybrid/On-site/No preference), and one free-text `notes` catch-all (contract type, schedule, salary, travel, relocation, organisation fit — v3's `narrative` + `work_preferences`, including the salary widget, collapse into this on migration). **Working languages are not here**: `preferences.languages` was dropped (2026-07-20) because `skills.languages` says the same thing with a proficiency level; `normalize_profile` pops the dead key and seeds `skills.languages` from it at level 3 when nothing is named there yet |
| `experience[]` | `title`, `employer`, `location`, `start_date`, `end_date` (empty ⇒ current — the single source of truth), `responsibilities[]` (CV bullets), `technologies[]`, and one optional free-text `ai_notes` field (never printed — v3 merged the old `relevance_note` + `ai_context` pair) |
| `education[]` | Degree, field, institution, years, distinction, optional `description` (thesis topic/specialisation/coursework — v4, for early-career users) |
| `skills` | `groups[]` (user-named `{label, items[]}`, any field) + `languages[]` (`{language, level 1–5, label}`, CEFR star scale — its own always-visible Profile section, and the **only** source of working languages: a blank profile seeds one empty row and the section is badged "needs an answer" until one is named; nameless rows never print on the CV). Legacy fixed categories auto-migrate to groups; v4's `academic.research_areas[]` migrate into a "Research areas" group on v5 load |
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
| `cv_design_preferences` | `{template, accent_color, colors?, include_photo, photo_crop?}` — the CV's look (Settings → Visual preferences + the CV templates). `template` is a `manifest.json` id (unknown → `default`); `colors` holds the optional `{ink, paper}` palette slots; `photo_crop` is `{zoom 0.5–3, x, y}` (x/y = pan, 50 = centred, applied as `translate((x-50)%, (y-50)%)`). Every hex is validated `#RRGGBB` and the crop clamped in `_migrate_design_prefs_v3` — these are interpolated unescaped into the CV's `<style>`, so normalize is the sanitization boundary |

**First-run onboarding** (`frontend/src/components/Onboarding.tsx`): a modal wizard
shown when `GET /api/engine` reports not-ready **and** config `onboarding_done` is
false. Three steps — pick a language, set up the AI engine (download the free local
model or paste an OpenRouter key), done. **Not skippable** — every feature depends
on an engine, so dismissing it would only hand over a broken install, and the engine
step's Next stays disabled until one works. `onboarding_done` is written **only on
completion** (`finish()`), which with no skip means "an engine is working": an
install abandoned mid-setup gets the wizard back next launch rather than a
half-configured app. The `ready` half of the condition is what stops it returning
later — delete your model after finishing and you get `ApiKeyBanner` pointing at
Settings, not the wizard again. Settings carries every choice the wizard offers.

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
- **Write Conventional Commit subjects** (`type(scope)?: subject` — `feat:`, `fix:`, `chore:`, `docs:`, …; `!`/`BREAKING CHANGE:` for majors). This is the version-bump signal release-please reads on merge to `stable` (see Phase 7 — Release versioning). The `commit-msg` hook warns on non-conventional subjects but never blocks.
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
- **OpenSpec plans *what* changes, impeccable governs *how UI looks*** — the two
  don't overlap, they compose. `PRODUCT.md`/`DESIGN.md` (repo root, both
  tracked) are impeccable's source of truth for register/principles and the
  visual system; `openspec/config.yaml`'s context block points at them rather
  than restating token values, so a UI-affecting OpenSpec proposal reads them
  instead of re-deriving colors/spacing. The design-detector hook (fires on
  every `.tsx`/`.css`/etc. edit) runs regardless of whether the edit came from
  an OpenSpec-planned change or an ad hoc fix — it's wired in the
  gitignored, per-machine `.claude/settings.local.json`, so re-run
  `/impeccable hooks on` after a fresh clone. Impeccable's own review commands
  (`/impeccable critique`, `/impeccable audit`, `/impeccable polish`) are
  separate from `/opsx:*` and aren't OpenSpec tasks — run them ad hoc on UI
  work, don't add them to tasks.md checklists. **The boundary is "how it
  looks", not "whatever the fix touches"**: if applying a critique/audit/polish
  finding changes what a surface *does* rather than how it presents (a save
  model switching between manual and autosave, a field's validation behavior,
  what data a request sends) rather than a purely presentational fix
  (headings, contrast, spacing, ARIA wiring, color, motion), stop and run
  `/opsx:propose` for that part before implementing it — same as any other
  non-trivial change. Don't retrofit a proposal after the fact for work
  already shipped this way; an honest commit message beats a tasks.md written
  to match code that already exists.

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

**Why the Atelier / Stone style?**
The UI owns a colour instead of hiding in neutral (2026-07-22 redesign, replacing
the cream-sheet-on-teal-wall "Print Shop" system, which itself read as generic AI
design). The whole app is one drenched, *lighter* sage world: the ground is
`--ground` `#CCD4CD` at three tonal values (`ground`/`board`/`surface`), the
sidebar is a tonal *step* of that same ground (`color-mix(--ink 8%, --ground)`),
and content sits directly on it — **no cream, no dark wall, no floating page
sheet**. Depth is **tonal, not shadow**: resting surfaces separate by the tonal
steps + a low-contrast hairline (`--line`, ink 16%); only overlays (modal/menu/
toast) cast the single soft `--shadow-float`. Listings are **one tonal board split
by hairlines** (`--board`, `--r-panel`), never a grid of bordered cards, and never
a coloured side-stripe. A listing's meta/status are **text, not badges**: meta is
an inline mono line (middot separators, `--data-font`), match is a square marker +
`--mark` (pine) word, deadline is `--deadline` mono text; the Badge primitive is
kept only for categorical labels (section destination, language level). Form is
**rounded + roomy**: pill controls (`--r-btn/--r-field/--r-nav` `999px`),
`--r-panel` `22px`, `--r-frame` `30px`. Type is **system-sans × mono** — the
system-sans stack for body/headings (mixed case, weight-based; the blanket
uppercase transform is dropped) and `--data-font` mono for every data line. One
**terracotta** accent, rationed to the primary signal: **fill vs. text are two
tokens** — `--accent` `#BC4A26` for fills (white on it 5.07:1), `--accent-text`
`#963618` for any terracotta *text* (a CTA link, the deadline), which fails AA as
the fill value on sage. In-content links are `--ink` + underline, never the accent;
the active nav route is a `--board` fill pill (no accent, no side-stripe). Shell
contrast is enforced by `node scripts/check_contrast.mjs`, which parses the tokens
out of `index.css`/`App.css` and fails if any shell pair drops below its WCAG
threshold. Icons stay lucide-react (no emoji). Tokens live in
`frontend/src/index.css` (`--ground/--board/--surface/--ink/--accent/--accent-text/
--mark/--r-*/--data-font/--space-1..8/--fs-*`); Inter is self-hosted via fontsource
as a neutral fallback so the packaged app needs no CDN. All feedback flows through
one Toast system (errors persist, successes auto-dismiss, destructive actions get
Undo); Modal/Collapsible/EmptyState/Badge are the shared primitives — pages should
not reimplement these patterns inline.

**Why SQLite for job data?**
File-based, no server needed locally, and the job data has no concurrent write requirements. SQLAlchemy abstracts the difference, so migrating to PostgreSQL for cloud deployment is a one-line change.
