# Profile v3 restructure — implementation plan

Status: approved by owner (2026-07-09), ready to implement.
Scope: profile schema v3, a new Job Preferences page, questionnaire-residue pruning,
and a real data contract for what each AI pipeline receives.

## Why (context for the implementer)

The profile schema grew out of a personal questionnaire and it shows:

1. The `cv`/`ai`/`jobs` section badges are decorative — `tailor()` in
   `app/services/cv_generator.py` dumps the **entire profile JSON** (salary,
   commute radius, design prefs) into the CV prompt, while the job filter in
   `app/services/job_scanner.py` uses a separate hand-trimmed dict.
2. Dead fields: `cv_design_preferences` has 10 keys but only `accent_color` and
   `include_photo` are ever read (Settings UI + `templates/cv/default.html`).
   `personal.keywords` is never printed and never sent to the job filter.
3. Over-structured sections: `academic` (6 sub-structures, never read by the job
   filter despite its "ai" badge) and `teaching` (6 sub-forms that render as one
   model-generated line). `academic.topics_to_teach` duplicates
   `teaching.subjects_to_teach`.
4. Per-experience AI notes are doubled: `relevance_note` vs `ai_context` — both
   free-text notes to the model, distinction too subtle for users.
5. Job-preference data (`work_preferences`, `narrative`) is scattered across the
   Profile page (one core section, one hidden optional section) even though it is
   the primary input to job matching.

## Decisions (already made — do not re-litigate)

- **Separate "Job Preferences" page** in the sidebar (Profile keeps only CV data).
  Storage stays one `profile/profile.json` — this is a UI split, not a data split.
- **Simplify `academic` and `teaching` but keep them structured** (2–3 fields each).
- **Prune**: merge the two per-experience AI-note fields into one; drop
  `personal.keywords`; trim `cv_design_preferences` to `accent_color` +
  `include_photo`. (Grants year triple stays as-is — explicitly declined.)
- **CV tailoring receives CV data + narrative, never `work_preferences`/salary.**
- Rendering of teaching on the CV is unchanged (model-written one-liner via
  `include_teaching`/`teaching_summary`); only the *input* structure shrinks.

## 1. Schema v3 (`career-profile-v3`)

Extend `normalize_profile()` in `app/services/cv_renderer.py` with an
idempotent v2→v3 step (same in-memory-upgrade pattern as v1→v2; persisted on
next auto-save). Bump `meta.schema` to `career-profile-v3`, `meta.version` to
`"3.0"`. `blank_profile()` produces the v3 shape directly.

Changes:

| Key | v3 shape | Migration from v2 |
|-----|----------|-------------------|
| `experience[].ai_notes` | single free-text string, never printed | join `relevance_note` + `ai_context` with `\n` (skip empties); delete both old keys |
| `personal.keywords` | **removed** | delete key |
| `cv_design_preferences` | `{accent_color, include_photo}` only | keep those two, delete the rest |
| `academic` | `{research_areas: string[], research_themes: string}` | fold `methods` groups, `interdisciplinary_work`, and `collaborators` into `research_themes` as appended readable lines (e.g. `"Methods — Computational modelling: Regression models, Bayesian inference"`); `topics_to_teach` merges into `teaching.subjects_to_teach` (union, order-preserving); delete the old keys |
| `teaching` | `{subjects_to_teach: string[], entries: [{type, course, institution, years, description}], notes: string}` | `formal_experience` → `entries` as-is; each `guest_lectures` item → an entry with `type: "Guest lecture"`; `student_supervision`/`mentoring`/`educational_materials` → concatenated into `notes` (labelled lines); keep `cv_summary` passthrough behaviour used by `apply_tailoring` |
| `narrative`, `work_preferences` | unchanged shape | none (they move pages, not keys) |
| `meta.enabled_sections` | drop `career_context` if present (its content moves to the Preferences page and is no longer an optional section) | remove from the list |

v1 files still work: v1→v2 runs first, then v2→v3.

Update `profile/profile.example.json` to the v3 shape. Update
`app/services/cv_importer.py` to emit v3 (no `keywords`, single `ai_notes`,
simplified academic/teaching if it extracts them).

## 2. AI data contract (backend)

Add one function in `cv_renderer.py` (or `cv_generator.py`):

```python
def profile_for_tailoring(profile: dict) -> dict:
    """Everything the CV-tailoring model may see: printable sections + narrative
    + per-role ai_notes. Never work_preferences, cv_design_preferences, or meta."""
```

Implemented as a copy minus `{"work_preferences", "cv_design_preferences", "meta"}`.
Use it in `tailor()` instead of the raw dump. The job filter's trimmed dict in
`filter_openings()` stays as-is (it already excludes CV detail) — just confirm it
still matches v3 keys.

Prompt text: `DEFAULT_CV_PROMPT` says "Use the experience relevance notes" —
reword to reference the single AI-notes field. Existing stored prompts in user
config are free text; no migration needed.

## 3. Frontend

### New page: `frontend/src/pages/Preferences.tsx`
- Sidebar entry + route (mirror how `Jobs.tsx` is wired in the app shell/router),
  between Profile and CV Generator.
- Sections: **"What I'm looking for"** (`narrative.looking_for`,
  `target_industries`, `differentiation`, `problems_enjoyed`, `work_to_avoid` —
  the current `career_context` fields) and **"Practical preferences"**
  (`work_preferences`: locations/remote, contract types, schedule, availability,
  travel, language preferences, organisation preferences, salary block — reuse
  the existing JSX from Profile.tsx's work_preferences section).
- Auto-save: extract Profile.tsx's debounced single-flight save (`set`, `applyPath`,
  save-state header, undo-toast `removeItem`) into a shared hook, e.g.
  `frontend/src/lib/useProfileAutosave.ts`, used by both pages. Both pages PUT the
  whole profile; that's fine for a single-user app (pages unmount on navigation).
- Page header shows the same save-state indicator as Profile.

### Profile page (`frontend/src/pages/Profile.tsx`)
- Remove the Work Preferences core section and the `career_context` optional
  section (moved to Preferences).
- Remove the `keywords` field from Personal.
- Experience card: one "Notes for the AI" textarea (`ai_notes`) with an explicit
  "never printed on your CV" hint, visually distinct from CV fields (e.g. the
  existing help-text style + an `ai` Badge inline).
- Academic section: two fields (research areas TagInput, research themes
  textarea). Teaching section: subjects TagInput + entries list (one card shape:
  type, course, institution, years, description) + notes textarea.
- Badges: with preferences gone, every Profile section prints on the CV except
  `academic` — keep the Badge component but only `cv` and `ai` appear on Profile;
  `jobs` badge moves conceptually to the Preferences page (can drop the chip
  there entirely — the page *is* the distinction).

### Registry + types
- `frontend/src/lib/profileSections.ts`: remove `work_preferences` from
  `CORE_SECTIONS` and `career_context` from `OPTIONAL_SECTIONS`.
- `frontend/src/types.ts`: v3 shapes (`ai_notes`, no `keywords`, new
  `Academic`/`Teaching`, 2-key `CvDesignPreferences`).
- i18n: update `frontend/src/locales/en.json` (new page title/labels, removed
  keys); regenerate shipped locales with
  `uv run python scripts/translate_locales.py`.
- Settings.tsx: unchanged (it already only edits the two live design keys), but
  fix its `Profile` type usage if the TS type shrinks.

## 4. Tests & docs

- `tests/test_hardening.py` (or a new small test file): v2→v3 migration
  round-trip on the old example fixture — asserts merged `ai_notes`, folded
  academic/teaching text, dropped keys, idempotency (running twice = once), and
  that `profile_for_tailoring()` output contains no `work_preferences`/salary.
- Update `CLAUDE.md` (schema table, endpoints/pages, "Profile section model"
  description) and `README.md` (new Preferences page) in the same change.

## Order of work

1. Backend: v3 migration + `blank_profile` + `profile_for_tailoring` + tests.
2. Frontend types + registry + extract autosave hook.
3. Preferences page + Profile page edits.
4. i18n keys + locale regen; example profile; docs.

## Non-goals

- No storage split (one profile.json stays).
- No change to CV teaching rendering or the `include_publications`/
  `include_teaching`/`excluded_sections` gates.
- No grants field changes.
- No interactive-preferences features yet (this restructure just gives them a page).
