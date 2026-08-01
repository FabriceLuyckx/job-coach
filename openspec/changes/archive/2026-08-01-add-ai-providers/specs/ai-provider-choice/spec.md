# ai-provider-choice

## Purpose

Which remote AI providers the app supports, how one is selected and
configured, and what the rest of the app (readiness, onboarding, provider-
specific UI) must reflect. The local GGUF engine is covered by
`local-model-choice`, not here.

## ADDED Requirements

### Requirement: Remote AI runs through a user-chosen provider preset

The app SHALL support multiple remote AI providers through one
OpenAI-compatible engine. The user selects a provider preset — OpenRouter,
Anthropic, OpenAI, Google Gemini, or Custom — and supplies that provider's
API key and a model name; the preset determines the base URL. The preset
table in the engine module is the single source of truth for provider ids,
base URLs, and default models.

#### Scenario: Anthropic key powers a generation

- **WHEN** the user selects the Anthropic preset, enters a valid Anthropic
  API key, and triggers any AI feature (CV tailoring, job scan, letter guide)
- **THEN** the call goes to Anthropic's OpenAI-compatible endpoint with that
  key, and the feature completes without an OpenRouter account existing

#### Scenario: Custom base URL

- **WHEN** the user selects Custom and enters an OpenAI-compatible base URL
  (e.g. a local Ollama server), a model name, and a key (which MAY be blank
  for servers that require none)
- **THEN** the engine calls that base URL and the AI features work

### Requirement: Per-provider credentials survive switching

Each provider's API key and model name SHALL be stored per provider, so
selecting a different provider and later switching back restores the earlier
key and model without re-entry. Existing installs' OpenRouter key and model
SHALL keep working with no user action after the update.

#### Scenario: Switching back restores the key

- **WHEN** a user with a saved OpenRouter key switches to OpenAI, enters an
  OpenAI key, then switches back to OpenRouter
- **THEN** the OpenRouter key and model are active again unchanged

#### Scenario: Existing install upgrades

- **WHEN** an install whose config.json predates provider presets starts the
  updated app
- **THEN** OpenRouter remains the selected provider with the stored key and
  model, and the app is ready without visiting Settings

### Requirement: Readiness reflects the selected provider

The app-wide AI-readiness check (`GET /api/engine`) SHALL report ready only
when the *selected* provider has what it needs (an API key for presets that
require one; a base URL for Custom), and its not-ready detail SHALL name the
selected provider rather than always saying OpenRouter.

#### Scenario: Key missing for the selected provider

- **WHEN** the selected provider is Anthropic and no Anthropic key is stored
  (even if an OpenRouter key exists)
- **THEN** the engine reports not ready with a message naming Anthropic, and
  the app-wide key banner points the user to Settings

### Requirement: Provider choice is configurable at setup and later

Settings → AI Engine and the onboarding wizard's engine step SHALL both offer
the provider choice with the same fields (provider, key, model; base URL for
Custom), and each preset SHALL link to that provider's page for obtaining a
key. API keys SHALL be shown masked once saved, for every provider.

#### Scenario: Onboarding with an existing OpenAI account

- **WHEN** a first-run user picks the API-key engine in the wizard and
  selects OpenAI
- **THEN** they can follow a link to OpenAI's key page, paste the key, and
  complete onboarding without ever seeing an OpenRouter-only flow

### Requirement: Provider-specific UI appears only for its provider

UI elements tied to one provider (e.g. the OpenRouter credit chip) SHALL be
shown only while that provider is the selected one.

#### Scenario: Credit chip hidden on Anthropic

- **WHEN** the selected provider is Anthropic
- **THEN** the OpenRouter credit chip is not rendered

### Requirement: The model field suggests what the provider actually serves

A model name is typed by hand, and a wrong one is not caught until a generation
fails minutes later on another page. The model field SHALL therefore offer the
selected provider's own model ids as suggestions, read live from its `/models`
endpoint, and SHALL warn (never block) when the entered name is absent from that
list. The field remains free text: a model the endpoint does not list — a new
release, or one a self-hosted server does not advertise — MUST still be usable,
and a provider that offers no list MUST leave the field fully functional.

#### Scenario: Typo caught where it is made

- **WHEN** the user types a model name the selected provider does not list, and
  leaves the field
- **THEN** a warning appears beneath the field, and saving is still allowed

#### Scenario: A stored model the provider has since retired

- **WHEN** Settings opens on a saved model that is no longer in the provider's
  catalog — a value the user set long ago and would never think to re-type
- **THEN** it is flagged as soon as the list loads, without the field being
  touched

#### Scenario: The shipped default is the thing that is gone

- **WHEN** the model field is empty (so the app would fall back to the preset's
  default) and that default is not in the provider's catalog
- **THEN** the warning names the default, since it is a value the user never
  typed and cannot otherwise see

#### Scenario: Self-hosted server suggests its own models

- **WHEN** the provider is Custom and the server implements `/models`
- **THEN** the models installed on that server are offered as suggestions

#### Scenario: No list available

- **WHEN** the provider returns no model list (no key yet, no `/models`, or
  unreachable)
- **THEN** the field behaves as plain free text with no warning and no error

### Requirement: Every paid provider links to its own spend dashboard

Only OpenRouter exposes a balance to the API key the user supplies; Anthropic,
OpenAI and Gemini put spend behind a separate admin credential or behind cloud
billing, which this app deliberately does not ask for. Each preset that requires
a key SHALL therefore carry a link to that provider's own usage/spend page,
shown beside its key link, so cost is always one click away even where no
balance can be displayed.

#### Scenario: Cost visibility on a provider with no balance API

- **WHEN** the selected provider is OpenAI, Anthropic or Gemini
- **THEN** the provider's usage page is linked from Settings → AI Engine, and no
  balance figure is claimed

#### Scenario: Self-hosted server has no bill

- **WHEN** the selected provider is Custom
- **THEN** no billing link is shown, since the server is the user's own
