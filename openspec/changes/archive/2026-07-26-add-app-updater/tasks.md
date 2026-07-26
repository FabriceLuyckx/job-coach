## 1. Updater service — check

- [x] 1.1 Create `app/services/updater.py` with the release constants: repo slug, `https://api.github.com/repos/FabriceLuyckx/job-coach/releases/latest`, the allowed download host + path prefix, and the platform→asset-name map (`darwin` → `MyJobCoach-macos.dmg`, `win32` → `MyJobCoach-windows.zip`)
- [x] 1.2 Add `parse_version(text) -> tuple[int,int,int] | None` (regex on `vX.Y.Z`, `None` for `"unknown"`/unparseable) and `is_newer(latest, current)` using a strict `>` compare
- [x] 1.3 Add `asset_for_platform(assets)` selecting by the name map and returning `None` when this platform has no asset
- [x] 1.4 Add `valid_download_url(url)` enforcing `https://github.com/FabriceLuyckx/job-coach/releases/download/…`
- [x] 1.5 Add `check_for_update()` — GET the latest release with a `User-Agent` header and a short timeout, returning `{available, current, latest, notes_url, installable, reason}`; unparseable/older version ⇒ not available, missing platform asset ⇒ available but `installable: False`, network/HTTP failure ⇒ a readable `reason`

## 2. Updater service — install preconditions

- [x] 2.1 Add `install_root()` — `None` when `not paths.FROZEN`; on macOS the first `.app` parent of `sys.executable`, on Windows `sys.executable.parent`
- [x] 2.2 Add `install_blocker() -> str | None` returning the reason self-update must be refused: not frozen, unresolvable install root, parent directory not writable (`os.access(..., W_OK)`), or a macOS path under `/AppTranslocation/` or `/Volumes/`
- [x] 2.3 Have the install entry point call `install_blocker()` before any download, so a refusal costs no bytes

## 3. Updater service — download, stage, swap

- [x] 3.1 Add module-level progress state (`{state, bytes_done, bytes_total, error}` + a `threading.Lock` + a `threading.Event` for cancel) — one update in flight at a time, no id keying
- [x] 3.2 Stream the asset to `DATA_DIR/updates/<name>` with httpx, updating progress per chunk and aborting on the cancel event; verify the final size against the asset's declared `size` and fail the update on a mismatch
- [x] 3.3 Stage the payload: macOS `hdiutil attach -nobrowse -readonly` → `ditto` the `.app` into `DATA_DIR/updates/staged/` → `hdiutil detach`; Windows `shutil.unpack_archive` into the same staging dir. Verify the staged bundle/exe exists before going further
- [x] 3.4 Write the platform swap helper into `DATA_DIR/updates/` (sh on macOS, `.cmd` on Windows) implementing wait-for-PID → move-aside → copy → restore-on-failure → relaunch, per design.md; clear `com.apple.quarantine` on the macOS copy
- [x] 3.5 Launch the helper detached (`start_new_session=True` / `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`) with the current PID, set state to `restarting`, and exit the app via `os._exit(0)` from a short-delayed thread so the HTTP response flushes first
- [x] 3.6 Clean up `DATA_DIR/updates/` (downloaded archive + staging dir) at the start of a new install and after a cancel or failure

## 4. API endpoints

- [x] 4.1 Add `GET /api/update/check` to `app/api/system.py`, returning `check_for_update()`
- [x] 4.2 Add `POST /api/update/install` — 400 with the blocker message when `install_blocker()` refuses, 409 when an update is already in flight, otherwise start the download/stage thread and return 202
- [x] 4.3 Add `GET /api/update/status` and `POST /api/update/cancel` (sets the cancel event; leaves the installation untouched)

## 5. Settings persistence

- [x] 5.1 Add `auto_update_check: True` to `config._DEFAULTS`
- [x] 5.2 Add `auto_update_check: bool | None` to `SettingsIn` and expose it from `GET /api/settings` in `app/api/settings.py`

## 6. Frontend

- [x] 6.1 Add typed client methods to `frontend/src/api.ts`: `checkUpdate`, `startUpdate`, `getUpdateStatus`, `cancelUpdate`, plus `auto_update_check` on the settings type
- [x] 6.2 Create `frontend/src/components/Updater.tsx` exporting `UpdateBanner` (mirrors `SetupBanner`: `role="status"`, dismissible for the session, "Update now" + release-notes link) and `UpdateDialog` (shared `Modal`: checking / up-to-date / available / downloading with progress + Cancel / restarting / error, plus the refusal message with a release-page link)
- [x] 6.3 Wire `App.tsx` — hold dialog open/closed state, render `UpdateBanner` beside `SetupBanner`/`ApiKeyBanner`, and replace the reserved comment in the sidebar app-menu cluster with the "Check for updates…" `.nav-item` button (lucide icon, matching the About button)
- [x] 6.4 Gate the banner's automatic check on the `auto_update_check` setting; the sidebar button always checks
- [x] 6.5 Add an "Updates" card to `frontend/src/pages/Settings.tsx` with the automatic-check checkbox (`.checkbox-row`) and help text, placed above Backup & Restore
- [x] 6.6 Add all new UI strings to `frontend/src/locales/en.json` only — do NOT run `scripts/translate_locales.py`; the pre-commit hook owns the other catalogs

## 7. Tests

- [x] 7.1 Create `tests/test_updater.py` covering `parse_version`/`is_newer` (including `"unknown"` and equal/older versions), `asset_for_platform` per platform and for an unsupported one, and `valid_download_url` accepting the GitHub release path while rejecting other hosts
- [x] 7.2 Add tests for `install_root()`/`install_blocker()` refusals: not frozen, non-writable parent, macOS translocated path
- [x] 7.3 Add a test that `check_for_update()` reports `installable: False` (not an error) when the latest release carries no asset for this platform
- [x] 7.4 Run `uv run pytest` and confirm the suite passes

## 8. Documentation

- [x] 8.1 Update `README.md` with an "Updating" section: automatic check on start-up, "Check for updates…" in the sidebar, how to turn the automatic check off, the unsigned-binary/AV caveat, and the manual-download fallback for a refused update
- [x] 8.2 Update `CLAUDE.md` — the Phase 7 section (updater mechanism + the `/api/update/*` endpoints in the endpoint list), the `config.json` reference table (`auto_update_check`), and the Phase 7 security prerequisites (the update endpoints must be auth-gated before any networked deployment)

Not tracked here (per project convention, manual QA is not a checkbox): the swap
itself needs one manual verification against two real built releases on each
platform before this ships — see design.md's testing note.
