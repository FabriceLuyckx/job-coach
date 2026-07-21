## 1. Data model & migration

- [x] 1.1 Add `employment_types: string[]`, `hours`, `salary`, `availability`, `travel` to the `Preferences` interface in `frontend/src/types.ts` (keep `notes`).
- [x] 1.2 Seed defaults for the five new keys in `normalize_profile()` (`app/services/cv_renderer.py`) alongside the `target_roles` setdefault — `employment_types` → `[]`, the rest → `""`. No schema version bump.
- [x] 1.3 Add a runnable check (assert-based `demo()`/`__main__` or a `test_*.py`) that `normalize_profile` seeds the new keys, preserves an existing `notes`, and is idempotent.

## 2. AI wiring

- [x] 2.1 Extend `role_brief()` (`app/services/cv_renderer.py`) with labelled lines for employment type, hours, salary, availability, and travel — omitting any that are unset, matching the existing pattern.
- [x] 2.2 Confirm no change is needed in `job_scanner.py` / `letter_guide.py` (they already pass the whole `preferences` object); note it in the task if verified.

## 3. Preferences page UI

- [x] 3.1 Replace the single "practical" textarea question in `frontend/src/pages/Preferences.tsx` with the structured controls: employment-type multi-toggle, `Segmented` for hours and travel, free-text inputs for salary and availability, and the retained `notes` textarea relabelled "Anything else".
- [x] 3.2 Add an inline minimal multi-toggle chip group (labelled `role="group"`, `aria-pressed` buttons) for employment type; store canonical English strings for hours/travel via the existing `Segmented`.
- [x] 3.3 Add all new i18n strings to `frontend/src/locales/en.json` (question headings, sub-lines, option labels, placeholders); relabel the old practical question to "Anything else". Do NOT run translations — the pre-commit hook owns locale sync.

## 4. Verification

- [x] 4.1 Run the backend check from 1.3 (`uv run pytest` / the demo) and the frontend build/typecheck.
- [x] 4.2 Manually load an existing profile and confirm the practical section renders with defaults, saves, and the generic-application brief reflects the new fields.
