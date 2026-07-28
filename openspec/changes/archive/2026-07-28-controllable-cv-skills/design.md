## Context

The skills block is untailored: `apply_tailoring` leaves `skills.groups` alone and `skills` is
absent from `_EXCLUDABLE`, so the profile's whole skill set prints on every CV and the only
per-CV escape is the editor's all-or-nothing section toggle. Sections solved this already —
`excluded_sections` carries the model's judgement, `hidden_sections` carries the user's, and
`CVEditor` renders the first as `chip-restore` ("AI left out: … ↺") and the second as
`chip-check` toggles. This change applies that same pair one level down, to individual skills.

Constraints worth stating: the local 4B engine grammars on the *tool schema*, and CLAUDE.md
already records what free-form fields cost there (`sidebar_translations` answered with category
buckets until its keys were enumerated per call); skill **names** are deliberately never
translated (`_translatable()` offers group labels, not items), so one stored English string is
valid in every language's CV; plans are per-language JSON in an existing column, so nothing here
needs a migration; and `_retailor(keep_edits=True)` already carries `hidden_sections` onto a
fresh plan, which is the pattern to follow rather than invent.

The user has asked for AI selection with full manual override, having heard the objection that
an AI silently removing a skill is a bad failure mode. The design answers that objection with
visibility rather than prohibition: everything the model drops is listed in the editor and
restorable in one click, and the model can only name skills that actually exist.

## Goals / Non-Goals

**Goals:**
- The model decides which skills belong on a CV for a given job, groups included.
- The user can restore anything it left out and remove anything it kept, without touching the
  profile.
- A dropped skill is never invisible: the editor names it.
- The choices follow the application, including across a language change.

**Non-Goals:**
- Any form of AI-chosen emphasis. Highlighting is deleted here rather than kept or deferred: it
  marked skills the user had no control over, which is the failure this change exists to fix one
  field over. The dataclass field stays only so older stored plans deserialize.
- Reordering or renaming groups, or editing skill text per CV — the profile owns the vocabulary.
- Writing anything back to `profile.json`.

## Decisions

**Mirror the sections model exactly: `excluded_skills` (model) + `hidden_skills` (user).** Two
lists, each with one owner, composing as `visible = profile skills − excluded − hidden`.
Restoring removes from `excluded_skills`; removing adds to `hidden_skills`. *Alternative
rejected:* one merged list seeded at generation and owned by the editor afterwards (the
`include_photo` → `hidden_sections` pattern). It is one field fewer, but it erases provenance —
and "what did the AI leave out?" is precisely the question the editor has to answer.

**No separate group field.** A group disappears when nothing in it is visible, so "drop the Soft
skills group" is expressible as its items, and the editor derives the group-level restore chip
by noticing that every item of a group is excluded. *Alternative rejected:* a parallel
`excluded_skill_groups`; a third list to keep consistent, for a case the first list already
covers.

**The model's choice is an enum of the profile's exact skill strings, built per call**, the way
`_tool_for()` already enumerates translatable strings. For the local engine this compiles to a
grammar, making a hallucinated or near-miss name unrepresentable — a *selection* that fails to
match would silently delete a real skill. Free text plus fuzzy matching would put that failure
one bad string away.

**Fail open, twice.** A name that still doesn't resolve is ignored and its skill stays on the
CV; a response that would exclude every skill is discarded whole. Both directions of failure
must leave more on the CV, never less. The resolver (casefold, strip, collapse whitespace, and
the profile side with any parenthetical removed) stays as a safety net for non-conforming
providers, not as the primary mechanism — narrow on purpose, since `"R"` must never match
`"React"`.

**Per-CV choices carry into a new language's plan.** `_retailor` seeds both lists from an
existing plan for that CV before falling back to the model's fresh selection. A skill removed
for *this application* should not return because the CV switched to Dutch, and skill names are
language-independent. Regenerate keeps its existing contract: keep-edits preserves,
regenerate-all re-selects.

**The editor shows one row per group: the group name as its own on/off control, then every
skill of it as a tap-to-toggle tag.** A skill off the CV is struck through when the user removed
it and dashed when the AI left it out, so provenance is legible without a second list. This
replaced a first cut that reused `chip-check` per skill and a separate `chip-restore` row: at 40+
skills that was a wall of checkbox pills, and it gave no way to drop a group in one action.
Both disclosures now sit on one `--board` panel split by a hairline, per DESIGN.md's
"one tonal board" rule — stacked bare they read as one cramped block.

## Risks / Trade-offs

- **The AI drops a skill the user considers essential** → it is listed as left out and restored
  in one click; nothing is lost, and the restore survives a keep-edits regenerate.
- **The user never opens the disclosure and doesn't notice a drop** → the header carries a live
  count of what is on the CV out of the profile total, the way the section row already does, so
  a shrunken skill set is visible without expanding anything.
- **A small model over-excludes** (returns half the profile as irrelevant) → the degenerate case
  is refused outright; short of that the user sees the leftovers and restores. If it proves
  chronic, the lever is a floor on how many skills may be dropped, not a smarter prompt.
- **A group toggle forgets which of its skills the user had individually removed** → turning a
  group back on returns all of it. Bounded and honest: the user just asked for the whole group.
- **A skill is later deleted from the profile** → the render composes against the current
  profile, so a stale entry in either list simply matches nothing; no cleanup pass needed.
- **Old plans have neither field** → they default to empty and render exactly as today; no
  backfill, no migration.

## Open Questions

- Whether the model should get an explicit reason to *keep* transferable skills (communication,
  teamwork) that read as irrelevant to a technical posting but rarely hurt. Cheapest fix if it
  bites is one prompt clause, not a schema change.
- Whether `hidden_sections` should carry across a language change too, now that the skill lists
  do. The same argument applies; kept out of scope to avoid changing behaviour this change was
  not asked to touch.
- Whether user-controlled emphasis is worth reintroducing later, now that AI-chosen emphasis is
  gone. Nothing in the data model blocks it; it just has to be the user's choice.
