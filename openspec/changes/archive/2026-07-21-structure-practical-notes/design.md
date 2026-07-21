## Context

The Preferences page (`frontend/src/pages/Preferences.tsx`) is a flat five-question
form. Q5 ("Anything practical we should check?") is one `<textarea>` bound to
`preferences.notes`. The sub-line already lists what it wants — salary, contract type,
hours, start date, travel — which is exactly the signal that structured controls capture
better than prose. `preferences` is a flat object; `target_roles` was added to it
additively (defaulted in `normalize_profile`, no version bump). The whole `preferences`
object is passed to the job-review call (`job_scanner.py`) and the cover-letter guide
(`letter_guide.py`); `role_brief()` (`cv_renderer.py`) hand-builds labelled lines from it
for the generic application.

## Goals / Non-Goals

**Goals:**
- Make the practical question self-explanatory via dedicated, enumerable controls.
- Give the AI named keys instead of loose prose.
- Keep a free-text escape hatch for everything the fixed controls don't cover.
- Migrate existing profiles transparently, with no data loss.

**Non-Goals:**
- No schema version bump (fields are additive; migration is idempotent defaults).
- No new API endpoints, DB columns, or dependencies.
- No new shared component library work — reuse existing `Segmented` and inline a minimal multi-toggle.
- Not parsing/rewriting existing `notes` prose into the new fields (kept as-is under "Anything else").

## Decisions

**Flat additive fields, not a nested `practical` object.** `preferences` is already flat
(`looking_for`, `avoid`, `locations`, `remote`, `notes`). Adding `employment_types`,
`hours`, `salary`, `availability`, `travel` as siblings matches the existing shape and
the `target_roles` precedent, and keeps `normalize_profile` to five `setdefault` lines.
A nested object would need extra migration plumbing for no benefit.

**Keep `notes`, relabel it "Anything else".** The existing free-text field becomes the
catch-all the user asked to retain. Because we don't parse old prose into the new
structured fields, old answers survive untouched and are still surfaced — the safe,
lossless path. Alternative (parse `notes` → fields via LLM) was rejected: costs a call,
can misclassify, and the user can just re-enter anything they want structured.

**Canonical English storage for single-choice fields.** `hours` and `travel` store their
English option string (like `remote` stores `'Remote'`/`'Hybrid'`), so the LLM reads
stable values regardless of UI language. Reuse the existing `Segmented` radiogroup.

**Employment type is a minimal inline multi-toggle.** No existing multi-select-chip
component exists (`Segmented` is single-select, `TagInput` is free-text). A ~15-line
toggle-chip group over a fixed enum is clearer than free-text tags and small enough to
inline. `aria-pressed` toggle buttons in a labelled `role="group"`.

**LLM wiring is mostly free.** The job review and letter guide already receive the whole
`preferences` object, so the new keys appear automatically — no prompt edits (the forced
tool schemas are unaffected; new keys are self-describing JSON). Only `role_brief()`
needs new labelled lines, since it hand-picks fields.

## Risks / Trade-offs

- [Old `notes` prose stays unstructured] → Acceptable: it's now explicitly the "Anything else" box; users can move details into the new fields at will. No forced migration means no misclassification risk.
- [Two more single-choice widgets add page length] → Grouped under the one practical card, so the page stays five questions; the controls replace a box that gave no guidance.
- [LLM ignores empty fields] → `role_brief()` omits unset fields (same pattern it already uses); the review call sees empty strings/arrays, which are self-evidently "no preference".

## Migration Plan

`normalize_profile()` gains five `setdefault`s in the `preferences` block (idempotent).
No version bump; v5 files pass through and the next auto-save persists the new keys. A
one-line assertion (normalize seeds the keys and is idempotent) is the check left behind.
Rollback is trivial — the extra keys are inert for any older code path.
