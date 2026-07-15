## Context

The cover-letter guide (`app/services/letter_guide.py`) mirrors `cv_generator.py`:
one `LetterGuide` dataclass, one forced `_TOOL` schema, one editable
`DEFAULT_LETTER_PROMPT`, one `build_guide()`. It currently returns seven fields
(`angle`, `structure` of title/goal/pointers, `evidence` map, `gaps`, `tone`)
rendered as five stacked sections in `GuideView.tsx`. The stance — never write
prose, only tell the writer what to cover — is deliberate and stays. The only
consumer of `LetterGuide` is `GuideView` (via `LetterHistoryEntry` in
`Applications.tsx`); guides are stored as an opaque `guide_json` blob in
`letter_history`, so shape changes touch no DB schema.

## Goals / Non-Goals

**Goals:**
- Cut the output to a scannable skeleton: `job_title`, `employer`, 3–5
  `structure` sections (`{title, goal, evidence}`), and a `tips` list.
- Co-locate the "which real fact to cite" evidence inside each section.
- Preserve the no-prose stance, the `{lang_name}` placeholder, and the editable
  `letter_prompt` setting.
- Render pre-existing stored guides without crashing.

**Non-Goals:**
- No HTTP route, DB schema, config, or async-job changes.
- No migration of stored `letter_history` rows.
- No move to a fixed Hook/Pitch/Bridge/CTA scaffold — sections stay AI-chosen.
- No change to the "we don't write the letter" product explainer.

## Decisions

- **Per-section `evidence[]` replaces the top-level evidence map and the
  `pointers[]` array.** One less top-level block, and the fact to cite sits next
  to the paragraph it belongs in — matching how a writer actually drafts.
  Alternative (keep a separate evidence map): rejected as the main source of the
  "too elaborate" complaint.
- **Fold `tone` into `tips[]`, drop `angle` and `gaps`.** `angle` is meta-analysis
  the user rephrases away; `gaps` is out of scope for a skeleton; `tone` is one of
  several practical reminders that fit naturally in a tips list seeded from the
  coaching framework (real recipient, quantified impact, ~250–350 words,
  tone/language). Alternative (keep `tone` as its own field): rejected — a single
  tips list is leaner and absorbs it.
- **Frontend guards with `?? []` and ignores unknown fields.** Old rows carry
  `pointers`/`angle`/`gaps`/`tone`; new render reads `structure[].evidence` and
  `tips`, defaulting absent arrays to empty. Cheaper and safer than a one-off
  migration for historical, read-only rows. Marked with a `ponytail:` note.
- **Prompt rewrite keeps forced tool use and the `{lang_name}` guard.** The
  `_TOOL` `required` becomes `["job_title","employer","structure","tips"]`; each
  section requires `["title","goal","evidence"]`. `build_guide()`'s `tool_args`
  required tuple and the `__main__` self-check update to match.

## Risks / Trade-offs

- [Old stored guides look sparse under the new renderer] → Acceptable: they still
  show title/goal; new fields render empty. History is read-only; no data loss.
- [i18n parity test fails after editing `en.json`] → Expected between the edit and
  the pre-commit hook that translates shipped locales; do NOT run
  `translate_locales.py`.
- [A small local model might still leak a paste-ready sentence] → Same risk as
  today; mitigated by the explicit no-prose rule kept in the prompt. No new
  exposure.

## Migration Plan

None. Shape change is backward-compatible at the storage layer (opaque JSON
blob), and the renderer tolerates both shapes. Rollback = revert the change; old
and new stored guides both keep rendering.
