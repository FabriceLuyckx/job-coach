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
PDF export works while it finishes.

Then pick how the AI runs (Settings → **AI Engine**, or the first-run prompt):

- **Free local model** — download a model (2.5–9 GB, your choice) that runs on your own
  computer. No account, no cost, fully private/offline. Good results; on a slower machine
  a CV can take a few minutes.
- **OpenRouter** — paste an [OpenRouter](https://openrouter.ai) API key for the best
  quality (pay a few cents per CV).

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

On first run, a banner guides you to **Settings → AI Engine** to set up the AI. Choose
either the **free local model** (downloaded and run on your machine — no key needed) or
**OpenRouter** (paste an [OpenRouter](https://openrouter.ai) API key, saved locally to
`config.json`, gitignored). Until an engine is ready, the Generate/Scan buttons are
disabled with an explanation. On OpenRouter, your credit balance shows next to the
buttons that spend it.

> **Local engine (development):** the local model runs via `llama-cpp-python`, a heavy
> platform-specific dependency kept out of the default install. Enable it with
> `uv sync --extra local`. Without it, use the OpenRouter engine.

#### Choosing a local model

Four models are offered, all Q4_K_M quantised. Bigger writes better and runs slower:

| Model | Download | Recommended RAM | Good for |
|-------|----------|-----------------|----------|
| Qwen3 4B | ~2.5 GB | 8 GB | The light option — pick this on an 8 GB machine. Multilingual, quickest. |
| **Qwen3 8B** (default) | ~5.0 GB | 16 GB | Balanced. Multilingual, clearly better writing than the 4B. |
| Gemma 3 12B | ~7.3 GB | 16 GB | A different model family; strong prose. |
| Qwen3 14B | ~9.0 GB | 24 GB | Best CVs and letters, if you have the memory. |

In **Settings → AI Engine**, pick a model to make it active; if it isn't downloaded yet,
the button below the list downloads it (resumable, with progress). Several models can sit
on disk at once — **Delete model** removes the selected one and frees its space. The
download warns before starting if your machine has less RAM than recommended, and lets
you proceed anyway.

**Adding your own model (advanced).** The same panel takes a direct HTTPS link to a
`.gguf` file — for example from
[Hugging Face's GGUF catalogue](https://huggingface.co/models?library=gguf&sort=trending).
Paste the link to the file itself (on Hugging Face use the download link, not the `blob`
page — the app corrects that one for you). Models added this way are not tested with this
app: some won't load, and some produce worse results. Delete removes both the file and
the entry.

### Language

The app is English by default and can run in other languages — pick one under
**Settings → Language**. Seven European languages (Dutch, French, German, Spanish,
Italian, Portuguese, Polish) ship translated and reviewed. Job postings themselves are
never translated: the AI reads them in whatever language they're in and writes your CV in
the language you ask for. Some backend error messages remain in English.

> **Maintainers:** UI strings live in `frontend/src/locales/en.json`. After changing them,
> refresh the shipped translations with `uv run python scripts/translate_locales.py` (it
> only re-translates new or changed keys). CV section headings are translated separately in
> `app/i18n/cv_labels.json`.

### Customise the AI prompts (advanced)

**Settings → Advanced — AI prompts** (collapsed by default) holds the four
editable prompts: the CV tailoring prompt, the cover-letter guide prompt, and the
two job-scanner prompts (link extraction, relevance filter). Edit and save to
change tone, rules, or emphasis. The CV and cover-letter prompts must keep the
`{lang_name}` placeholder (where the output language appears) — saves without it
are rejected. Your profile and the job
listing are appended automatically. **Reset to default** restores the built-in
prompt.

### Edit a generated CV

Every generated CV shows the live preview and an **Edit generated content** panel
side by side (they stack on a narrow window; the preview scales to fit). You can
edit the professional summary and each role's bullet points (up to 4 per job — the
**+ Add** button disappears at 4), drag the handle to reorder bullets, and apply
formatting by selecting text and pressing **⌘/Ctrl+B** (bold) or **⌘/Ctrl+I**
(italic). **Edits save automatically** (a *Saving… / Saved* status shows in the
panel header) and the preview refreshes itself — there is no Save button.

Edits are stored **per language**, so switching the application's **Language** back and
forth (the selector above the tabs) keeps each language's edits intact.

**Sections.** Under the preview, tick sections on/off to show or hide them. You get
one checkbox per section actually on this CV — teaching, projects, awards, your own
custom sections, all of them — and the choice is **real**: it applies to the preview,
the PDF, "open in new tab", and the next time you open the CV. It is also **per CV**:
hiding a section here never touches your other applications. The same cluster shows the AI's decisions
— which **skills it emphasised**, and any sections it **left out** as irrelevant
(each with a one-tap **restore**).

### Update an existing CV

The AI actions are:

- **Update with AI…** — re-runs the AI against the job listing (~30 seconds, uses
  credits). You choose whether to **keep your edits** (summary, role selection,
  bullets, and section toggles are preserved; the rest is refreshed) or **start
  fresh**. (For a legacy CV with no editable plan this button reads **Build
  editable CV from listing**.)
- The **Language** dropdown re-tailors the CV into the other language; the summary
  and bullets are written in the CV's language by the AI.

These AI calls, plus generation, all run in the background with a coarse progress
stage (*reading the listing → tailoring → building*) so a slow local model never
times out the browser. Design/profile changes appear on the next preview
automatically; the small **refresh** icon reloads it on demand. **Download PDF**
saves the file directly and reports any error instead of opening a blank tab.

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

Requires a configured AI engine (a downloaded local model, or an OpenRouter API key). Set
it via the Settings page (preferred), or create `config.json` manually:

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

## Choose how your CV looks

**Settings → Visual preferences** holds the whole design. Nothing here costs AI
credits, and every change applies to **all** your CVs — open one under
**Applications** to see it.

- **Template** — five layouts, shown as small previews drawn in your own colours:
  **Sidebar** (two columns, the default), **Classic** (single column, centered
  serif header), **Banner** (full-width colour band), **Compact** (right sidebar,
  denser — for long CVs), and **Minimal** (typographic, nothing filled in — the
  friendliest to a black-and-white office printer).
- **Colour palette** — curated palettes (including one in Job Coach's own
  colours); tapping one recolours the previews straight away.
- **Colours** — the selected palette's accent, text, and background colours,
  each shown with an editable colour picker and hex box. Overwrite any of them
  to make the palette your own.

## Add a photo

1. Place your photo at `profile/photo.jpg` (`.jpeg`, `.png`, and `.webp` also accepted)
2. In `profile/profile.json`, set `"include_photo": true` under `cv_design_preferences`
3. Re-run either script — the photo is embedded directly in the HTML

Alternatively, upload via the **Settings** page in the web UI, where you can also:

- **Adjust the framing** — the editor opens right after an upload (and any time
  via the pencil on the photo preview): drag to reposition, zoom with the
  slider, and the circle shows exactly what will appear on the CV. The photo sits
  on a square canvas painted in your CV's background colour, so you can zoom out
  past its own edges and place it freely — whatever ends up beside it is simply
  part of the CV's background. Your uploaded file is never modified, so you can
  re-adjust any time without losing quality. Each template places the photo where
  its design wants it (in the sidebar, inside the banner, above your name…),
  always as a circle.
- **Include photo on new CVs by default** — saves the moment you toggle it, and
  each CV keeps its own photo on/off switch in the CV editor.

---

## Edit your profile

Use the **Profile** and **Preferences** pages in the web UI, or open
`profile/profile.json` directly in any text editor — both pages edit the same file,
just different parts of it.

**Everything on both pages saves automatically as you type** — a status
indicator in the header shows *Saving… / All changes saved* (with a Retry button
if a save fails). Removing an item (a job, degree, publication, …) shows a
5-second **Undo** toast.

**Profile** holds only what can end up on a generated CV. It's organised into
**core** sections that are always shown — Personal Info, Professional Summary,
Experience, Skills, Education — and **optional** sections you add on demand via
**+ Add a section** (Projects, Volunteering, Certifications, Courses & training,
Awards, Professional memberships, Publications, Grants, Research & academic
background, Teaching, and **Custom sections** for anything your field needs). The
add-a-section menu explains what each one does. Each section carries a small badge
showing where its data goes:

- **On your CV** — printed on the generated CV.
- **Helps the AI** — not printed; guides how the AI tailors your CV (e.g. Research
  & academic background).

Every section is career-neutral, so the same page works whether you're a nurse, a
designer, a lawyer or a researcher. To remove an optional section, use **Hide** in its
header — this keeps your data (it reappears in **+ Add a section** with a *has content*
hint); only the per-item ✕ actually deletes anything (with a 5-second Undo).

**Preferences** holds what's *not* on the CV. It's a five-question form: the job
titles to watch for, where and how you want to work (locations, working style,
languages), what makes a job a great match, your dealbreakers (with one-tap
examples), and the practical small print (salary, contract, hours, travel).
The answers drive Job Suggestions' matching — since the scanner reads each full
posting, even free-text answers like dealbreakers and salary expectations
actually take effect — and will power motivational letters in a future phase.

### Start from an existing CV

A brand-new profile starts empty. Use **Import from an existing CV** (on the empty
state, or the button in the page header) to upload a PDF or paste your CV text — the AI
extracts your details into the profile for you to review and edit. Nothing is saved
until you've checked it, and importing over an existing profile warns you first.
Requires a configured AI engine. CV import is the most demanding AI task, so on the free
local model it may be slower and less accurate — the import dialog says so, and for a
long or complex CV an OpenRouter key gives noticeably better results.

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
2. **Find new listings** — scans each source, showing progress (*Scanning example.com (2 of 5)…*, then *Reading posting 3 of 7…*). It reads the page's actual links (rendering JS-heavy pages in a headless browser when needed) and ignores openings seen on a previous scan. A source whose links haven't changed since the last scan is skipped entirely — no AI cost. For the genuinely new openings, a quick title triage drops the clearly off-target ones, then the AI **reads each remaining posting in full** to decide whether it fits your profile *and* pull out a digest — employer, location, remote, salary, deadline, a short summary and key requirements — shown on the suggestion. Because the whole posting is read (not just its title), preferences like *what to avoid*, remote/on-site and the free-text notes actually take effect. The last-scan time shows next to the button, and each source shows when it was last scanned; if a source can't be read, it's reported by name after the scan instead of failing silently. A scan keeps running if you switch to another page — come back and it's still going — and a **Cancel** button stops it early (which frees the AI engine straight away). Cancelling never wastes work: any postings already judged are kept, so a re-scan only picks up where it left off.
3. **Accept / Reject** — each suggestion can be rejected (with a 5-second **Undo**) or accepted. **Accepting generates both a tailored CV and a cover-letter writing guide from the job URL — in the posting's language, reusing the posting already read during the scan (no re-fetch) — and takes you straight to the Applications page**, which shows both building. Past the fifth suggestion a search box and source filter appear.

Nothing is thrown away silently. Openings the filter *rejected* land in a collapsed **Filtered out** list, each with the reason it was dropped and a **Suggest anyway** button in case it got one wrong. When you improve your Preferences, hit **Re-check filtered jobs** to re-judge those past openings against your new answers — it reuses the postings already read, so it's fast and free of extra scraping (and a hint appears when your profile changed since the last scan). Found a posting somewhere else? Paste its URL under **Check a specific job** to run it through the same review.

Accepted and rejected openings stay in the **History** list, newest first (with **Show more** for long histories). Accepted entries have **Open application** to jump to the generated CV and letter guide; rejected entries can be **Restored** to the suggestions.

You can edit the two scanner prompts under **Settings → Advanced — AI prompts**, and verify a source from the CLI:

```bash
uv run python scripts/scan_debug.py --url https://example.com/jobs
```

---

## Applications

The **Applications** page is where a job's tailored CV and cover-letter guide live
together — one row per job, joined automatically. Click **New application**, paste a
job listing URL, leave the language on **Auto-detect** (or pick one), tick **Tailored
CV** and/or **Letter guide**, and **Generate**. Auto-detect reads the posting once to
work out its language, so the CV and letter come out in the posting's language without
you guessing. Each row expands to a **CV | Letter** tab strip so you work on one at a
time without either editor getting cluttered; if a row has only one of the two, the
other tab offers to create it. Accepting a job on the **Job Suggestions** page drops a
fully-built application here in the posting's detected language.

**No listing yet? Use the general application.** Pinned at the top of the page is a
**general application** — a CV and cover-letter guide aimed at the roles you're
targeting rather than at one posting, for networking, speculative approaches, or just
having something to hand out. It is only built when you click **Create general
application**, and only once your profile can aim it: you need at least one target role
(**Preferences**) and one role in your work history (**Profile**). Until then the card
tells you what's missing and links you there. Once created it behaves like any other
application — same editor, language selector, PDF, and delete. Regenerating it picks up
your latest preferences.

**Language is one setting for the whole application.** A single **Language** selector
sits above the tabs — change it and both the CV and the letter are re-generated in the
new language (your CV edits are preserved). There is no separate language control inside
the CV editor.

**Cancelling a generation.** Every generation (creating a CV or letter, a new
application, or a language change) shows a **Cancel** button while it runs. On the free
local model this can take a few minutes; cancelling stops the wait **and** interrupts
the model so it frees up for other work — important on a modest laptop, where the local
engine runs one job at a time and an unstoppable generation would block everything else.

The **CV** tab is the full CV editor — live preview, editable summary and bullets,
section toggles, re-tailoring, and **Download PDF** (see *Edit a generated CV* above).

The **Letter** tab is a **tailored writing guide** — **not** a written letter. The AI
returns an angle, a paragraph-by-paragraph outline (each with a goal and concrete
pointers), an evidence map (posting requirement → the real profile fact to cite for
it), honest gaps to address, and a tone/length note. This is deliberate: a cover
letter only works in your own words, and recruiters increasingly discard AI-written
ones. The guide tells you *what* to write and *which* parts of your profile to lean
on; the writing stays yours. **Copy as Markdown** hands the outline to your own
editor. The guide prompt is editable under **Settings → Advanced — AI prompts**.

---

## Run the tests

```bash
uv run pytest
```

Covers the backend hardening: upload validation (size caps, image magic bytes),
backup-import safety (zip bombs, path traversal, manifest checks), slug
sanitisation, LLM-config and AI-response guards, and profile/prompt validation.
All tests exercise rejection paths only, so they never touch your local data.

The frontend has one standalone check (no test framework needed):

```bash
node frontend/scripts/check-tags.mjs
```

It covers `parseTags`, the tag-entry logic behind every tag field — comma/newline
splitting, case-insensitive dedup, and per-entry length caps.

---

## Spec-driven changes (maintainers)

Non-trivial changes are planned with [OpenSpec](https://github.com/Fission-AI/OpenSpec)
(`npm install -g @fission-ai/openspec`). Project context lives in
`openspec/config.yaml`; in Claude Code use `/opsx:propose` to draft a change
(proposal, design, tasks), `/opsx:apply` to implement it, and `/opsx:archive`
when done.

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

---

## License

Licensed under the GNU Affero General Public License v3.0 or later
(AGPL-3.0-or-later). See [LICENSE](LICENSE). If you run a modified version of
this app as a network service, the AGPL requires you to offer its source to
users.
