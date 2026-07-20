## Why

The local AI engine ships exactly one model (Qwen3 4B) with no way to pick another. A 4B model is a compromise: strong enough for multilingual scanning, weak at the reasoning and prose quality that make a good CV or cover letter. Users with a capable machine cannot trade disk and RAM for quality, users who follow the field cannot try a newer GGUF, and every future model swap costs a code release. This is Phase 4/D follow-up work (AI engine setup), not a new phase.

## What Changes

- **Registry grows from one model to a small curated set**, each labelled by what it is *for* (light / balanced & multilingual / stronger reasoning & writing) rather than by parameter count, and spanning a real range of machines — from ~2.5 GB up to ~9 GB.
- **BREAKING (default only)**: **Qwen3 8B becomes the default and recommended model** in place of Qwen3 4B. The 4B stays offered as the explicit **light** option for 8 GB machines, so existing installs keep a first-class, still-listed model rather than a retired one.
- **Onboarding picks a model**, instead of silently downloading the only one. Default preselected, size + RAM shown per option, one click still gets a working engine.
- **Settings manages models**: list the curated set plus anything already on disk, showing which is active, which is downloaded, and its size. Download another, switch the active one, delete one to free disk. Several models may coexist.
- **Custom model by URL**: paste a direct link to a `.gguf` file (Hugging Face or any HTTPS host); it is validated, registered as a custom entry in config, and downloaded through the same progress/resume path. Deleting it removes both the file and the entry. Settings links out to the Hugging Face GGUF catalogue so "find me a different model" has an obvious starting point rather than requiring the user to already know where to look.
- The download flow's disk pre-check, RAM pre-check with override, resume, truncation tripwire and single-active-download rule all apply unchanged to every model, curated or custom.

## Capabilities

### New Capabilities
- `local-model-choice`: which local models are offered and across what range of machines, how one is selected/downloaded/deleted/replaced, and how a user-supplied GGUF URL is discovered, validated and registered.

### Modified Capabilities
<!-- none — no existing spec in openspec/specs/ covers the local engine -->

## Impact

- `app/services/engines/registry.py` — multiple curated entries; merge config-stored custom entries.
- `app/api/engine.py` — `/engine/models` returns the full list with active/downloaded state; `/engine/download` accepts a URL; `/engine/model` DELETE cleans up custom entries.
- `app/config.py` — `DEFAULT_LOCAL_MODEL` moves to Qwen3 8B; new `local_custom_models` key.
- `frontend/src/components/EngineSettings.tsx`, `Onboarding.tsx`, `api.ts` — drop the single-model (`ms[0]`) assumption; model list UI + custom-URL field.
- `frontend/src/locales/en.json` — per-model names/descriptions and the new UI strings.
- Docs: `README.md` (model sizes, choosing/replacing a model), `CLAUDE.md` (config reference).
- Tests: `tests/test_engine_api.py`, `tests/test_hardening.py` (URL/filename validation, registry merge).
- No new Python dependency; no schema or DB change.
