---
target: Preferences
total_score: 32
p0_count: 0
p1_count: 1
timestamp: 2026-07-19T09-38-28Z
slug: frontend-src-pages-preferences-tsx
---
Method: dual-agent (A: design review · B: detector + live Playwright evidence)

## Design Health Score

| # | Heuristic | Score | Δ | Key Issue |
|---|-----------|-------|---|-----------|
| 1 | Visibility of System Status | 4 | ▲2 | Fixed. SaveStatus back in the a11y tree; four independent nets on the one thing that must not fail. |
| 2 | Match System / Real World | 3 | — | "Job Coach has what it needs" overstates what one filled field buys. |
| 3 | User Control and Freedom | 3 | — | Tag removal has Undo; a mis-tapped suggestion chip doesn't. |
| 4 | Consistency and Standards | 3 | ▲1 | .q-mark is a micro-pattern found nowhere else; Q2's marker contradicts the control beneath it. |
| 5 | Error Prevention | 4 | ▲2 | MAX_TAGS + toast, dedupe, whole-phrase match, the mustard gate before routing to a scanner that can't help. |
| 6 | Recognition Rather Than Recall | 4 | ▲2 | Real worked examples in every placeholder. |
| 7 | Flexibility and Efficiency | 3 | — | Nothing accelerates the return visit. |
| 8 | Aesthetic and Minimalist Design | 2 | ▼1 | DOWN. Marker row adds a competing typographic layer to all five cards; page grew a sixth card that isn't a question. |
| 9 | Error Recovery | 3 | — | role="alert" + toast + retry. |
| 10 | Help and Documentation | 3 | ▼1 | Honest about cost and CV separation. |
| **Total** | | **32/40** | **▲5** | **Good** |

The score rose 5 while the page got busier. That divergence is the finding, not the score. The rise is almost entirely the four a11y/contrast fixes from run 2's P0/P1s — real defects, really fixed.

## Anti-Patterns Verdict

**LLM assessment: not slop.** Copy is specific and human, tokens honored, no persona/gradient/urgency. The inverse risk has appeared instead: **over-annotation.** Preferences.tsx is ~1:2 comments-to-code and several comments defend decisions against critique rounds rather than explain code — rubric residue accumulating in source. A maintainer inherits an argument transcript.

**Deterministic scan:** detect.mjs clean (exit 0, []) on Preferences.tsx and all of pages/. components/ has 2 × layout-transition (EngineSettings.tsx:133, Onboarding.tsx:199) — determinate progress bars where animated width IS the data. False positives for the rule's intent.

**Browser evidence (Playwright; profile.json md5 identical across all 3 runs, API stubbed rather than typed):** zero aria-hidden in main content; radiogroup name resolves to "Working style"; no accessible-name gaps; clean heading outline (h1 + five h2, no skips); 24 focus stops all with 2px visible outline; end-card action exactly ONE stop; a.btn-primary renders as filled block, no hover underline either state; reduced-motion doesn't leak (normal keeps spin/0.7s); zero console and page errors; NO element below 4.5:1 (lowest a.btn-primary at 4.99).

## Cognitive load: 2 of 8 fail

- Visual noise / competing signals — FAIL. Every card head carries bold uppercase letter-spaced micro-type at --fs-xs: the loudest typographic treatment on the page, applied to its least important information, five times.
- Consistent patterns — FAIL. Q2's marker can read "NOT ANSWERED" while a working style is visibly selected beneath it.
- Passes: choice count, working memory, clear primary action, scannable structure, progressive disclosure (correctly absent), jargon.

## Emotional journey

First visit regressed. The page opens as four stamps reading "– NOT ANSWERED" on optional questions. Brand is "calm, trustworthy, reassuring… a steady hand, not add urgency." preferences.help says "Answer what you can" and the layout contradicts that sentence four times before the user reads a question. The empty-state failure mode of a checklist is manufacturing obligation out of optionality.

Return visit is better — teal checks reassure. But the return visit was never the problem the marker claimed to solve: answered questions already show filled tags and textareas, blanks show placeholder grey. The scanning anchor already existed; it was the content.

## Strengths

1. useProfileAutosave is exemplary — every safety net keyed off `dirty` rather than the debounce timer, with the comment explaining that a timer-based guard goes quiet precisely when data exists only in memory. Four independent nets.
2. Segmented is a real radiogroup: roving tabindex, arrow keys, aria-checked, plus a guard for an unrecognised stored value that would otherwise leave nothing focusable.
3. The mustard no-roles state is the one piece of new scaffolding that earns its place — refusing to offer a primary action routing to a scanner that can't help yet is honest design and the correct use of --highlight.

## Priority Issues

### [P1] Q2's answered marker lies
`answered={p.locations.length > 0 || p.languages.length > 0}` ignores p.remote, which always holds a value. Pick "Hybrid" and nothing else → a visibly selected segment with "– NOT ANSWERED" stamped above it. A status indicator contradicting the control it describes is worse than none. Note the shape: this bug exists ONLY inside the scaffolding added to reduce cognitive load.

### [P2] Delete .q-mark — not fix it
- Redundant on a 5-card page where each answer is visible in the control directly below its own marker.
- Stamps four failures on a first visit to a page of optional questions, against an explicit brand constraint.
- Violates the Case Signal Rule: B confirms .q-mark is the ONLY uppercase rule reaching inside .q-head. Uppercase is this app's vocabulary for taxonomy; "ANSWERED" is the transient state of one item.
- It caused P1.
Deleting also removes .q-head, .q-mark-done, the `answered` prop across five call sites, and two locale keys. Negative diff in every file.

### [P3] Soften the ready-state claim
"Job Coach has what it needs to judge a posting" is a large assertion off one filled field. "That's enough to start scanning" is true in both the thin and full case. Also: the no-roles state nags twice for one gap (Q1's marker + the mustard end line).

**Complete list. Three findings, one a deletion. Not padded to five.**

## Persona Red Flags

PRODUCT.md defines no named personas, so these are archetypes, not project canon.
- **Jordan (non-technical first-timer):** meets four "NOT ANSWERED" stamps before reading a question. Highest-impact flag on the page.
- **Sam (returning months later — the persona PRODUCT.md actually centers, "built to last years"):** well served. Save status, persistence, undo all hold. The marker gives nothing the filled fields don't.
- **Riley (assistive tech):** best-served version yet. One caveat the marker introduces: it sits as the h2's sibling in .q-head, so a screen-reader user hears the question heading and, separately, a bare "– NOT ANSWERED" with no owner. Deleting resolves this too.

## Minor Observations

- The /jobs destination DELIVERS. It opens with the Sources card (URL input, Add, "No sources yet — paste a careers-page URL above"). "Add a page to watch" matches the destination's own vocabulary. Thread closed — do not touch.
- A suggestion chip is additive-only and unremovable except by hand-editing; the controlled `set` kills native ctrl-Z. Real, tiny, missed by both prior rounds. Not worth fixing.
- parseTags caps and reports — correct call. Silent truncation was the failure mode; a toast is the whole fix.
- The reduced-motion contract comment is genuinely good design-system documentation. Keep it.
- Narrow viewport (420px) overflows 287px, but the root is app-shell (fixed 208px sidebar), not this page. .q-head specifically does NOT wrap or overflow its card.

## Questions to Consider

1. The marker exists because someone read five questions to find the blank one. Is the real problem that the questions are prose sentences rather than labels — did a status stamp treat a symptom of heading design?
2. Runs 1–2 scored 27 and produced revisions; run 3 scores 32 while reading busier than run 2. If score and experience move in opposite directions, which is the page being optimized for?
3. What would a fourth critique find? If the honest answer is "whatever we add next," the process has inverted — findings generated by the existence of the review, not by the page.

## Verdict: leave it alone after one fix

Delete the marker (resolving P1 and P2 in one negative diff), soften one string, then stop. The a11y work across runs 1–3 was real and is complete. Run 3's changes are the first that made the page measurably worse in one dimension while improving a score — the signature of over-fitting. A fourth round should not be scheduled; if one happens, the correct output is "no changes."
