# Job Coach

AI-powered career assistant — generate tailored CVs and (in future phases) discover and filter job openings.

---

## Requirements

- [uv](https://docs.astral.sh/uv/) — Python package manager
- Python 3.11+ (uv installs this automatically on first run)
- Node.js 18+ — for the frontend dev server

---

## Setup

**macOS — one command:**

```bash
git clone <repo>
cd job-coach
./setup.sh
```

`setup.sh` installs Homebrew, uv, and Node if they're missing, then installs all
backend and frontend dependencies, the headless browser for PDF export, and
seeds your local `profile/profile.json` and `config.json` from the committed
`*.example` files. (Linux/Windows aren't scripted yet — use the manual steps below.)

**Manual setup (or non-macOS)** — what `setup.sh` does, step by step:

```bash
uv sync                              # backend deps (installs Python 3.11 too)
uv run playwright install chromium   # one-time: headless browser for PDF export
cd frontend && npm install && cd ..  # frontend deps
cp profile/profile.example.json profile/profile.json   # starter profile
cp config.json.example config.json                     # local config
```

> `profile/profile.json` and `config.json` are gitignored — they hold your
> personal data and API key. Both are seeded from the committed
> `*.example` templates above; edit them freely. See `CLAUDE.md` for the full
> profile schema.

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

### Customise the CV-tailoring prompt

The **Settings** page has a **CV Generator Prompt** editor — the instructions the
AI follows when tailoring a CV. Edit and save it to change tone, rules, or
emphasis; use `{lang_name}` where the output language should appear. Your profile
and the job listing are appended automatically. **Reset to default** restores the
built-in prompt.

### Edit a generated CV

Every generated CV has an **Edit generated content** panel below the preview. You
can edit the professional summary and each role's bullet points (up to 4 per job),
drag the ⠿ handle to reorder bullets within a job, and apply formatting by
selecting text and pressing **⌘/Ctrl+B** (bold) or **⌘/Ctrl+I** (italic).
Click **Save all edits** to apply everything at once and re-render.

Edits are stored **per language**, so switching the **Language** dropdown back and
forth keeps each language's edits intact. **Regenerate** opens a prompt with three
choices:
- **Keep my edits, regenerate the rest** — preserves your summary, role selection
  and bullets, refreshing only the rest (e.g. picking up new sidebar translations).
- **Regenerate everything** — a fresh AI version, discarding manual edits.
- **Cancel**.

### Re-tailor an existing CV

On any generated CV:
- **Update from Profile** re-renders it with your latest profile data (cheap — no
  AI call when a tailoring plan is stored).
- **Regenerate** re-runs the AI to fully re-tailor and re-translate the CV in its
  current language — use this to pick up profile edits or fix any untranslated text.
- The **Language** dropdown re-tailors the CV into the other language.

The summary and each role's bullet points are written in the CV's language by the
AI; switching language or regenerating translates them.

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

In the web app, click **Download PDF** on a generated CV. The PDF is rendered
server-side with headless Chromium (Playwright), so it comes out correctly
paginated — full-width header, a repeating sidebar, and the main column flowing
across pages. This needs the one-time `uv run playwright install chromium` from
Setup above.

> The old "open the HTML and Cmd+P → Save as PDF" route still works for the CLI
> output files, but the browser's print dialog handles the two-column layout
> poorly across pages — prefer the **Download PDF** button.

## Add a photo

1. Place your photo at `profile/photo.jpg` (`.jpeg`, `.png`, and `.webp` also accepted)
2. In `profile/profile.json`, set `"include_photo": true` under `cv_design_preferences`
3. Re-run either script — the photo is embedded directly in the HTML

Alternatively, upload via the **Settings** page in the web UI.

---

## Edit your profile

Use the **Profile** page in the web UI, or open `profile/profile.json` directly in any text editor.

The Profile page is organised into **core** sections that are always shown — Personal
Info, Professional Summary, Experience, Skills, Education, and Work Preferences — and
**optional** sections you add on demand via **+ Add a section** (Projects,
Certifications, Awards, Publications, Grants, Academic Background, Teaching, and Career
preferences & AI context). Each section carries a small badge showing where its data
goes:

- **On your CV** — printed on the generated CV.
- **Helps the AI** — not printed; guides how the AI tailors your CV.
- **Job matching & letters** — not printed; powers job suggestions and (soon)
  motivational letters. (Work Preferences.)

**Skills** are organised into named groups you control — add a group with any heading
that fits your field (e.g. *Technical skills*, *Clinical skills*, *Design tools*) and tag
it with the relevant skills; each non-empty group is printed on your CV. **Languages** use
a clickable 1–5 star rating (CEFR scale) instead of a typed level. Older profiles using the
previous fixed skill categories are migrated automatically on load.

Publications use a single **APA citation** field plus an optional short description.
See `CLAUDE.md` for the full schema reference.

---

## Job Suggestions

The **Job Suggestions** page watches job-listing pages and surfaces openings that fit your profile:

1. **Add sources** — paste the URL of any job-listing page (e.g. a careers or vacancies page) and click **Add**. Add as many as you like.
2. **Find new listings** — scans each source. It reads the page's actual links (rendering JS-heavy pages in a headless browser when needed), ignores openings seen on a previous scan, and asks the AI to judge only the *new* ones against your profile (goals, role type, location, language). The profile filter is skipped entirely when nothing new is found, and the last-scan time shows next to the button.
3. **Accept / Reject** — each suggestion can be rejected (greyed out in History) or accepted. **Accepting generates a tailored CV from the job URL — in the posting's language — and takes you straight to the CV Generator**, which shows the URL it's building from.

Accepted and rejected openings stay in the **History** list, newest first (rejected greyed). Accepted entries have **Open CV** to jump to the generated CV, and can still be rejected.

You can edit the two scanner prompts (link extraction, relevance filter) on the **Settings** page, and verify a source from the CLI:

```bash
uv run python scripts/scan_debug.py --url https://example.com/jobs
```

---

## Project roadmap

See `CLAUDE.md` for the full plan. Upcoming phases:

| Phase | Description |
|-------|-------------|
| 6 | Job matching — Claude scores and ranks jobs against your profile |
| 7 | Cloud deployment — share the app with non-technical users |
