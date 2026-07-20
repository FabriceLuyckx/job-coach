## 1. Verify the curated models

- [x] 1.1 Confirm repo id, exact filename and byte size on Hugging Face for each *new* curated entry (`qwen3-8b`, `qwen3-14b`, `gemma-3-12b-it`, Q4_K_M quant); prefer a public mirror over a gated official repo, as the existing registry NOTE requires. `qwen3-4b-instruct` needs no verification — it is the entry that ships today
- [x] 1.2 Download one candidate and smoke-check a forced-tool call through `app/services/engines/local.py` (schema-constrained JSON must come back valid); drop any model that fails rather than shipping it

## 2. Registry

- [x] 2.1 Extend `app/services/engines/registry.py` to the verified curated set, each with `label`, `repo`, `filename`, `size_bytes`, `min_ram_gb`, `n_ctx`
- [x] 2.2 Keep the existing `qwen3-4b-instruct` entry unchanged as the light option (only its label/blurb move from "recommended" to "light"); note in the module docstring that a genuinely retired model must stay served while downloaded or active
- [x] 2.3 Add `all_models()` returning `LOCAL_MODELS | config custom entries`; route `get_model()` and `local_model_path()` through it
- [x] 2.4 Point `config.DEFAULT_LOCAL_MODEL` at `qwen3-8b` and add the `local_custom_models: {}` default in `app/config.py`

## 3. Custom model by URL

- [x] 3.1 Add `register_custom_model(url)` (registry or `app/api/engine.py`): enforce https, `.gguf` suffix, sanitize the basename to `[A-Za-z0-9._-]` (reject empty), rewrite Hugging Face `/blob/` → `/resolve/`
- [x] 3.2 `HEAD` the URL before registering: readable 400 on failure; use `content-length` for `size_bytes` and derive `min_ram_gb = round(size_gb) + 2`; default `n_ctx` to 8192 with a `ponytail:` comment naming the upgrade path
- [x] 3.3 Persist the entry under `local_custom_models` in config (id `custom-<stem>`, `custom: true`); re-adding the same file replaces the entry
- [x] 3.4 Teach `_run_download` to use an entry's direct `url` when present, falling back to `hf_hub_url(repo, filename)` — one branch, everything else unchanged

## 4. Engine API

- [x] 4.1 `GET /api/engine/models`: return every curated and custom model, each with `downloaded`, `active`, `custom`, `recommended`
- [x] 4.2 `POST /api/engine/download`: accept `url` as an alternative to `model_id`, registering the custom entry before starting the thread
- [x] 4.3 `DELETE /api/engine/model`: also drop the config entry when the deleted model is custom
- [x] 4.4 Confirm `_engine_status` reports correctly for a custom active model (label falls back to the entry's own `label`)

## 5. Frontend

- [x] 5.1 `frontend/src/api.ts`: extend `LocalModel` with `active`/`custom`/`recommended`, and `startModelDownload` with `url`
- [x] 5.2 `EngineSettings.tsx`: replace the `ms[0]` single-model state with a model picker built from the **existing** `radioGroup()` helper inside a second `.engine-grid` of `.engine-card`s — no new list markup, no new CSS, no `<table>`, no fixed px width. Selecting a downloaded model saves `local_model_id`; selecting an undownloaded one starts its download
- [x] 5.3 `EngineSettings.tsx`: keep **one** action `Button` below the group acting on the selection (Download / Delete), not one per option — the page's vermilion stays rationed to a single primary signal. Reuse `fmtGb` for every size, and keep the teal `--success` + `CheckCircle2` treatment for "downloaded and ready" rather than introducing a `badge-*` variant
- [x] 5.4 `EngineSettings.tsx`: keep the single `role="progressbar"` below the group (one download runs at a time) and extend its `aria-label` to name the model; preserve the existing `scaleX` transition, the resume-reconnect, force-RAM `ConfirmModal`, delete `ConfirmModal`, and **the comment explaining why it is deliberately not a live region**
- [x] 5.5 `EngineSettings.tsx`: add the custom-model field as a real form field — `<label>`, `type="url"`, `spellCheck={false}`, `.help-text` carrying the plain-spoken "advanced, unverified" caveat (no alarm language, per PRODUCT.md's calm register). Validation errors render in `.error-msg` below the field and keep the typed text; request failures go to `toast.error`
- [x] 5.6 `EngineSettings.tsx`: add the catalogue link inside that help text — `https://huggingface.co/models?library=gguf&sort=trending`, `target="_blank" rel="noreferrer"`, link text naming Hugging Face rather than "here", matching the existing openrouter.ai link's treatment
- [x] 5.7 `EngineSettings.tsx`: render a stated failure with a retry when `listLocalModels()` rejects, instead of today's `.catch(() => {})` leaving an unexplained empty choice
- [x] 5.8 `Onboarding.tsx`: replace the `ms[0]` assumption with the same `radioGroup()` + `.engine-card` vocabulary as the local/OpenRouter cards it sits under (not the accent-bordered language grid from the previous step), default preselected, non-default selection passed to `startModelDownload`; no custom-URL field here. Replace its inline `(size_bytes / 1e9).toFixed(1)` with the shared `fmtGb`
- [x] 5.9 Add the new keys to `frontend/src/locales/en.json` (`engine.models.<id>.name`/`.desc`, picker, custom-URL and error strings) and stop there — the pre-commit hook translates them. Purpose names are sentence case, not uppercase: per DESIGN.md's Case Signal Rule, uppercase labels an action or category, and these are content. Names and blurbs must wrap, never truncate — no `nowrap`/`ellipsis` on grid text that grows ~35% in German and Polish

## 6. Tests

- [x] 6.1 `tests/test_hardening.py`: URL validation — non-https, non-`.gguf`, traversal/hostile basename, `/blob/` rewrite, empty-after-sanitize
- [x] 6.2 `tests/test_engine_api.py`: custom entries merge into `/engine/models` with the right flags; delete removes file + config entry; at least one curated model has `min_ram_gb <= 8`
- [x] 6.3 Check the existing `qwen3-4b-instruct` fixtures in `tests/test_engine_api.py`, `tests/test_hardening.py`, `tests/test_local_engine.py` — the id stays valid, so most should pass unchanged; update only what asserts on the default
- [x] 6.4 `uv run pytest` passes (the i18n shipped-catalog parity failure after an `en.json` edit is expected pre-commit and is not a regression)

## 6b. Design-system conformance

- [x] 6b.1 Grep the diff for the tells this change is prone to: `border-radius` on anything new, a `badge-` variant added for model state, a second `box-shadow`, a hard-coded hex or px width — every colour comes from a token and every corner stays square
- [x] 6b.2 Confirm the diff adds **no** new selection styling: the only "chosen" treatment in it is the existing ink-fill/`aria-checked` one from `radioGroup()` + `.engine-card`
- [x] 6b.3 Confirm the new model options are siblings of the provider cards inside the one `.card` — no card nested in a card
- [x] 6b.4 Run `/impeccable audit frontend/src/components/EngineSettings.tsx frontend/src/components/Onboarding.tsx` once the UI is in place and address anything at P0/P1

## 7. Docs

- [x] 7.1 `README.md`: the model choices with their sizes and RAM (including the light option for 8 GB machines), how to switch or delete a model, and how to add one by URL (advanced/unverified, with the catalogue link) — note the "~2.5 GB" figure at line 23 now describes the light option, not the default
- [x] 7.2 `CLAUDE.md`: config reference (`local_model_id` default, `local_custom_models`), the AI-engine setup section's model size, and add the custom-URL fetch to the Phase-7 SSRF prerequisite list
