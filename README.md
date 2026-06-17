# Job Coach

AI-powered career assistant — generate tailored CVs and (in future phases) discover and filter job openings.

---

## Requirements

- [uv](https://docs.astral.sh/uv/) — Python package manager
- Python 3.11+ (uv installs this automatically on first run)
- Node.js 18+ — for the frontend dev server

---

## Setup

```bash
git clone <repo>
cd job-coach
uv sync
cd frontend && npm install && cd ..
```

---

## Run the web app

```bash
# Terminal 1 — backend API
uv run uvicorn app.main:app --reload

# Terminal 2 — frontend dev server
cd frontend && npm run dev
```

Open **http://localhost:5173** in your browser.

On first run, go to **Settings** and enter your [OpenRouter](https://openrouter.ai) API key. This is saved locally to `config.json` (gitignored).

---

## Generate a CV (CLI)

The career profile lives in `profile/profile.json`. Run the script to render it as a print-ready HTML file.

```bash
# English CV (generic, full profile)
uv run python scripts/generate_cv.py

# Dutch CV
uv run python scripts/generate_cv.py --lang nl

# CV saved to a dedicated folder for a specific opening
uv run python scripts/generate_cv.py --job "Company Role Name"

# Both flags
uv run python scripts/generate_cv.py --lang nl --job "UGent Data Scientist"
```

## AI-tailor a CV for a specific job (CLI)

Requires an OpenRouter API key. Set it via the Settings page (preferred), or create `config.json` manually:

```json
{
  "openrouter_api_key": "sk-or-..."
}
```

Then run:

```bash
uv run python scripts/tailor_cv.py --url https://example.com/jobs/123

# Dutch tailored CV
uv run python scripts/tailor_cv.py --url https://... --lang nl

# Override the output folder name
uv run python scripts/tailor_cv.py --url https://... --job "ugent-lecturer"
```

The AI reads the job posting, selects the most relevant experience from your profile, rewrites the summary and responsibility bullets to match the role's language, and saves the result to `output/<job-slug>/cv_<lang>.html`.

---

## Output structure

```
output/
├── cv_en.html                  # Generic English CV
├── cv_nl.html                  # Generic Dutch CV
└── <job-slug>/                 # One folder per job opening
    ├── cv_en.html              # Full-profile or AI-tailored CV
    └── cv_nl.html
```

## Export to PDF

1. Open the `.html` file in **Chrome** or **Firefox**
2. Press `Cmd+P` (Mac) or `Ctrl+P` (Windows)
3. Set **Destination** → Save as PDF
4. **Paper size**: A4 · **Margins**: None · **Background graphics**: ON
5. Save

## Add a photo

1. Place your photo at `profile/photo.jpg` (`.jpeg`, `.png`, and `.webp` also accepted)
2. In `profile/profile.json`, set `"include_photo": true` under `cv_design_preferences`
3. Re-run either script — the photo is embedded directly in the HTML

Alternatively, upload via the **Settings** page in the web UI.

---

## Edit your profile

Use the **Profile** page in the web UI, or open `profile/profile.json` directly in any text editor. Sections include `personal`, `narrative`, `experience`, `education`, `skills`, `publications`, and more. See `CLAUDE.md` for the full schema reference.

---

## Project roadmap

See `CLAUDE.md` for the full plan. Upcoming phases:

| Phase | Description |
|-------|-------------|
| 5 | Job scrapers — automatically collect listings from `sources.yaml` |
| 6 | Job matching — Claude scores and ranks jobs against your profile |
| 7 | Cloud deployment — share the app with non-technical users |
