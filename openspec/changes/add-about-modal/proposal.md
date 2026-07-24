## Why

The app has no place that tells the user *what this is* — its name, version,
license, and where the source lives. Today the only such signal is the footer
credit line, which is easy to miss and can't grow. A packaged desktop app needs
a conventional "About" surface, and it doubles as the natural home for the
"Check for updates…" action planned next.

This is a cross-cutting UX addition adjacent to **Phase 7** (desktop packaging /
distribution), where a visible version and an update path start to matter.

## What Changes

- Add a persistent **App menu** affordance in the sidebar footer (below the
  nav, near Settings) whose first entry is **About**. It is the fixed home for
  future sibling actions — "Check for updates…" lands here next — so the
  location is chosen now to hold more than one item.
- Add an **About modal** (reusing the shared `Modal` primitive) showing: app
  name, version, one-line description, license (AGPL-3.0-or-later, linked),
  copyright, and a link to the source repository. This is the AGPL §13 source
  offer made explicit; the footer link stays.
- Add a small backend endpoint (`GET /api/version`) that reports the running
  app version — the single source of truth the modal reads, and the home the
  update check will extend later.

Not in scope (stated future step): the "Check for updates…" action itself and
any release-comparison logic. This change only establishes the location and the
version endpoint it will build on.

## Capabilities

### New Capabilities
- `app-about`: The About surface — an app-menu entry point in the sidebar
  footer that opens a modal describing the app (name, version, license,
  copyright, source link), backed by a version endpoint. Designed as the
  extension point for later app-level actions (update check).

### Modified Capabilities
<!-- None: no existing spec's requirements change. -->

## Impact

- **Frontend**: `frontend/src/App.tsx` (sidebar footer entry + modal state),
  a new `About` component, new i18n keys in `frontend/src/locales/en.json`
  (source catalog only — translations run via the pre-commit hook).
- **Backend**: one new read-only route in `app/api/` returning the version;
  version sourced from `pyproject.toml` metadata.
- **Docs**: `README.md` if the run/use surface changes (an About menu is
  user-visible but adds no new setup step — likely a one-line mention).
- No new dependencies, no data-model change, no security surface (read-only,
  no user input).
