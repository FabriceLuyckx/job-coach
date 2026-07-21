## Why

An impeccable critique of the first-run installation wizard (`frontend/src/components/Onboarding.tsx`) scored it 26/40, with two P1s: the wizard disagrees with itself about what "selected" looks like (step 0's language buttons use a 2px accent border; step 1's engine cards use the app's ink-fill selection), and its hand-rolled overlay drops the dialog accessibility (`role`, focus trap, focus-into) that the shared `Modal` primitive already provides. This is the very first screen a non-technical self-hoster meets, so inconsistency and keyboard/SR gaps here undermine trust before the product starts. Belongs to Phase 4 (Profile Web UI / onboarding).

## What Changes

- **Unify selection vocabulary**: step 0 language options adopt the ink-fill `data-selected` treatment used by `EngineCard`/`ModelRow`, removing the accent border so vermilion stays rationed to the primary **Next** action (one accent per view, per DESIGN.md).
- **Accessible overlay**: the wizard overlay gains `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (step heading), focus-into on open **and** on each step change, and a Tab trap — while remaining non-dismissable (no Escape/backdrop close). Prefer reusing `Modal`'s trap logic via a non-dismissable variant over duplicating it.
- **Styled RAM-override confirm**: replace the native `window.confirm` with the shared `ConfirmModal`, matching `EngineSettings`.
- **Reassure the download wait**: show `GB done / total (%)` (reuse `engine.local.downloading`) plus a "can take a few minutes" hint, instead of bare `Downloading… {{pct}}%`.
- **No silent translation failure**: the "Other language" path stops swallowing `generateLocale` errors; surface progress/failure at the done step or defer explicitly to Settings.
- **Visual/i18n minors**: bordered ink progress bar (match Settings), delete the orphaned `langOtherHelp` string, `t()`-wrap the `"sv, ja, ar…"` placeholder, drop the redundant inline `fontFamily` on headings, and add a 3-segment ink stepper rule for progress visibility.

## Capabilities

### New Capabilities
- `onboarding-wizard`: first-run setup flow — language choice, AI-engine setup (local model download or OpenRouter key), and completion — covering its selection vocabulary, dialog accessibility, wait-state feedback, error handling, and non-dismissable/completion semantics.

### Modified Capabilities
<!-- None: no existing spec governs the onboarding wizard. -->

## Impact

- `frontend/src/components/Onboarding.tsx` (main), possibly a new non-dismissable `Modal` variant in `frontend/src/components/Modal.tsx`.
- Reuses existing `ConfirmModal`, `EngineCard`/`ModelRow`, `radioGroup`.
- `frontend/src/locales/en.json` (copy edits, delete `onboarding.langOtherHelp`, placeholder key); other locales regenerate via the pre-commit hook.
- Possibly `frontend/src/index.css` (stepper rule, shared selectable-tile styles).
- No backend or API changes; no data-model changes.
