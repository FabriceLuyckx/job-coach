# Fix scan reliability — page reading, engine-failure reporting, Windows setup

## Why

Windows users report they "cannot add job listing websites or they cannot be scraped." Investigation found the real causes, none Windows-only, all reproduced or confirmed in code:

1. `render_html()` waits for `networkidle` (30s) — chatty SPAs (vdab.be, reproduced) never go idle, so the fully-loaded page is thrown away as a timeout. `/check` surfaces a raw Playwright traceback; scans silently fall back to httpx, which yields the nav-only SPA shell → zero jobs.
2. When the AI engine can't run (e.g. `llama-cpp-python` missing), the scan loop's catch-all reports **every source** as "the page couldn't be read" — pointing users at the websites when the engine is at fault.
3. `_source_error()`'s docstring promises the raw exception is kept in the server log; nothing logs it. Diagnosing (2) required a manual investigation instead of one `tail`.
4. `SetupBanner` claims "everything except PDF export works" while Chromium downloads — but scanning JS boards also needs it and silently degrades meanwhile (or forever, if the download failed).
5. `_run_install()` runs `playwright install` with inherited stdio; in the windowed (`console=False`) Windows build there are no console handles — a known way for the child to die, leaving Chromium never installed and every JS board unscrapable.
6. `pdf.py` uses `set_content(wait_until="networkidle")`; behind a proxy that blackholes the Google Fonts request, PDF export hangs 30s and fails instead of falling back to system fonts.

## What Changes

- `render_html()`: navigate on `domcontentloaded`, best-effort bounded `networkidle` settle, always return the content that loaded. All callers (scan, `/check`, CV generation) inherit the fix.
- Scan: detect engine failure distinctly — fail the scan once with "the AI engine isn't ready" instead of N per-source "page couldn't be read" errors (reuse `config.require_engine` up front, and don't misattribute LLM-call failures to sources).
- Log the raw exception (server log) wherever `_source_error()` flattens it for the UI.
- `pdf.py`: tolerate the `networkidle` timeout in `set_content`; render with whatever fonts arrived.
- `SetupBanner` copy: say job scanning *and* PDF export need the browser engine; keep the error state actionable.
- `_run_install()`: explicit `stdin=DEVNULL`, `stdout`/`stderr` to the app log, so the installer both survives windowed builds and leaves a diagnosable trace.

## Capabilities

### New Capabilities
- `page-reading`: how posting/listing pages are read — HTTP first, headless render fallback, tolerance for never-idle pages, and PDF rendering not hanging on blocked font CDNs.
- `headless-engine-setup`: first-run Chromium download — truthful UI about what depends on it, and an install path that works and logs in windowed (no-console) builds.

### Modified Capabilities
- `job-scan-lifecycle`: source-error reporting requirements change — engine failures are reported once as an engine problem, never per-source; flattened errors keep their raw detail in the server log.

## Impact

- Phase 5 (Job Suggestions) + Phase 7 packaging touchpoints.
- Code: `app/services/headless.py`, `app/services/pdf.py`, `app/api/jobs.py`, `app/api/system.py`, `frontend/src/components/SetupBanner.tsx`, `frontend/src/locales/en.json` (banner copy; hook owns translations).
- No API or schema changes; no new dependencies.
