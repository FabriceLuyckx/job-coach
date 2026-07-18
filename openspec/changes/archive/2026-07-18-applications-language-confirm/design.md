## Context

The `applications-language` spec already commits to auto-reverting the
language control and preserving successfully-generated artifacts on failure
(see "Failure is reported without data loss"). The gap this change closes is
upstream of failure handling: nothing warned the user *before* a language
change deleted their existing letter, even on success.

## Goals / Non-Goals

**Goals:**
- Warn before the one destructive step (letter deletion + regeneration) on
  language change, without adding friction to the common non-destructive case.

**Non-Goals:**
- Redesigning the language-change flow itself (re-tailor/regenerate, revert
  on partial failure) — unchanged, already spec'd.
- A general confirmation framework for other destructive actions on the page
  (deleting an application/letter already has its own Undo-toast pattern,
  which is a different, non-blocking mitigation and stays as-is).

## Decisions

**Confirm-before via the shared `Modal` primitive, not an inline strip.**
Considered an inline confirm bar under the language `<select>` instead
(lighter, avoids an overlay). Kept the modal: it reuses the same
confirm-before-AI-regeneration pattern already shown for the CV "Re-tailor
with AI" action (`CVEditor.tsx`'s `showRegen` modal), so the two AI-triggered,
partially-destructive actions on this page look and behave identically —
consistency won over marginally less friction for the rare user who changes
language often. `Modal` already provides focus trap, Esc-to-close, and
backdrop click, so no new interaction pattern was introduced.

**Confirmation is conditional on `letter` existing, not blanket.** A CV-only
change re-tailors in place with edits preserved and is cheap to reverse
(re-picking the old language re-tailors back); gating it behind a confirm
would be friction with nothing destructive to justify it. Only the
letter-exists branch prompts.

**No partial "undo" after the fact.** Considered routing the deleted letter
through the existing `scheduleDelete`/5s-Undo pattern used elsewhere on the
page instead of a before-the-fact confirm. Rejected: undoing the letter
deletion alone would leave the CV re-tailored into the new language while the
restored letter stayed in the old one — a coherent undo would also need to
revert the CV's language (another AI call), which the existing Undo pattern
has no mechanism for. Prevention-before-the-fact is the honest fix; a
misleading partial-undo is worse than no undo.

## Risks / Trade-offs

[Extra click for users who already know the letter will regenerate] →
Accepted; the action is genuinely destructive (deletes generated content) and
costs AI tokens/time to redo, so the safety default outweighs the minor
friction. No "don't ask again" affordance was added — out of scope for this
change, revisit only if user feedback asks for it.
