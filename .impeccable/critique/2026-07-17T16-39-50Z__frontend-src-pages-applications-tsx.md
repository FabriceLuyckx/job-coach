---
target: Applications page
total_score: 26
p0_count: 0
p1_count: 2
timestamp: 2026-07-17T16-39-50Z
slug: frontend-src-pages-applications-tsx
---
Method: dual-agent (isolated sub-agents for Assessment A: Design Review, Assessment B: Detector + Browser Evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Relang failures only surface as small inline text, not a toast, unlike every other action on the page |
| 2 | Match Between System / Real World | 3/4 | "Rebuild from URL" vs "Update CV with AI" are two labels on the same-position button depending on internal state the user can't see |
| 3 | User Control and Freedom | 3/4 | Cancel genuinely reaches the server job (not just the client poll) — a real strength. Gap: language change deletes the old letter with no Undo |
| 4 | Consistency and Standards | 3/4 | Shared primitives (Button/Collapsible/LangSelect/Toast) reused correctly; undercut by raw unicode glyphs vs. the Lucide icon system and off-scale inline spacing |
| 5 | Error Prevention | 3/4 | Generate correctly disabled with no URL/artifact; no confirmation before language-change discards a letter |
| 6 | Recognition Rather Than Recall | 3/4 | Icon-only controls (X, RefreshCw) rely on hover-title, invisible until hovered |
| 7 | Flexibility and Efficiency | 2/4 | One undiscoverable keyboard accelerator (Cmd/Ctrl+B/I); no bulk actions; search only appears past 8 rows with no sort/filter |
| 8 | Aesthetic and Minimalist Design | 2/4 | An expanded CV tab stacks 7+ distinct content blocks with zero secondary disclosure |
| 9 | Error Recovery | 3/4 | Failures preserve typed input and keep the same action retryable; no structured "what to do next" |
| 10 | Help and Documentation | 1/4 | Only the Letter tab gets a contextual explainer; the CV tab and the page's own CV+Letter merge model have no equivalent |
| **Total** | | **26/40** | **Acceptable — significant improvements needed before users are happy** |

## Anti-Patterns Verdict

**LLM assessment (Assessment A):** Not AI slop in the generic-template sense — no gradient text, glassmorphism, hero-metric cards, identical-card grids, or chat-bot chrome. The uppercase labels, `.seg` control, and hard poster shadow are DESIGN.md-mandated and correctly scoped, so they were not flagged. What reads as unpolished is accretion, not template-slop: raw `✓`/`—` text glyphs sitting inside an otherwise all-Lucide icon vocabulary, and heavy reliance on one-off inline `style={{}}` objects instead of shared classes, with spacing that occasionally drifts off the token scale.

**Deterministic scan (Assessment B):** `detect.mjs` ran clean — **0 findings** across `Applications.tsx`, `CVEditor.tsx`, `GuideView.tsx`, `LangSelect.tsx` (exit code 0), confirmed against a synthetic bad-file sanity check (the detector correctly flagged a purple gradient / bounce easing / undeclared font elsewhere, so the empty result here is a genuine clean scan, not a broken run). No false positives to reconcile since there were no findings.

**Visual overlays:** Unavailable from both assessments — neither had a mutable browser/screenshot tool in this session (only read-only WebFetch was exposed). No overlay is visible in any tab; this is a source-level review, not a rendered-page inspection.

**Reconciliation:** The clean regex-based scan and the LLM's "not slop, but accreted inconsistency" read agree rather than conflict — the issues found here (icon-vocabulary drift, inline-style sprawl, an unrationed second accent button) are structural/compositional, exactly the class of thing a pattern-matching detector isn't built to catch.

## Overall Impression

The page's bones are genuinely good — cancellation reaches the actual server job, autosave is properly debounced and single-flighted, and merging CV+Letter by `job_url` is the right information-architecture call, not just a UI trick. The gap is in what happens once a row opens: the CV tab dumps seven-plus distinct control clusters at equal visual weight with zero secondary disclosure, and the page's own "everything destructive is undoable" promise (5s Undo everywhere else) quietly breaks at language change, its one genuinely consequential action. The single biggest opportunity is applying the progressive-disclosure discipline the page already uses at the row level (Collapsible, CV|Letter tabs) one level deeper, inside the CV tab itself.

## What's Working

1. **Cancellation actually reaches the server, not just the client poll.** `makeCanceller()` (Applications.tsx:96-104) tracks every started `job_id` and calls `api.cancelCVJob(id)` on cancel — respects the documented local-engine single-lock constraint and gives users real control over a slow operation.
2. **Autosave is well-engineered, not just present.** `runSave`/`scheduleSave` in CVEditor.tsx (59-92) debounce, single-flight, and flush on unmount — matches the "forgiving autosave" design principle with no manual Save button anywhere.
3. **The CV/Letter merge-by-`job_url`** (`mergeApplications`, Applications.tsx:39-71) embodies "one profile, many outputs" from PRODUCT.md by collapsing two former pages into one job-centric mental model, reusing the established `.seg` tab chrome rather than inventing new UI.

## Priority Issues

**[P1] Expanded CV tab is a wall of controls with no progressive disclosure.**
- **What:** Once a row is open on the CV tab, ~7 distinct blocks render simultaneously at equal visual weight with no sub-collapsing: job-info strip, tailoring-notes box, an 80vh iframe, a 3-button action row, a section-toggle checkbox cluster, AI-decision chip rows, a photo-missing callout, and a full content editor with per-role bullet lists (CVEditor.tsx:242-468).
- **Why it matters:** Works against DESIGN.md's minimalism principle and PRODUCT.md's "calm under a stressful process" commitment; fails cognitive-load checklist items (single focus, progressive disclosure); scored 2/4 on the Aesthetic/Minimalist heuristic.
- **Fix:** Collapse "Sections," AI-decision chips, and the photo callout under one secondary disclosure; keep only preview + primary actions + content editor visible by default.
- **Suggested command:** `/impeccable distill`

**[P1] Two full-saturation vermilion CTAs can be visible at once, violating DESIGN.md's Rationed Accent Rule.**
- **What:** The page header's "+ New Application" button (Applications.tsx:603, `variant="primary"`) stays visible while a row is expanded, and CVEditor renders its own vermilion "Update CV with AI" primary button (CVEditor.tsx:322/328) at the same time.
- **Why it matters:** DESIGN.md names this exact scenario as the rule's own failure case: "If two elements on a screen both want vermilion, one of them is wrong."
- **Fix:** Demote one to `variant="secondary"` — most naturally the page-level "+ New" once history is non-empty, keeping the accent reserved for the in-context primary action.
- **Suggested command:** `/impeccable polish`

**[P2] Raw unicode glyphs (`✓`, `—`) mixed into an all-Lucide icon system.**
- **What:** `progressLine` (Applications.tsx:201) and `tabBtn` (Applications.tsx:382) render plain-text checkmark/dash characters, while everything else in both files uses lucide-react (`ExternalLink`, `X`, `RefreshCw`, `Sparkles`, `RotateCcw`, `Copy`, `ImageOff`).
- **Why it matters:** product.md explicitly bans inconsistent component vocabulary across a surface; font glyphs also don't share the SVG grid's weight/alignment, undermining the controlled poster geometry.
- **Fix:** Swap for `Check`/`Minus` from lucide-react at matching size.
- **Suggested command:** `/impeccable polish`

**[P2] Language change is the one non-undoable, unexplained destructive action on the page.**
- **What:** `changeListingLang` (Applications.tsx:337-377) immediately re-tailors the CV and regenerates + deletes the old-language letter the instant a new language is picked — no confirmation, no Undo toast, unlike every other delete on this page.
- **Why it matters:** Scored 1/4 on Help & Documentation for exactly this gap — the page's own established "forgiving, undoable" contract (5s Undo everywhere else) breaks at its single highest-consequence interaction.
- **Fix:** Route the old letter through the same `scheduleDelete`/Undo pattern used elsewhere, or add an inline note next to the language control before the click.
- **Suggested command:** `/impeccable clarify`

**[P3] Layout built almost entirely from one-off inline styles rather than shared classes.**
- **What:** Dozens of `style={{...}}` objects across both files, with spacing that occasionally drifts off the token scale (e.g. a raw `6` in the sections-cluster gap, CVEditor.tsx:348, beside `var(--space-2)`/`var(--space-4)` used for visually similar rows elsewhere).
- **Why it matters:** Inline styles bypass any shared review surface, so small drifts compound invisibly over time — the exact failure mode product.md's "inconsistent component vocabulary" ban targets.
- **Fix:** Promote the repeated flex-row/cluster patterns into 2-3 utility classes in `index.css`.
- **Suggested command:** `/impeccable harden`

## Persona Red Flags

**Alex (Power User):**
- No bulk actions anywhere — regenerating in a new language, deleting, or reviewing many applications is strictly one row at a time.
- The only keyboard accelerator (Cmd/Ctrl+B/I in the summary textarea, CVEditor.tsx:432-436) is undiscoverable — no visible hint it exists.
- Regeneration blocks behind a full-cover spinner overlay on the iframe (CVEditor.tsx:303-316) rather than a background "notify me when done" pattern.
- Search only appears once `apps.length > 8` (Applications.tsx:640) and offers no sort/filter by status, date, or employer once it does.

**Sam (Accessibility-dependent):**
- The `tabBtn` checkmark/dash is `aria-hidden` (correct), but that means a screen-reader user gets no signal at all that a CV or letter already exists behind a tab before activating it.
- The busy overlay on the CVEditor iframe (CVEditor.tsx:303-316) is a plain positioned `<div>` with no `aria-live` region — no announcement that generation started or finished.
- Focus state is color-only (`border-color: var(--accent)` on `:focus`, index.css:175-178) with no thickness/shape change — weaker than a true outline ring at low vision / 200% zoom.
- Bullet reordering (`BulletListEditor ... reorder`, CVEditor.tsx:453-458) keyboard-accessibility wasn't verifiable from source alone — if drag-only, it locks this persona out of that editing capability.

**Jordan (First-Timer):**
- No inline explanation of the CV+Letter merge itself — the Letter tab gets a dedicated explainer callout but the CV tab has no equivalent, so the page's core "two artifacts, one language, one job" model is only implicit.
- Default language is "Auto-detect" with no copy explaining what happens if detection is wrong before clicking Generate.
- "Rebuild from URL" vs. "Update CV with AI" (CVEditor.tsx:321-333) are two different labels on the same-position primary button depending on internal state Jordan can't see.

## Minor Observations

- The photo-missing callout (CVEditor.tsx:393-401) re-renders on every CV view with no per-session dismiss — nags a user who deliberately opted out of a photo.
- `EmptyState` correctly avoided rendering alongside the New slot (`!slotOpen && visible.length === 0`) — good state-exclusivity.
- The `expandedRows`/`rowTabs` module-level `Set`/`Map` (Applications.tsx:267-269) are explicitly marked `ponytail: in-memory only` — appropriately scoped for a single-tenant desktop app, not a bug.
- `missingArtifact()`'s per-artifact empty copy ("no CV yet" / "no letter yet") is a solid pattern — better than a blank tab.

## Questions to Consider

1. If the Rationed Accent Rule allows exactly one vermilion thing per view, which one should win when a row is expanded — the page-level "+ New Application" or the row's "Update CV with AI"? Right now both do.
2. Does every application really need its full CV editor (preview + toggles + bullet editor) inline and fully expanded, or would a list-plus-detail split carry the same density without stacking it all in one collapsible?
3. Given the page's own pattern of "everything destructive gets a 5-second Undo," why does language change — the single action with the most real consequence — skip it?
