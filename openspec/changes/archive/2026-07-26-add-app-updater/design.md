## Context

The packaged app is a PyInstaller **onedir** bundle built by
`.github/workflows/release.yml` and attached to a GitHub Release that
release-please tags from `stable`:

- **macOS** — `MyJobCoach-macos.dmg` containing `MyJobCoach.app`; executable at
  `MyJobCoach.app/Contents/MacOS/MyJobCoach`.
- **Windows** — `MyJobCoach-windows.zip` built with `Compress-Archive -Path
  dist/MyJobCoach/*`, so the zip holds the install directory's *contents*, not a
  wrapping folder; executable `MyJobCoach.exe`.

Neither is code-signed or notarized. `app/paths.py` already splits read-only
bundled resources (under `sys._MEIPASS`) from writable user data (`DATA_DIR` =
platform app-data dir when frozen) — so profile, `jobs.db`, `output/`, the
downloaded GGUF and Chromium all live *outside* the install directory and are
untouched by replacing it. `app/api/system.py` already owns `app_version()` and
`/api/version`. `App.tsx` already carries the comment reserving a
"Check for updates…" slot in the sidebar app-menu cluster.

## Goals / Non-Goals

**Goals:**
- Tell a user running a packaged build that a newer release exists, on start-up
  and on demand.
- Replace the installed app with that release on explicit approval, and land the
  user back in a working app either way.
- Refuse loudly and usefully in the situations where in-place replacement can't
  work, instead of half-updating.
- No new runtime dependency; no new release-pipeline machinery.

**Non-Goals:**
- Code signing / notarization (the reason the manual download path is awkward
  today, and a separate change).
- Delta or patch updates — the whole bundle is replaced.
- Silent or unattended updates, update channels, betas, or downgrades.
- Linux packaging (no asset is built for it today).
- Updating a source checkout — that's `git pull`.

## Decisions

### Roll it by hand instead of adopting an update framework

~150 lines of stdlib + `httpx` against the GitHub Releases API, rather than
Sparkle/WinSparkle (two native frameworks to embed in a PyInstaller bundle, plus
a signed appcast feed to publish, plus code signing they effectively assume),
`pyupdater`/`esky` (unmaintained), or `tufup` (a whole TUF signing infrastructure
for a single-maintainer hobby app). GitHub Releases is already the distribution
channel and already serves a perfectly good JSON manifest at
`/repos/FabriceLuyckx/job-coach/releases/latest` — `tag_name`, `html_url`, and
`assets[].{name,size,browser_download_url}` is everything the updater needs.
Unauthenticated, that's 60 requests/hour/IP against one request per launch.

### Version comparison is a strict 3-tuple compare, and "unknown" means "no update"

`app_version()` can return `"unknown"` (frozen bundle without metadata). Tags are
`vX.Y.Z`, produced by release-please, so a regex to a `(major, minor, patch)` int
tuple covers every real value; anything unparseable on either side reports *no
update available* rather than guessing. Strict `>` — never offer a sidegrade or a
downgrade. No pre-release handling; the project publishes none.

### Assets are selected by name, and the download URL is host-constrained

`sys.platform` → `"darwin"`: `MyJobCoach-macos.dmg`, `"win32"`:
`MyJobCoach-windows.zip`; anything else has no asset. This is what the delta to
`release-versioning` pins: the names must not carry the version, or the selection
rule breaks every release.

The updater downloads and then *executes* what it fetches, so
`browser_download_url` is not followed on trust: it must be `https://github.com/`
with a path under `/FabriceLuyckx/job-coach/releases/download/`. Redirects to
`objects.githubusercontent.com` are GitHub's own and are followed by httpx, but
the entry point is pinned. Size is verified against the asset's declared
`size` before anything is staged — a truncated stream that ended without an error
must not become an installed app.

### The install directory is derived from `sys.executable`, and drives the refusals

```
macOS   : first parent of sys.executable with a .app suffix   → MyJobCoach.app
Windows : sys.executable.parent                               → MyJobCoach/
```

Four preconditions are checked *before* downloading, each with its own message:

| Condition | Why it can't work |
|---|---|
| `not paths.FROZEN` | Source checkout — `git pull` is the update mechanism |
| install root not resolvable | Unrecognised layout; don't guess at what to delete |
| parent dir not writable (`os.access(parent, W_OK)`) | Can't swap the bundle in |
| macOS path contains `/AppTranslocation/` or is under `/Volumes/` | The app is running from the `.dmg` or a Gatekeeper-translocated copy; "updating" it writes to a throwaway path. Tell the user to move it to Applications |

The `FROZEN` guard has a useful second effect: the install endpoint is inert in
any server deployment (never frozen), so this feature adds no remote-code path to
the Phase 7 cloud target — but the endpoints still belong in CLAUDE.md's
auth-before-deployment list.

### Replacement runs in a detached helper script, not in the app

The app cannot overwrite its own running bundle (a locked `.exe` on Windows; a
half-replaced `.app` on macOS). So: download → stage → write a helper script into
`DATA_DIR/updates/` → launch it detached with the app's PID → app exits.

Staging first, swapping second, means a failed download never touches the
installation. The swap itself is **move-aside, copy, restore-on-failure** — never
`rm` the current install before the replacement is verified in place:

```
macOS  (/bin/sh, start_new_session=True)
  wait for PID to exit
  mv  MyJobCoach.app  MyJobCoach.app.old      || exit
  ditto STAGED MyJobCoach.app                  \
      && rm -rf MyJobCoach.app.old             \
      || { rm -rf MyJobCoach.app; mv MyJobCoach.app.old MyJobCoach.app; }
  xattr -dr com.apple.quarantine MyJobCoach.app
  open MyJobCoach.app

Windows (.cmd, DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
  wait for PID to exit (tasklist poll)
  move MyJobCoach MyJobCoach.old               || exit /b 1
  xcopy STAGED MyJobCoach /E /I /Q /Y
  on failure: rmdir /s /q MyJobCoach & move MyJobCoach.old MyJobCoach
  rmdir /s /q MyJobCoach.old
  start "" MyJobCoach\MyJobCoach.exe
```

Both wait for the PID rather than sleeping a fixed interval, so nothing is locked
when the copy starts. Staging: macOS `hdiutil attach -nobrowse -readonly` →
`ditto` the `.app` out → `hdiutil detach`; Windows `shutil.unpack_archive`. The
helper lives in `DATA_DIR`, never inside the directory it is replacing.

App exit is `os._exit(0)` from a short-delayed thread after the response flushes —
uvicorn graceful shutdown buys nothing for a process that's about to be
overwritten.

### macOS quarantine: fetching programmatically is an advantage

`com.apple.quarantine` is set by the *downloading application*, so an httpx
download carries none — the replaced, unsigned `.app` launches without the
right-click-to-open dance the manual `.dmg` route forces. `xattr -dr` in the
helper is belt-and-braces for a staged copy that inherited one.

### Endpoints go on the existing `system` router; state is one module-level dict

`/api/update/check`, `/api/update/install`, `/api/update/status`,
`/api/update/cancel` — added to `app/api/system.py` (already the home of
`/api/version` and `/api/setup/status`), so `main.py` needs no new router. Logic
lives in `app/services/updater.py`. Progress state mirrors
`app/api/engine.py`'s download tracking but **without the id keying**: exactly one
update can be in flight, ever, so a single dict guarded by a lock is enough.

### The automatic check is a frontend decision, the backend stays dumb

`GET /api/update/check` always performs a check when called. "Automatic on
start-up" is the `Updater` component calling it on mount when the
`auto_update_check` setting is on; the manual sidebar entry calls it regardless.
No server-side scheduling, no cached-result TTL, no "last checked" bookkeeping —
one HTTP request per app launch doesn't need managing.

`auto_update_check: True` joins `config._DEFAULTS` and the `SettingsIn` model,
which is the entire persistence story.

### UI: one component, two surfaces, one dialog

`frontend/src/components/Updater.tsx` exports the shell banner and the dialog;
`App.tsx` owns the open/closed state so the sidebar's "Check for updates…" button
(the reserved slot) and the banner's "Update now" both open the same dialog. The
banner follows `SetupBanner`/`ApiKeyBanner` — `role="status"`, in the page
container, dismissible for the session. The dialog is the shared `Modal`;
progress and errors use the existing `Button busy` and Toast primitives. Nothing
new is invented visually.

## Risks / Trade-offs

- **A release exists before its binaries are attached.** release-please creates
  the tagged release, then the `v*`-triggered build uploads assets minutes later —
  a real window where `latest` has no asset. → The check reports the update as
  *available but not installable*, linking the release page, instead of erroring.
- **The swap helper is the one unrecoverable step.** A crash between `mv` and the
  copy leaves `MyJobCoach.app.old` on disk with no app at the real path. →
  Move-aside preserves the bits (the user renames one folder to recover), the
  failure branch restores automatically, and the window is a filesystem rename
  plus a local copy.
- **Windows AV / SmartScreen may flag an unsigned exe appearing in place.** →
  Unavoidable until code signing lands; called out in the README's update section
  rather than hidden.
- **`os._exit(0)` skips cleanup.** → Nothing needs it: SQLite writes are already
  committed per request, and the process is about to be replaced.
- **GitHub API unauthenticated rate limit (60/h/IP).** → One request per launch;
  shared-IP exhaustion degrades to "check failed", never to a broken app.
- **End-to-end updating cannot be unit-tested** (it requires two real signed-off
  builds and a restart). → Tests cover the decidable parts — version comparison,
  asset selection, URL host validation, install-root resolution and every refusal
  precondition. The swap itself is verified once, manually, against a real build.
- **These endpoints trigger code execution and are unauthenticated**, like every
  other route today. → Localhost-only, and `FROZEN`-gated so a server deployment
  can't reach the install path at all; still added to the Phase 7 security
  prerequisites in CLAUDE.md.
