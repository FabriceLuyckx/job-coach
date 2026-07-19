## Why

Today every CV and cover-letter guide is born from a job posting URL. A user
with no posting in hand — networking, a speculative application, or just wanting
a baseline CV to hand out — has no way to produce one from the app. The CLI can
render an untailored CV, but the web UI can't, and none of the editor, PDF, or
language machinery is reachable without a URL.

Phase 4 (Profile Web UI) / Applications page.

## What Changes

- The Applications page gains a **pinned generic application** at the top of the
  list: one CV + one cover-letter guide aimed at the user's *stated target
  roles* rather than a specific posting.
- It is **not** created automatically. The pinned card shows a create action; the
  user triggers it. Once created it behaves like any other application row (CV |
  Letter tabs, editor, language switch, PDF, delete).
- Creation is **gated on profile readiness**: at least one
  `preferences.target_roles` entry and at least one `experience` entry. Below
  that the pinned card explains what's missing and links to Profile/Preferences
  instead of offering the button.
- Backend: the generic application reuses the whole existing pipeline. Instead of
  fetching a posting, a **role brief** is synthesized from the profile's
  preferences (target roles, looking_for, locations, languages, notes) and passed
  as the `job_text` that `tailor()` and `build_guide()` already accept. The
  artifacts are stored in `cv_history` / `letter_history` under a reserved
  `job_url` sentinel, so history, the URL join, relang, regenerate, and delete
  all work unchanged.
- Regenerating or re-languaging the generic CV re-synthesizes the brief from the
  *current* profile rather than fetching the sentinel URL.
- Only one generic application exists at a time; creating it again replaces it.

No new dependency, no schema migration, no new LLM call type.

## Capabilities

### New Capabilities
- `generic-application`: an untargeted CV + cover-letter guide generated from the
  profile's stated preferences, pinned at the top of Applications, user-triggered,
  gated on profile readiness.

### Modified Capabilities
- `applications-language`: the language control must also work for an application
  whose "listing" is the synthesized role brief rather than a fetched URL.
- `cover-letter-guide`: a guide may be produced from the role brief instead of a
  posting.

## Impact

- `app/api/cv.py` — generic-brief branch in `_retailor`, new create endpoint
- `app/api/letters.py` — accept a pre-supplied brief for the sentinel URL
- `app/services/cv_renderer.py` (or a small new helper) — `role_brief(profile)`
  + `profile_ready()` readiness check
- `frontend/src/pages/Applications.tsx`, `api.ts`, `locales/en.json`
- Tests: `tests/` — brief synthesis, readiness gate, sentinel routing
- README.md / CLAUDE.md — Applications page description
