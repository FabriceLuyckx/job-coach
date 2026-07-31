# add-ai-providers

Phase: extends the Phase 4 Settings / AI-engine configuration surface (cross-cutting; no new pipeline).

## Why

Today the only paid AI option is an OpenRouter API key, so a user who already
holds credits with Anthropic, OpenAI, or Google must put money on a second
account just to run the app. Anthropic, OpenAI, and Gemini all expose
OpenAI-compatible chat-completions endpoints, so their keys can ride the
existing engine for the cost of a base-URL preset.

Researched and deliberately **out of scope**: consumer subscriptions.
ChatGPT Plus and Windows/GitHub Copilot offer no permitted third-party API
path at all. A Claude Pro/Max subscription *can* power a third-party app, but
only through the Claude Agent SDK with the user signed in via a locally
installed Claude Code (extracting OAuth tokens into a plain API client is
banned by Anthropic's terms). That is a new dependency and a different
integration shape — a candidate follow-up change, not part of this one.

## What Changes

- The remote AI engine becomes provider-agnostic: a **provider preset**
  (OpenRouter, Anthropic, OpenAI, Google Gemini, or Custom) selects the
  base URL; the user supplies that provider's API key and a model name.
- **Custom** accepts any OpenAI-compatible base URL — this also covers
  self-hosted servers (Ollama, LM Studio) and any provider we didn't preset.
- API keys are stored **per provider**, so switching providers doesn't erase
  a previously entered key. Existing `openrouter_*` config keys keep working
  unchanged — no migration for current installs.
- Settings → AI Engine and the onboarding wizard's engine step gain the
  provider choice (same fields, one shared component); each preset links to
  that provider's key page. `GET /api/engine` readiness reflects the chosen
  provider.
- OpenRouter-only UI (the credit chip) shows only when OpenRouter is the
  active provider.
- README + CLAUDE.md config reference updated.

## Capabilities

### New Capabilities

- `ai-provider-choice`: which remote AI providers the app supports, how a
  provider is selected and configured (key, model, base URL for custom), how
  per-provider keys persist across switches, and what readiness/onboarding
  must reflect.

### Modified Capabilities

_None. `local-model-choice` is untouched; the `onboarding-wizard` spec's
requirements (dialog semantics, progress, i18n) don't encode the engine list,
so adding a provider field is implementation there, not a requirement change._

## Impact

- `app/config.py` — provider selector values, per-provider key/model config,
  `require_engine()` resolution.
- `app/services/engines/openrouter.py` — becomes the generic OpenAI-compatible
  remote engine (preset table with base URLs); `app/services/llm.py` dispatch
  unchanged apart from passing the base URL through.
- `app/api/settings.py`, `app/api/engine.py` — per-provider key masking,
  readiness detail.
- `frontend/src/pages/Settings.tsx`, `Onboarding.tsx`, `KeyStatus`,
  `CreditChip` — provider dropdown, per-preset key link, OpenRouter-only chip.
- `frontend/src/locales/en.json` — new strings (hook translates the rest).
- Tests: engine resolution + config round-trip; no new dependencies.
