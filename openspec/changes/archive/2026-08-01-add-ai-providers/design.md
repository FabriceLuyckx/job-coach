# add-ai-providers — Design

## Context

All remote AI goes through `app/services/engines/openrouter.py`, which builds
an OpenAI SDK client pinned to OpenRouter's base URL; `config.require_engine()`
resolves `llm_provider` (`openrouter` | `local`) into an `EngineConfig`.
Anthropic, OpenAI, and Gemini each expose an OpenAI-compatible
chat-completions endpoint, so the same client code can serve them all —
only the base URL and key differ. Every AI call in the app is a forced-tool
call (`tool_choice`), which all three compat layers support.

## Goals / Non-Goals

**Goals:**
- Let a user run the app on an existing Anthropic / OpenAI / Gemini API key,
  or any OpenAI-compatible server (Custom base URL), with OpenRouter still the
  default and zero migration for existing installs.
- Keep exactly one remote code path.

**Non-Goals:**
- Consumer-subscription engines (Claude Pro via Agent SDK — possible,
  deferred; ChatGPT Plus / Copilot — no permitted path). See proposal.
- Per-provider model pickers/catalogs. Model stays a free-text field with a
  per-preset default.

## Decisions

**1. One generic remote engine with a preset table.** Rename
`engines/openrouter.py` → `engines/remote.py` holding
`PRESETS = {id: {base_url, label, key_url, default_model}}` for `openrouter`,
`anthropic`, `openai`, `gemini` (+ `custom`, whose base_url comes from
config). `llm.py`'s dispatch is unchanged: local → local, everything else →
`remote.complete()`. Alternative — one module per provider — rejected: the
modules would be identical except for a URL string.

**2. `llm_provider` stays the single selector**, gaining values `anthropic`,
`openai`, `gemini`, `custom`. No new "engine kind" concept: `local` is special
in exactly the places it already is; every other value is a preset id.

**3. Flat per-provider config keys, existing names untouched.**
`<provider>_api_key` / `<provider>_model` for each preset, plus
`custom_base_url`. `openrouter_api_key`/`openrouter_model` already follow this
pattern, so existing configs work with **no migration**. Generic code
(`cfg[f"{p}_api_key"]`) replaces hardcoded key names in `require_engine`,
settings GET masking, and settings PUT. Alternative — nested
`api_providers: {}` dict — rejected: churns the settings API shape and the
existing keys for no behavioral gain.

**4. Empty model falls back to the preset's `default_model`** (in the preset
table, the one source of truth). Exact default-model strings are resolved
against provider docs at implementation time, not guessed now.

**5. Provider quirks live in the preset table, not in branches.**
Two known ones: (a) Anthropic's endpoint requires `max_tokens` — the preset
carries a `default_max_tokens` applied when the caller passes none; (b) newer
OpenAI models reject `max_tokens` in favor of `max_completion_tokens` — the
preset carries the param name. `complete()` reads both from the preset.

**6. Key verification generalizes to `GET {base_url}/models`.**
`_verify_openrouter_key` becomes a generic reachability/auth check against
the preset's models endpoint on settings save. Custom is saved unverified
(server may not exist yet); a bad key/URL surfaces as the normal AI-call
error. OpenRouter keeps its richer `/key` check and the usage endpoint.

**7. Frontend: one shared `ProviderFields` component** (provider select,
masked key input with per-preset "get a key" link, model input, base-URL
field only for Custom) used by both Settings → AI Engine and the onboarding
wizard's API-key card. `CreditChip` already gates on
`provider === 'openrouter'` — no change needed there. Follows DESIGN.md
form-control primitives; no new visual patterns.

## Risks / Trade-offs

- [Gemini/Anthropic compat layers may diverge from OpenAI on forced
  `tool_choice` or JSON escaping] → the implementation includes a manual
  smoke test of one forced-tool call per preset (where a key is available);
  quirks get a preset-table field, never an `if provider ==` in call sites.
- [Custom base URL is a user-supplied URL the backend will call] → same trust
  level as the existing custom-GGUF URL feature; localhost-only today, and
  the CLAUDE.md Phase 7 SSRF prerequisite already covers both before any
  networked deployment (add `custom_base_url` to that checklist item).
- [Per-preset default models go stale] → they're placeholders for a free-text
  field, not an allowlist; a stale default fails loudly on first call and is
  user-overridable.

## Migration Plan

None needed: existing config keys keep their meaning, defaults add new empty
keys, `llm_provider` default stays `openrouter`. Rollback = ship the previous
build; new config keys are ignored by old code.

## Open Questions

- Exact `default_model` string per preset (resolve from provider docs during
  implementation).
