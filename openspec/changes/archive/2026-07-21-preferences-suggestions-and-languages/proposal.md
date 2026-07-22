## Why

The Preferences page asks five questions but only helps with one of them. "Dealbreakers"
offers one-tap example chips; "target job titles" and "what makes a great match" leave the
user staring at an empty box — and target titles is the single answer the job scanner
cannot work without. Meanwhile "languages you can work in" duplicates data the Profile
already holds with more precision (`skills.languages` carries CEFR levels), so the same
fact is asked twice and can disagree with itself.

Phase 5 (Job Suggestions) — this improves the quality of the input the scanner runs on.

## What Changes

- **AI title suggestions (Q1).** A "Suggest titles" button runs one forced-tool LLM call
  over the profile and returns candidate job titles, shown as the same dashed suggestion
  chips used for dealbreakers. One tap appends a title to `target_roles`. On demand only —
  no tokens spent on page load.
- **Static example chips (Q3).** "What makes a job a great match" gains the existing
  `Suggestions` component with four fixed i18n example phrases, mirroring dealbreakers.
- **Preferences inherits languages.** The editable languages TagInput is removed from
  Preferences. Working languages are read from `skills.languages` and shown read-only with
  a link to the Profile section that owns them. **BREAKING** (data): `preferences.languages`
  is dropped from the schema; on load its values merge into `skills.languages` when that
  list is empty, so no user answer is lost.
- **Languages become a required profile field.** A new profile seeds one empty language
  row, and the Profile page marks the section as needing an answer while none is filled.

## Capabilities

### New Capabilities
- `job-preferences`: the Preferences page's five questions — what each one collects, where
  its data lives, how suggestions are offered, and which answers are required before the
  job scanner can do useful work.

### Modified Capabilities
<!-- None: no existing spec covers the Preferences page or the profile languages section. -->

## Impact

- **Frontend**: `pages/Preferences.tsx` (suggestion chips for Q1/Q3, languages read-only),
  `pages/Profile.tsx` (languages required marker), `components/` (a suggestion source that
  appends to a tag list, not just free text), `types.ts` (`Preferences.languages` removed),
  `locales/en.json` (new keys — English only; the pre-commit hook translates).
- **Backend**: new endpoint for title suggestions (`app/api/profile.py`),
  `services/cv_renderer.py` (`normalize_profile` migration, `blank_profile` seed,
  `role_brief` reads `skills.languages`).
- **Tests**: migration of `preferences.languages` → `skills.languages`; `role_brief`
  language line; suggestion endpoint shape.
- No dependency changes. No CV output changes.
