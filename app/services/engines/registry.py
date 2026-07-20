# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Registry of downloadable local LLM models (GGUF, run via llama-cpp-python).

Everything keys off the registry id stored in config as ``local_model_id``:
:func:`local_model_path` turns it into a file in ``MODELS_DIR``, and that file's
existence is the app's "is the local model ready" signal.

Two sources feed the registry: the curated :data:`LOCAL_MODELS` below, and
user-supplied entries stored in config under ``local_custom_models``.
:func:`all_models` merges them, and every call site reads through it — so a
custom model needs no special case in download, delete, status or engine load.

Retiring a curated model: keep serving its entry while it is downloaded or
active, or an install would read "not ready" for a model sitting on its own
disk. Nothing is retired today — ``qwen3-4b-instruct``, the original default,
stays listed as the light option.
"""

from pathlib import Path

from app.paths import MODELS_DIR

# NOTE: verify the exact repo/filename against Hugging Face at build time.
# The official Qwen repos went gated (401 on download) as of 2026-07-09, so
# these point at the public bartowski mirrors instead — same Q4_K_M quant.
# Sizes are the exact content-length of each file (verified 2026-07-20); they
# drive the disk-space pre-check and the UI.
LOCAL_MODELS: dict[str, dict] = {
    "qwen3-4b-instruct": {
        "label": "Qwen3 4B Instruct",
        "repo": "bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF",
        "filename": "Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        "size_bytes": 2_500_000_000,
        "min_ram_gb": 8,
        "n_ctx": 16384,
    },
    "qwen3-8b": {
        "label": "Qwen3 8B",
        "repo": "bartowski/Qwen_Qwen3-8B-GGUF",
        "filename": "Qwen_Qwen3-8B-Q4_K_M.gguf",
        "size_bytes": 5_027_784_224,
        "min_ram_gb": 16,
        "n_ctx": 16384,
    },
    "gemma-3-12b-it": {
        "label": "Gemma 3 12B",
        "repo": "bartowski/google_gemma-3-12b-it-GGUF",
        "filename": "google_gemma-3-12b-it-Q4_K_M.gguf",
        "size_bytes": 7_300_575_264,
        "min_ram_gb": 16,
        "n_ctx": 16384,
    },
    "qwen3-14b": {
        "label": "Qwen3 14B",
        "repo": "bartowski/Qwen_Qwen3-14B-GGUF",
        "filename": "Qwen_Qwen3-14B-Q4_K_M.gguf",
        "size_bytes": 9_001_753_632,
        "min_ram_gb": 24,
        "n_ctx": 16384,
    },
}


def all_models() -> dict[str, dict]:
    """Curated entries merged with the user's custom ones from config."""
    # Local import: config imports this module lazily too, and a module-level
    # import either way would be a cycle.
    from app import config
    custom = config.load().get("local_custom_models") or {}
    return {**LOCAL_MODELS, **custom}


def get_model(model_id: str) -> dict | None:
    """Registry entry for an id, or None if unknown."""
    return all_models().get(model_id)


def local_model_path(model_id: str) -> Path | None:
    """Where the GGUF for this model lives once downloaded, or None for an
    unknown id. Existence is the app's "is the local model ready" signal."""
    entry = get_model(model_id)
    if not entry:
        return None
    return MODELS_DIR / entry["filename"]
