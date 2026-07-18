## Context

The Job Suggestions page is the densest surface in the app: sources, scan
controls, live progress, suggestions, a filtered-out collapsible, history
paging, search/filter, check-a-specific-job, and a profile-changed nudge all
share one scroll. Its cognitive-load checklist failed 5 of 8 items. This change
does **not** attempt to restructure that information architecture — it fixes the
places where the page's visual treatment actively contradicts its stated
product promises, plus two bugs. A larger IA rethink (see Open Questions)
stays out of scope.

## Goals / Non-Goals

**Goals:**
- Make the AI's reasoning legible wherever it appears, at WCAG AA.
- Make the filter's fallibility and appeal path visible from first run.
- Let a user triage a queue without being ejected from it.
- Restore the Rationed Accent Rule on a page that currently repeats vermilion
  once per suggestion.
- Give long-running work one announced status home.
- Fix the stuck-Cancel and colliding-source-error bugs.

**Non-Goals:**
- Merging "Filtered out" into the main list, or any list/detail restructure.
- Bulk accept/reject, keyboard queue traversal, or history search — real gaps
  (heuristics 7 scored 2/4) but separate work.
- Mobile adaptation; this is a desktop-only single-tenant tool by design.

## Decisions

**De-emphasise by surface, not by opacity.** `opacity` composites *every*
descendant toward the background, including the reason text that most needs
reading — that is what produced the ~2.4:1 figure. DESIGN.md already has the
right primitive: a `--surface-dim` fill is the documented step-down for
secondary panels, and it de-emphasises the row's *ground* while leaving its
*text* at full token contrast. The verdict icon and the "Accepted"/"Rejected"
label already carry the state, so meaning is never colour- or opacity-only.

**Accept becomes `secondary`, not a new style.** The ink-outline→ink-fill
inversion already means "chosen" everywhere else in the app (the `.seg`
control's selected state is a solid ink fill). Reusing it keeps the component
vocabulary intact while freeing vermilion. Considered keeping Accept primary
and demoting "Find new listings" instead — rejected: Accept is the repeated
element, so it is the one whose repetition breaks the rule.

**Accept marks in place; the handoff key stays.** The existing
`application_pending` localStorage handoff is what makes the Applications page
show both artifacts building, so it is still written — only the automatic
`navigate()` is dropped, replaced by an explicit "View application →" link.
This preserves the accepted-job flow for anyone who wants it while ending the
forced context switch. The Undo mirrors Reject's existing toast pattern.

**One `role="status"` region rather than per-control progress.** Progress
currently lives inside the label of the button that started it, so the button's
accessible name mutates under focus mid-press, and a scrolled-away or
result-empty state renders no progress at all. A single region under the page
title fixes all three at once and is where the source-error list and Cancel
belong too — which is also the structural fix for Bug 1, since Cancel stops
being a child of `{filteredOut.length > 0 && …}`.

**Key source errors by source id, not name.** The backend derives `name` from
hostname, so two sources under one domain collide. Ids are already available on
the source rows. Errors also get cleared at the start of a re-check, not only a
scan, so a stale error cannot outlive its scan.

## Risks / Trade-offs

[Removing the automatic redirect changes a flow users may have learned] →
The accepted row gains an explicit, visible "View application →" link and a
toast, so the destination is one click away rather than automatic; the
handoff key is unchanged so the destination page behaves identically.

[`--surface-dim` on a filtered row is a weaker visual signal than a 45% fade] →
Intended. The row should read as *decided*, not as *discarded* — the whole
point of keeping reasons is that these rows are meant to be re-examined. The
icon + text label carry the state unambiguously.

[Touching most of a 543-line file in one pass] → Sequence the tasks so each
group is independently verifiable, and keep the IA untouched so the diff stays
about treatment, not structure.

## Open Questions

- **Should `badge-deadline` keep the accent?** It is currently the only
  vermilion inside a suggestion card, which makes time pressure the loudest
  element on the page. PRODUCT.md says avoid manufactured urgency; DESIGN.md
  gives the accent to "the thing you're most likely to click next." Those
  disagree here. Left as-is in this change; flagged for an explicit decision.
- **Is "Filtered out" a separate section or the tail of one ranked list?** The
  critique's strongest structural question. Out of scope here; would make the
  trust story visible on day one without a discoverability workaround.
