# Job Coach

AI-powered career assistant — generate tailored CVs and (in future phases) discover and filter job openings.

---

## Requirements

- [uv](https://docs.astral.sh/uv/) — Python package manager
- Python 3.11+ (uv installs this automatically on first run)

---

## Setup

```bash
git clone <repo>
cd job-coach
uv sync
```

---

## Generate a CV

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

## AI-tailor a CV for a specific job

Requires an Anthropic API key. Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Then run:

```bash
uv run python scripts/tailor_cv.py --url https://example.com/jobs/123

# Dutch tailored CV
uv run python scripts/tailor_cv.py --url https://... --lang nl

# Override the output folder name
uv run python scripts/tailor_cv.py --url https://... --job "ugent-lecturer"
```

Claude reads the job posting, selects the most relevant experience from your profile, rewrites the summary and responsibility bullets to match the role's language, and saves the result to `output/<job-slug>/cv_<lang>.html`.

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

---

## Edit your profile

Open `profile/profile.json` in any text editor. Sections include `personal`, `narrative`, `experience`, `education`, `skills`, `publications`, and more. See `CLAUDE.md` for the full schema reference.

---

## Project roadmap

See `CLAUDE.md` for the full plan. Upcoming phases:

| Phase | Description |
|-------|-------------|
| 4 | Web UI — browser-based profile editor and CV generator |
| 5 | Job scrapers — automatically collect listings from `sources.yaml` |
| 6 | Job matching — Claude scores and ranks jobs against your profile |
| 7 | Cloud deployment — share the app with non-technical users |
