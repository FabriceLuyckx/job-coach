# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Registry of downloadable local LLM models (GGUF, run via llama-cpp-python).

v1 ships a single recommended model. The registry shape lets more be offered
later without touching call sites: everything keys off the registry id stored in
config as ``local_model_id``.
"""

from pathlib import Path

from app.paths import MODELS_DIR

# NOTE: verify the exact repo/filename against Hugging Face at build time.
# The official Qwen/Qwen3-4B-Instruct-2507-GGUF repo went gated (401 on
# download) as of 2026-07-09, so this points at the bartowski mirror instead —
# same Q4_K_M quant, public.
LOCAL_MODELS: dict[str, dict] = {
    "qwen3-4b-instruct": {
        "label": "Qwen3 4B Instruct (recommended)",
        "repo": "bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF",
        "filename": "Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        # Approximate on-disk size; used only for the disk-space pre-check and UI.
        "size_bytes": 2_500_000_000,
        "min_ram_gb": 8,
        "n_ctx": 16384,
    },
}


def get_model(model_id: str) -> dict | None:
    """Registry entry for an id, or None if unknown."""
    return LOCAL_MODELS.get(model_id)


def local_model_path(model_id: str) -> Path | None:
    """Where the GGUF for this model lives once downloaded, or None for an
    unknown id. Existence is the app's "is the local model ready" signal."""
    entry = LOCAL_MODELS.get(model_id)
    if not entry:
        return None
    return MODELS_DIR / entry["filename"]
