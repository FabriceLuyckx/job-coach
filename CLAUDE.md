# Job Coach — Project Plan & Documentation

## Overview

An AI-powered career assistant with two main pipelines:

1. **CV Generator** — Build tailored CVs from a career profile, targeted at specific job openings
2. **Job Scout** — Scrape, filter, and score job listings against the user's profile

The app runs locally first, designed for easy cloud deployment. AI is powered by the Anthropic Claude API. The UI is browser-based and should be usable by non-technical people.

---

## Current State (as of 2026-06-17)

| Artifact | Status | Notes |
|----------|--------|-------|
| `profile/profile.json` | Done | Full structured career data from questionnaire |
| `sources.yaml` | Started | Two sources: Euraxess (RSS), IMEC (HTML) |
| `templates/cv/default.html` | Done | Two-column Jinja2 CV template with language support and photo slot |
| `scripts/generate_cv.py` | Done | CLI: `--lang`, `--job`, photo support, job-slug output dirs |
| `app/services/cv_generator.py` | Done | `tailor()` + `apply_tailoring()` — called by CLI and future API |
| `app/services/cv_renderer.py` | Done | Shared Jinja2 utilities (LABELS, filters, photo) |
| `scripts/tailor_cv.py` | Done | CLI: fetch URL → Claude → tailored HTML |
| FastAPI backend | Not started | Phase 4 |
| React frontend | Not started | Phase 4 |
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
| AI | Anthropic Claude API | `claude-sonnet-4-6` or later |
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
│   └── jobs.db                   # SQLite job database (Phase 5)
├── app/                          # FastAPI backend (Phase 4+)
│   ├── main.py
│   ├── api/
│   │   ├── profile.py            # Profile CRUD endpoints
│   │   ├── cv.py                 # CV generation endpoints
│   │   └── jobs.py               # Job listing endpoints
│   ├── services/
│   │   ├── cv_generator.py       # Claude-powered tailored CV generation
│   │   ├── job_matcher.py        # Job scoring/filtering via Claude
│   │   └── scrapers/
│   │       ├── base.py           # Abstract scraper class
│   │       ├── rss.py            # Generic RSS/Atom feed scraper
│   │       └── html.py           # Custom HTML scraper (BeautifulSoup)
│   └── models/
│       ├── profile.py            # Pydantic models for profile data
│       └── job.py                # Job data model
├── frontend/                     # React app (Phase 4+)
│   └── src/
│       ├── pages/
│       │   ├── Profile.tsx       # View/edit career profile
│       │   ├── CVGenerator.tsx   # Paste job description → generate CV
│       │   └── Jobs.tsx          # Browse and filter scraped jobs
│       └── components/
├── .env                          # API keys — never commit
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
# Set ANTHROPIC_API_KEY in .env first
uv run python scripts/tailor_cv.py --url https://example.com/jobs/123
uv run python scripts/tailor_cv.py --url https://... --lang nl
# → output/<slug>/cv_<lang>.html
```

**Model**: `claude-sonnet-4-6`.

---

### Phase 4 — Profile Web UI

**Goal**: Browser-based interface to view and edit the career profile without touching JSON directly.

**Features**:
- View all profile sections in a clean, readable UI
- Inline editing of any field (text, lists, dates)
- Add new sections or custom questions
- Configure Anthropic API key (stored in `.env`, shown masked in UI)
- Trigger CV generation and download from the browser
- Auto-save to `profile/profile.json` on change

**Key API endpoints**:
```
GET  /api/profile          Return full profile JSON
PUT  /api/profile          Save updated profile JSON
GET  /api/settings         Return app settings (API key masked)
PUT  /api/settings         Update settings
POST /api/cv/generate      Generate tailored CV (wraps Phase 3 script)
```

**Run locally**:
```bash
uvicorn app.main:app --reload
# Navigate to http://localhost:8000
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
Create a `.env` file in the project root (never commit this file):
```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=sqlite:///./jobs/jobs.db
PORT=8000
```

Or configure the API key via the UI settings page (Phase 4+).

### Environment variables reference
| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | Required for AI features |
| `DATABASE_URL` | SQLite path or PostgreSQL URL | `sqlite:///./jobs/jobs.db` |
| `PORT` | FastAPI listening port | `8000` |

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
