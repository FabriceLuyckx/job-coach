## Why

The skills block is the one part of a tailored CV that nothing tailors. `apply_tailoring` never
touches `skills.groups` and `skills` isn't an excludable section, so every skill in the profile
prints on every CV — a profile built as the superset of a career lands whole on a CV for one
job. Sections already work the way skills should: the model names the ones irrelevant to the
role in `excluded_sections`, and the CV editor shows them as "AI left out" chips the user can
restore. Skills need the same treatment one level down.

Refinement of the existing AI CV generator + CV editor (CLAUDE.md phases 3–4); no new phase.

## What Changes

- **The AI selects the relevant skills.** The tailoring plan gains `excluded_skills` — the
  profile skills not relevant to this job — and the CV renders without them. A skill group left
  with nothing visible disappears, so dropping a whole group is expressible without a second
  field.
- **The model can only name skills that exist.** The field is built per call as an enum of the
  profile's exact skill strings, the way `sidebar_translations` already is, so a hallucinated or
  near-miss name is unrepresentable for the grammar-constrained local engine and rejected for
  any other. A name that still fails to resolve is ignored, leaving the skill visible.
- **The user has the final say, in both directions.** The CV editor lists every profile skill in
  its group as a tap-to-toggle tag — struck through when the user removed it, dashed when the AI
  left it out — and the group's own name is the control that takes the whole group off the CV or
  puts it back. Restoring or removing a skill never touches the profile.
- **The profile stays the superset.** Nothing here writes to `profile.json`; every choice lives
  in that CV's plan, per language, and carries across a language change rather than resetting.
- **Highlighting is removed, not deferred.** `highlighted_skills` was AI-chosen emphasis the
  user could neither explain nor change, on a document going out over their name — the exact
  failure this change exists to fix, one field over. The model is no longer asked for it, no
  template marks a skill, and the dataclass field survives only so older stored plans still
  deserialize.

## Capabilities

### New Capabilities
- `cv-skills`: which skills a tailored CV shows — how the model selects them, how the user
  overrides the selection in both directions, and what a template is handed to render.

### Modified Capabilities
- `cv-templates`: the rendering contract gains the per-CV skill selection, so a template renders
  the skills it is given rather than every skill in the profile.

## Impact

- `app/services/cv_generator.py` — `TailoringPlan.excluded_skills` / `hidden_skills`, the
  per-call enum in `_tool_for`, one prompt line, resolution + visible-skills helper
- `app/api/cv.py` — `PlanEdit` accepts both lists; `PUT /api/cv/plan/{id}` persists them;
  `_retailor` carries the user's choices into a new language's plan
- `templates/cv/_sections.html` — render the visible skills, drop emptied groups and an emptied
  section
- `frontend/` — `CVEditor.tsx` skill chips reusing `chip-check` / `chip-restore`, `api.ts`
  types, new `en.json` keys (locales belong to the pre-commit hook)
- `tests/` — enum construction, resolution, selection, persistence, language carry-over,
  per-template rendering
