## Context

`CVEditor.tsx` renders the CV tab as seven stacked blocks. Three of them edit the same
`CVPlan` through the same `editPlan` → debounced single-flight `putCVPlan`:

| Block | Container | Save feedback | Writes |
|---|---|---|---|
| Sections | `.editor-clusters` board, `Collapsible flat`, closed | none | `hidden_sections` |
| "AI left out" chips | same disclosure, below the checkboxes | none | `excluded_sections` |
| Skills | same board, second disclosure, closed | none | `hidden_skills` / `excluded_skills` |
| Summary + bullets | separate `1px solid --line` panel, always open | "Saving…/Saved" | `summary`, `roles[]` |

So the save state lives in the one container that owns a quarter of the edits, and the
sections list is split from the content the sections hold. The row list already exists in the
right shape and order: `readSections()` reads `[data-section]` out of the preview iframe and
unions it across reloads, because the server omits hidden sections from the HTML.

Constraints: the page is capped at 880px (`.page-container`) and the CV is a 794px A4 sheet
already scaled to fit, so a side-by-side layout is not available without widening the whole app.
DESIGN.md: depth is tonal (no resting card chrome), a list is one `--board` panel split by
hairlines, data is `--data-font`, accent is rationed to real actions/selections.

## Goals / Non-Goals

**Goals:**
- One surface, one row per CV section in CV order, each row owning both its presence and its content
- One save state for every edit, announced as well as drawn
- An expanded row adjacent to the preview, refreshing it without losing the reader's place
- A single restore action regardless of who took a section off
- The a11y defects in the markup being replaced fixed as part of replacing it, not inherited

**Non-Goals:**
- Any backend, `PlanEdit`, template, or persistence change — the same fields, the same save
- Side-by-side preview, or widening the app's one content width
- Editing the profile from here; the plan is per-CV and the profile stays the superset
- Changing what the model decides, or the skills controls' visual vocabulary (`cv-skills` is
  unchanged; the group and per-skill controls move into the Skills row keeping their look, and
  gain only the textual provenance the rest of the surface uses)
- The wider Applications page outline — this change touches one `headingLevel` prop on the
  application row, the level directly above the editor, and nothing else on that page

## Decisions

**One purpose-built row, not `Collapsible`.** A row carries two independent controls — a
checkbox and a disclosure — and `Collapsible`'s entire header is a single `<button>`. Nesting an
`<input>` in a button is invalid HTML and swallows the click, and `extras` puts the checkbox to
the *right* of the name, which inverts the control it labels. So the CV editor gets its own
`.cv-row`: `<input type="checkbox">` + `<button aria-expanded aria-controls>` (name + chevron) +
a muted mono meta cell. This is a different pattern from `Collapsible`, not a second copy of it.
*Alternative rejected:* keeping `Collapsible` and moving the checkbox into the body — the
control would then be unreachable without expanding the row, which is the one thing every row
must offer.

**Accordion, one row open at a time.** With the surface above the preview, two tall rows open at
once (Career Path + Skills) would push the preview off screen, defeating the placement. One
`useState<string | null>` holds the open key. *Alternative rejected:* independent expansion —
simpler state, but it re-creates the distance the placement change exists to remove.

**`toggleSection` and `restoreSection` collapse into one.** Ticking a row clears the key from
**both** `hidden_sections` and `excluded_sections`; unticking adds it to `hidden_sections`. This
is exactly what `setSkills(names, show)` already does one level down, so the two levels finally
behave alike and the restore-chip row disappears. Provenance is carried as text on the row
("AI left out" / "you removed it"), not by style alone — a struck-through label is not
answerable by a screen reader.

**Row list gains `excluded_sections`.** `readSections()` already unions the DOM keys with
`hidden_sections`; excluded sections are absent from the DOM for the same reason and are added to
the same union. Keys never seen in the DOM (hidden or excluded on first render — `photo` is the
common one) append after the CV-ordered keys; the accumulated order is stable across reloads, as
today.

**Content per row is a `switch` on the key**, with a default of no body: `summary` → the textarea
plus the AI-summary action, `experience` → the `BulletListEditor` per role, `skills` → the
existing `.skill-group` markup. A new template section therefore still needs nothing here beyond
its `cveditor.sections.<key>` label, which is the property the current design already has.
Rows without a body render no chevron and no `aria-expanded`.

**Block order on the tab becomes:** job strip → actions (Update with AI · Download PDF ·
Refresh) → tailoring notes → AI caveat → photo nudge → **editing board** → **preview**. The
actions move above because they act on the document, not on an edit; that keeps the editing board
in direct contact with the preview. The AI caveat stays a boundary marker — everything below it,
board and preview alike, is model-written.

**Accessibility is rebuilt with the markup, not appended to it.** An impeccable `audit` of the
code being replaced scored a11y 1/4 — `CVEditor.tsx` contains zero occurrences of `aria-live`,
`role="status"`, `htmlFor`, or `headingLevel` across 549 lines. Every one of those defects is in
the markup this change rewrites, so shipping the rewrite without them would rebuild them:

- **Outline:** the board title is an `<h3>`; each expandable row wraps its disclosure button in an
  `<h4>`. Those sit under the application row's `Collapsible`, which gains `headingLevel={2}` in
  `Applications.tsx` — one prop, and without it the `<h3>` skips a level. Rows with no body get no
  heading; they are controls, not regions.
- **Names:** the summary textarea gets a real `<label htmlFor>` instead of today's
  `<div class="editor-cluster-label">` sitting above it. The row checkbox is named by the section
  label, the disclosure by the same label plus its count.
- **Announcement:** the board header's save state becomes `role="status"`, and the regeneration
  overlay — 30 seconds of silence today — becomes one too, carrying the stage text it already
  renders. Errors get `role="alert"`.
- **Targets:** `.skill-toggle` (~24px), `.chip-restore` (~22px) and the inline-styled AI-summary
  button (`padding: 3px 8px`) sit at or under the WCAG 2.2 2.5.8 minimum with 6px gaps that do not
  earn the spacing exception. They are brought to 24px — the same reasoning already applied to
  `.tag button` in `index.css`.

**Skill provenance becomes text too.** The first cut of this design moved the skills controls in
"as-is", which would have left the surface carrying two provenance conventions: text for sections,
strike-vs-dash for skills. Both skill states announce as `aria-pressed="false"` today and are
indistinguishable to a screen reader. The visual vocabulary stays exactly as it is — it works, and
`cv-skills` describes it — and gains a textual carrier alongside it, so section and skill
provenance read alike. `cv-skills`' requirements are unaffected: they say the editor distinguishes
the three states, not how.

**The preview stops resetting the reader's place.** `runSave` bumps `previewKey`, remounting the
iframe: a fresh fetch and a scroll jump to the top of the CV, ~1.5s after the user stops typing.
At 80vh below the editor that was tolerable; adjacent and in view it is disorienting. Two changes,
both small: capture `contentWindow.scrollY` before the reload and restore it `onLoad`, and drop
the reload entirely for section visibility changes — `toggleSection` already applies those to the
preview's DOM directly, so the reload only ever undid and redid its own work. Text and skill edits
still re-render, now without losing the reader's position. *Alternative rejected:* refreshing on
blur instead of on save — it decouples "saved" from "shown" and adds a rule the user has to learn.

**`applyScale` stops thrashing.** It writes `zoom: 1`, reads `scrollWidth`, then writes the real
zoom — a forced synchronous layout on every `ResizeObserver` callback. The unscaled width only
changes when the document does, so it is captured once in a ref at `onLoad` (when zoom is
already 1) and the resize path becomes a pure read of `clientWidth` and one write.

**Visuals follow DESIGN.md with no new tokens:** one `--board` panel, `--r-panel`, rows split by
`--line`, header carrying the title, the `N of M` count in `--data-font`, and the save state. The
bordered content panel and `.chip-check` / `.chip-restore` / `.editor-clusters` retire —
`editor-cluster-label` and `cluster-count` stay, they have other callers.

## Risks / Trade-offs

- **The preview is no longer the first thing on the tab** → the board is collapsed by default and
  each row is one line, so it reads as a table of contents for the CV below it rather than a wall
  of controls; the count in its header states at a glance what is on the CV.
- **Losing the always-open summary textarea costs one click** → the summary row is the first row
  and the only one open on first load, so the most-edited field stays where it was in reach.
- **Section labels do double duty**, naming both a CV block and the editor that fills it → they
  already do (`cveditor.sections.*` is what the current checkbox row shows) and the row shows the
  section exactly as the CV names it, which is the point of the change.
- **A section can be turned off while it holds unsaved text** → presence and content are separate
  plan fields; turning a section off never clears `summary` or `roles[]`, so the edits are still
  there when it comes back. Pinned by a scenario.
- **Regression risk in the union order** → the existing "wait for a non-empty DOM read" guard is
  what keeps the row order in CV order rather than leading with hidden keys; it must survive the
  rewrite, and gets a test-by-inspection note in tasks.
- **`role="status"` on the save state could chatter**, announcing on every debounce cycle → it
  announces the settled states (saved, failed), not the transient "saving" tick, so a typing burst
  produces one announcement rather than one per pause.
- **Cached unscaled width goes stale if the document reflows without a load** → the CV is a static
  rendered document in an iframe; it reflows on load and on container resize, and the resize path
  divides by the cached width rather than re-measuring, which is the point. A reload (any text or
  skill edit) re-captures it.
- **The a11y work grows the diff** beyond the structural change the proposal opens with → it is
  confined to the markup being rewritten anyway, plus one prop in `Applications.tsx`; none of it
  is a second refactor, and deferring it would mean rewriting this surface twice.

## Migration Plan

Pure frontend replacement of one component's lower half. No data migration: stored plans carry
the same fields and older plans with `excluded_sections` render as unticked rows immediately.
Rollback is reverting the commit.

## Open Questions

None.
