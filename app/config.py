"""Persistent app config stored in config.json (gitignored)."""

import json
import os
import threading

from app.paths import CONFIG_PATH

# The one place the default OpenRouter model is defined.
DEFAULT_MODEL = "anthropic/claude-sonnet-4-6"

_DEFAULTS = {
    "openrouter_api_key": "",
    "openrouter_model": DEFAULT_MODEL,
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


def require_llm(cfg: dict | None = None) -> tuple[str, str]:
    """Return (api_key, model) for LLM calls, or raise a user-readable error.

    Raises ValueError so threaded callers surface str(e) directly; API endpoints
    that need an HTTP status wrap this in a 400 themselves.
    """
    cfg = cfg if cfg is not None else load()
    key = cfg.get("openrouter_api_key", "")
    if not key:
        raise ValueError("OpenRouter API key not configured. Set it in Settings.")
    return key, cfg.get("openrouter_model") or DEFAULT_MODEL
