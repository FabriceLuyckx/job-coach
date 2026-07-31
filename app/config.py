# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Persistent app config stored in config.json (gitignored)."""

import json
import os
import threading
from dataclasses import dataclass

from app.paths import CONFIG_PATH

# Default local model registry key (see app/services/engines/registry.py).
DEFAULT_LOCAL_MODEL = "qwen3-4b-instruct"

_DEFAULTS = {
    # One API key + model per remote provider, so switching provider doesn't
    # erase the key you entered for the previous one. An empty model resolves to
    # that provider's default from engines/remote.py PRESETS.
    "openrouter_api_key": "",
    "openrouter_model": "",
    "anthropic_api_key": "",
    "anthropic_model": "",
    "openai_api_key": "",
    "openai_model": "",
    "gemini_api_key": "",
    "gemini_model": "",
    # "custom" is any other OpenAI-compatible server (Ollama, LM Studio, …).
    "custom_api_key": "",
    "custom_model": "",
    "custom_base_url": "",
    # AI engine selection: a preset id from engines/remote.py, or "local" for a
    # downloaded GGUF run via llama-cpp-python. "openrouter" keeps existing
    # installs working unchanged.
    "llm_provider": "openrouter",
    "local_model_id": DEFAULT_LOCAL_MODEL,
    # User-added local models, {id: registry entry} — see engines/registry.py.
    "local_custom_models": {},
    # UI language (ISO 639-1). "en" is the native, source language.
    "app_language": "en",
    # First-run onboarding wizard completion marker.
    "onboarding_done": False,
    # Check GitHub Releases for a newer version when the app starts.
    "auto_update_check": True,
}

_lock = threading.Lock()


def load() -> dict:
    if CONFIG_PATH.exists():
        data = json.loads(CONFIG_PATH.read_text())
        return {**_DEFAULTS, **data}
    return dict(_DEFAULTS)


def save(data: dict) -> None:
    # Serialized + atomic: a scan finishing while Settings saves must not lose
    # either update, and a crash mid-write must not leave a half-written file.
    with _lock:
        current = load()
        current.update(data)
        tmp = CONFIG_PATH.with_name(CONFIG_PATH.name + ".tmp")
        tmp.write_text(json.dumps(current, indent=2))
        os.replace(tmp, CONFIG_PATH)


@dataclass
class EngineConfig:
    """Resolved, ready-to-use AI engine settings for a single run."""
    provider: str  # a remote preset id ("openrouter", "anthropic", …) or "local"
    api_key: str = ""       # remote
    model: str = ""         # remote model string
    base_url: str = ""      # remote endpoint (preset's, or custom_base_url)
    local_model_id: str = ""  # registry key (local)


# Display names for error messages — the provider ids are not what a user typed.
PROVIDER_LABELS = {
    "openrouter": "OpenRouter",
    "anthropic": "Anthropic",
    "openai": "OpenAI",
    "gemini": "Google Gemini",
    "custom": "Custom",
}


def provider_label(provider: str) -> str:
    return PROVIDER_LABELS.get(provider, provider)


def require_engine(cfg: dict | None = None) -> EngineConfig:
    """Return a ready EngineConfig for LLM calls, or raise a user-readable error.

    Raises ValueError so threaded callers surface str(e) directly; API endpoints
    that need an HTTP status wrap this in a 400 themselves.
    """
    cfg = cfg if cfg is not None else load()
    provider = cfg.get("llm_provider") or "openrouter"

    if provider == "local":
        # Local import to avoid pulling the engine registry into every config load.
        from app.services.engines.registry import local_model_path
        model_id = cfg.get("local_model_id") or DEFAULT_LOCAL_MODEL
        path = local_model_path(model_id)
        if path is None or not path.exists():
            raise ValueError(
                "Local AI model not downloaded yet — finish setup in Settings."
            )
        return EngineConfig(provider="local", local_model_id=model_id)

    # Local import: keeps the OpenAI SDK out of a plain config load.
    from app.services.engines.remote import PRESETS
    preset = PRESETS.get(provider)
    if preset is None:
        raise ValueError(f"Unknown AI provider '{provider}'. Pick one in Settings.")

    label = provider_label(provider)
    base_url = cfg.get("custom_base_url", "") if provider == "custom" else preset["base_url"]
    if not base_url:
        raise ValueError("No server address configured for the custom AI provider. Set it in Settings.")

    key = cfg.get(f"{provider}_api_key", "")
    # Custom servers (Ollama, LM Studio) often need no key; presets always do.
    if not key and provider != "custom":
        raise ValueError(f"{label} API key not configured. Set it in Settings.")

    return EngineConfig(
        provider=provider,
        api_key=key,
        model=cfg.get(f"{provider}_model") or preset["default_model"],
        base_url=base_url,
    )
