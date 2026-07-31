# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Remote AI providers — chat completions via the OpenAI SDK.

Anthropic, OpenAI and Gemini all expose an OpenAI-compatible chat-completions
endpoint, so one client serves them all: a preset only decides the base URL, the
default model, and the two known request quirks (Anthropic requires max_tokens;
newer OpenAI models renamed it). ``custom`` covers any other OpenAI-compatible
server (Ollama, LM Studio, a provider we didn't preset) and takes its base URL
from config.

Centralises client construction (timeouts are always set — a hung model call must
never block a worker thread forever) and maps the OpenAI response into the app's
uniform ``LLMResponse``.
"""

from openai import OpenAI

from app.services.llm import GenerationCancelled, LLMResponse, ToolCall

# The one source of truth for provider ids, base URLs and default models.
# key_url is where the user gets an API key; billing_url is that provider's own
# usage/spend page. Only OpenRouter will report a balance to the key we hold — the
# others put spend behind a separate admin credential, or behind Google Cloud
# billing — so for them a link to their dashboard is the honest substitute for a
# number we cannot fetch. Both are shown in Settings/onboarding.
PRESETS: dict[str, dict] = {
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "key_url": "https://openrouter.ai/keys",
        "billing_url": "https://openrouter.ai/activity",
        "default_model": "anthropic/claude-sonnet-5",
    },
    "anthropic": {
        "base_url": "https://api.anthropic.com/v1",
        "key_url": "https://console.anthropic.com/settings/keys",
        "billing_url": "https://console.anthropic.com/settings/billing",
        "default_model": "claude-sonnet-5",
        # Anthropic's endpoint rejects a request without it.
        "default_max_tokens": 8192,
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "key_url": "https://platform.openai.com/api-keys",
        "billing_url": "https://platform.openai.com/usage",
        "default_model": "gpt-4o",
        # Newer OpenAI models reject max_tokens in favour of this name.
        "max_tokens_param": "max_completion_tokens",
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "key_url": "https://aistudio.google.com/apikey",
        "billing_url": "https://aistudio.google.com/usage",
        "default_model": "gemini-2.5-flash",
    },
    "custom": {
        # Base URL comes from config (custom_base_url); the user's own server has
        # no key page and no bill.
        "base_url": "",
        "key_url": "",
        "billing_url": "",
        "default_model": "",
    },
}

# The one place that says which providers run through this engine.
REMOTE_PROVIDERS = tuple(PRESETS)


def _make_client(base_url: str, api_key: str) -> OpenAI:
    return OpenAI(
        base_url=base_url,
        # Some self-hosted servers need no key, but the SDK requires a string.
        api_key=api_key or "none",
        timeout=120.0,
        max_retries=1,
    )


def complete(engine, messages, *, tools=None, tool_choice=None, max_tokens=None, cancel=None) -> LLMResponse:
    # ponytail: remote providers run off-machine (no local CPU load) and the client
    # already caps each call at 120s, so we only honour an already-set cancel here
    # rather than streaming to interrupt mid-flight. The frontend's Cancel stops the wait.
    if cancel is not None and cancel.is_set():
        raise GenerationCancelled()
    preset = PRESETS.get(engine.provider, {})
    client = _make_client(engine.base_url, engine.api_key)
    kwargs: dict = {"model": engine.model, "messages": messages}
    tokens = max_tokens if max_tokens is not None else preset.get("default_max_tokens")
    if tokens is not None:
        kwargs[preset.get("max_tokens_param", "max_tokens")] = tokens
    if tools is not None:
        kwargs["tools"] = tools
    if tool_choice is not None:
        kwargs["tool_choice"] = tool_choice

    resp = client.chat.completions.create(**kwargs)

    choices = getattr(resp, "choices", None)
    message = choices[0].message if choices else None
    text = getattr(message, "content", None) if message else None
    raw_calls = getattr(message, "tool_calls", None) if message else None
    calls = [
        ToolCall(name=c.function.name, arguments=c.function.arguments)
        for c in (raw_calls or [])
    ]
    return LLMResponse(text=text, tool_calls=calls)
