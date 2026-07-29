# Design — fix-scan-reliability

## Context

All page reading funnels through `app/services/headless.py` (`http_get` → `render_html` fallback), used by the scan (`fetch_listing_links`, `fetch_texts`), `/api/jobs/check`, and CV generation (`fetch_job_description` → `fetch_text`). `render_html` navigates with `wait_until="networkidle"`, which never fires on SPAs with continuous polling — reproduced on vdab.be: timeout at 30.0s with 8,343 chars of readable text already in the page; `domcontentloaded` + a bounded settle got the same text in 8.4s.

Separately, the scan loop (`app/api/jobs.py:_run_scan`) wraps its links → extract → prescreen phase in one `except Exception` that maps everything to `_source_error(e)` per source. LLM-engine failures (the extract/prescreen calls) hit this path, so a dead engine reads as "the page couldn't be read" on every source. Nothing logs the raw exception despite the docstring's promise.

Packaging: the Windows build is `console=False`; `_run_install` (`app/api/system.py`) spawns `playwright install chromium` with inherited stdio. `SetupBanner` copy claims only PDF export depends on Chromium.

## Goals / Non-Goals

**Goals**
- Never discard a page that loaded, just because it never went network-idle.
- Engine failures fail the scan once, named as an engine problem.
- Every flattened user-facing error keeps its raw exception in the server log.
- First-run Chromium install works and is diagnosable in windowed builds; the banner tells the truth about what needs it.

**Non-Goals**
- No bot-evasion work (UA spoofing for Cloudflare-fronted boards) — separate decision if reports continue.
- No SSRF hardening (already tracked as a Phase 7 security prerequisite).
- No retry/backoff machinery for fetches.

## Decisions

1. **`render_html`: `domcontentloaded` + bounded best-effort settle, always return content.**
   `page.goto(url, wait_until="domcontentloaded", timeout=30000)`, then `page.wait_for_load_state("networkidle", timeout=8000)` inside `try/except PlaywrightTimeoutError`, then `return page.content()`.
   - Why not "catch the timeout on the existing networkidle goto": functionally equivalent but always burns the full 30s on chatty pages; the settle cap makes chatty pages ~4× faster.
   - Why keep a settle at all: `domcontentloaded` alone fires before the SPA has fetched its data; the render exists precisely for JS-built pages.
   - Real navigation failures (DNS, refused) still raise from `goto` — callers' fallback behaviour is unchanged. A timeout-before-content case returns near-empty HTML, which callers already treat as "too thin" (`_MIN_TEXT` / `_MIN_LINKS`).

2. **Engine readiness checked once, up front, in `_run_scan`/`_run_recheck`** via the existing `config.require_engine(cfg)` (already used by `/check`). Failure sets the scan status to `error` with the engine message — no per-source attribution. Additionally, `GenerationCancelled` stays a re-raise; any *other* exception raised by `complete()` mid-scan is still caught per source (a transient provider blip on source 3 shouldn't kill sources 4–9), but is logged (Decision 3) — the up-front check is what prevents the all-sources-fail lie.
   - Why not classify exception types per source: fragile across two providers; the cheap up-front check catches the dominant case (engine dead ⇒ all calls fail).

3. **Logging: module logger in `jobs.py`; `logger.warning("scan: source %s failed: %r", name, e)` (with traceback via `exc_info=e`) at every `_source_error` call site.** Uses stdlib `logging` — uvicorn already routes it; the packaged app's `_redirect_stdio` sends it to `myjobcoach.log`.

4. **`pdf.py`: wrap `set_content(..., wait_until="networkidle")` in `try/except PlaywrightTimeoutError`** and proceed to `page.pdf()`. A blackholed fonts request then costs the timeout once but still yields a PDF in fallback fonts instead of an error.

5. **`_run_install`: `stdin=subprocess.DEVNULL`, `stdout`/`stderr` appended to `paths.DATA_DIR / "myjobcoach.log"`.** One `open(..., "ab")` handle for both streams; also fixes the missing diagnosis trail for failed downloads (proxy/AV).

6. **`SetupBanner` copy** (`banner.setupInstalling`, `banner.setupError` in `en.json` only — the pre-commit hook translates): name "reading job pages and PDF export" as what's affected. No behavioural change to the banner.

## Risks / Trade-offs

- [8s settle is a heuristic] → A very slow SPA may yield partial text. Acceptable: today it yields *nothing*; `_MIN_TEXT` still guards downstream, and the constant is one named value (`_SETTLE_MS`) to tune.
- [Chatty pages during PDF export still wait the full `set_content` timeout before falling back] → rare (self-contained HTML; only remote fonts), and correctness over speed here.
- [Up-front `require_engine` can pass and the engine still die mid-scan] → per-source catch + logging remains as the backstop; the user sees per-source errors but the log now names the real cause.

## Migration Plan

Pure behaviour fixes; no schema/API changes. Ship in one commit series (`fix:` prefixes). Rollback = revert.

## Open Questions

None.
