## Why

An `/impeccable critique` pass on the Applications page (Phase 5/design-polish
work) found that changing an application's language control silently deleted
and regenerated its existing cover-letter guide with no confirmation and no
undo — the one destructive, token-costing action on the page that broke the
page's own "everything's undoable" pattern. The fix (a confirmation step) has
already been implemented and verified (`tsc -b` clean, Vite transform
verified); this change documents it retroactively so
`specs/applications-language/spec.md` stays accurate.

## What Changes

- When an application already has a cover-letter guide and the user changes
  the language control, a confirmation modal now appears before anything
  regenerates, naming both effects (the letter will be regenerated and the
  old one replaced; the CV will be re-tailored with edits kept).
- When there is no existing letter (a CV-only change), the language change
  still runs immediately with no confirmation — there is nothing destructive
  to warn about.
- Declining the confirmation leaves the language control and both artifacts
  unchanged.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `applications-language`: the "Changing the listing language re-generates
  both artifacts" requirement gains a confirmation precondition for the
  letter-regenerating case.

## Impact

- `frontend/src/pages/Applications.tsx`: `requestLangChange` gate,
  `pendingLang` state, a confirmation `Modal`.
- `frontend/src/locales/en.json`: `applications.changeLangTitle` /
  `changeLangBody` / `changeLangConfirm` keys (shipped locales translate at
  commit via the existing pre-commit hook).
- Phase 4 (Profile Web UI) / Applications page, per CLAUDE.md.
