## 1. Frontend

- [x] 1.1 Add `pendingLang` state and a `requestLangChange` gate in
      `ApplicationRow` (`Applications.tsx`) that shows a confirmation modal
      when a letter exists, and calls `changeListingLang` directly otherwise.
- [x] 1.2 Wire the `LangSelect`'s `onChange` to `requestLangChange` instead of
      `changeListingLang` directly.
- [x] 1.3 Render a confirmation `Modal` (reusing the shared primitive) with
      confirm/cancel actions that call `changeListingLang(pendingLang)` or
      clear `pendingLang`.
- [x] 1.4 Add `applications.changeLangTitle` / `changeLangBody` /
      `changeLangConfirm` keys to `en.json`.

## 2. Verification

- [x] 2.1 `npx tsc -b` clean.
- [x] 2.2 Vite dev-server transform verified for the changed module (no
      compile error).
- [x] 2.3 Confirmed via `/impeccable critique Applications` re-run that the
      language-change gap is resolved (heuristics 3/5 improved, no new
      regression introduced by this specific change).

## 3. Documentation

- [x] 3.1 Update CLAUDE.md's Applications page description to mention the
      confirmation step before a letter-regenerating language change.
