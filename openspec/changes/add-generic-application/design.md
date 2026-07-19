## Context

Every artifact on the Applications page starts from a job posting URL:
`cv.start_generation(url, lang, job_text=None)` fetches the posting, `tailor()`
turns it into a `TailoringPlan`, rows land in `cv_history` / `letter_history`
keyed by `job_url`, and `Applications.tsx` client-side-joins the two histories on
that URL. Language changes (`_retailor`) and regeneration re-fetch from the
stored `job_url`, and the row UI gates the language control and the missing-artifact
CTA on `app.jobUrl` being non-empty.

Crucially, both `tailor()` and `build_guide()` already accept a pre-supplied
`job_text` (added so accepted suggestions reuse the scanner's cached posting).
That is the entire seam this change needs.

## Goals / Non-Goals

**Goals:**
- One user-triggered, pinned, untargeted CV + cover-letter guide.
- Reuse the existing pipeline end to end: same plan, editor, relang, PDF, delete.
- Zero schema migration, zero new dependency, no new LLM call shape.

**Non-Goals:**
- Multiple generic applications, or per-target-role variants.
- Auto-creating or auto-refreshing it when the profile changes.
- A new "generic" template or renderer.

## Decisions

### Reserved `job_url` sentinel instead of a new column or new table

The generic application is stored as an ordinary `cv_history` / `letter_history`
row with `job_url = "generic:profile"` (a constant, e.g. `GENERIC_URL` in
`app/services/cv_renderer.py`). The frontend's URL join, delete, undo, history
list, and letter pairing then work untouched; the frontend only special-cases
the sentinel for presentation (pin to top, no listing link, generic label).

*Alternatives:* a `kind` column on both tables (a migration plus branching in
every read path, for one row) or a separate table (duplicates the whole editor
and history surface). A sentinel is the smallest change that keeps one code path.
The sentinel is not a fetchable URL by construction, so a code path that
mistakenly tries to fetch it fails loudly rather than hitting the network.

### A synthesized "role brief" as `job_text`

`role_brief(profile) -> str` renders a short plain-text posting-shaped brief from
`preferences` (`target_roles`, `looking_for`, `locations`, `remote`, `languages`,
`notes`) plus `personal.professional_title`. It is passed as `job_text`, so
`tailor()` and `build_guide()` never fetch and their prompts are unchanged.

*Alternative:* a separate prompt/tool schema for "generic CV". Rejected — it
would fork the tailoring plan, the editor's plan contract, and the `{lang_name}`
prompt validation for no behavioural gain. A brief keeps one prompt path; the
prompt already handles "no employer named" gracefully because `job_title` /
`employer` are free strings (they become the target role and a generic label).

### One branch in `_retailor`, not per-caller patching

`_retailor` is the single place relang and regenerate fetch from. It gets one
guard: if `row["job_url"] == GENERIC_URL`, use `role_brief(profile)` instead of
`fetch_job_description()`. It also drops its "No job URL stored" 400 for the
sentinel. Same shape in `letters.start_letter_generation`: `_cached_posting_text`
returns the brief for the sentinel. Two small guards at the two chokepoints
covers create, relang, regenerate, and the per-tab create CTA.

### Readiness gate lives on the server, mirrored in the UI

`profile_ready(profile) -> list[str]` returns the missing-requirement keys
(`target_roles`, `experience`). The create endpoint 400s with them; the frontend
computes the same from the profile it already loads to decide between the create
button and the "what's missing" state. The server check is the authority — the
client one only avoids offering a button that would fail.

### Endpoint shape

`POST /api/cv/generic {lang}` → `{job_id}` and `POST /api/letters/generic {lang}`
→ `{job_id}`, both thin wrappers over the existing `start_generation` /
`start_letter_generation` with the sentinel URL and the brief supplied. Reusing
`POST /generate` with a magic URL would mean validating a user-supplied sentinel
on a public route; separate endpoints keep the sentinel server-owned.

### Frontend

`mergeApplications` gets the sentinel row split out into a `generic` slot
rendered by the existing `ApplicationRow` with two presentational props
(`pinned`/`generic`): no listing link, generic title, and — when absent — a
create card in place of the row. Search and date sorting apply to the remaining
list only. Uses the existing `Button`/`Collapsible`/`Modal`/toast primitives per
DESIGN.md; no new component families.

## Risks / Trade-offs

- **A future real posting URL colliding with the sentinel** → the scheme
  `generic:` is not http(s), so no scanned or pasted listing can produce it; the
  create endpoints are the only writers of that value.
- **A thin profile yields a vague CV** → the readiness gate is the floor, not a
  guarantee. The brief is regenerated from the current profile on every
  regenerate, so improving the profile and hitting Regenerate is the fix.
- **Users may expect the generic CV to auto-refresh on profile edits** → the CV
  already re-renders from its stored plan against the live profile, so structural
  profile edits show immediately; only the AI-written summary/bullets need an
  explicit Regenerate. Same behaviour as every other CV, so no new surprise.
- **`excluded_sections` with no posting to judge against** → the model may drop
  optional sections it can't justify. The editor's section toggles already let
  the user put them back.

## Migration Plan

None. Additive: no schema change, no existing row touched. Rollback is removing
the two endpoints and the frontend slot; any generic row left behind renders as
an ordinary URL-less application.

## Open Questions

- ~~Should the generic CV default its language to `app_language` rather than `en`?~~
  **Resolved: yes.** There is no posting to detect a language from, so the language
  the user reads the app in is the best default. The client omits `lang` entirely and
  `generic_lang()` resolves it from config server-side, keeping config the authority
  (an explicit `lang` still wins, for the API/CLI).
