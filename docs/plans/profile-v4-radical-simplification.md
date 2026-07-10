# Profile v4 — Per-Section Refinement

**Status: proposed** (2026-07-09; third revision after owner review — supersedes the
earlier "generic sections" drafts entirely). Implementer: read the whole plan before
touching code — schema, template, tailoring plan, importer, and both pages change
together.

---

## 0. Owner guarantees — read first, these override everything below

1. **No generic sections.** Every section keeps (or gains) structure **tailored to
   its topic** — typed fields with topic-specific names. Structured, topic-shaped
   data is easier for the AI to process than free text or generic
   heading/subheading rows. The only generic section is `custom_sections`, whose job
   is to be the escape hatch.
2. **Core sections are permanent.** Personal, Summary, Work experience, Skills, and
   Education are always on the Profile page — never behind an add-menu, never
   removable. Optional sections stay opt-in via the existing add-a-section menu and
   `meta.enabled_sections` (that machinery is unchanged).
3. **No functional widgets are removed.** Language star-rating (CEFR), month
   pickers, current-role/currently-volunteering checkboxes all stay as they are.
4. **Guidance is the product.** The goal is to guide users to add as much *relevant*
   information as possible in the easiest, clearest way: selects instead of
   invent-your-own-words where answers are enumerable, coaching placeholders on the
   fields users struggle with, and no future-facing preference data hiding inside
   historical CV sections. Losing low-value fields is fine ("highest quality with
   less"); losing the questions that coax information out of users is not.
5. **Optional means optional.** New fields added by this plan (grant amount/funder,
   education description, publication URL) are optional — empty stays empty, prints
   nothing, and the UI labels them "(optional)".

## 1. Design rules (apply to every section)

- **R1 — Enumerable answers get a select, not free text.** Free text yields
  inconsistent vocabulary for the AI ("Tutorial teaching" vs "tutorials" vs "TA")
  and blank-page anxiety for the user. Selects store canonical keys; the UI and the
  CV translate them.
- **R2 — Every hard-to-write field gets coaching microcopy** (placeholder or help
  text) that asks the question a career coach would ask. All i18n keys.
- **R3 — CV sections describe the past; matching data lives on the Preferences
  page.** No "what I want / what I could do" fields inside Profile sections.
- **R4 — Input effort must match CV output.** If a section collects rich structure,
  the CV renders that structure. No collecting four fields to print one AI-written
  line.

## 2. Schema — `career-profile-v4`

Same shape as v3 except the deltas below. Untouched sections: `projects`,
`volunteering`, `certifications`, `courses`, `awards`, `memberships`,
`custom_sections`, `skills` (incl. `languages`), `academic`, `cv_design_preferences`,
`meta` (incl. `enabled_sections`).

### 2.1 `teaching` — restructured (the worst offender today)

```jsonc
"teaching": {
  "entries": [ {
    "type": "course_instructor",       // enum, see below; "" allowed
    "type_other": "",                  // free text, used only when type == "other"
    "subject": "",                     // was `course` — relabel: "Subject / course title"
    "institution": "",
    "years": "",                       // free text, placeholder "2018–2019"
    "description": ""                  // coached: audience, level, group size, your role
  } ]
}
```

- `type` enum: `course_instructor`, `guest_lecture`, `tutorials_seminars`,
  `workshop_training`, `supervision`, `other`. UI: a select (labels via i18n);
  choosing "Other" reveals a small free-text input (`type_other`). CV printing uses
  new `cv_labels` keys `teaching_type_<key>` so types localize per CV language;
  `type_other` prints as-is.
- **`subjects_to_teach` is removed from teaching** (R3 — it's forward-looking
  matching data). Migration: appended to `preferences.looking_for` as a line
  ("Subjects I can teach: Data Science, Psychology, …").
- **`notes` is removed** (it was a dumping ground; supervision is now an entry
  type). Migration: appended to `academic.research_themes` as a "Teaching notes: …"
  line — AI-only, reaches tailoring, never printed. (Seeding `academic` this way
  also enables that section; acceptable.)
- **The CV now renders teaching entries as a real block** (R4): a compact list —
  type + subject, institution, years, description — styled like a lightweight
  experience list. Delete the AI one-liner machinery: `include_teaching`,
  `teaching_summary`, `teaching.cv_summary`, and the `teaching_line` fallback filter.
  Section help text changes to match ("Printed on your CV; the AI drops it for
  roles where it's irrelevant").

### 2.2 `grants` — right-sized for its topic

```jsonc
"grants": [ { "name": "", "funder": "", "years": "", "amount": "" } ]
```

- The `year`/`year_start`/`year_end` triple + multi-year checkbox die: one free-text
  `years` ("2021" or "2019–2021", placeholder shows both).
- New **optional** `funder` and **optional** `amount` (free text — "€25 000", users
  format currency themselves). Both labelled "(optional)", print only when set
  (amount in parentheses after the name/funder line). Section label stays
  "Grants & scholarships".
- Migration: `year` → `years`; `year_start/year_end` → `"start–end"`; funder/amount
  start empty.

### 2.3 `personal` — one less "who am I"

- **Drop `headline`.** `professional_title` + `summary` are enough. Migration: if
  non-empty, prepend to `summary` as its own first line (don't silently lose user
  text). Template: delete the `header-headline` block.

### 2.4 `education` — serve juniors

- Add optional `description: ""` — thesis topic, specialisation, relevant
  coursework. Coached placeholder: "Thesis topic, specialisation, or coursework
  relevant to the jobs you want (optional)". Prints as a small line under the degree
  when set. For early-career users education *is* the CV; today there's nowhere to
  put this.

### 2.5 `publications` — one gap

- Add optional `url: ""` (DOI or link). Prints as a link after the citation when
  set. Paste-a-citation stays — decomposing citations into author/year/title fields
  would be hostile; citations are a standard format the AI parses fine.

### 2.6 `narrative` + `work_preferences` → `preferences` (Preferences page)

Confirmed from the previous revision (its only consumer is the matching prompt,
where coached free text works — unlike CV sections, where template and tailoring
plan consume typed fields):

```jsonc
"preferences": {
  "looking_for": "",   // free text
  "avoid": "",         // free text
  "locations": [],     // tags
  "remote": "",        // Remote | Hybrid | On-site | No preference (select)
  "languages": [],     // tags
  "notes": ""          // free text
}
```

Migration: `narrative.looking_for + target_industries + differentiation +
problems_enjoyed` → `looking_for` (readable lines); `work_to_avoid` → `avoid`;
`commute_radius` → `locations`; `remote_hybrid` → `remote`;
`language_preferences` → `languages`; `relocation`, `contract_types`, `schedule`,
`availability`, `travel`, `organisation_preferences`, `salary` → `notes` as readable
lines ("Salary: 3500–4500 EUR/month (…)"), skipping empties. The whole `salary`
object and its six-field widget die.

## 3. Coaching microcopy (R2) — the questions survive the fields

All i18n keys; wording finalised in `en.json`. The must-haves:

| Field | Placeholder / help |
|---|---|
| `summary` | "2–4 sentences: who you are professionally, your strongest expertise, and what you're aiming for." |
| `experience[].responsibilities` (bullets) | "Start with a verb; include measurable results where you can." |
| `experience[].technologies` | relabel → "Skills & tools used in this role" (career-neutral) |
| `teaching.entries[].description` | "Who did you teach (level, group size), and what did you do?" |
| `education[].description` | "Thesis topic, specialisation, or relevant coursework (optional)" |
| `projects[].description` | "What was it, who was it for, and what was the outcome?" |
| skills group `label` | add a suggestion datalist (Technical skills, Tools & software, Soft skills, Methods, Certifiable skills) — same pattern as the links field |
| `preferences.looking_for` | "What kind of role are you looking for next? Which industries appeal to you? What sets you apart? What problems do you enjoy working on?" |
| `preferences.avoid` | "What should a job NOT have? E.g. purely administrative work, constant travel, industries you'd rule out." |
| `preferences.notes` | "Anything practical: contract type, full-time/part-time, schedule, salary expectations, travel, relocation, what kind of organisation suits you." |
| `memberships[].year` | relabel → "Since" (already partially done; make consistent) |

## 4. Migration v3→v4 (in `normalize_profile`, after the v3 step, idempotent)

Follow the established pattern: **pop/consume old keys unconditionally** so a second
pass is a no-op even though earlier pipeline steps re-pad empty defaults.

| v3 | v4 |
|---|---|
| `teaching.entries[].{type, course}` | `type` mapped to the nearest enum key by keyword match (guest→`guest_lecture`, tutorial/seminar→`tutorials_seminars`, workshop/training→`workshop_training`, supervis→`supervision`, lectur/instruct/course/taught→`course_instructor`); unmatched non-empty → `type:"other"`, `type_other:<original>`; `course` → `subject` |
| `teaching.subjects_to_teach` | line appended to `preferences.looking_for`: "Subjects I can teach: …" |
| `teaching.notes` | line appended to `academic.research_themes`: "Teaching notes: …" |
| `grants[].{year, year_start, year_end}` | `years` string ("2021" / "2019–2021"); `funder`/`amount` = "" |
| `personal.headline` | dropped if empty; else prepended to `summary` as its own first line |
| `education[]` | gains `description: ""` |
| `publications[]` | gain `url: ""` |
| `narrative` + `work_preferences` | → `preferences` per §2.6 |
| everything else | untouched |

## 5. Backend changes

- **`cv_renderer.py`** — v4 migration step; `blank_profile()` → v4 shape; delete the
  `teaching_line` filter; `_optional_has_data()` for teaching checks `entries` only;
  `profile_for_tailoring()` strips `preferences`, `cv_design_preferences`, `meta`
  (unchanged concept — the CV AI keeps seeing `academic` and per-role `ai_notes`).
  `cv_labels`: add `teaching_type_*` keys (+ translate them for all shipped locales
  in `app/i18n/cv_labels.json`; `ensure_cv_labels` covers other languages).
- **`templates/cv/default.html`** — teaching block: render `entries[]` as a compact
  list (localized type + subject, institution, years; description as a small line),
  replacing the `cv_summary`/`teaching_line` one-liner. Grants: funder + optional
  amount. Education: optional description line. Publications: optional link. Delete
  `header-headline`.
- **`cv_generator.py`** — delete `include_teaching` + `teaching_summary` (fields,
  schema, prompt rules, `apply_tailoring` handling). `excluded_sections` (extend its
  enum with `teaching`) + the existing `include_publications` gate remain the two
  mechanisms — or fold publications into `excluded_sections` too and delete
  `include_publications` for symmetry (**recommended**; one mechanism, same
  behavior). Prompt guidance: "exclude teaching/publications/grants for roles where
  they're irrelevant".
- **`job_scanner.py` `filter_openings()`** — profile payload becomes
  `{professional_title, preferences, skills}` (was narrative + work_preferences +
  skills).
- **`cv_importer.py`** — tool schema updated: teaching type enum, grants
  funder/years/amount, education description, publication url, `preferences` block;
  drop headline/narrative/work_preferences.
- **Tests** — `test_profile_migration.py`: one case per §4 row (incl. the teaching
  type keyword mapping and idempotency); update blank-profile and tailoring tests.
  Regenerate `profile.example.json` through the real migration.

## 6. Frontend changes

- **`types.ts`** — `TeachingEntry` gains `type_other`, renames `course`→`subject`;
  `Teaching` loses `subjects_to_teach`/`notes`; `Grant` → `{name, funder, years,
  amount}`; `Education` gains `description`; `Publication` gains `url`; `Personal`
  loses `headline`; delete `Narrative`, `WorkPreferences`, `Salary`; add
  `Preferences`.
- **`Profile.tsx`** — teaching editor: type select (+ conditional `type_other`
  input), relabels, coached description, subjects/notes fields removed; GrantCard
  loses the multi-year checkbox, gains funder/amount "(optional)" inputs; education
  gains the optional description; publications gain the optional URL; headline field
  removed; skills group-label datalist; placeholder/label updates per §3. **No
  structural page changes** — sections, badges, add-menu, enabled_sections all stay.
- **`Preferences.tsx`** — per §2.6: two textareas + two TagInputs + one select + one
  textarea, with §3 microcopy. Delete the salary widget and the dropped fields.
- **`en.json`** — new/changed keys per §3 + teaching enum labels; delete dead keys
  (headline, salary, narrative fields, teaching subjects/notes, multi-year).
  Regenerate locales with `scripts/translate_locales.py` (auto-prunes stale keys).

## 7. Decisions taken (override before implementing, not during)

1. **Teaching entries print on the CV as a real block** (R4). Behavior change:
   tailored academic CVs show the entry list instead of the old AI one-liner.
2. **`teaching.subjects_to_teach` → Preferences, `teaching.notes` → academic
   research_themes** on migration (R3; §2.1 rationale).
3. **Grant `funder` and `amount` are optional free text** — no currency/number
   structure; nothing computes on them (§0.5).
4. **`headline` dies** (merged into `summary` on migration).
5. **Preferences collapse confirmed** despite the structure-helps-AI principle: its
   only consumer is a prompt; CV sections keep typed structure precisely because
   code consumes them.
6. **Fold `include_publications` into `excluded_sections`** so the tailoring plan
   has one exclusion mechanism (recommended in §5; decide before starting).
7. **No storage consolidation.** The earlier generic-`sections[]` design is dead
   (§0.1); custom_sections stays the only generic shape.

## 8. Non-goals

- No storage split (still one `profile.json`).
- No changes to projects/volunteering/certifications/courses/awards/memberships
  structure (labels/placeholders only).
- No interactive-preferences features and no AI summary-draft button (both noted as
  natural future work; the smaller `preferences` object is the foundation).
- No visual-theme changes.

## 9. Order of work

1. Backend: v4 migration + `blank_profile` + tests (§4 row by row).
2. Template: teaching block, grants, education description, publication url,
   headline removal; render a v3-era profile through the migration and eyeball the
   HTML against pre-migration output.
3. `cv_generator` plan schema + `apply_tailoring`; `job_scanner` payload;
   `cv_importer`; `cv_labels` teaching-type keys.
4. Frontend: types → Profile.tsx section edits → Preferences.tsx → i18n (§3) →
   locale regen.
5. Regenerate `profile.example.json`; update CLAUDE.md + README.
6. Full pytest, `tsc --noEmit -p tsconfig.app.json` (not `-p .` — solution-style
   config no-ops), and a live Playwright pass on both pages + a generated CV.

**Verification gates**
- Generate a CV from the migrated example profile before and after: every piece of
  user text that printed before must still print. Known allowed diffs: teaching
  renders as an entry list (was one line), headline text appears inside the summary.
- Teaching type select round-trips: pick each enum value + Other, save, reload,
  confirm stored keys and CV rendering in two CV languages (labels localize).
- Empty optional fields (funder, amount, education description, publication url)
  print nothing.
