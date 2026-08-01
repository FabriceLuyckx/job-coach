## Why

Everything a user changes about a generated CV goes through one plan and one auto-save, but the
editor presents it as three unrelated things: section checkboxes and skill tags in a tonal board
of disclosures, the summary and role bullets in a separate bordered panel below it, and the
AI's dropped sections as restore chips in a third shape. Only the text panel reports whether
anything saved, so toggling a skill or a section gives no feedback at all. The split is by *kind
of edit*; the user's mental model is *part of the CV* — so the summary's on/off switch and its
text sit in different places, and so do the skills section's switch and its skills.

Refinement of the Phase 4 CV editor (CLAUDE.md); no new phase, no backend behaviour change.

## What Changes

- **One editing surface, one row per CV section, in CV order.** The editor mirrors the document:
  each `data-section` key is a row carrying its own on/off control, and a row with editable
  content expands into it — Summary into its textarea and the AI-summary action, Career Path into
  the per-role bullet editors, Skills into the group and per-skill controls it already has.
  Sections with nothing to edit are the row alone.
- **The editor moves above the preview.** An open row sits directly against the top of the
  preview instead of ~80vh below it, so an edit and its effect share a viewport. Collapsed, the
  board is a compact list and the preview is still the first substantial thing on the tab.
- **One control for "is this on the CV", whatever left it off.** A section the user removed and
  a section the AI judged irrelevant become the same unticked row, marked with which of the two
  it was; ticking it puts it back. This is the skills pattern one level up, and it retires the
  separate "AI left out" restore chips.
- **One save status for every edit**, in the board's header, serving text, sections and skills
  alike — and announced, not just drawn.
- **The separate bordered content panel is removed**, not restyled — resting card chrome in a
  system whose depth is tonal, nested inside the Applications card.
- **The surface becomes operable without sight.** An impeccable audit of the code being replaced
  scored accessibility 1/4: no heading structure, no accessible name on the summary textarea, no
  announcement of the save state or of the 30-second regeneration, provenance carried by strike
  and dash alone, and touch targets under the WCAG 2.2 minimum. Every one of those defects lives
  in the markup this change rewrites, so it is fixed here rather than left to be rebuilt intact.
- **The preview keeps the reader's place.** It reloads wholesale after every save, resetting
  scroll to the top of the CV — tolerable when it sat 80vh away, disorienting once it is adjacent
  and in view. Scroll survives the reload, and a section toggle stops triggering one at all,
  since the visibility change is already applied to the preview directly.

## Capabilities

### New Capabilities
- `cv-editing`: the editing surface for a generated CV — what is editable, how a section's
  presence and its content are controlled together, how the AI's choices are shown and reversed,
  and how edits are saved and reflected.

### Modified Capabilities

(none — `cv-skills` keeps its requirements; `cv-editing` points at it for the skills row's
contents, as `cv-templates` already does.)

## Impact

- `frontend/src/components/cv/CVEditor.tsx` — the section list replaces the two disclosures and
  the content panel; `readSections` also unions `excluded_sections` so a dropped section has a row;
  heading levels, live regions, label wiring, scroll-preserving preview reload
- `frontend/src/pages/Applications.tsx` — one prop: the application row's `Collapsible` gains
  `headingLevel`, so the editor's headings sit under a real one instead of skipping a level
- `frontend/src/index.css` — the section-list rows and their touch targets; `.chip-check` /
  `.chip-restore` / `.editor-clusters` retire if nothing else uses them
- `frontend/src/locales/en.json` — new keys, dead keys removed (locales belong to the pre-commit hook)
- No API, plan schema, template, or persistence change: the same `PlanEdit` fields, written by
  the same debounced save
