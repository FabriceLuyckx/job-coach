"""Persistent app config stored in config.json (gitignored)."""

import json

from app.paths import CONFIG_PATH

_DEFAULTS = {
    "openrouter_api_key": "",
    "openrouter_model": "anthropic/claude-sonnet-4-6",
}


def load() -> dict:
    if CONFIG_PATH.exists():
        data = json.loads(CONFIG_PATH.read_text())
        return {**_DEFAULTS, **data}
    return dict(_DEFAULTS)


def save(data: dict) -> None:
    current = load()
    current.update(data)
    CONFIG_PATH.write_text(json.dumps(current, indent=2))
