# Job Coach

AI-powered career assistant — generate tailored CVs and (in future phases) discover and filter job openings.

---

## Download & run (no setup)

For non-technical users. Grab the latest build from the
[Releases](../../releases) page:

- **macOS** — download `JobCoach-macos.dmg`, open it, drag **Job Coach** into
  Applications, then launch it.
- **Windows** — download `JobCoach-windows.zip`, unzip it anywhere, and run
  `JobCoach.exe` (keep the small window it opens — closing it quits the app).

The app opens in your default browser. On **first launch** it downloads a PDF
engine one time (~150 MB) — a banner shows the progress and everything except
PDF export works while it finishes. Then open **Settings** and paste your
[OpenRouter](https://openrouter.ai) API key.

All your data stays on your machine, in a standard per-user folder:
- macOS: `~/Library/Application Support/JobCoach/`
- Windows: `%APPDATA%\JobCoach\`

### Moving to a new computer (backup & restore)

**Settings → Backup & Restore** lets you carry everything over in one file:

- **Export backup** downloads a single `.zip` with your profile and photo, settings,
  job sources and history, and every generated CV. Your OpenRouter API key is **not**
  included, so the file is safe to email or store in the cloud.
- On the new machine, install Job Coach, open **Settings → Backup & Restore**,
  **Restore from backup** — pick that `.zip` — then re-enter your API key.

Restoring **replaces** your profile, job history and generated CVs on the new machine
(it doesn't merge). Any API key already set there is left untouched.

> **First-launch security warning (unsigned app):** because the app isn't code-signed
> yet, the OS will warn the first time. On **macOS**, right-click the app → **Open** →
> **Open** (or run `xattr -dr com.apple.quarantine "/Applications/Job Coach.app"`).
> On **Windows**, click **More info** → **Run anyway** on the SmartScreen prompt.

---

## Requirements (for development)

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

On first run, a banner guides you to **Settings** to enter your
[OpenRouter](https://openrouter.ai) API key — it's saved locally to `config.json`
(gitignored). Until a key is set, the Generate/Scan buttons are disabled with an
explanation. Your OpenRouter credit balance shows next to the buttons that spend it.

### Customise the AI prompts (advanced)

**Settings → Advanced — AI prompts** (collapsed by default) holds the three
editable prompts: the CV tailoring prompt and the two job-scanner prompts (link
extraction, relevance filter). Edit and save to change tone, rules, or emphasis.
The tailoring prompt must keep the `{lang_name}` placeholder (where the output
language appears) — saves without it are rejected. Your profile and the job
listing are appended automatically. **Reset to default** restores the built-in
prompt.

### Edit a generated CV

Every generated CV has an **Edit generated content** panel below the preview. You
can edit the professional summary and each role's bullet points (up to 4 per job),
drag the handle to reorder bullets within a job, and apply formatting by
selecting text and pressing **⌘/Ctrl+B** (bold) or **⌘/Ctrl+I** (italic).
Click **Save all edits** to apply everything at once and re-render.

Edits are stored **per language**, so switching the **Language** dropdown back and
forth keeps each language's edits intact.

### Update an existing CV

The **Update CV…** button on any generated CV opens one menu with the three ways
to refresh it:

- **Refresh the preview** — re-renders your saved edits with the latest design
  settings. Free, instant. (Labelled **Save my edits & refresh** when you have
  unsaved edits.)
- **Pull in my latest profile** — re-renders from the stored tailoring plan using
  your current profile data. Free.
- **Ask the AI to re-tailor** — re-runs the AI against the job listing
  (~30 seconds, uses credits). You choose whether to **keep your edits** (summary,
  role selection, bullets are preserved; the rest is refreshed) or **start fresh**.

The **Language** dropdown re-tailors the CV into the other language; the summary
and bullets are written in the CV's language by the AI.

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

**Everything on the Profile page saves automatically as you type** — a status
indicator in the header shows *Saving… / All changes saved* (with a Retry button
if a save fails). Removing an item (a job, degree, publication, …) shows a
5-second **Undo** toast.

The Profile page is organised into **core** sections that are always shown — Personal
Info, Professional Summary, Experience, Skills, Education, and Work Preferences — and
**optional** sections you add on demand via **+ Add a section** (Projects,
Volunteering, Certifications, Courses & training, Awards, Professional memberships,
Publications, Grants, Research & academic background, Teaching, Career preferences & AI
context, and **Custom sections** for anything your field needs). The add-a-section menu
explains what each one does. Each section carries a small badge showing where its data
goes:

- **On your CV** — printed on the generated CV.
- **Helps the AI** — not printed; guides how the AI tailors your CV.
- **Job matching & letters** — not printed; powers job suggestions and (soon)
  motivational letters. (Work Preferences.)

Every section is career-neutral, so the same page works whether you're a nurse, a
designer, a lawyer or a researcher. To remove an optional section, use **Hide** in its
header — this keeps your data (it reappears in **+ Add a section** with a *has content*
hint); only the per-item ✕ actually deletes anything (with a 5-second Undo).

### Start from an existing CV

A brand-new profile starts empty. Use **Import from an existing CV** (on the empty
state, or the button in the page header) to upload a PDF or paste your CV text — the AI
extracts your details into the profile for you to review and edit. Nothing is saved
until you've checked it, and importing over an existing profile warns you first.
Requires an OpenRouter API key.

**Experience** entries keep just what a CV needs — title, employer, dates (an *I
currently work here* checkbox handles current roles), and the bullet points that become
your CV body. Anything extra for the AI (context, when a role is most relevant) lives
behind an optional **Notes for the AI** panel. Drag the handle on any Experience,
Education, Publication or Project entry to reorder it.

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
2. **Find new listings** — scans each source, showing progress (*Scanning example.com (2 of 5)…*). It reads the page's actual links (rendering JS-heavy pages in a headless browser when needed), ignores openings seen on a previous scan, and asks the AI to judge only the *new* ones against your profile (goals, role type, location, language). The profile filter is skipped entirely when nothing new is found, and the last-scan time shows next to the button. If a source can't be read, it's reported by name after the scan instead of failing silently.
3. **Accept / Reject** — each suggestion can be rejected (with a 5-second **Undo**) or accepted. **Accepting generates a tailored CV from the job URL — in the posting's language — and takes you straight to the CV Generator**, which shows the URL it's building from.

Accepted and rejected openings stay in the **History** list, newest first. Accepted entries have **Open CV** to jump to the generated CV and **Regenerate CV** to run the generation again (e.g. after a failure); rejected entries can be **Restored** to the suggestions.

You can edit the two scanner prompts under **Settings → Advanced — AI prompts**, and verify a source from the CLI:

```bash
uv run python scripts/scan_debug.py --url https://example.com/jobs
```

---

## Run the tests

```bash
uv run pytest
```

Covers the backend hardening: upload validation (size caps, image magic bytes),
backup-import safety (zip bombs, path traversal, manifest checks), slug
sanitisation, LLM-config and AI-response guards, and profile/prompt validation.
All tests exercise rejection paths only, so they never touch your local data.

---

## Building a desktop release (maintainers)

The downloadable apps are built with [PyInstaller](https://pyinstaller.org) from
`packaging/jobcoach.spec`, which bundles the FastAPI backend, the built frontend,
and the Playwright driver into a single double-click app. Chromium itself is
downloaded on the user's first launch to keep the installer small.

**Automated (recommended):** push a version tag and GitHub Actions builds both
platforms and attaches them to a Release:

```bash
git tag v0.1.0 && git push --tags   # see .github/workflows/release.yml
```

**Local build** (produces `dist/JobCoach.app` on macOS, `dist/JobCoach/` on Windows):

```bash
cd frontend && npm run build && cd ..   # build the frontend into frontend/dist
uv sync --extra package                 # installs PyInstaller
uv run pyinstaller packaging/jobcoach.spec
```

You can also run the packaged launcher directly during development — it starts the
server and opens your browser, exactly as the bundle does:

```bash
cd frontend && npm run build && cd ..
uv run python -m app.desktop
```

Builds are unsigned for now; see the first-launch security note above. To ship a
warning-free app, add code-signing/notarization to the CI workflow (macOS
notarytool, Windows signtool / Azure Trusted Signing).

---

## Project roadmap

See `CLAUDE.md` for the full plan. Upcoming phases:

| Phase | Description |
|-------|-------------|
| 6 | Job matching — Claude scores and ranks jobs against your profile |
| 7 | Desktop packaging — downloadable Mac/Windows apps (in progress) + optional cloud deployment |
