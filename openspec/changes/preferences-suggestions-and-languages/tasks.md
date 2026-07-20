## 1. Languages become profile-owned

- [x] 1.1 In `normalize_profile` (`app/services/cv_renderer.py`), pop `preferences.languages` and, when no `skills.languages` entry has a name, seed one entry per popped value at level 3
- [x] 1.2 Seed one empty language row in `blank_profile()`
- [x] 1.3 Rewrite `role_brief()`'s working-languages line to read `skills.languages`
- [x] 1.4 Remove `languages` from the `Preferences` interface in `frontend/src/types.ts`
- [x] 1.5 Add tests: migration with empty `skills.languages`, migration with languages already present, idempotence on re-load, and `role_brief` emitting the profile's languages

## 2. Preferences shows languages read-only

- [x] 2.1 Replace the languages `TagInput` in Q2 (`Preferences.tsx`) with a read-only list of named `skills.languages` entries. **Do not keep the `<label htmlFor>`** — a read-only list is not a form control. Use `<span className="field-label" id={id('langs')}>` + a container with `aria-labelledby={id('langs')}`, exactly mirroring the `Segmented` control four lines above it
- [x] 2.2 Render each language with the existing `Badge variant="lang"` (outline chip) — do not invent a new read-only chip style; wrap them in a `flex-wrap` row so long language names never force horizontal scroll
- [x] 2.3 Render the empty case as one sentence naming what's missing and what to do about it (teach, don't report "none") — not an `EmptyState` block, which is too heavy inside a card
- [x] 2.4 Link to `/profile` as a plain inline text link in `--accent-text`. **Not** a `btn-primary`/`btn-secondary` — the page's one vermilion action is the Job Suggestions link in `.q-end` (Rationed Accent Rule)
- [x] 2.5 Add the English keys for both states to `en.json` (do not run the translation script)

## 3. Profile marks languages as required

- [x] 3.1 Add a `required` variant to `Badge` (`components/Badge.tsx`) using `--highlight` (mustard): transparent background, `1px solid var(--highlight)`, `--highlight` text — matching the existing `.profile-changed` nudge chip in `index.css`. **Do not reuse `cv`/`accent`**: the languages section already renders a vermilion `cv` badge and two vermilion elements in one row violates the Rationed Accent Rule. **Do not use `--danger`**: unanswered is not an error
- [x] 3.2 Add optional `required?: boolean` to `Section` (`ProfileSection.tsx`) rendering that badge beside the existing section badge, and append the same text to the collapsible toggle's accessible name (`aria-label` or visually-hidden span) so a **collapsed** section still announces that it needs an answer
- [x] 3.3 Pass `required` on the languages section in `Profile.tsx` when no entry has a non-empty language name
- [x] 3.4 Verify the mustard badge clears 4.5:1 on `--surface-dim` (collapsible headers sit on it, not on `--surface`)
- [x] 3.5 Add the English badge key to `en.json`

## 4. Suggestion chips work for tags and free text

- [x] 4.1 Change `Suggestions` props to `{ items, added, onPick, label }` and move the free-text join into a module-level `appendPhrase(value, phrase)` helper, preserving the existing casing and separator rules
- [x] 4.2 **Replace `disabled={added}` with `aria-disabled={added}`** plus an early return in the click handler, and switch the CSS from `.suggest-row button:disabled` to `.suggest-row button[aria-disabled="true"]`. A `disabled` button drops keyboard focus to `<body>` on activation (WCAG 2.4.3) — tolerable for one chip row, hostile now that there are three
- [x] 4.3 Bump `.suggest-row button` vertical padding from `3px` to `6px`: at 13px text the current chip is ~24px tall, exactly the WCAG 2.2 (2.5.8) target-size floor, and this change triples how many there are
- [x] 4.4 Update the dealbreakers question (Q4) to the new props via `appendPhrase`
- [x] 4.5 Add a `Suggestions` row with four static example phrases to the great-match question (Q3), also via `appendPhrase`
- [x] 4.6 Give each of the three chip rows its **own** group label key — the shared `preferences.suggestLabel` would announce three identically-named groups. Add the four great-match example keys to `en.json`

## 5. AI title suggestions

- [x] 5.1 Add `POST /api/profile/suggest-titles` in `app/api/profile.py`: one forced-tool `complete()` call over professional title, experience and skills returning up to 8 job titles; **cap each title at 60 characters** server-side so an over-long title can't overflow the chip row; 400 when the profile has neither experience nor a professional title; mark the sync-call ceiling with a `ponytail:` comment
- [x] 5.2 Add the typed client call in `frontend/src/api.ts`
- [x] 5.3 Wire the button into Q1 as `<Button variant="secondary" busy={loading}>` — **`secondary`, not `primary`** (Rationed Accent Rule, as 2.4). `busy` already ships a spinner with a `prefers-reduced-motion` fallback; do not hand-roll a loading state or swap the label text, which would reflow the row
- [x] 5.4 **No sparkle, wand, or star icon on this button.** PRODUCT.md bans the AI-assistant persona; the AI here is a quiet background tool. A plain text label, or a neutral Lucide glyph if one is genuinely needed
- [x] 5.5 Render results through `Suggestions` with `added` testing `preferences.target_roles` and `onPick` appending to it — so a title already in the list arrives pre-marked
- [x] 5.6 Announce arrival in an `sr-only` `role="status" aria-live="polite"` region naming the count (the chips appear after an async round-trip and are otherwise silent — WCAG 4.1.3). Follow the existing pattern at `Jobs.tsx:368`
- [x] 5.7 Surface failures as an inline `<p className="error-msg">` beside the button, **not** a toast — inline `.error-msg` is the app-wide pattern for a scoped action failure (`Applications.tsx`, `EngineSettings.tsx`, `Profile.tsx`)
- [x] 5.8 Disable the button when the client-side readiness mirror fails, and add the button, loading, empty-result, and error keys to `en.json`
- [x] 5.9 Add a test for the endpoint's success shape, its 60-char cap, and its 400 on an unusable profile

## 6. Verify

- [x] 6.1 Run `uv run pytest` and fix regressions (a failing i18n shipped-catalog parity test after `en.json` edits is expected, not a regression)
- [x] 6.2 Run `npm run build` in `frontend/` and fix type errors
- [x] 6.3 Keyboard-only pass over Preferences: tab to each chip row, activate a chip, confirm focus stays on the chip and the group is announced by its own label
- [x] 6.4 Confirm no page has two vermilion elements competing — Preferences' single accent stays the `.q-end` Job Suggestions link
- [x] 6.5 Update `CLAUDE.md`'s Preferences page description and the v5 `preferences` schema row to drop `languages` and note the profile-owned source
