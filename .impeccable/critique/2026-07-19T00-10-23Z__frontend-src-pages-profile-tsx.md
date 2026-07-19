---
target: Profile page
total_score: 25
p0_count: 0
p1_count: 4
timestamp: 2026-07-19T00-10-23Z
slug: frontend-src-pages-profile-tsx
---
Method: dual-agent (isolated sub-agents — Assessment A: Design Review, Assessment B: Detector + Browser Evidence). First critique of this target.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2/4 | Autosave indicator lives in a non-sticky `.page-head`; off-screen for ~95% of editing on the app's longest page. No toast on save failure |
| 2 | Match Between System / Real World | 3/4 | Copy is excellent; the CV/Preferences split is never explained or linked |
| 3 | User Control and Freedom | 3/4 | Undo toasts on every removal, non-destructive hide. But undo restores a stale snapshot; TagInput backspace-delete has no undo |
| 4 | Consistency and Standards | 2/4 | ExperienceCard opens collapsed, CustomSectionCard expanded; some sections get cards, others bare rows; teaching alone omits `count` |
| 5 | Error Prevention | 2/4 | `+e.target.value` turns a cleared year into 0; no `beforeunload` anywhere; TagInput commits partial drafts on blur |
| 6 | Recognition Rather Than Recall | 3/4 | Counts, "has content" hints, help under every section. Cmd+B/I and star-click-to-clear undiscoverable |
| 7 | Flexibility and Efficiency | 3/4 | CV import is a real accelerator; no keyboard reorder, no multi-line bullet paste |
| 8 | Aesthetic and Minimalist Design | 2/4 | 16 identical vermilion "ON YOUR CV" badges; zero primary-weight buttons in the form |
| 9 | Error Recovery | 2/4 | Save error names the cause and offers Retry — but off-screen. Unmount save is `.catch(() => {})`: silent loss |
| 10 | Help and Documentation | 3/4 | Contextual help everywhere. No "what happens next", no path to the payoff |
| **Total** | | **25/40** | **Acceptable — significant improvements needed** |

Score is dragged down almost entirely by system feedback and state handling, not craft: the visual system and copy are the strongest parts of this page.

## Anti-Patterns Verdict

**LLM assessment:** Not slop. Uppercase labels, squared chips, zero radius, the poster shadow and `.seg` are documented brand decisions applied consistently. Help copy is specific and domain-aware; `Modal.tsx` ships a real focus trap. Two product-register bans checked and cleared: no reinvented standard affordances (`input type="month"`, `<datalist>`, native `<select>` — the lazy-correct choices) and no decorative motion (only `spin`, a 180ms toast, a 150ms chevron). One ban IS violated: the Rationed Accent Rule, inverted (see P1).

**Deterministic scan:** `detect.mjs` clean — **0 findings** on `Profile.tsx` and on all five supporting components (exit 0 both). The two known `layout-transition` warnings elsewhere are unrelated to this file set.

**Static inventory (B, factual):** 745 lines; 23 Buttons — 21 `secondary`, 2 default-primary (never both visible), 0 ghost, 0 danger; 49 inline `style={{}}`; 21 off-token numeric literals across 15 distinct values; 14 `useState`, 1 `useEffect`; **67 native form controls** (57 input, 9 textarea, 1 select); `<h1>` ×1, `<h2>`/`<h3>` ×0; **11 array-index React keys** on reorderable/removable lists.

**Contrast (computed):** every muted/ink/danger/success/highlight pair PASSES. One failure — `--accent` #C8401F on `--paper` = **4.33:1 FAIL**. Verified independently during synthesis that it also fails on `--surface-dim` at **4.07:1**, which B did not test. Since `a { color: var(--accent) }` is global, this is an app-wide link-contrast failure, not Profile-only.

**Visual overlays:** Unavailable — neither sub-agent had a mutable browser/screenshot tool. Source-level review only.

**Where the passes converge:** A reached "no heading structure" from the design side (screen-reader skimming of a 16-section form) and B from the markup side (1 `<h1>`, 0 `<h2>`); both land on `ProfileSection.tsx` rendering titles as `<span>` inside a `<button>`. Likewise the label gap: B's count (65 of 67 controls with no programmatic association) traces to one shared `Field` primitive whose `<label>` is a bare sibling with no `htmlFor` — a single-point fix A's persona pass felt as "tabbing through ~60 inputs".

## Overall Impression

The craft here is real — the add-a-section menu's "has content" hint, the help copy that tells you what the machine will do with your data, a genuine focus trap in Modal. What fails is that nobody decided what the user should do **first** or what tells them they're **done**, and that the page's state handling can lose or corrupt work. The core/optional split relocates cognitive load rather than reducing it: it removes ten sections from the initial wall, then puts them back as a ten-item menu at the end of the grind. Biggest opportunity: spend the accent on the next action instead of on sixteen identical badges, and make save state legible enough to justify having no Save button.

## What's Working

1. **The add-a-section menu** (`Profile.tsx:725-735`) — each option carries a one-line description *and* a `has content` chip when hidden data still exists, converting "hide" from a scary destructive action into an obviously reversible one.
2. **The help copy is the product's voice, correctly executed** — `profile.help.publications` tells the user what the AI will do with the data; `profile.help.education` is spatial and concrete. Plain, no jargon, no urgency.
3. **Modal and Toast are above-average a11y engineering** — a real focus trap with Escape and focus-return, and a persistent toast live region with a comment explaining why an inserted region announces unreliably.

## Cognitive Load Checklist

- Single focus — **FAIL**: up to 16 sections render at once; nothing sequences the task or states what "enough" is.
- Chunking — PASS.
- Grouping — PASS.
- Visual hierarchy — **FAIL**: every "+ Add" is secondary; the accent marks only non-interactive badges.
- One thing at a time — **FAIL**: "Fill it in manually" drops the user into six core sections with no first step named.
- Minimal choices — **FAIL**: the add-section menu presents 10 options at one decision point.
- Working memory — PASS.
- Progressive disclosure — PASS (genuinely good).

**4 failures → high cognitive load (critical).** The *mechanics* of disclosure are well built; what's missing is a decision about first step and completion.

## Emotional Journey

The empty state is the best-designed moment on the page — warm title, two differentiated paths, import as the vermilion primary. Two things spoil it: with no AI engine configured the primary button is **disabled**, so a brand-new user's first screen offers a greyed-out main action; and the state is **not sticky** — `pristine` is recomputed from name + experience only, so entering Education/Skills/Languages but no name and reloading returns the "let's build your profile" wall with that work invisible behind it. Indistinguishable from data loss at the most fragile moment.

The grind offers no encouragement, progress, or destination. The page's final element is `+ Add a section` — the last thing a user sees after twenty minutes of typing their career history is an invitation to type more. Peak-end violated exactly at the end, against a product that commits to "lowering the emotional cost of applying".

## Priority Issues

**[P1] The Rationed Accent Rule is inverted — 16 vermilion badges, zero primary actions.** Every section is `badge: 'cv'` and `.badge-cv` is `background: var(--accent)`, so the page renders 16 accent chips all saying the same word, while every form button is `secondary`. A badge whose value never varies is decoration wearing the app's loudest colour, and the thing the accent should mark is unmarked. → `/impeccable colorize`

**[P1] Autosave has no Save button and no reliable failure signal.** The indicator is in a non-sticky `.page-head`, off-screen for most of the session; `saveState === 'error'` fires no toast; there is no `beforeunload` anywhere in the frontend and the unmount save is `.catch(() => {})`. A user can type for ten minutes against a dead backend and see nothing. "No Save button" is only safe if save state is always legible. → `/impeccable harden`

**[P1] Index-keyed reorderable lists corrupt per-card UI state.** Education, publications, projects and volunteering use `keyOf={(_, i) => i}`; only experience uses a stable id. Cards hold local state React can't migrate (`open`, and in VolunteeringCard `current`, which disables the End-date input). Dragging an ongoing role above a finished one leaves the checkbox and disabled field on the wrong row — appears to work, writes wrong data to the CV. → `/impeccable harden`

**[P1] Custom controls are keyboard-inaccessible and inputs have no visible focus state.** `outline: none` on every input/select/textarea, replaced by a 1px colour-only border change, across ~60 inputs; no `:focus-visible` anywhere. Drag handles are `<span draggable>` with no `tabIndex`, role, or key handler, so reordering — including CV bullet order — is mouse-only. StarRating puts 5 buttons in the tab order under `role="radiogroup"` with no arrow-key handling, labelled "3 of 5" rather than the CEFR level. → `/impeccable harden`

**[P2] The empty state hides real data on reload.** `pristine` derives from name + experience only, and `manualStart` is unpersisted component state, so a user who fills Education/Skills/Languages and reloads is returned to the empty-state wall with their work rendered nowhere. → `/impeccable onboard`

## Persona Red Flags

**Jordan (first-timer):** with no engine configured the empty state's primary button is disabled — a dead main action on the first screen. `+ Add job` appends a *collapsed* `(untitled)` card with no focus move, so the highest-intent action looks like nothing happened (and gets clicked twice). After twenty minutes the last element is `+ Add a section` — nothing says they're finished or where the CV comes from. The page never mentions or links Preferences, and every badge insists "On your CV", so Jordan concludes job preferences don't exist. The add-section menu offers 10 options at the end of an exhausting task.

**Riley (stress-tester):** clearing an Education start year yields `0` via `+e.target.value`, displayed and un-blankable; no min/max on any year input. Dragging a volunteering entry leaves the `current` checkbox and disabled End-date on the wrong row. TagInput commits a partial draft on blur and deletes the previous tag on Backspace with no undo, while every other removal gets one. Deleting a job, editing a different job, then clicking Undo restores a pre-deletion snapshot and silently reverts the intervening edit. Quitting 1s after typing loses the last edit with no warning.

**Sam (accessibility):** cannot reorder anything — every handle is a non-focusable `<span draggable>`, and CV bullet order is unreachable. The only focus signal across ~60 inputs is a 1px border colour change. The `role="status"` save indicator re-announces on every debounce cycle. Five tab stops per language row announced as "3 of 5" with no unit. No `<h2>`/`<h3>` anywhere, so heading navigation — the primary way a screen-reader user skims a 16-section form — does not work.

## Minor Observations

- Hardcoded English in a 7-locale app: `CEFR_LABELS`, `SKILL_GROUP_SUGGESTIONS`, `LINK_SUGGESTIONS`, the custom-section placeholder, plus BulletListEditor's "+ Add"/"Drag to reorder", TagInput's placeholder and hint, StarRating's "Proficiency", RemoveButton's "Remove".
- Worse than a UI leak: `CEFR_LABELS[n]` is written into `l.label` — profile *data*, printed on the CV. A Dutch CV shows "B2/C1 Advanced".
- Section vocabulary drifts: certifications/courses/memberships are bare rows; awards/grants get cards; teaching gets cards but no `count`.
- `renderOptional` returns undefined for unrecognised keys, so a stale `enabled_sections` entry renders nothing with no way to see or clear it.
- Multi-line paste into BulletListEditor produces one bullet containing newlines rather than splitting — the most common way anyone moves an existing CV in by hand.
- `saveState` starts `idle`, rendering nothing; a resting "All changes saved" would be more reassuring than blank.

## Questions to Consider

1. If every section says "On your CV", why is any of them saying it? What would this page look like if the accent were spent on the one action you actually want clicked next?
2. What tells someone they're done? There is no completion signal and no exit toward the payoff — the page ends on "+ Add a section". If the profile is meant to outlive any single job search, shouldn't finishing it feel like reaching somewhere?
3. Is the core/optional split reducing load, or moving it? What if optional sections were offered contextually — Publications surfacing once a CV is tailored for an academic posting — instead of as a menu shopped through at the end of the grind?
