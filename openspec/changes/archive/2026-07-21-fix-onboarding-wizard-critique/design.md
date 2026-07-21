## Context

`frontend/src/components/Onboarding.tsx` is the first-run wizard (language → engine → done). It already reuses `EngineCard`/`ModelRow` from `EngineSettings.tsx` and the `radioGroup` helper, but predates some of the app's consolidated primitives: it hand-rolls its overlay instead of using `Modal`, uses `window.confirm` for the RAM override instead of `ConfirmModal`, and its language step still marks selection with a 2px accent border rather than the ink-fill treatment the rest of the app converged on. This is a UI-only refinement — no backend, API, or data-model surface is touched. DESIGN.md governs the visual decisions (ink-fill selection, Rationed Accent Rule, one shadow per ground).

## Goals / Non-Goals

**Goals:**
- One selection vocabulary across all wizard steps (ink fill), accent reserved for the primary action.
- Bring the overlay up to the accessibility bar the shared `Modal` already meets, while keeping it non-dismissable.
- Remove the two "subtly-off" moments (native confirm, unreassured download wait) that erode first-run trust.
- Close the silent-failure gap on the "Other language" path.
- Land the visual/i18n minors in the same pass.

**Non-Goals:**
- No change to what the wizard *does* functionally: same three steps, same engine options, same completion semantics (`onboarding_done` written only on `finish()`), still not skippable.
- No backend, API, or `config.json` schema changes.
- No mobile/responsive rework (app is desktop/local-first today).
- Not touching Settings' own engine UI beyond reusing its components/strings.

## Decisions

- **Selection treatment**: give the language buttons `className="engine-card"`-style ink-fill selection via a small shared selectable-tile, rather than re-styling inline. Extract a minimal `SelectableTile` (or reuse `engine-card` classes) that both the language grid and future pickers use, so a third surface can't reintroduce the accent border. *Alternative considered*: just swap the inline border for an ink background — rejected because it leaves two near-identical selection idioms in code that drift again.
- **Dialog accessibility**: add a non-dismissable mode to `Modal` (a prop such as `dismissable={false}` that suppresses Escape + backdrop `onClose` and omits the close affordance) and render the wizard through it, inheriting the existing focus-into, Tab-trap, `role="dialog"`, `aria-modal`, and `aria-labelledby` logic. *Alternative considered*: duplicate the trap logic inside `Onboarding` — rejected as reimplementing a primitive the repo already ships (DESIGN.md forbids). On step change, move focus to the new step's heading (make the step heading focusable/`tabindex=-1` and `.focus()` in an effect keyed on `step`).
- **RAM override**: reuse `ConfirmModal` exactly as `EngineSettings` does, replacing the `window.confirm` branch in `download()`. Retry the same requested model on confirm.
- **Download progress**: reuse the existing `engine.local.downloading` string (GB done/total + pct) instead of `onboarding.engineDownloading`; add a short "can take a few minutes" hint. Give the bar the Settings treatment (`1px solid var(--border)` + ink fill).
- **"Other language" honesty**: keep the fire-and-forget generation but surface its outcome — at minimum, on failure, keep the wizard's done step pointing to Settings with a clear line; do not `.catch(() => {})` into silence. Since this is feedback (not new data flow), it stays within the presentational/harden boundary.
- **Minors**: delete the orphaned `onboarding.langOtherHelp` key from `en.json` (hook regenerates other locales), add an i18n key for the code placeholder, drop redundant inline `fontFamily` (global `h1,h2,h3` rule already applies display + uppercase), add a 3-segment ink stepper rule.

## Risks / Trade-offs

- **Adding a `dismissable` prop to `Modal`** touches a widely-used primitive → keep the default `true` so every existing caller is unchanged; only the wizard opts out.
- **Editing `en.json`** trips the i18n parity test until commit → expected per project rules; do not run `translate_locales.py`. Deleting a key means the hook must prune it from shipped locales at commit; verify after commit rather than hand-editing locales.
- **Focus-on-step-change** can fight the Tab trap if mis-ordered → move focus in an effect after render, targeting a stable element (step heading), and test with keyboard.
- **Shared selectable-tile extraction** could over-abstract for two call sites → keep it a thin styled button wrapper (ponytail: one component, no config), not a framework.

## Migration Plan

Pure frontend refactor; no data migration. Rollout is a normal build. Rollback is reverting the component/CSS/locale diff. Verify by forcing the wizard (fresh `config.json` with `onboarding_done:false` and no engine) in a dev environment and walking both engine paths plus the "Other language" path, keyboard-only.

## Open Questions

- Should the "Other language" translation get a real progress line in the wizard's done step, or is a Settings pointer sufficient? (Leaning Settings pointer to keep the wizard short; confirm during apply.)
