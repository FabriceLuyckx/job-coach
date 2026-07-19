---
target: Preferences
total_score: 27
p0_count: 0
p1_count: 4
timestamp: 2026-07-19T08-42-25Z
slug: frontend-src-pages-preferences-tsx
---
Method: dual-agent (A: design review · B: detector + static a11y evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | `pending` (debounce, nothing sent) renders same spinner + "Saving…" as `saving`. No indication when answers take effect. |
| 2 | Match System / Real World | 4 | Copy is the page's best asset. Real examples, no jargon, no persona. |
| 3 | User Control and Freedom | 2 | Tag × instant + irreversible; Profile.tsx gives 5s Undo for identical gesture. Picked chip can't be un-picked. |
| 4 | Consistency and Standards | 2 | Exclusive Segmented built as 4 aria-pressed toggles; Q2 labels lack htmlFor; Q1/3/4/5 have no label at all. |
| 5 | Error Prevention | 2 | No maxLength on Preferences TagInputs; case-sensitive dedup; onBlur commits partial drafts. |
| 6 | Recognition Rather Than Recall | 3 | Strong placeholders, but only Q4 gets chips; Q3 is hardest field, gets nothing. |
| 7 | Flexibility and Efficiency | 2 | .seg = 4 tab stops, no roving arrow keys; pasting "Ghent, Brussels" yields one tag. |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, on-system, but five --accent blocks spend rationed vermilion on ordinals. |
| 9 | Error Recovery | 3 | Save failure double-reported; load failure is bare grey text, no retry. |
| 10 | Help and Documentation | 3 | Good sub-lines; no link to payoff, no statement that text goes to the AI provider. |
| **Total** | | **27/40** | **Acceptable** |

## Anti-Patterns Verdict

**LLM assessment: not slop.** Hand-built and opinionated — load-bearing comments in useProfileAutosave.ts, Segmented chosen deliberately over a select, domain-real placeholders. A Linear/Notion-fluent user would trust the surface; where they'd pause is behavioural (arrow keys dead in .seg, Tab silently committing a partial tag, no Undo on tag removal). One artifact: the ~12-line save-status block is copy-pasted verbatim from Profile.tsx:615-626 into Preferences.tsx:82-93.

**Deterministic scan:** detect.mjs --json → `[]`, exit 0, on both the file and all of frontend/src/pages. Zero rules triggered, no false positives.

**Visual overlays:** none. Vite dev server running on :5173 but no browser automation tool exposed to Assessment B — no screenshot, no injection, no overlay. All findings source-derived.

## Overall Impression

The writing is better than the interface around it. Copy ranks the questions, reassures about the right fear, gives permission to have limits — then the design flatly contradicts it: five identical cards, five identical vermilion blocks, no ordering, no completion, no exit. Biggest opportunity: accessibility plumbing (four of five controls unnamed; both agents converged independently).

## What's Working

1. **The copy.** "including variants and translations" anticipates a Belgian user missing "Data Analist". "the AI reads this like a colleague would" tells the user what register to write in.
2. **Segmented over a dropdown.** Four options visible, one tap, ink fill for active — native to the poster system, respects ≤4 options.
3. **The autosave hook is defensively correct.** beforeunload/unmount flush key off `dirty`, not the debounce timer — so the failed-save state (data only in memory) is exactly the state that warns.

## Priority Issues

### [P1] Form controls have no accessible names; page has one heading
Preferences.tsx:100/129/134/146 have no `<label>` — only a placeholder, which vanishes on input. Q2's three labels (106/111/122) have no htmlFor, and TagInput's input has no id to point at. q-title is a span, q-num is aria-hidden → one heading, five anonymous cards.
**Fix:** Question renders `<h2 className="q-title">`; accept controlId, render `<label htmlFor>`; add id/htmlFor to Q2's fields.
**Command:** /impeccable audit

### [P1] Keyboard focus is invisible on every text input on the page
index.css:187 `input:focus, textarea:focus { outline: none }` at specificity (0,1,1) beats global `:focus-visible` (0,1,0). Line 200 re-declares only outline-offset, never outline. All three textareas + three TagInputs signal focus by a 1px border colour change alone. Contradicts the stated intent at index.css:193-195. App-wide, not page-local.
**Fix:** re-declare outline in the input:focus-visible rule, or drop the blanket outline:none.
**Command:** /impeccable audit

### [P1] Segmented is a radio group implemented as four independent toggles
Preferences.tsx:39-45 uses role="group" + aria-pressed. SR announces four unrelated toggles; arrow keys do nothing.
**Fix:** role="radiogroup"/role="radio" + aria-checked, roving tabIndex, ArrowLeft/Right handler. ~10 lines in one component.
**Command:** /impeccable audit

### [P1] Five vermilion blocks break accent rationing — and one fails AA
.q-num (index.css:315-327): --paper on --accent = 4.33:1 at 14px/700. WCAG large text starts at 18.66px bold, so this is judged at 4.5:1 and fails. Codebase already has --accent-text because --accent fails as text; the reverse pairing was never checked. DESIGN.md rations vermilion to one signal per view; this page spends it five times on ordinals.
**Fix:** .q-num → transparent bg, 1px solid --ink, ink text. Spend the freed vermilion on Q1 or nothing.
**Command:** /impeccable polish

### [P2] Tag removal irreversible here, undoable one nav item away
TagInput.tsx:42-44 removes on click, no Undo; Profile.tsx wraps the same gesture in a 5s Undo toast and CLAUDE.md makes that a system rule. Plus: no maxLength at these three call sites (prop exists, used for skills); .tag has no max-width/overflow so a pasted paragraph blows the card; dedup is case-sensitive. Tag remove × is 16×16px, failing WCAG 2.2 AA 24×24 (2.5.8) — the 6px gap doesn't rescue it.
**Fix:** reuse the existing toast Undo; maxLength={60}; overflow-wrap:anywhere on .tag; case-insensitive dedup; 24×24 ×.
**Command:** /impeccable harden

### [P2] The page never says where these answers go, and never shows the payoff
Every field is serialized by _trimmed_profile() (job_scanner.py:209-216) and sent to the provider on every scan, including any salary figure in Q5. In an app whose principle is local-first and honest about cost, silence is a trust liability. And after five questions there's no link to Job Suggestions, no completion state.
**Fix:** one clause in preferences.help naming the destination (vary by llm_provider); one closing row linking to /jobs labelled for the payoff.
**Command:** /impeccable clarify

## Persona Red Flags

**Jordan (first-timer)** — Five empty questions, no empty state, no ordering signal; doesn't know a blank Q1 makes the scanner near-useless. Numbering implies a sequence with an end; no completion feedback. Q2 is visibly three questions in one card. Only Q4 offers chips; Q3 is hardest and gets none.

**Sam (a11y)** — Four of five controls unnamed; .seg announces as four unrelated toggles; no visible focus ring on any input/textarea. role="status" re-announces every debounce cycle (typing a sentence into Q3 = a stream of "Saving…/All changes saved"), and the error state puts an interactive retry Button inside the live region. .suggest-row button:disabled composites to 1.65:1 — exempt under 1.4.3 but it's the only "already added" signal. Zero prefers-reduced-motion hits in the entire frontend; .spinner rotates unconditionally through every debounce+save window.

**Riley (stress tester)** — 5,000-char paste → one unbounded tag, no cap, no overflow rule, card breaks. "Ghent, Brussels, Antwerp" → one tag. "Data Sci" + blur → silent commit. Chip casing inconsistent (first as-is, later lowercased) → "Frequent travel, purely administrative work". Substring dedup: "no cold-calling please" leaves the cold-calling chip enabled. Refresh mid-edit handled well — strongest part of the implementation.

## Minor Observations

- Dead code: line 150's error paragraph can never render (line 74 early-returns).
- Double error reporting: inline retry in the head + a toast with its own retry. The toast exists because the header scrolls away — but it's sticky.
- Load-failure state: bare grey text, no retry, ignores the existing .load-error strip.
- Sticky head has no bottom rule; content cuts against identical cream in an ink-hairline system.
- Negative-margin hack duplicated inline in Preferences.tsx:95 and Profile.tsx:631.
- Card separation ~1.03:1 (--surface on --paper); five cards read as one continuous field.
- Terminology drift: UI "Working style"/"dealbreakers" vs schema `remote`/`avoid`.

## Questions to Consider

1. If Q1 is "the first thing the scanner checks", why does it look identical to Q5? The copy ranks these fields; the design refuses to.
2. Why is this a page and not the last step of onboarding? Five short numbered questions is a wizard that was flattened into a page and left in the nav where nobody has a reason to click it.
3. What does "done" look like here, and why doesn't the page know? Empty target_roles means the prescreen has no strong signal — that answer exists in the backend and never reaches the person who needs it.
