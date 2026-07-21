## Why

The Preferences page's last question — "Anything practical we should check?" — is a
single free-text box mapping to `preferences.notes`. It's too open: a non-technical
user has no idea what belongs there, and the answers that do arrive are unstructured
prose the job-matcher and generic-application brief have to parse loosely. The kinds
of "small print" it's meant to capture (salary, contract type, hours, start date,
travel) are enumerable and would be clearer as dedicated controls — and cleaner LLM
input as named keys.

## What Changes

- Split the single `preferences.notes` question into structured controls on the
  Preferences page:
  - **Employment type** — multi-select chips (Permanent, Fixed-term, Freelance, Internship)
  - **Hours** — single-choice (Full-time / Part-time / No preference)
  - **Salary expectation** — short free-text
  - **Availability** — short free-text (start date / notice period)
  - **Travel** — single-choice (None / Occasional / Frequent / No preference)
  - **Anything else** — the existing free-text field, kept as the catch-all escape hatch
- Add flat, additive fields to `preferences` (`employment_types`, `hours`, `salary`,
  `availability`, `travel`); `notes` is retained unchanged. `normalize_profile` seeds
  defaults for the new keys on load, exactly as it does for `target_roles` — no schema
  version bump, no lossy migration of existing `notes`.
- Feed the new fields into `role_brief()` so the generic application reflects them. The
  per-posting job review and cover-letter guide already receive the whole `preferences`
  object, so the new keys flow into them with no prompt changes.

## Capabilities

### New Capabilities
- `practical-preferences`: the structured "practical" section of the Preferences page — what fields exist, how they're stored, and how they reach the AI.

### Modified Capabilities
<!-- None: no existing spec covers the Preferences page. -->

## Impact

- Frontend: `frontend/src/pages/Preferences.tsx`, `frontend/src/types.ts`, `frontend/src/locales/en.json`
- Backend: `app/services/cv_renderer.py` (`normalize_profile` defaults, `role_brief`)
- No API, DB, or dependency changes. Existing profiles migrate transparently on next load.
