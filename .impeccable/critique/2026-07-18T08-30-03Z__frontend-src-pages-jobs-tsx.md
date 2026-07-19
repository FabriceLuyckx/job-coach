---
target: Job Suggestions page
total_score: 27
p0_count: 0
p1_count: 3
timestamp: 2026-07-18T08-30-03Z
slug: frontend-src-pages-jobs-tsx
---
Method: dual-agent (isolated sub-agents — Assessment A: Design Review, Assessment B: Detector + Browser Evidence). First critique of this target.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Scan progress lives only inside the button label that started it; recheck progress renders only inside the `filteredOut.length > 0` block and can be invisible entirely; no `aria-live` on this page |
| 2 | Match Between System / Real World | 3/4 | Copy is genuinely plain; "Sources" and "Filtered out" remain system-language, never defined for a newcomer |
| 3 | User Control and Freedom | 3/4 | Reject→undo, restore, suggest-anyway, cancel-scan all present. Accept — the expensive, irreversible one — has no undo and force-navigates away |
| 4 | Consistency and Standards | 3/4 | Same "Reject" action styled two ways (secondary in suggestions, ghost+danger in history); search/filter exists for suggestions but not history |
| 5 | Error Prevention | 2/4 | Both URL inputs untyped (no `type="url"`, no validation); no confirm on source removal; Accept spends tokens with no local cost signal |
| 6 | Recognition Rather Than Recall | 3/4 | Reasons + digests colocated per card, every icon has a text label. "Re-check filtered jobs" is orphaned outside the collapsible it refers to |
| 7 | Flexibility and Efficiency | 2/4 | No bulk accept/reject, no keyboard traversal of cards, history unsearchable, Accept ejects you mid-triage |
| 8 | Aesthetic and Minimalist Design | 2/4 | Six stacked full-width regions in identical `.section-title` + `.card` treatment; unrationed accent flattens hierarchy further |
| 9 | Error Recovery | 3/4 | Retry on load error, per-source error naming, suggested-with-caveat fallback. Raw backend error text interpolated into user-facing copy |
| 10 | Help and Documentation | 3/4 | Real help text under Sources/Check, three distinct empty states, working tooltips. Nothing explains how the filter decides or what a scan costs |
| **Total** | | **27/40** | **Acceptable — significant improvements needed before users are happy** |

## Anti-Patterns Verdict

**LLM assessment:** Not slop. One `Button` primitive, one `Badge`, one `Collapsible`, one `EmptyState`, one toast channel. No gradient, pastel status pill, sparkle icon, chat bubble, or second display font — the three PRODUCT.md anti-references (SaaS dashboard, job-board chrome, chatbot) are genuinely avoided. Uppercase labels, squared chips, zero radius and the poster shadow are DESIGN.md-mandated and were correctly not flagged. Two brand-rule breaches found, one systemic (see P1 accent issue); the Flat-At-Rest, One Ink, and Case Signal rules are all respected.

**Correction to the review brief:** I had described Reject as "a red button" when scoping this critique. That was wrong — Reject is `variant="secondary"` in suggestions and `ghost` + `btn-icon-danger` in history, i.e. red on hover only. That matches DESIGN.md's icon-button note ("lists never show permanent red squares") and is the right call.

**Deterministic scan:** `detect.mjs` clean on `Jobs.tsx` — **0 findings, exit 0**. Broader scan of `pages` + `components` returned exit 2 with **2 findings, neither in the target**: `layout-transition` (animating `width`) at `EngineSettings.tsx:133` and `Onboarding.tsx:199`. Assessment B ran its own synthetic bad-file sanity check (purple gradient + bounce easing → correctly flagged, exit 2), so the clean result on Jobs.tsx is verifiably real, not a silent no-op.

**Static inventory (Assessment B, factual):** 543 lines; 7 top-level UI regions; 14 `Button` render sites — `primary` ×2 (lines 351, 417), `secondary` ×6, `ghost` ×6, `danger` ×0; 54 inline `style={{}}` objects; off-token literals `verticalAlign: -2` ×11, `marginRight: 6` ×5, `marginRight: 5` ×5, plus `gap: 6`, `minWidth: 180`, `padding: '4px 0'`; 17 `aria-` attributes (5 `aria-label`, 12 `aria-hidden`); every Button has a visible text child; no `onClick` on non-button elements.

**Where the two assessments reconcile:** B's static count of *2* primary buttons looks compliant with the Rationed Accent Rule — but A caught that one of them (line 417, Accept) renders **once per suggestion card**. Ten suggestions = ten vermilion buttons, plus "Find new listings", plus each accented `badge-deadline` chip, plus the accent-coloured profile-changed nudge. The static inventory understates runtime accent density; only the design read catches it. This is the clearest example in this critique of why both passes exist.

**Visual overlays:** Unavailable — neither sub-agent had a mutable browser/screenshot tool this session. Source-level review only; no rendered-page claims. Note this means the contrast figures below are *derived* from token values and opacity math, not measured in a browser.

## Overall Impression

The engineering discipline here is the best in the app — resumable, cancellable scans that never re-charge for completed work, a filtered-out audit trail almost no product ships, and calibrated progressive disclosure. The copy is genuinely on-brand: unhurried, fallibility-admitting, no manufactured urgency. What undermines it is that the page's *visual* language contradicts its own *verbal* promises at two specific points: the AI's reasoning — the entire justification for the trust design — is rendered as the faintest text on the page, and the whole appeals apparatus is hidden on first run, exactly when a user is deciding whether to trust the filter at all. The single biggest opportunity is making the trust story visible and legible rather than dimmed and conditional.

## What's Working

1. **Cancel + resumable scans, done properly** (`Jobs.tsx:66` module-level `activeScan`, `:182-188` re-attach on mount, `:215-217` cancel, `:148-152` cancelled-status reload). You can leave, come back, and kill a scan — and never re-pay for work already stored. The "local-first and honest about cost" principle actually shipped, not just written down.
2. **The filtered-out audit trail exists at all** (`:461` renders the reason on non-matches, `:463-467` one-click restore, `:472` free re-judge of the cached set). Almost no product shows what its filter discarded, let alone lets you argue with it. Best-in-class idea; only the visual treatment undercuts it.
3. **Progressive disclosure is calibrated, not reflexive.** Filters appear only past 5 suggestions and correctly key off `allSuggested` (not the filtered result) so they can't vanish while in use; history pages at 20; filtered-out is collapsed. Three distinct empty-state messages for three distinct empty conditions rather than one generic "Nothing here."

## Cognitive Load Checklist

- Single focus — **FAIL**: sources + scan + progress + errors + search/filter + suggestions + check-a-job + filtered-out + recheck + nudge + history + paging on one scroll.
- Chunking (≤4/group) — **FAIL**: one suggestion card carries ~12 units (title, lang badge, host, reason, up to 6 digest chips, 50-word summary, 2 buttons).
- Grouping — PASS: `.card` borders and proximity are clean.
- Visual hierarchy — **FAIL**: every region is `div.section-title` + `.card` at identical weight; N competing vermilion primaries destroy the "what next" signal.
- One thing at a time — **FAIL**: Accept navigates away mid-triage; a scan can run while you decide on stale rows.
- Minimal choices (≤4) — **FAIL**: 14 distinct action types simultaneously available.
- Working memory — PASS: each card is self-contained.
- Progressive disclosure — PASS: deliberate and well-judged.

**5 failures / 8 → high cognitive load (critical).**

## Emotional Journey

The copy is the strongest thing on this page and it *is* the brand — `filteredOutHelp` ("Openings the filter judged off-target, with its reason. If it got one wrong, suggest it anyway.") attributes judgment to a fallible filter, promises a reason, and pre-authorises override in one sentence. No urgency manufacturing, no celebration confetti, no streak counters.

The rejection-by-proxy moment breaks visually, not verbally. Filtered-out cards render at `opacity: 0.7` and rejected history at `opacity: 0.55`; the AI's reason inherits that fade. `.muted-sm` (`#6E6A5E` on `--surface #FBFAF3`) is ~4.6:1 at full strength, landing near **2.4:1** at 0.55 — so the explanation for why a job was dismissed becomes the least legible text on the page while failing the WCAG AA baseline PRODUCT.md commits to. Auditable in the database, greyed out in the UI.

Compounding it: the entire trust apparatus is gated behind `filteredOut.length > 0`. On first run — precisely when trust is being decided — "Filtered out", "Suggest anyway", and "Re-check filtered jobs" do not exist. The user sees a filter with no visible appeals process.

Peak-end: the peak is Accept, and it teleports the user to another page with no on-page confirmation and no undo. The end state is History, which is fine, but there's no closure after the emotionally loaded act of rejecting six things.

## Priority Issues

**[P1] The AI's reasoning is the faintest text on the page.** `opacity: 0.7` (`:455`) and `opacity: 0.55` (`:497`) fade already-`--muted` reason text to roughly 3.2:1 and 2.4:1. Fails the committed WCAG AA baseline and is semantically backwards — the content that most needs reading is hardest to read. **Fix:** delete both opacity values; signal "decided" structurally via `--surface-dim` fill (DESIGN.md's nested-panel step-down) plus the existing verdict icon and "Accepted"/"Rejected" text label. → `/impeccable harden`

**[P1] Vermilion is unrationed — a dozen accents compete.** `btn-primary` Accept on every suggestion card (`:417`), plus primary "Find new listings" (`:350`), plus each `badge-deadline` (`:49`), plus accent nudge text (`:484`). Direct violation of the Named Rationed Accent Rule; the busiest state of the page is also its loudest, the opposite of "calm under a stressful process." **Fix:** Accept becomes `secondary` (the ink-fill inversion already reads as "chosen" via the `.seg` precedent); reserve vermilion for one thing per state. → `/impeccable colorize`

**[P1] Accept ejects the user from the page, with no undo.** `accept()` (`:236-247`) fires the API call then immediately `navigate('/applications')`. Reject gets an undo toast; Accept — irreversible and token-spending — gets nothing. The undo asymmetry is backwards, and triaging 10 suggestions means 10 forced context switches. **Fix:** stay on Jobs; mark the row accepted in place with an inline "Generating… / View application →" line and an Undo in the toast. → `/impeccable shape`

**[P2] Scan status has no home on the page.** `scanProgress` renders only as the label of the button that started it (`:358`), and recheck progress only inside the `filteredOut.length > 0` conditional (`:475`). No `aria-live` anywhere on this page. Three failure modes: scrolled-away users lose sight of a multi-minute scan; a resumed recheck whose openings haven't loaded renders no progress at all; screen-reader users get no announcement, and the button's accessible name mutates mid-press. **Fix:** one `role="status"` strip under the page title owning progress, source errors, and Cancel; buttons keep stable labels and just show `busy`. → `/impeccable clarify`

**[P2] Six identical regions, two identical URL inputs, zero heading structure.** All five region titles are `div.section-title`, not headings — one `<h1>`, no `<h2>` on the densest page in the app. "Check a specific job" is a second URL input, visually identical to the source input but with opposite meaning ("judge this posting" vs "watch this page forever"), placed after the suggestion list, and neither is `type="url"`. **Fix:** promote region titles to real `<h2 className="section-title">`; fold "Check a specific job" nearer the source input where the distinction can be stated once; add `type="url"`. → `/impeccable layout`

## Persona Red Flags

**Jordan (first-timer)** — two undifferentiated URL boxes with no model for why one is "watched"; "Sources" never defined, so pasting a single posting URL yields zero openings with no explanation; the entire trust story is invisible on day one (gated behind `filteredOut.length > 0`); "Find new listings" disabled with only a `title` tooltip (which many browsers won't surface on a disabled button); Accept's tooltip is the only place stating that accepting generates a CV *and* a letter — the button just says "Accept".

**Riley (stress-tester)** — cancel a recheck and have the last filtered row rescued: `filteredOut` empties, the whole block unmounts, Cancel and progress vanish while `rechecking` is still true and `busyScan` still blocks the scan button. Navigate away and back mid-recheck: progress resumes but openings load async, so the page looks idle while the engine is locked. Refresh mid-scan: `activeScan` is module-scope (explicitly `ponytail:`-flagged as in-memory), so the server keeps running with no UI indicator and no way to cancel. Non-URL paste hits the backend raw and surfaces as an interpolated error string. `sourceErrors` is keyed by source *name* (hostname-derived), so two sources on one host collide. Filter to zero results → empty state with no clear-filters button, despite `EmptyState` exposing an unused `action` prop.

**Sam (accessibility)** — no `aria-live` on the page's longest operation; progress lives in a button's own accessible name, which changes under focus; contrast failures by design at `opacity` 0.55/0.7; no heading structure for navigation; no `:focus-visible` rules anywhere in the stylesheets, and `input:focus { outline: none }` replaces the ring with a border-colour change only; `target="_blank"` links with no new-window affordance; `.spinner` animates infinitely with no `prefers-reduced-motion` guard. The history verdict icon pair is fine — the "Accepted"/"Rejected" text label carries it, so meaning isn't colour-only.

## Minor Observations

- `RemoveButton` on a source deletes with no confirmation and no undo — inconsistent with Reject, and arguably more destructive (loses `links_hash`, so the next scan re-pays for link extraction).
- History has no search or source filter though suggestions do, and `decided` grows unbounded — against the "built to last years" principle.
- `Digest` renders up to six chips with no truncation; a long salary/location string wraps the row to three lines.
- `jobs.couldntRead` appears both inline on the source row and in the `.load-error` block below — the same failure stated twice in two registers.
- `checkNoMatch` is a 6s auto-dismiss `toast.info` carrying the AI's full reason — six seconds to read the justification, with no way to retrieve it.
- Two `layout-transition` detector warnings sit outside this target, in `EngineSettings.tsx:133` and `Onboarding.tsx:199` (animating `width`).

## Questions to Consider

1. **Is "Filtered out" a section, or is it the same list?** Two lists, two visual treatments, two vocabularies for one underlying thing: openings the filter scored. What if there were one list sorted by confidence, where off-target rows collapse to a single line instead of being exiled below the fold? The audit trail stops being a basement and becomes the tail of the list — visible on day one rather than only after the first miss.
2. **Why does accepting a job take you somewhere else?** Every other decision on this page happens in place. If Accept behaved like Reject — mark, toast, offer undo, keep the queue — a user could triage fourteen openings in one pass instead of fourteen round trips.
3. **The deadline chip is the only vermilion inside a suggestion card. Is time pressure really what this product wants to shout?** PRODUCT.md says avoid manufactured urgency; DESIGN.md hands the accent to "the thing you're most likely to click next." Those two sentences disagree about the deadline chip, and one should win explicitly.
