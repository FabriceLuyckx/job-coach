---
target: Settings
total_score: 26
p0_count: 0
p1_count: 3
timestamp: 2026-07-19T13-35-37Z
slug: frontend-src-pages-settings-tsx
---
Method: dual-agent (A: design review · B: detector + contrast evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | `SaveStatus` in the sticky head reports only the profile autosave — four of five cards save manually. Renders nothing at `idle`, so the band is empty on load. |
| 2 | Match System / Real World | 2 | `settings.language.otherHelp` says "Type a language name"; `LanguageSettings.tsx:50` rejects anything but `/^[a-z]{2}$/`. Seven raw model IDs shown to non-technical users. |
| 3 | User Control and Freedom | 2 | Design prefs autosave with no undo. One swatch click destroys three hand-tuned hex values, unrecoverably. Profile gives undo toasts for far cheaper losses. |
| 4 | Consistency and Standards | 2 | Two save models on one page, unexplained. Settings lacks the `autoSaveNote` line both sibling autosave pages render. |
| 5 | Error Prevention | 3 | Three `window.confirm` → `ConfirmModal` is a real gain, undercut by `Modal.tsx:27` focusing the destructive button first. |
| 6 | Recognition Rather Than Recall | 3 | Thumbnails + swatches excellent. Palette names live only in `title`/`aria-label`. |
| 7 | Flexibility and Efficiency | 3 | Custom model, custom palette, editable prompts, keyboard pan/zoom. No Home/End in the radiogroup. |
| 8 | Aesthetic and Minimalist Design | 3 | "CV Appearance" is ~160 lines rendering ~20 controls at once. |
| 9 | Error Recovery | 2 | Invalid hex saves silently while the picker beside it shows `#000000` — the UI displays a value it did not store. |
| 10 | Help and Documentation | 3 | `settings.backup.note` is exemplary: names what is replaced, what is not, and that the key is never exported. |
| **Total** | | **26/40** | **Acceptable — flat vs. the previous run** |

## Anti-Patterns Verdict

**LLM assessment**: not visually AI slop. `TemplateThumb.tsx` is the proof — five hand-drawn schematics encoding each template's real geometry, recoloured live, zero assets. What shows instead is refactor residue: a dead i18n key orphaned by the card merge, dead DOM ids, two orphan `<label>` elements, and hardcoded English inside `SaveButton`. The composition is the flattest possible reading of the poster system: N full-width cards, one column, no exceptions.

**Deterministic scan**: exit 2, 12 advisory findings — **zero in any `.tsx` file**. All landed in shared `index.css`/`App.css`. Six are `#fff` on filled buttons (intentional; the CSS comments explain the AA reasoning). Three are font sizes on components Settings never renders. The only genuine drift is `.tag button` at `index.css:479` using 4px instead of `--chip-radius`, and Settings renders no `.tag`. Net: no in-scope detector findings.

**Contrast**: no failures anywhere in the token set as used on this page. The pairing flagged as risky — `.engine-card-desc`, `--paper` at `opacity: .82` composited over `--ink` — computes to **10.46:1**, comfortably clear. `--success` on `--surface` 5.88:1, `--muted` on `--surface` 5.83:1, `--highlight` 5.92:1, `--accent-text` 6.05:1. The new ink-fill card is 15.09:1.

**Visual overlays**: unavailable — no browser-automation tool is exposed in this session. Contrast was computed numerically instead. No user-visible overlay exists.

## Overall Impression

The accessibility and structure work landed. Headings are real, the radiogroups are real, the ink-fill selection is a genuine system-level improvement, and the detector is clean on every file that was touched. The score didn't move because the same batch introduced two new regressions that cost exactly what the fixes gained: a page-level save indicator that reports on one card out of five, and a confirmation dialog that focuses its own destructive button. The single biggest opportunity is deciding what the sticky head is *for* — it was borrowed from Preferences without the condition that earned it there.

## What's Working

1. **`TemplateThumb.tsx`** — refuses both lazy options. Screenshots go stale and need a build step; generic wireframe icons say nothing about *this* template. Each arm encodes real geometry (`default` sidebar left plus accent band, `compact` mirrored right with a fourth block for density, `minimal` hairlines and no fill), and it doubles as the live palette preview for free.

2. **`.engine-card[data-selected]` ink fill** (`index.css:404`) — matches `.seg` exactly, so "ink fill = chosen" is now one vocabulary across Preferences and Settings. It survives greyscale, which the 2px accent border did not. Best change in the batch.

3. **Backup copy and button variants** (`Settings.tsx:524-547`) — both actions secondary so Restore doesn't read as the happy path, and the note states that restore *replaces* rather than merges and that the API key is never exported. The honesty principle implemented as copy, not asserted in a doc.

## Priority Issues

**[P1] Two contradictory save models on one page, unexplained**
`Settings.tsx:268` puts an autosave `SaveStatus` in the sticky page head. Below it sit five manual save buttons. A user can read "✓ All changes saved" while an unsaved API key sits 200px lower.
*Why it matters*: on a page holding an API key, "saved" must not be ambiguous.
*Fix*: move `SaveStatus` out of the page head into the CV Appearance card header, where it labels exactly what it reports; add the `autoSaveNote` equivalent to that card; revert the head to plain `page-head`.
*Command*: `/impeccable clarify`

**[P1] ConfirmModal focuses the destructive action**
`Modal.tsx:27` focuses `focusables()[0]`, which in `ConfirmModal.tsx:22` is the confirm button. Open the restore dialog, press Enter, and profile + settings + job history + every generated CV are replaced irreversibly.
*Why it matters*: the dialog exists to interrupt momentum and instead hands it back.
*Fix*: render Cancel first in the DOM and reverse it visually with `row-reverse`. No new API.
*Command*: `/impeccable harden`

**[P1] The "other language" flow instructs the user to do the thing that fails**
Copy says "Type a language name", placeholder says "e.g. Swedish, Vietnamese, Greek", `LanguageSettings.tsx:50` accepts only two lowercase letters.
*Why it matters*: this is a first-run path for every non-English user, and the app's own instructions produce an error toast.
*Fix*: reverse-map `OTHER_CODES` and normalise before validating. Keep the code path as fallback; don't demand ISO codes from non-technical users.
*Command*: `/impeccable clarify`

**[P2] Invalid hex saves silently while the UI shows a different value**
`Settings.tsx:427-433` writes every keystroke; autosave persists `"nope"` to `colors.ink`; the picker beside it displays `#000000` (`:421`). The server sanitises on normalize, so the round trip rewrites the input with no message.
*Why it matters*: the interface displays a value it did not store — the one thing a colour control must never do.
*Fix*: validate against `HEX_RE` on blur, show `.error-msg`, and don't write through until valid.
*Command*: `/impeccable harden`

**[P2] The Rationed Accent Rule is broken on this page**
With Advanced expanded, vermilion can appear on the selected template border (`:366`), Save connection, four prompt saves, Use this language, and Download model. The page establishes ink-as-selection twice and then contradicts itself: the template grid says vermilion border = chosen, twelve lines after the engine card says ink fill = chosen.
*Fix*: selected template border → ink. `SaveButton` secondary until genuinely the next action.
*Command*: `/impeccable quieter`

## Persona Red Flags

**Sam (screen reader / keyboard / 200% zoom)** — most improved, three specific breaks remain:
- `radiogroup.ts:16,22` — in the custom-palette state `sel === -1`, `focusIdx = 0`, so the first ArrowRight computes `(0+1) % 7 = 1` and selects the *second* palette. Index 0 is unreachable by the first arrow press. The comment claims this case is handled; the arithmetic doesn't.
- `radiogroup.ts:25` — `e.currentTarget.children[next]` assumes group children are exactly the option buttons in order. True today, silently wrong the moment a wrapper appears. A ref array belongs here.
- `Settings.tsx:411,440` — orphan `<label>` elements bound to nothing. "Colours" and "Profile Photo" announce as labels for no control, so the grouping isn't conveyed.
- Credit: `PhotoCropModal.tsx:100-102` is properly keyboard-reachable — `tabIndex={0}`, `role="group"`, arrow and ± handlers.

**Jordan (first-timer, non-technical — the stated target user)**:
- `EngineSettings.tsx:110-123` — the page's first decision is its hardest, and neither card states the actual tradeoff (free + private + slower + 2.5 GB vs. paid + better + your CV leaves the machine).
- `Settings.tsx:315` — seven raw model IDs, nothing marking which is default or cheap.
- `Settings.tsx:319-321` — "Active: X" beside a select showing Y beside a mustard dot. Three model signals, no explanation of which is in force.

**Riley (stress tester)**:
- Hex fields accept anything and lie about it (P2 above).
- Hand-tune three hexes, brush a swatch: all three overwritten, autosaved in 1.5s, no undo anywhere on the page.
- Enter-on-open restores a backup (P1 above).
- `useProfileAutosave.ts:86-94` — the unmount flush swallows all errors. Navigate away mid-failure and the change is lost with no signal. The unload path was thought about; the unmount path wasn't.

## Minor Observations

- `settings.openrouter.title` is dead in `en.json` — orphaned by the card merge, still translated into seven locales. Both assessments found this independently.
- `id={`col-${slot}`}` (`Settings.tsx:419`) is referenced by nothing; the inputs use `aria-label` instead. Both associations were written, both shipped.
- `SaveButton.tsx:22,57` hardcode `'Save'`, `'Saved'`, `'Saving…'`. This page is the densest concentration of `SaveButton` in the app, so a Dutch install flashes English six times. Fix in the component, not the call sites.
- `Settings.tsx:410-436` — the colour row is the only multi-child flex row on the page without `flexWrap: 'wrap'` (~308px of fixed-width children). Its four siblings all wrap.
- `EngineSettings.tsx:163` — `aria-live="polite"` on text that changes every second for minutes. Politeness queues rather than drops; the `role="progressbar"` above already carries the value. Keep one.
- `radiogroup.ts` has no Home/End; APG expects both.
- `Settings.tsx:274` — `provider` is optimistic local state. A failed `putSettings` toasts the error but leaves the new provider's fields showing. The card lies until reload.
- `ConfirmModal.tsx` lacks its SPDX header (the pre-commit hook adds it, but the file as written has none).
- The page ends on the Advanced prompts collapsible — "here are the raw AI instructions you can break." Preferences earned a conditional closing card that names the next step; Settings ends on a warning label.

## Questions to Consider

1. If "CV Appearance" is one concern, why does it carry four headings' worth of content under a single `<h2>`, with four `<label>`s doing heading work? Either those are sections deserving `<h3>`s and progressive collapse, or the card is doing too much. The current state picks neither.
2. What is the sticky page head for on a page where four of five cards don't autosave? Preferences earned it with thousands of pixels of continuous autosaved input. Settings borrowed the chrome without the condition.
3. The engine card says ink fill = chosen. Why does the template grid say vermilion border = chosen, twelve lines later? Which one is the system?
4. Why does the most destructive action get a confirmation modal while the most-repeated one gets no undo? The safety budget is spent inversely to how often the loss actually happens.
