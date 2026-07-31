# add-ai-providers — Tasks

## 1. Backend engine

- [x] 1.1 Rename `app/services/engines/openrouter.py` → `remote.py`; add the
  `PRESETS` table (`openrouter`, `anthropic`, `openai`, `gemini` with
  base_url, label, key_url, default_model, default_max_tokens,
  max-tokens param name; resolve default-model strings from current provider
  docs); update the import in `llm.py` and any test imports
- [x] 1.2 `config.py`: add per-provider `_DEFAULTS` keys
  (`<provider>_api_key`/`<provider>_model` for anthropic/openai/gemini/custom,
  `custom_base_url`); generalize `require_engine()` to resolve any preset id
  in `llm_provider` (empty model → preset default; custom requires base_url;
  key may be blank for custom only) and put `base_url` on `EngineConfig`
- [x] 1.3 `remote.complete()`: build the client from `engine.base_url`; apply
  the preset's max-tokens param name and default
- [x] 1.4 `app/api/engine.py` `_engine_status()`: report ready/detail for the
  selected preset (naming it), not just openrouter
- [x] 1.5 `app/api/settings.py`: accept/mask all `*_api_key` keys and the new
  model/base-url keys generically; generalize save-time key verification to
  `GET {base_url}/models` for presets (custom saved unverified); keep the
  OpenRouter `/key` + usage endpoints as-is

## 2. Frontend

- [x] 2.1 Build shared `ProviderFields` component (provider select, masked key
  input + per-preset "get a key" link, model input, base-URL field for
  Custom) and use it in Settings → AI Engine
- [x] 2.2 Use `ProviderFields` in the onboarding wizard's API-key engine card
- [x] 2.3 Confirm `KeyStatus` / `ApiKeyBanner` message and `CreditChip` gating
  behave correctly for non-openrouter providers (chip already checks
  `provider === 'openrouter'`)
- [x] 2.4 Add new strings to `frontend/src/locales/en.json` only (pre-commit
  hook owns the other locales)
- [x] 2.5 Add a `billing_url` per preset (server-side table, exposed by settings
  GET) and link it beside the key link in `ProviderFields` — the only cost
  signal available on providers whose spend sits behind an admin credential
  this app doesn't ask for; test pins every paid preset to having one
- [x] 2.6 `GET /api/engine/remote-models` (live `/models` per provider, never
  raises, strips Gemini's `models/` prefix, unauthenticated where the list is
  public) → `datalist` suggestions + an on-blur "not on your account" warning in
  `ProviderFields`. Verified live: 365 OpenRouter ids with no key, and a
  self-hosted server's own tags. This caught the pre-existing bad default
  `anthropic/claude-sonnet-4-6` (OpenRouter separates versions with dots, not
  dashes, so it 404s) — defaults corrected to `anthropic/claude-sonnet-5` /
  `claude-sonnet-5` in `PRESETS` and `config.json.example`
- [x] 2.7 Check the **effective** model (typed value, or the default a blank
  field falls back to) when the list arrives, not only on blur — the value most
  likely to be dead is a stored one nobody would re-type, which is exactly what
  an existing install carries; distinct wording when the shipped default is the
  missing one, since the user never typed it

## 3. Tests

- [x] 3.1 Unit tests: `require_engine()` per provider (key present/missing,
  custom base-url required, blank-key custom allowed, empty model → preset
  default, legacy openrouter config resolves unchanged)
- [x] 3.2 Unit test: `remote.complete()` request shaping per preset (mocked
  OpenAI client — base_url, max-tokens param name, default max_tokens)
- [x] 3.3 Unit test: settings GET masks every stored `*_api_key`

## 4. Docs

- [x] 4.1 Update README.md (AI engine setup: provider choice, where keys come
  from, custom/Ollama note) and CLAUDE.md (config.json reference table,
  engines section, add `custom_base_url` to the Phase 7 SSRF checklist item)
