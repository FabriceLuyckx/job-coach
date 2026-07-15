## Why

The cover-letter guide is too dense: the AI returns seven fields — an `angle`
sentence, a `structure` of 3–5 paragraphs (each with title/goal/2–4 pointers), a
separate `evidence` map, optional `gaps`, and a `tone` note — rendered as five
stacked sections. Users want a plain skeleton they can rephrase into their own
words, not a five-part analysis. This is a Phase 4 refinement of the existing
Cover Letter feature.

## What Changes

- Trim the `LetterGuide` output to a lean skeleton: `job_title`, `employer`, an
  AI-chosen 3–5 section `structure`, and a short `tips` list.
- Each `structure` section becomes `{title, goal, evidence}` — the per-section
  `evidence` (real profile facts to cite there) replaces the old top-level
  evidence map, co-locating "what to say" with "which fact to use".
- **BREAKING** (tool/output shape, not HTTP): remove top-level `angle`,
  top-level `evidence`, and `gaps`; fold `tone` guidance into `tips`; rename each
  section's `pointers[]` → `evidence[]`.
- Keep the deliberate **"never write the letter / no prose"** stance — every
  line is an instruction or a real fact, never a sentence to paste. The page
  explainer and product philosophy are unchanged.
- Rewrite `DEFAULT_LETTER_PROMPT` to the new shape, seeding `tips` from the
  coaching framework (address a real person, quantify impact, ~250–350 words,
  match tone/language). Keeps the `{lang_name}` placeholder.
- Frontend renders only the trimmed sections + tips and guards old
  `letter_history` rows so they degrade gracefully (no data migration).

## Capabilities

### New Capabilities
- `cover-letter-guide`: given a job posting, produce a tailored cover-letter
  writing skeleton (never prose) — an AI-chosen set of sections, each with a
  goal and the real profile facts to cite, plus practical writing tips.

### Modified Capabilities
<!-- No existing spec covers the cover-letter feature; captured as a new capability above. -->

## Impact

- `app/services/letter_guide.py` — `LetterGuide` dataclass, `_TOOL` schema,
  `DEFAULT_LETTER_PROMPT`, `_reshape()`, `build_guide()` required tuple, `__main__`
  self-check.
- `frontend/src/types.ts` — `LetterGuide` interface.
- `frontend/src/components/letters/GuideView.tsx` — render + `toMarkdown()`.
- `frontend/src/locales/en.json` — `letters.guide.*` keys (pre-commit hook
  re-translates shipped locales; do not run translations manually).
- `CLAUDE.md` — Cover Letter paragraph.
- No API routes, DB schema, or config changes. Existing stored guides remain
  readable. The editable `letter_prompt` setting continues to work.
