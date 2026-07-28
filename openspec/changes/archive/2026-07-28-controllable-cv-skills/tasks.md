## 1. The model's selection

- [x] 1.1 Add `excluded_skills: list[str]` and `hidden_skills: list[str]` to `TailoringPlan`
      (both default empty), and a `visible_skills(profile, plan)` helper returning the profile's
      groups minus both lists, with emptied groups omitted
- [x] 1.2 In `_tool_for()`, add `excluded_skills` as an array whose items enumerate the
      profile's exact skill strings, mirroring how `sidebar_translations` enumerates
      translatable strings; omit the field when the profile has no skills
- [x] 1.3 Add `resolve_skills(profile, names)` beside `apply_tailoring`: normalize (casefold,
      strip, collapse inner whitespace), also compare the profile side with any parenthetical
      removed, return canonical profile strings, drop what does not resolve; carry the
      `ponytail:` note that this is a safety net for non-conforming providers, the enum is the
      mechanism
- [x] 1.4 In `_plan_from_tool_call`, resolve `excluded_skills` and discard the list entirely if
      it would leave no visible skills (fail open in both directions)
- [x] 1.5 Add one `DEFAULT_CV_PROMPT` line for selecting relevant skills, in the shape of the
      existing `excluded_sections` line
- [x] 1.6 Remove skill highlighting entirely: drop `highlighted_skills` from the tool
      schema, the prompt, the render context and every template's `.tag.key` styling;
      keep the dataclass field defaulted so older stored plans still deserialize

## 2. Persisting the user's overrides

- [x] 2.1 Add `excluded_skills` and `hidden_skills` (`list[str] | None`, `None` = unchanged) to
      `PlanEdit` in `app/api/cv.py`, matching the `hidden_sections` convention
- [x] 2.2 In `put_plan`, resolve both lists, then persist and re-render as the existing
      edits do
- [x] 2.3 Return both lists from `GET /api/cv/plan/{id}`
- [x] 2.4 In `_retailor`, seed both lists from an existing plan for that CV before falling back
      to the model's fresh selection, so a language change keeps the user's choices; leave the
      keep-edits / regenerate-all contract otherwise unchanged

## 3. Rendering

- [x] 3.1 Pass the visible skills into the render context — done in `apply_tailoring`
      (`p["skills"]["groups"] = visible_skills(...)`) rather than as a second context
      variable in `_render_html`: `_render_html` already splats the tailored profile,
      so this is the same context with one fewer name to keep in step, and the CLI
      render path gets it for free
- [x] 3.2 In `templates/cv/_sections.html`, render the visible skills, skip a group left empty,
      and omit the section when no group survives — the template does no matching of its own

## 4. CV editor

- [x] 4.1 Add both lists to the plan types and save payload in `frontend/src/api.ts`
- [x] 4.2 In `frontend/src/components/cv/CVEditor.tsx`, add a skills disclosure below the
      section row: one hairline-split row per profile group, each skill a tap-to-toggle tag,
      with a live "on this CV / in your profile" count in the header
- [x] 4.3 Render an off-CV skill in place rather than in a second list: struck through when the
      user removed it, dashed when the AI left it out, with the count of the AI's leftovers in
      the header — and make the group name itself the whole group's on/off control
- [x] 4.4 Wire both actions into the existing plan edit/auto-save path so a change re-renders
      the preview like the section toggles do
- [x] 4.5 Add the new UI strings to `frontend/src/locales/en.json` only — the pre-commit hook
      owns every other locale; never run `scripts/translate_locales.py`

## 5. Tests

- [x] 5.1 The tool schema enumerates exactly the profile's skill strings, and omits the field
      for a profile with no skills
- [x] 5.2 `resolve_skills`: case/whitespace differences resolve, a parenthetical profile entry
      resolves, `"R"` does not match `"React"`, an unknown name is dropped
- [x] 5.3 Fail-open: an unresolvable exclusion leaves its skill on the CV, and an exclusion of
      every skill is discarded whole
- [x] 5.4 `PUT /api/cv/plan/{id}` persists both lists and leaves each untouched when its field
      is omitted
- [x] 5.5 `_retailor` carries both lists into a new language's plan
- [x] 5.6 Per template: excluded skills do not render, a group emptied by them prints no
      heading, and the section disappears when nothing is visible

## 6. Documentation

- [x] 6.1 Update the CV-templates / tailoring section of `CLAUDE.md`: the two skill lists and
      who owns each, the per-call enum and why, the fail-open rules, the language carry-over,
      and that highlighting is gone
- [x] 6.2 Update `README.md` to say the AI picks the skills that fit each job and the user can
      restore or remove any of them, with the profile unaffected
