## Why

The desktop app ships as an unsigned PyInstaller bundle (macOS `.dmg`, Windows
`.zip`) attached to GitHub Releases. Today a user who installed one has no way to
learn a newer version exists, let alone move to it — they would have to remember
the repo, notice the release, re-download, and re-drag the app by hand. In
practice that means every install freezes at whatever version it was downloaded
at, and shipped fixes never reach anyone. This is Phase 7 (packaging /
distribution), completing the release chain that `add-release-versioning` and the
binary build workflow started.

## What Changes

- **Update check**: the app queries the GitHub Releases API for the latest
  published release, compares its tag against the running version
  (`GET /api/version`'s source), and reports whether a newer one exists, with its
  release-notes link.
- **Automatic check on start-up**, on by default, announced by a dismissible
  banner in the app shell when an update is found. A new `auto_update_check`
  config key turns it off; the toggle lives in Settings.
- **Manual check**: a "Check for updates…" entry in the sidebar app-menu cluster
  beside About — the slot already reserved for it in `App.tsx`.
- **Guarded self-update after explicit approval**: on the user's confirmation the
  app downloads the release asset for its platform with visible progress, stages
  it, and swaps it over the running install via a detached helper that waits for
  the app to exit, then relaunches. The current install is moved aside, not
  deleted, until the replacement is verified in place.
- **Honest refusals** where self-update cannot work: a source checkout, a
  read-only or non-writable install location, a macOS app running translocated
  from the `.dmg`, or a release with no asset for this platform. Each says why and
  offers the release page instead of failing silently or half-updating.
- Release assets gain a documented, stable per-platform naming contract, since the
  updater selects by name.

## Capabilities

### New Capabilities
- `app-updates`: discovering that a newer release exists, deciding when to look,
  and replacing the installed application with the user's approval — including the
  conditions under which the app must decline to update itself.

### Modified Capabilities
- `release-versioning`: adds a requirement that published release assets carry
  stable, platform-identifying names, so an updater can pick the right one without
  guessing.

## Impact

- **New**: `app/services/updater.py` (check, download, stage, swap),
  `frontend/src/components/UpdateBanner.tsx` + update modal,
  `tests/test_updater.py`.
- **Modified**: `app/api/system.py` (`/api/update/*` endpoints — it already owns
  version and setup status), `app/config.py` (`auto_update_check` default),
  `app/api/settings.py` (expose/persist the toggle), `frontend/src/App.tsx`
  (banner + menu entry), `frontend/src/pages/Settings.tsx`,
  `frontend/src/api.ts`, `frontend/src/locales/en.json`, `README.md`, `CLAUDE.md`.
- **Dependencies**: none added — `httpx` and the stdlib cover download, unzip, and
  process launch. Network calls hit `api.github.com` unauthenticated (60 req/h per
  IP; one request per launch).
- **Security**: the updater downloads and executes code, so the download URL is
  constrained to the project's own GitHub release host rather than followed from
  arbitrary release JSON.
