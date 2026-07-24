## 1. Backend: version endpoint

- [x] 1.1 Add `app_version()` helper in `app/api/system.py`: try `importlib.metadata.version("job-coach")`, fall back to parsing `[project].version` from `pyproject.toml` via `tomllib`, then `"unknown"` (mark the fallback with a `ponytail:` note re: Phase 7 packaging).
- [x] 1.2 Add `GET /api/version` on the `system` router returning `{"version": app_version()}`.
- [x] 1.3 Add a small assert-based self-check that `app_version()` returns the current `pyproject.toml` version (not `"unknown"`) in the source checkout.

## 2. Frontend: version API

- [x] 2.1 Add `getVersion()` to `frontend/src/api.ts` (typed `{ version: string }`).

## 3. Frontend: About modal + entry point

- [x] 3.1 Create `frontend/src/components/About.tsx` using the shared `Modal`: app name, version (fetched on open, neutral placeholder until loaded), description, copyright, AGPL-3.0 license link, source-repo link — all via `about.*` i18n keys; reuse the footer's repo/license URLs.
- [x] 3.2 In `App.tsx`, add an "About" `<button>` (lucide `Info` icon) in the sidebar footer beside the Settings `NavLink`, with `showAbout` state opening `About`.
- [x] 3.3 Add a shared class so the About button matches nav-item styling (`App.css`); keep the cluster ready to hold a second sibling button.

## 4. i18n

- [x] 4.1 Add `about.*` keys and the nav/button label to `frontend/src/locales/en.json` (source catalog only — do NOT run translations; the pre-commit hook owns them).

## 5. Docs

- [x] 5.1 Update `README.md` with a one-line mention of the About menu, and note the `GET /api/version` endpoint / About surface in `CLAUDE.md`'s endpoint list and structure.
