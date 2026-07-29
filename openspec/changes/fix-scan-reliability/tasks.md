# Tasks — fix-scan-reliability

## 1. Page reading (root cause of the vdab report)

- [x] 1.1 `app/services/headless.py` `render_html`: navigate with `wait_until="domcontentloaded"`, then best-effort `page.wait_for_load_state("networkidle", timeout=_SETTLE_MS)` in `try/except TimeoutError`, then return `page.content()`; `_SETTLE_MS = 8000` module constant
- [x] 1.2 Add a test (`tests/`) with a stubbed page object asserting: settle timeout is swallowed and content returned; a `goto` failure still raises
- [x] 1.3 `app/services/pdf.py`: wrap `set_content(..., wait_until="networkidle")` in `try/except PlaywrightTimeoutError` and proceed to `page.pdf()`

## 2. Scan error reporting

- [x] 2.1 `app/api/jobs.py` `_run_scan` + `_run_recheck`: call `config.require_engine(cfg)` before the source loop; on `ValueError` set the run's status to `error` with that message and stop (no per-source errors) — already present in code; pinned by test 2.3
- [x] 2.2 Add module logger to `jobs.py`; at every `_source_error()` call site log the raw exception with traceback (`logger.warning(..., exc_info=e)`)
- [x] 2.3 Test: scan with a broken engine reports one run-level engine error and zero source errors (extend `tests/test_scan_concurrency.py` patterns or new test file)

## 3. Windows first-run Chromium setup

- [x] 3.1 `app/api/system.py` `_run_install`: `stdin=subprocess.DEVNULL`, `stdout`/`stderr` appended to `paths.DATA_DIR / "myjobcoach.log"` (both branches of the driver/python fallback)
- [x] 3.2 `frontend/src/locales/en.json`: reword `banner.setupInstalling` and `banner.setupError` to name job-page reading and PDF export (edit en.json only — the pre-commit hook translates)

## 4. Wrap-up

- [x] 4.1 Run `uv run pytest` and `cd frontend && npm run build` (i18n parity failure after the en.json edit is expected pre-commit)
- [x] 4.2 Update CLAUDE.md's headless.py description (networkidle → domcontentloaded+settle) so docs match behaviour
