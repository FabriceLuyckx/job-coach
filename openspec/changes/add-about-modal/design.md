## Context

The sidebar (`App.tsx`) holds the page nav plus a `nav-spacer` and a Settings
`NavLink` pinned to the bottom. The footer carries the AGPL credit line. There
is a shared, accessible `Modal` primitive. The app version lives once in
`pyproject.toml` (`0.1.0`). Backend routers register in `app/main.py`; a
`system` router already owns health/setup endpoints.

## Goals / Non-Goals

**Goals:**
- One always-reachable entry point ("About") in the sidebar footer that opens a
  modal describing the app.
- A location that can hold a second sibling action ("Check for updates…") later
  with no relocation and no new interaction model.
- Version shown from a single backend source of truth.

**Non-Goals:**
- The "Check for updates…" action and any release-comparison logic (next step).
- A generic dropdown/popover menu component. Two stacked footer buttons are the
  whole "app menu" — no menu infrastructure until there's a reason for it.

## Decisions

- **Entry point = a footer button cluster, not a popover.** Add a `<button>`
  (lucide `Info` icon + "About" label) below the `nav-spacer`, alongside the
  Settings `NavLink`, sharing the nav item's visual style via a shared class so
  it reads as one group. Settings stays a route; About is a button because it
  opens a modal, not a page. "Check for updates…" becomes a second button in the
  same cluster — that stacking *is* "the same location". No menu component.
- **Modal = the shared `Modal` primitive.** New `About` component
  (`frontend/src/components/About.tsx`) rendering: app name, version, one-line
  description, copyright (© 2026 Fabrice Luyckx), a link to the AGPL-3.0 license
  text, and a link to the source repo. All strings are i18n keys in
  `en.json` (`about.*`); the two external URLs match the ones already in the
  footer. State (`showAbout`) lives in `App.tsx` next to the button.
- **Version endpoint = `GET /api/version` on the existing `system` router.**
  Returns `{"version": "<str>"}`. Source via
  `importlib.metadata.version("job-coach")` (present under the uv editable
  install), falling back to parsing `pyproject.toml` with stdlib `tomllib`, then
  `"unknown"`. No new router, no new dependency. The `system` router is also the
  natural home for the future update check.
- **Data flow.** `About` fetches `/api/version` on open via the typed `api`
  client (new `api.getVersion()`), shows a neutral placeholder until it lands.

## Risks / Trade-offs

- **Frozen/packaged app version resolution.** In a PyInstaller bundle,
  `importlib.metadata` may not see the dist and `pyproject.toml` may be absent;
  the `"unknown"` fallback keeps the endpoint from erroring. Acceptable until
  Phase 7 packaging, where the build can inject a version if needed — mark the
  fallback with a `ponytail:` note pointing at that upgrade path.
- **Two version sources could drift** (`pyproject.toml` vs
  `frontend/package.json`). The modal reads only the backend value, so
  `pyproject.toml` is authoritative; `package.json`'s version is not surfaced.
- **Footer vs modal duplication.** The repo/license links now appear in both the
  footer and the modal. The footer link stays (it satisfies AGPL §13 and is the
  always-visible offer); the modal is the richer, discoverable surface. Minor,
  intentional.
