---
target: the design system (colors, accents, cards, drop shadows, anything UI/UX)
total_score: 31
p0_count: 1
p1_count: 2
timestamp: 2026-07-20T18-26-57Z
slug: frontend-src-index-css
---
Method: dual-agent (A: design review, isolated · B: detector + browser evidence, isolated)

Provenance note: Assessment B returned before A. A ran fully isolated and was unaffected; the anchoring risk was on the synthesis side only.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Exceptional. Three pages fall back to a bare unstyled `Loading…` that strips the layout. |
| 2 | Match System / Real World | 3 | "Filtered out", "Re-check filtered jobs", "Generic application", "Tailoring notes" are internal vocabulary surfaced verbatim. |
| 3 | User Control and Freedom | 4 | Undo everywhere; undo-after-accept cancels paid AI work (Jobs.tsx:265). |
| 4 | Consistency and Standards | 2 | Three selection vocabularies, two progress-bar colors, window.confirm beside ConfirmModal, aria-pressed vs role=radio for the same job. |
| 5 | Error Prevention | 3 | ConfirmModal.tsx:24 puts Cancel first in DOM. But Applications.tsx:725 deletes CV and letter behind one 5s toast. |
| 6 | Recognition Rather Than Recall | 3 | Settings.tsx:448 — 7 palette swatches named only in title/aria-label. |
| 7 | Flexibility and Efficiency | 3 | Only keyboard shortcut is Cmd+B/I in one textarea. 30-job triage = 30 clicks. |
| 8 | Aesthetic and Minimalist Design | 3 | Coherent poster system, undercut by card-in-card and no prose measure cap. |
| 9 | Error Recovery | 3 | Raw server strings still reach users in places. |
| 10 | Help and Documentation | 3 | Nothing explains a "tailoring plan" before you spend credit on one. |
| **Total** | | **31/40** | **Strong** |

## Anti-Patterns Verdict

Not AI slop. Authored work. index.css:779 uses a full perimeter toast border with the comment "the stripe is the single most recognizable AI-slop tell". Numbered markers actively removed (index.css:337). Card grid replaced by ruled list (EngineSettings.tsx:198).

Detector: 12 advisory findings — 7 design-system-color, 4 design-system-font-size, 1 design-system-radius. Six color hits are #fff button labels on filled grounds (false positives). Real: index.css:520 border-radius 4px (matches none of the three declared radii); four literal font sizes where --fs-* exist (App.css:22, index.css:172/536/626).

Detector caught what review missed: z-index has no scale — 5/10/20/50/100 as magic numbers.

Elevation clean: exactly 3 box-shadow declarations, all --shadow-pop, all floating.

Browser: all five routes rendered against live backend, no console errors.

## Overall Impression

A design system with unusually good epistemics — it ships its contrast proofs, not just its tokens — that audited exactly one of its two surfaces. The cream sheet was measured to two decimals. The teal wall was never measured, and everything on it fails.

## What's Working

1. Contrast reasoning shipped as an artifact (index.css:21-24, 29-33, 42-44). Independently recomputed and reproduced exactly.
2. Cancellation as a design principle — undo cancels paid work, not just a DB row.
3. The AI is refused a persona repeatedly (CVEditor.tsx:348, Preferences.tsx:183); letters ship a skeleton, never a letter.

## Priority Issues

### [P0] App-shell text fails WCAG AA on the teal wall — confirmed independently by both assessments
App.css:36 nav links 2.58:1 (14px). App.css:91 footer 2.27:1 (11px). App.css:93 AGPL link 3.06:1. App.css:54 active tab's 3px vermilion border-left is 1.42:1 against the frame — the current-location indicator is invisible as a UI component (3:1 required).
Code uses --paper via color-mix, not #fff, so real numbers are worse than a white-text assumption suggests.
Fix: darken --frame toward #4E6F71, footer to full --paper, inactive nav to paper 96%. Active tab already at 15.09:1. Comment the measured ratios.
Command: /impeccable audit

### [P1] The Rationed Accent Rule is defeated by one line
index.css:96 — `a { color: var(--accent-text) }`. 25+ vermilion elements on a populated Jobs page (Jobs.tsx:408, 514, 563, 574, 631) where DESIGN.md permits one. The codebase defends the rule elsewhere (SaveButton.tsx:53, Profile.tsx:771) and the link color defeats all of it.
Fix: in-content links to --ink with a 1px underline at ink 45%. Reserve --accent-text for links that ARE the next action. Leaves Jobs with three vermilion elements.
Command: /impeccable colorize

### [P1] The first-run wizard is the least finished surface in the product
Onboarding.tsx diverges on six counts: no role=dialog/aria-modal/focus trap/initial focus (:54) while Modal.tsx:19 has all four; 2px accent border selection (:99,109) vs ink fill everywhere else; plain buttons instead of radioGroup() (:94); progress fill --accent vs --ink at EngineSettings.tsx:224; window.confirm (:177) vs ConfirmModal at EngineSettings.tsx:289; className="card" in a fixed overlay so it gets zero elevation.
Unskippable by design, so a screen reader user gets no dialog boundary and no escape.
Fix: render through Modal, .modal-box, radioGroup(), data-selected ink fill, --ink progress, ConfirmModal. All pieces exist — deletion, not construction.
Command: /impeccable harden

### [P2] Card-in-card is systemic and encodes no depth
Profile.tsx:658→64, Profile.tsx:710→712, Jobs.tsx:565→570, Applications.tsx:455→GuideView.tsx:89. Both levels --surface + 1px --ink; no tonal step. DESIGN.md makes tone the depth mechanism but the code never applies the step-down.
Fix: `.card .card { background: var(--surface-dim) }`. Drop the card in GuideView.tsx:89 — five letter sections are a ruled list.
Command: /impeccable layout

### [P3] DESIGN.md asserts two things the code doesn't do
Disabled primary claims "full white-text contrast"; measured 1.97:1 (danger 2.29, secondary 2.81). WCAG exempts disabled controls, so this is a spec-accuracy failure, not conformance. Separately the 65–75ch prose cap exists nowhere; CVEditor.tsx:283 runs ~100ch.
Fix: correct the DESIGN.md claim to the real ratio; add max-width: 68ch to .help-text, .q-sub, tailoring notes.
Command: /impeccable document

## Persona Red Flags

Alex: Settings.tsx:392 OpenRouter card is the one thing needing Save, directly above an autosaving card — he'll lose the key. Toast.tsx:57 keeps 4 toasts, so a 30-job triage silently expires undo windows. 80vh iframe per row; comparing two CVs means collapsing one.

Jordan: nine language tiles as the first decision, selection in the color that means "primary action" everywhere else. Raw window.confirm at maximum uncertainty. Five job actions whose names blur together.

Sam: unskippable wizard is a plain div — Tab walks out into the live page with no announcement. Modal.tsx:61 .modal-title is a div, so every dialog contains zero headings. Applications.tsx:419 tabs use aria-pressed with no aria-controls, panels have no role=tabpanel — switching is silent. .star off-state 1.94:1.

## Minor Observations

- --border and --border-strong are identical; the distinction is fictional. Three more dead compat aliases.
- .badge-cv at 4.33:1 — 11px bold is not large text, misses AA. The one in-sheet pair that escaped the audit.
- Three page-specific blocks (q-*, engine-*, model-*) in a global stylesheet organized by primitive.
- progressLine() defined twice (Applications.tsx:216, :589).
- 378 inline style={{}} objects — discipline by convention, not system, which is what fails to catch Onboarding.tsx:99.
- Modal.tsx:22 filters focusables on `disabled` only; aria-disabled chips stay in the trap order.
- Toast.tsx:84, 98 — the only two hardcoded English strings in a fully-i18n'd UI.
- Two transitions outside 120–250ms: .star 100ms, spinner 700ms infinite.

## Questions to Consider

1. If vermilion appears 25 times on Jobs, what is the accent signalling? Has "links are accent-coloured" survived from a default nobody re-examined?
2. The most carefully reasoned screens are the ones a returning user sees; the least finished is the one every user sees first. What else predates the rules it now breaks?
3. The cream sheet was audited; the wall was never measured. If the nav is chrome, why is it the only persistent way to move through the app?
4. An expanded application row presents nine interactive regions at once, in a product whose personality is "calm." Is the CV editor a panel in a list, or a page folded into a list to avoid building a route?
5. Every contrast claim carries a measured number except one — and that one is wrong. How many other spec statements are aspirations wearing the grammar of facts?
