# Job Coach — Project Plan & Documentation

## Overview

An AI-powered career assistant with two main pipelines:

1. **CV Generator** — Build tailored CVs from a career profile, targeted at specific job openings
2. **Job Scout** — Scrape, filter, and score job listings against the user's profile

The app runs locally first, designed for easy cloud deployment. AI is powered via OpenRouter (routing to Anthropic Claude models). The UI is browser-based and should be usable by non-technical people.

---

## Current State (as of 2026-06-17)

| Artifact | Status | Notes |
|----------|--------|-------|
| `profile/profile.json` | Done | Full structured career data from questionnaire |
| `sources.yaml` | Started | Two sources: Euraxess (RSS), IMEC (HTML) |
| `templates/cv/default.html` | Done | Two-column Jinja2 CV template with language support and photo slot |
| `scripts/generate_cv.py` | Done | CLI: `--lang`, `--job`, photo support, job-slug output dirs |
| `app/services/cv_generator.py` | Done | `tailor()` + `apply_tailoring()` — called by CLI and API |
| `app/services/cv_renderer.py` | Done | Shared Jinja2 utilities (LABELS, filters, photo) |
| `scripts/tailor_cv.py` | Done | CLI: fetch URL → Claude → tailored HTML |
| `app/db.py` | Done | SQLite setup: `cv_history` table (Phase 4), `jobs` table (Phase 5) |
| FastAPI backend | Done | Phase 4 — all endpoints live |
| React frontend | Done | Phase 4 — Profile editor, CV Generator, Settings, Jobs placeholder |
| Job scrapers | Not started | Phase 5 |
| Job matching | Not started | Phase 6 |
| Cloud deployment | Not started | Phase 7 |

---

## Architecture

### Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend | Python / FastAPI | User knows Python well |
| Frontend | React (TypeScript) | Simple SPA, served by FastAPI locally |
| Profile data | `profile/profile.json` | Human-readable, version-controllable |
| Jobs data | SQLite → PostgreSQL | SQLite locally, Postgres for cloud |
| AI | OpenRouter → Anthropic Claude | Model: `anthropic/claude-sonnet-4-6`; key stored in `config.json` |
| CV output | HTML → PDF (browser print) | Jinja2 templates, no external deps |
| Local run | uvicorn | `uvicorn app.main:app --reload` |
| Cloud (future) | Railway (backend) + Vercel (frontend) | Phase 6 |

### Target Directory Structure

```
job-coach/
├── profile/
│   ├── profile.json              # Career data source of truth
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
├── sources.yaml                  # Job scraping sources config
├── jobs/
│   └── jobs.db                   # SQLite database: cv_history + jobs tables
├── app/                          # FastAPI backend
│   ├── main.py
│   ├── config.py                 # Persistent config (config.json) for API key & model
│   ├── db.py                     # SQLite setup: init_db(), get_db()
│   ├── api/
│   │   ├── profile.py            # Profile CRUD endpoints
│   │   ├── cv.py                 # CV generation, history, preview endpoints
│   │   ├── settings.py           # Settings + photo upload endpoints
│   │   └── jobs.py               # Job listing endpoints (Phase 5)
│   └── services/
│       ├── cv_generator.py       # OpenRouter-powered tailored CV generation
│       ├── cv_renderer.py        # Shared Jinja2 utilities
│       ├── job_matcher.py        # Job scoring/filtering via Claude (Phase 6)
│       └── scrapers/             # Job scrapers (Phase 5)
│           ├── base.py
│           ├── rss.py
│           └── html.py
├── frontend/                     # React + TypeScript SPA (Vite)
│   └── src/
│       ├── pages/
│       │   ├── Profile.tsx       # View/edit career profile
│       │   ├── CVGenerator.tsx   # Paste job URL → generate CV + history
│       │   ├── Jobs.tsx          # Browse and filter scraped jobs (Phase 5)
│       │   └── Settings.tsx      # OpenRouter API key, model, photo
│       ├── components/
│       │   ├── TagInput.tsx
│       │   └── BulletListEditor.tsx
│       ├── api.ts                # Typed API client
│       └── types.ts              # TypeScript models for profile data
├── config.json                   # API keys & model — never commit
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
- View all profile sections in a clean, readable UI
- Inline editing of any field (text, lists, dates)
- Configure OpenRouter API key (stored in `config.json`, shown masked in UI)
- Trigger CV generation and preview from the browser
- History of previously generated CVs (persisted in `jobs/jobs.db`)
- Photo upload/delete via settings

**API endpoints**:
```
GET  /api/profile              Return full profile JSON
PUT  /api/profile              Save updated profile JSON
GET  /api/settings             Return app settings (API key masked)
PUT  /api/settings             Update settings (key, model)
POST /api/settings/photo       Upload profile photo
GET  /api/settings/photo       Return photo as base64 data URI
DELETE /api/settings/photo     Remove photo
POST /api/cv/generate          Generate tailored CV → saves HTML + history row
GET  /api/cv/history           Return all generated CVs, newest first
GET  /api/cv/preview/{slug}    Return CV HTML for browser preview
```

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

### Phase 5 — Job Scrapers

**Goal**: Automatically collect job listings from sources defined in `sources.yaml`.

**Features**:
- Per-source scraper (RSS or HTML, driven by `sources.yaml`)
- URL-based deduplication
- Store scraped jobs in SQLite with full metadata
- Manual trigger from UI or a CLI script

**Job data model** (SQLite table `jobs`):
```
id             TEXT PRIMARY KEY (UUID)
source         TEXT  (name from sources.yaml)
title          TEXT
employer       TEXT
location       TEXT
url            TEXT UNIQUE
posted_date    TEXT (ISO 8601)
description    TEXT (full raw text)
fetched_at     TEXT (ISO 8601 timestamp)
match_score    REAL  (null until scored in Phase 6)
interested     INT   (null=unseen, 1=interested, 0=not interested)
```

**Scrapers to build**:
1. `scrapers/rss.py` — Generic RSS/Atom parser; covers Euraxess and any other feed
2. `scrapers/html.py` — BeautifulSoup-based; customised per source using CSS selectors from `sources.yaml`

**Extending `sources.yaml` for HTML sources**:
```yaml
sources:
  - name: IMEC
    type: html
    url: https://www.imec.be/en/work-at-imec/jobs
    selectors:
      job_list: ".job-card"
      title: ".job-title"
      employer: "IMEC"  # static string for single-employer sites
      link: "a[href]"
      date: ".posted-date"
```

---

### Phase 6 — Job Matching & Filtering

**Goal**: Score and surface the most relevant jobs from the scraped database.

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

---

## Configuration

### API key setup
Configure via the Settings page in the web UI — the key is saved to `config.json` (gitignored).

For CLI use without the web UI, create `config.json` manually:
```json
{
  "openrouter_api_key": "sk-or-...",
  "openrouter_model": "anthropic/claude-sonnet-4-6"
}
```

### config.json reference
| Key | Description | Default |
|-----|-------------|---------|
| `openrouter_api_key` | OpenRouter API key (get one at openrouter.ai) | Required for AI features |
| `openrouter_model` | Model string passed to OpenRouter | `anthropic/claude-sonnet-4-6` |

---

## Data Formats

### profile.json top-level keys
| Key | Description |
|-----|-------------|
| `meta` | Schema version and last-updated date |
| `personal` | Name, contact details, links, title, keywords |
| `narrative` | Career goals, target industries, differentiation, topics to avoid |
| `experience[]` | Work history with responsibilities, achievements, technologies, and relevance tags |
| `education[]` | Academic history (degree, field, institution, years, distinction) |
| `academic` | Research areas, methods, datasets/tools, collaborators |
| `publications[]` | Peer-reviewed papers (APA-style fields) |
| `grants[]` | Fellowships and scholarships |
| `teaching` | Formal teaching, guest lectures, supervision, mentoring, materials |
| `skills` | Programming, languages, cloud, visualization, databases, big data, ML |
| `work_preferences` | Location, remote/hybrid, salary, schedule, language, relocation |
| `cv_design_preferences` | Visual preferences for CV output |

The `experience[].relevance` object has four keys (`teaching`, `research`, `leadership`, `interdisciplinarity`) used by Claude when generating tailored CVs for different job types.

### sources.yaml schema
```yaml
sources:
  - name: string            # Display name
    type: rss | html        # Scraper type
    url: string             # Feed URL or listing page URL
    selectors:              # Only required for type: html
      job_list: string      # CSS selector for job card container
      title: string         # CSS selector for job title (relative to job card)
      employer: string      # CSS selector or static string
      link: string          # CSS selector for detail link
      date: string          # CSS selector for posted date (optional)
```

---

## Development Rules

- **Always update `README.md`** when making changes that affect how the project is run or used — new CLI flags, new setup steps, new usable phases. Do this as part of the same change, not as a follow-up.

---

## Design Decisions

**Why JSON for profile data?**
Human-readable, version-controllable with git, easy to inspect and edit directly, and trivial to pass to an LLM as context. The profile changes infrequently and doesn't need a relational database.

**Why HTML → PDF for CVs?**
Fully automatable, exact visual control via CSS, no external dependencies or accounts required, and the user can open the file in any editor for manual tweaks before printing. Figma would require manual updates for every tailored variant and a Figma account.

**Why Claude for AI features?**
Best-in-class long-form text generation and document understanding. The user already uses it daily. Keeping a single provider avoids credential management complexity.

**Why local-first?**
Zero hosting cost to start, full data privacy (CV data is sensitive), and simpler to develop and test. The architecture is cloud-ready from day one — adding a `DATABASE_URL` env var and a Dockerfile is all that's needed.

**Why SQLite for job data?**
File-based, no server needed locally, and the job data has no concurrent write requirements. SQLAlchemy abstracts the difference, so migrating to PostgreSQL for cloud deployment is a one-line change.
