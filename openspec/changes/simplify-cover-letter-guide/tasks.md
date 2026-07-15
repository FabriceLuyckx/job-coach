## 1. Backend — letter_guide.py

- [x] 1.1 Update the `LetterGuide` dataclass: drop `angle`, `evidence`, `gaps`, `tone`; change `structure` items to `{title, goal, evidence}`; add `tips: list[str]`.
- [x] 1.2 Rewrite the `_TOOL` schema: remove `angle`/`gaps`/`tone` properties and the top-level `evidence` array; each `structure` item requires `["title","goal","evidence"]` with `evidence` an array of strings ("real profile facts to cite here"); add a top-level `tips` array of strings; set top-level `required` to `["job_title","employer","structure","tips"]`.
- [x] 1.3 Rewrite `DEFAULT_LETTER_PROMPT`: keep the `{lang_name}` line and the "NEVER write sentences to paste" rule; instruct 3–5 AI-named sections each with a goal + specific real profile facts (`evidence`); keep grounding motivation in `preferences` (looking_for/notes); add a `tips` instruction seeded from the coaching framework (address a real person / "Dear Hiring Team", quantify impact — "so what?", ~250–350 words / one page, match the employer's tone and write in {lang_name}).
- [x] 1.4 Update `_reshape()` to build the new shape (structure with per-section evidence, tips defaulting to []).
- [x] 1.5 Update the `tool_args(response, required=(...))` tuple in `build_guide()` to `("job_title","employer","structure","tips")`.
- [x] 1.6 Update the `__main__` self-check assertions to the new fields (runnable via `uv run python -m app.services.letter_guide`).

## 2. Frontend — types & rendering

- [x] 2.1 Update the `LetterGuide` interface in `frontend/src/types.ts`: `structure: {title; goal; evidence: string[]}[]`, add `tips: string[]`, remove `angle`/`evidence`/`gaps`/`tone`.
- [x] 2.2 In `GuideView.tsx`, remove the Angle/Evidence/Gaps/Tone blocks; render each structure section as title + goal (muted) + `evidence` bullets; add a Tips block (label + `<ul>`). Guard all arrays with `?? []` so old stored rows don't crash (add a `ponytail:` note).
- [x] 2.3 Update `toMarkdown()` in `GuideView.tsx` to emit the new structure (title/goal + evidence bullets) and a tips section; drop removed sections.
- [x] 2.4 Update `letters.guide.*` keys in `frontend/src/locales/en.json`: remove `angle`/`evidence`/`gaps`/`tone`, add a `tips` label, keep `structure`. Do NOT run translate_locales.py.

## 3. Docs

- [x] 3.1 Update the Cover Letter paragraph in `CLAUDE.md` to describe the new shape (sections + tips; no angle/evidence-map/gaps/tone). Check README for any cover-letter field references and update if present.

## 4. Verify

- [x] 4.1 Run `uv run python -m app.services.letter_guide` — self-check passes.
- [x] 4.2 Run `uv run pytest` — no regressions (only the expected i18n parity failure from en.json edits, which the pre-commit hook resolves; frontend `tsc --noEmit` also clean).
- [ ] 4.3 Run the app, generate a guide for a real posting on Applications → Letter, confirm only trimmed sections + tips render and Copy-as-Markdown produces the lean output; open an old history guide and confirm it renders without crashing. (Manual — needs a configured AI engine + live posting URL.)
