## 1. Accessible non-dismissable dialog (P1)

- [x] 1.1 Add a `dismissable` prop to `frontend/src/components/Modal.tsx` (default `true`); when `false`, suppress Escape + backdrop `onClose` and omit any close affordance, keeping focus-into, Tab-trap, `role="dialog"`, `aria-modal`, and `aria-labelledby`
- [x] 1.2 Render `Onboarding` through `Modal` with `dismissable={false}`, replacing the hand-rolled `position:fixed` overlay `<div>`; label it by the current step's heading
- [x] 1.3 Move focus into the newly-shown step on step change (focusable step heading + `.focus()` in an effect keyed on `step`)

## 2. One selection vocabulary (P1)

- [x] 2.1 Extract a thin shared selectable-tile (or reuse `engine-card` classes) that renders the ink-fill `data-selected` selected state
- [x] 2.2 Convert the step-0 language grid buttons to that tile, removing the `2px solid var(--accent)` border and the accent `Check` so the selected state is ink-fill only
- [x] 2.3 Verify vermilion on step 0 is now only the primary **Next** button (Rationed Accent Rule)

## 3. Styled RAM-override confirm (P2)

- [x] 3.1 Replace the `window.confirm` branch in `EngineStep.download()` with the shared `ConfirmModal`, retrying the same requested model on confirm (mirror `EngineSettings`)

## 4. Reassuring download wait (P2)

- [x] 4.1 Show GB done/total + pct during onboarding download by reusing `engine.local.downloading`, and add a "can take a few minutes" hint
- [x] 4.2 Give the onboarding progress bar the Settings treatment: `1px solid var(--border)` border + ink fill

## 5. No silent translation failure (P2)

- [x] 5.1 Stop `.catch(() => {})`-swallowing the "Other language" `generateLocale` outcome; surface failure to the user (wizard line or explicit Settings pointer) instead of closing as if fully set up

## 6. Visual & i18n minors

- [x] 6.1 Add a 3-segment ink stepper indicator (alongside/replacing the text-only "Step n of 3")
- [x] 6.2 Delete the unused `onboarding.langOtherHelp` key from `frontend/src/locales/en.json`
- [x] 6.3 Add an i18n key for the "Other language" code input placeholder and `t()`-wrap it (replace hardcoded `"sv, ja, ar…"`)
- [x] 6.4 Drop the redundant inline `fontFamily: 'var(--font-display)'` on the wizard headings (global `h1,h2,h3` rule already applies it)

## 7. Verify

- [x] 7.1 `cd frontend && npm run build` (typecheck + build) passes
- [x] 7.2 `cd frontend && npm run lint` passes (no new warnings in `Onboarding.tsx`/`Modal.tsx`) — no `lint` script/eslint is configured in this repo; the `tsc -b` typecheck inside `npm run build` is the gate and passed clean
- [x] 7.3 `node scripts/check_contrast.mjs` still passes (shell tokens unchanged)
- [x] 7.4 Update `README.md` only if any run/use instructions changed (expected: none)
