# Plan — Free local LLM + full app internationalization

**Handover document.** This plan was designed against the codebase as of commit `7d63862`.
Read `CLAUDE.md` first. Work phase by phase, in order — each phase leaves the app fully
working and is independently committable. Update `README.md` and `CLAUDE.md` as part of
each phase (project rule), not at the end.

## Goal

1. The app must be usable **fully free**: instead of an OpenRouter API key, the user can
   download a free local model from Hugging Face that powers every AI feature.
2. The app UI must be usable in (almost) **any language**. Natively English; the user
   picks a language at first run or in Settings.
3. A **first-run onboarding wizard** offers both choices (engine + language); both are
   changeable later in Settings.

## Locked design decisions (do not re-litigate)

These were decided with the project owner; implement them as stated.

- **Local runtime: `llama-cpp-python`** running GGUF models in-process. Not Ollama (would
  require a separate install — breaks the non-technical-user and PyInstaller packaging
  story), not transformers (too heavy).
- **Recommended model: Qwen3-4B-Instruct-2507, GGUF quant Q4_K_M (~2.5 GB).** Strong
  multilingual + structured output at a size that runs on an 8 GB machine; Apache-2.0.
  Pin the exact Hugging Face repo/filename at implementation time (prefer Qwen's official
  GGUF repo; else a well-known quantizer mirror like bartowski/unsloth). Keep a code-level
  registry so more models can be offered later — but ship v1 with just this one.
- **Structured output from the local model uses llama.cpp grammar constraints, not native
  function-calling.** For every forced-tool call, pass the tool's JSON schema as
  `response_format={"type": "json_object", "schema": ...}` to
  `create_chat_completion()` — llama.cpp compiles it to a GBNF grammar so even a 4B model
  emits schema-valid JSON. This is the load-bearing reliability trick for the whole plan.
- **No separate translation model.** UI translation is a one-time batch job performed by
  whatever engine the user chose (local model or OpenRouter). There is exactly one AI
  engine in the app at any time.
- **UI strings are translated once and cached, never at render time.** react-i18next with
  an English source catalog; locale JSON files are either shipped (curated languages,
  generated at dev time with Claude and committed) or generated on-device once when the
  user picks an unshipped language.
- **Job postings are never translated.** The main engine reads posting text in whatever
  language it is in (cross-lingual comprehension) and *writes* output in the requested
  language. The translation machinery touches only the UI catalog and CV section labels.
- **App language ≠ CV language.** App language = UI chrome, stored in config. CV language
  = per-CV, defaults to the posting's detected language (current behavior, generalized
  beyond en/nl). Never merge these concepts in the UI.
- **Honest quality framing.** Local = "Free & private — good results, runs on your
  computer". OpenRouter = "Best quality — needs an API key, pay per use". Never present
  them as equivalent.
- **Language tiers.** Tier 1 = shipped locales (curated list below). Tier 2 = any other
  language, generated on demand, labeled "AI-translated — may contain rough edges".

## Current-state map (verified)

| What | Where |
|---|---|
| All LLM calls construct a client via | `app/services/llm.py` → `make_client()`; responses parsed by `tool_args()` / `message_text()` |
| Call sites (7) | `app/services/cv_generator.py:190`, `app/services/job_scanner.py:139` and `:177`, `app/services/cv_importer.py:226`, `app/api/cv.py:468` (plan-edit chat) |
| Engine config resolution | `app/config.py` → `require_llm()` returns `(api_key, model)`; used by `app/api/{profile,jobs,cv}.py`, `scripts/scan_debug.py` |
| CV language | `app/services/cv_generator.py:131` `_LANG_NAMES = {"en", "nl"}`; prompt substitutes `{lang_name}` |
| CV section labels | `app/services/cv_renderer.py:42` `LABELS` dict, en + nl only |
| Scanner language detection | `app/services/job_scanner.py:84` — tool schema enum `["en","nl"]`; `:194` falls back to `"en"` |
| Data dir / packaging paths | `app/paths.py` — `DATA_DIR`, works both frozen (PyInstaller) and dev |
| Frontend | ~3.4k lines TSX, 4 pages + ~18 components, no i18n library, all strings inline |
| First-run UX today | `SetupBanner` + `KeyStatus` push the user to Settings to paste an API key |

---

## Phase A — Engine abstraction (pure refactor, no behavior change)

**Goal:** one seam through which every LLM call flows, so Phase B can plug in a second
provider. App behaves identically after this phase.

1. In `app/services/llm.py`, define the provider-neutral interface:
   ```python
   @dataclass
   class ToolCall:
       name: str
       arguments: str  # raw JSON string

   @dataclass
   class LLMResponse:
       text: str | None
       tool_calls: list[ToolCall]

   def complete(messages: list[dict], *, tools: list[dict] | None = None,
                tool_choice: dict | None = None, cfg: dict | None = None,
                max_tokens: int | None = None) -> LLMResponse: ...
   ```
   `complete()` resolves the engine from config (Phase A: always OpenRouter) and
   dispatches. Keep the existing 120 s timeout / 1 retry inside the OpenRouter path.
2. Move OpenRouter specifics into `app/services/engines/openrouter.py` (client
   construction + call + mapping the OpenAI response into `LLMResponse`).
3. Rework `tool_args(response, required)` and `message_text(response)` to take an
   `LLMResponse`. Keep `AIResponseError` and all its user-readable messages.
4. Replace `config.require_llm()` with `config.require_engine(cfg) -> EngineConfig`
   (dataclass: `provider`, plus `api_key`/`model` for openrouter). Phase A: provider is
   always `"openrouter"`; keep the same "API key not configured" ValueError message and
   the same ValueError contract for threaded callers.
5. Update all 7 call sites and the `require_llm` callers (`app/api/profile.py:40`,
   `app/api/jobs.py:78`, `app/api/cv.py:157,295,450`, `scripts/scan_debug.py:26`) to the
   new interface. `app/api/cv.py:468` uses a plain-text completion (`message_text`) —
   make sure `complete()` supports tool-less calls.
6. Tests (`tests/test_hardening.py` or a new `tests/test_llm.py`): `tool_args` /
   `message_text` behavior on the new dataclass; `require_engine` error cases.

**Acceptance:** `uv run pytest` green; CV generation, job scan, CV import, and plan-edit
chat all work against OpenRouter exactly as before.

## Phase B — Local model engine

**Goal:** user can download the recommended model and run every AI feature offline/free.

### B1. Config & registry

- New config keys (extend `_DEFAULTS` in `app/config.py`):
  `llm_provider` (`"openrouter" | "local"`, default `"openrouter"` for existing installs),
  `local_model_id` (registry key, default the Qwen entry).
- `app/services/engines/registry.py`:
  ```python
  LOCAL_MODELS = {
      "qwen3-4b-instruct": {
          "label": "Qwen3 4B (recommended)",
          "repo": "<pin at implementation>",
          "filename": "<...Q4_K_M.gguf>",
          "size_bytes": ~2_500_000_000,
          "min_ram_gb": 8,
          "n_ctx": 16384,
      },
  }
  ```
- `require_engine()` learns the local branch: provider `"local"` is "ready" iff the GGUF
  file exists on disk; otherwise raise ValueError "Local AI model not downloaded yet —
  finish setup in Settings."

### B2. Model download manager

- New: `app/api/engine.py` (+ router registration in `app/main.py`):
  - `GET  /api/engine` → `{provider, ready, detail}` — detail says "key set" /
    "model downloaded" / what's missing. This becomes the app-wide "is AI configured"
    check (replaces the key-only check behind `KeyStatus`/`SetupBanner`).
  - `POST /api/engine/download` → starts a background thread (same pattern as
    `POST /api/jobs/scan`) downloading via `huggingface_hub.hf_hub_download`
    (new dependency) into `MODELS_DIR = DATA_DIR / "models"` (add to `app/paths.py`).
    Returns `{download_id}`. Before starting: check free disk
    (`shutil.disk_usage`) ≥ 1.5× model size and total RAM ≥ `min_ram_gb` (via `psutil`,
    new dependency) — refuse with a clear message, RAM check overridable with a
    `force: true` body flag.
  - `GET /api/engine/download/status` → `{state, bytes_done, bytes_total, error}`.
    hf_hub resumes partial downloads automatically; surface that ("resuming").
  - `DELETE /api/engine/model` → delete the GGUF (frees disk when switching to API).
- Exclude `DATA_DIR/models` from backup export in `app/api/backup.py` (multi-GB).

### B3. Local inference provider

- New: `app/services/engines/local.py`. Dependency: `llama-cpp-python`.
  - Singleton `Llama` instance, lazy-loaded on first call (`n_ctx` from registry,
    `n_gpu_layers=-1` — Metal on Apple Silicon, ignored on CPU builds), guarded by a
    module-level `threading.Lock` (llama.cpp is not thread-safe; requests serialize).
  - Implement `complete()`: when `tool_choice` forces a tool, do **not** use native
    function calling. Instead: append the tool's description to the system prompt and
    call `create_chat_completion(..., response_format={"type": "json_object",
    "schema": <tool parameters schema>})`; wrap the returned JSON string as a single
    `ToolCall` in `LLMResponse`. Tool-less calls map straight to `text`.
  - No per-call timeout enforcement is possible in-process; instead cap `max_tokens`
    on every call (tailoring plan ≤ ~4k, scan filter ≤ ~2k, import ≤ ~8k).
- **Context budget:** count prompt tokens with `llama.tokenize()`; if over budget:
  - `job_scanner.extract_openings`: chunk the link list (~100 links per call), merge
    results, dedupe by URL. Apply chunking for both providers or gate on local — gating
    on provider is fine.
  - `cv_generator` / `cv_importer`: truncate page/PDF text to fit, keeping the head
    (postings and CVs front-load the signal).
- Test with mocks: schema-forced call path builds the right `response_format`; chunking
  splits and merges correctly.

### B4. Settings UI

- Settings → new **AI engine** section (above the existing key/model fields): radio
  choice **Local model** ("Free & private — runs on your computer, good results") vs
  **OpenRouter** ("Best quality — API key, pay per use").
  - Local pane: model name + size, RAM note, state (not downloaded / downloading with
    progress bar via poller / ready), Download & Delete buttons.
  - OpenRouter pane: existing key + model fields unchanged.
- `KeyStatus`/`SetupBanner`/`CreditChip`: drive off `GET /api/engine`. `CreditChip`
  (OpenRouter balance) renders only when provider is openrouter.
- **CV import warning (owner's decision):** when provider is local, the Profile import UI
  shows an upfront note before upload — "You're using the free local model: importing a
  CV may be slow and less accurate. For best results use an OpenRouter key." Import still
  runs; do not gate it.

**Acceptance:** with no API key and the model downloaded, all four AI flows (CV generate,
scan, import, plan-edit chat) complete successfully. Switching provider in Settings takes
effect on the next request with no restart.

## Phase C — i18n infrastructure + shipped locales

**Goal:** every UI string flows through a catalog; ~12 languages work out of the box.

### C1. Frontend catalog

- Add `i18next` + `react-i18next`. Source catalog `frontend/src/locales/en.json`,
  keys namespaced by page/component (`jobs.scanButton`, `settings.engine.local.title`).
- Convert all user-visible strings in `frontend/src` to `t()` calls. This is the largest
  mechanical diff (~400–600 strings). Do it one page/component at a time; run
  `npm run build` (typecheck) after each file. Includes: aria-labels, placeholders,
  toast messages, confirm texts, empty states, and the section labels/badges in
  `frontend/src/lib/profileSections.ts`. Use interpolation (`t('x', {n})`) — never
  string-concatenate translated fragments.
- Date formatting in `lib/format.ts`: switch to `Intl.DateTimeFormat(lang)`.

### C2. Shipped locales

- Generate locale files for the curated Tier-1 list with Claude at **dev time**, review,
  and commit to `frontend/src/locales/`: `nl, fr, de, es, it, pt, pl` (European focus —
  owner's decision; other languages, incl. RTL, are Tier 2 with the experimental warning).
- Add `scripts/translate_locales.py` (dev tool, uses the dev's OpenRouter key): diffs
  `en.json` against each shipped locale and translates **only new or changed keys**, so
  routine releases cost cents, not a full re-translation. `--lang xx --full` forces a
  complete regeneration. Placeholder validation identical to the Phase D generator.
- Language is stored server-side: config key `app_language` (default `"en"`), exposed via
  existing `GET/PUT /api/settings`. Frontend reads it at boot and calls
  `i18n.changeLanguage`. Settings gets a **Language** section (Tier-1 dropdown +
  "Other…" free entry that becomes active in Phase D).

### C3. Backend user-facing strings

- Keep backend messages English on the wire, but add a stable `code` next to `detail`
  for the ~dozen messages users actually see (engine-not-configured, AI response errors
  from `llm.py`, scan per-source errors). Frontend `lib/errors.ts`: if a known `code` is
  present, show `t('errors.' + code)`; else fall back to the raw English message. Do not
  attempt to translate every backend string in v1 — document the gap in README.
- CV section labels: move the `LABELS` dict out of `cv_renderer.py` into
  `app/i18n/cv_labels.json` (en + nl seeded from the current values, plus entries for the
  Tier-1 languages, generated at dev time and reviewed). Add `cv_labels(lang)` helper with
  English fallback per key. `cv_renderer` and `app/api/cv.py:113` use the helper.

**Acceptance:** switching to Dutch/French in Settings translates the whole UI without
reload artifacts; `npm run build` clean; English remains pixel-identical.

## Phase D — Any-language support

**Goal:** Tier 2 — a user can pick a language we didn't ship; the engine generates its
locale once. CV generation works in any supported language.

### D1. On-device locale generation

- `POST /api/i18n/generate {lang}` → background thread (scan-status pattern) that
  translates `en.json` (and the `cv_labels` entry) using the configured engine, in
  batches of ~40 strings per call, schema-forced (`{translations: {key: string}}`).
  **Placeholder validation:** every `{{var}}` present in the source must appear verbatim
  in the translation; retry failed strings once, then keep English for that key and
  record it in the result. Output to `DATA_DIR/locales/<lang>.json`.
- `GET /api/i18n/{lang}` serves shipped or generated locales (shipped wins);
  `GET /api/i18n/generate/status` for progress. Frontend loads Tier-2 locales via this
  endpoint (i18next HTTP backend or a small custom loader).
- Include `DATA_DIR/locales` in backup export.
- Language input: free-text language name + ISO 639-1 code guess, with the
  "AI-translated — may contain rough edges" warning shown before generating.

### D2. Generalize CV language beyond en/nl

- `app/i18n/languages.py`: registry `code → {english_name, native_name}` covering
  Tier 1 + common codes; helper `lang_name(code)` falling back to the code itself.
- `cv_generator.py`: replace `_LANG_NAMES` with `lang_name()`; `{lang_name}` prompt
  contract unchanged. `cv_labels(lang)`: if a CV is requested in a language with no
  labels entry, generate the ~15 label strings inline via one small engine call and
  cache to `DATA_DIR/locales/cv_labels.<lang>.json`.
- `app/api/cv.py`: drop any en/nl validation on `lang` / `RelangRequest`; accept any
  registered or 2-letter code. Output path `cv_<lang>.html` already generalizes.
- `scripts/generate_cv.py` / `tailor_cv.py`: `--lang` choices open up (validate as
  2-letter code); README examples updated.
- `job_scanner.py`: change the tool-schema enum at `:84` to a free `"lang"` string
  described as "ISO 639-1 code of the posting language"; at `:194` validate
  `len(lang) == 2` else `"en"`. Pass the app language into the filter prompt so the
  one-line `reason` is written in the user's language.
- Frontend CV language pickers (CVGenerator, CVEditor relang): show Tier-1 languages +
  the app language + the opening's detected language, plus free-code entry.

**Job openings in foreign languages — the rule (already decided):** the engine reads the
posting as-is and writes the CV in the requested language; nothing is pre-translated.

**Acceptance:** pick e.g. Polish (shipped) and Vietnamese (generated) end-to-end; accept
a Dutch job posting while the app is in French → CV generated in Dutch, UI and suggestion
reasons in French.

## Phase E — First-run onboarding wizard

**Goal:** the two choices are offered up front, in the user's language, skippable.

- New frontend component `Onboarding.tsx` (modal wizard over the app), shown when
  `GET /api/engine` says not-ready **and** config `onboarding_done` is false. Steps:
  1. **Language** — Tier-1 grid (native names) + "Other…". Selecting applies immediately
     (shipped) or shows generation progress *after* an engine exists — if the user picks
     a Tier-2 language before choosing an engine, queue the generation to run right after
     step 2 and say so.
  2. **AI engine** — two cards: **Free local model** (size, RAM/disk check result,
     Download with progress) vs **OpenRouter key** (paste field + link to openrouter.ai).
     Both framed with the honest-quality copy from the locked decisions.
  3. **Done** — one-line pointers to Profile import and Job sources.
- "Skip for now" on every step; sets `onboarding_done` so it never nags again;
  `SetupBanner` remains the fallback prompt for a missing engine.
- Settings must be able to change everything the wizard set (already true after B4/C2).

**Acceptance:** fresh data dir (`rm -rf` the dev data paths) → wizard appears; both
paths (local download / API key) end with a working AI feature; skip works.

## Cross-cutting

- **Packaging (PyInstaller)** — flag as its own risk workstream: `llama-cpp-python`
  native libs must be collected per OS (Metal dylib on macOS arm64, AVX2 CPU wheels on
  Windows/Linux); verify the frozen app can load the GGUF from `DATA_DIR/models`. Test on
  each target OS before release. Keep `huggingface_hub` download working behind the
  frozen app's cert bundle.
- **Docs**: update `README.md` (setup paths: free vs API key; language support; new
  endpoints) and `CLAUDE.md` (architecture table, endpoint list, config reference:
  `llm_provider`, `local_model_id`, `app_language`, `onboarding_done`) **within each
  phase**.
- **Tests**: extend per phase as noted; all runnable with `uv run pytest` without a model
  download (mock the `Llama` class).

## Known limitations to state in README (do not silently fix)

- Local-model output quality is below Claude, especially CV import from PDF (the largest
  schema). If import reliably fails locally, split extraction into 2–3 smaller
  schema-forced calls (personal+summary / experience+education / the rest) — implement
  this fallback only if needed. The local-mode import warning (Phase B4) is mandatory
  either way.
- CPU-only machines: a CV generation may take minutes. Show an inline note when provider
  is local ("this runs on your computer and can take a few minutes").
- Backend error strings beyond the coded set remain English.
- RTL languages are Tier-2/experimental (no RTL layout pass yet).

## Open decision points (proceed with the recommendation; flag in the PR)

1. Exact HF repo/filename/quant pin for Qwen3-4B-Instruct-2507 (verify at implementation
   time; prefer official).
2. Whether to later add a dedicated low-resource-language translator (NLLB-200) — out of
   scope now; the engine-agnostic catalog pipeline keeps the door open.

Already resolved with the owner (2026-07-08): Tier-1 = `nl, fr, de, es, it, pt, pl`
with the diff-based dev translation script; CV import on the local engine tries locally
with the split-schema fallback **and** an upfront quality warning in the UI.
