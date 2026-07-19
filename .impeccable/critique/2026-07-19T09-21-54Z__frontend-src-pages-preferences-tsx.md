---
target: Preferences
total_score: 27
p0_count: 1
p1_count: 2
timestamp: 2026-07-19T09-21-54Z
slug: frontend-src-pages-preferences-tsx
---
Method: dual-agent (A: design review · B: detector + live Playwright browser evidence)

## Design Health Score

| # | Heuristic | Score | Δ | Key Issue |
|---|-----------|-------|---|-----------|
| 1 | Visibility of System Status | 2 | ▼1 | Save state is aria-hidden AND its spinner is killed under reduced-motion — two independent ways to have no status, on a page with no Save button. |
| 2 | Match System / Real World | 3 | ▼1 | doneSub asserts "That's everything the matcher needs" when target_roles can be empty. |
| 3 | User Control and Freedom | 3 | ▲1 | Tag-removal Undo landed. A used suggestion chip still has no un-add path. |
| 4 | Consistency and Standards | 2 | — | `<label id={id('style')}>` labels nothing; payoff card byte-identical to a question card; Profile still has the bare load-error string Preferences replaced. |
| 5 | Error Prevention | 2 | — | Nothing prevents an empty target_roles while the page congratulates you on completeness. |
| 6 | Recognition Rather Than Recall | 2 | ▼1 | REGRESSION. Ordinals gone, nothing replaced them — five identical boxes at 1.03:1, differentiated only by prose. |
| 7 | Flexibility and Efficiency | 3 | ▲1 | Roving tabIndex, arrow keys, paste-splitting all real wins. |
| 8 | Aesthetic and Minimalist Design | 3 | — | Accent rationing now correct (one vermilion fill, one action) but the page lost vertical rhythm in the trade. |
| 9 | Error Recovery | 3 | — | .load-error + retry good; retry is window.location.reload(), a full reboot for one failed GET. |
| 10 | Help and Documentation | 4 | ▲1 | Best dimension. Privacy/cost disclosure landed. |
| **Total** | | **27/40** | **—** | **Acceptable — unchanged** |

Four heuristics up, three down. Score did not move.

## Anti-Patterns Verdict

**LLM assessment: not slop.** Comments argue specific past bugs (the substring chip match, opacity 0.35 = 1.65:1, the input:focus specificity trap) — a person who watched something break. Register is correct product-tier. One slop-adjacent tell: preferences.doneSub reads like reassurance copy written to fill a card rather than state a fact.

**Deterministic scan:** detect.mjs clean (exit 0, `[]`) on Preferences.tsx and all of pages/. components/ has 2 × layout-transition warnings (EngineSettings.tsx:133, Onboarding.tsx:199) — both progress-bar width fills, false positives for the rule's intent.

**Browser evidence (live Playwright, profile.json md5 verified unchanged):** see verified-fixes below.

## What Got Fixed — browser-verified

- Zero accessible-name gaps; all 6 controls named via real <label for>.
- Heading outline clean: H1 → five H2s, no skips, sentence case (computed textTransform "none").
- .seg is ONE tab stop, exactly one aria-checked=true, roving tabIndex works at 1280 and 420.
- All 23 focus stops have a visible ring (2px solid rgb(200,64,31)). No gaps, trap, or unreachable control.
- All targets ≥24×24. Reduced-motion works and does NOT leak (normal mode keeps 0.15s transitions, 0.7s spin).

## Priority Issues

### [P0] aria-hidden on the save states removes them from the accessibility tree
SaveStatus.tsx:27,32. The reasoning was about announcements, but aria-hidden means "does not exist", not "don't announce". A screen-reader user browsing the sticky header finds nothing. Compounding: index.css:640 sets .spinner { animation: none; border-top-color: transparent } under reduced-motion, so the same status is a static inert ring for sighted low-motion users. This page has NO Save button — the indicator is the only evidence answers left the browser.
**Fix:** delete both aria-hidden attributes. A plain span with no aria-live is already silent during typing and readable on demand. Under reduced-motion swap the spinner for a static meaningful glyph, not a decapitated ring.

### [P1] The payoff card overpromises and links somewhere that can't deliver
Preferences.tsx:190-193. "That's everything the matcher needs" is false twice: target_roles can be [], and /jobs renders disabled={sources.length === 0} on its primary action. Label mismatches destination ("Find matching jobs" vs Jobs' "Find new listings").
**Fix:** make the card conditional. Empty target_roles → mustard line pointing back at Q1. Otherwise state the real next step: add a careers page to watch.

### [P1] Placeholder text fails AA at 4.40:1
Browser-measured: #757575 on #fbfaf3 = 4.40, needs 4.5. No ::placeholder rule exists anywhere — this is the Chrome UA default, varying per browser. Every placeholder here carries a real example, so it's content.
**Fix:** author `::placeholder { color: var(--muted) }` — 5.82:1, already a token.

### [P2] Nothing signals which questions are answered
Prior finding, still open; removing the ordinals took away the only positional anchors. "Built to last years" means the dominant session is a return visit to refine one answer — today that means reading five prose questions to find the blank one.
**Fix:** 3px left border on .card — var(--teal) when answered, faint ink when empty. Teal is already the "done" hue and isn't the rationed accent. Pair with a visually-hidden answered/not-answered token so it isn't colour-only.

### [P2] `<label id={id('style')}>` labels nothing
Preferences.tsx:149. A label with a generated id never referenced, beside a Segmented that names itself via aria-label. "Working style" appears twice in the a11y tree, or zero times usefully.
**Fix:** switch Segmented to aria-labelledby={id('style')} and drop the duplicated t() call.

## Persona Red Flags

**Sam (a11y)** — P0 is the headline. Suggestions chips use `disabled`, dropping them from tab order with no announcement — aria-disabled + no-op handler keeps the ✓ discoverable. Focus stops 21 and 22 are two consecutive stops to the same destination (Link wrapping Button).

**Riley** — parseTags has no cap on tag COUNT: a pasted CSV becomes hundreds of chips, all saved, all sent to the engine per posting read; card grows unbounded vertically. Holding ArrowRight on .seg fires a save-debounce reset per repeat. Backspace in an empty tag field fires the Undo toast on every stray press.

**Jordan** — May skip Q1 entirely: the one card needing an Enter keypress, unmarked as more load-bearing than the four free-text boxes beside it.

## Minor Observations

- Narrow viewport overflows 287px at 420px — app shell (fixed 208px sidebar, zero media queries in the codebase), not this page. Settings 718px, Profile 640px. Consistent with DESIGN.md desktop-first. Out of scope.
- Footer link 3.06:1 (cream on wall-teal) — app shell, pre-existing, fails AA.
- Q3 textarea scrolls at 201px content in a 98px box; notes hits 439px. Fixed minHeight, pre-existing.
- .tag button:hover uses hardcoded rgba(255,255,255,0.22) — won't follow a palette change.
- Load-error retry is window.location.reload(); re-invoking api.getProfile() is the same line count.
- Console/page errors: none. Only React Router v7 future-flag warnings.

## Questions to Consider

1. If the payoff card must be conditional to be honest, is it a card — or the missing completion state wearing a card's clothes? One terminal element that changes with what's filled solves P1 and P2 together, with less code than a per-card border.
2. Q3 is the hardest question here and the only free-text one without chips. Why is the scaffolding on the easy question?
3. SaveStatus was extracted for reuse, yet Profile still shows a bare loading string while Preferences got .load-error with retry. Which page is the standard?
