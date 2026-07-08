"""Persistent app config stored in config.json (gitignored)."""

import json
import os
import threading
from dataclasses import dataclass

from app.paths import CONFIG_PATH

# The one place the default OpenRouter model is defined.
DEFAULT_MODEL = "anthropic/claude-sonnet-4-6"

# Default local model registry key (see app/services/engines/registry.py).
DEFAULT_LOCAL_MODEL = "qwen3-4b-instruct"

_DEFAULTS = {
    "openrouter_api_key": "",
    "openrouter_model": DEFAULT_MODEL,
    # AI engine selection. "openrouter" keeps existing installs working unchanged;
    # "local" runs a downloaded GGUF model via llama-cpp-python.
    "llm_provider": "openrouter",
    "local_model_id": DEFAULT_LOCAL_MODEL,
    # UI language (ISO 639-1). "en" is the native, source language.
    "app_language": "en",
    # First-run onboarding wizard completion marker.
    "onboarding_done": False,
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
    provider: str  # "openrouter" | "local"
    api_key: str = ""       # openrouter
    model: str = ""         # openrouter model string
    local_model_id: str = ""  # registry key (local)


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

    key = cfg.get("openrouter_api_key", "")
    if not key:
        raise ValueError("OpenRouter API key not configured. Set it in Settings.")
    return EngineConfig(
        provider="openrouter",
        api_key=key,
        model=cfg.get("openrouter_model") or DEFAULT_MODEL,
    )


def require_llm(cfg: dict | None = None) -> tuple[str, str]:
    """Deprecated shim — returns (api_key, model) for OpenRouter.

    Retained only for any callers not yet migrated to require_engine(); raises for
    the local provider since it has no (key, model) pair.
    """
    engine = require_engine(cfg)
    if engine.provider != "openrouter":
        raise ValueError("This action requires the OpenRouter engine.")
    return engine.api_key, engine.model
