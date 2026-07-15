# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""AI engine status + local-model download management.

`GET /api/engine` is the app-wide "is AI configured and ready" check that the
frontend onboarding/banners drive off. The download endpoints fetch the selected
GGUF from Hugging Face into MODELS_DIR with resumable, progress-tracked streaming.
"""

import shutil
import threading
import time
import uuid

import httpx
import psutil
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config
from app.paths import MODELS_DIR
from app.services.engines.registry import LOCAL_MODELS, get_model, local_model_path

router = APIRouter(prefix="/api/engine", tags=["engine"])

# Single active download at a time, keyed by id for status polling.
_downloads: dict[str, dict] = {}
_dl_lock = threading.Lock()
_DL_TTL = 3600


def _evict_downloads() -> None:
    cutoff = time.time() - _DL_TTL
    for did in [d for d, v in _downloads.items()
                if v.get("state") in ("done", "error") and v.get("created", 0) < cutoff]:
        del _downloads[did]


def _engine_status(cfg: dict) -> dict:
    """{provider, ready, detail, model} — provider readiness without raising."""
    provider = cfg.get("llm_provider") or "openrouter"
    if provider == "local":
        model_id = cfg.get("local_model_id") or config.DEFAULT_LOCAL_MODEL
        entry = get_model(model_id)
        path = local_model_path(model_id)
        ready = bool(path and path.exists())
        return {
            "provider": "local",
            "ready": ready,
            "detail": "Model downloaded" if ready else "Model not downloaded",
            "model": {"id": model_id, "label": entry["label"] if entry else model_id,
                      "size_bytes": entry["size_bytes"] if entry else None,
                      "min_ram_gb": entry["min_ram_gb"] if entry else None},
        }
    ready = bool(cfg.get("openrouter_api_key"))
    return {
        "provider": "openrouter",
        "ready": ready,
        "detail": "API key set" if ready else "No API key",
        "model": None,
    }


@router.get("")
def engine_status():
    return _engine_status(config.load())


@router.get("/models")
def list_models():
    """The local-model registry (for the Settings/onboarding model picker)."""
    def downloaded(mid: str) -> bool:
        p = local_model_path(mid)
        return bool(p and p.exists())

    return [
        {"id": mid, "label": e["label"], "size_bytes": e["size_bytes"],
         "min_ram_gb": e["min_ram_gb"], "downloaded": downloaded(mid)}
        for mid, e in LOCAL_MODELS.items()
    ]


def _run_download(download_id: str, model_id: str) -> None:
    entry = get_model(model_id)
    target = local_model_path(model_id)
    try:
        from huggingface_hub import hf_hub_url
        url = hf_hub_url(repo_id=entry["repo"], filename=entry["filename"])
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        part = target.with_suffix(target.suffix + ".part")

        # Resume a partial download if one exists.
        resume_at = part.stat().st_size if part.exists() else 0
        headers = {"Range": f"bytes={resume_at}-"} if resume_at else {}
        if resume_at:
            with _dl_lock:
                _downloads[download_id]["state"] = "resuming"

        with httpx.stream("GET", url, headers=headers, follow_redirects=True, timeout=60) as r:
            if resume_at and r.status_code != 206:
                # Server ignored the Range (200 = full body, 416 = part already
                # past EOF, e.g. from a differently-sized upstream file). Appending
                # would corrupt the model — drop the partial and start from zero.
                resume_at = 0
                part.unlink(missing_ok=True)
                if r.status_code != 200:
                    r.raise_for_status()
            r.raise_for_status()
            total = int(r.headers.get("content-length", 0)) + resume_at
            with _dl_lock:
                _downloads[download_id].update({"state": "downloading",
                                                "bytes_total": total or entry["size_bytes"],
                                                "bytes_done": resume_at})
            mode = "ab" if resume_at else "wb"
            with open(part, mode) as f:
                for chunk in r.iter_bytes(chunk_size=1024 * 1024):
                    f.write(chunk)
                    with _dl_lock:
                        _downloads[download_id]["bytes_done"] += len(chunk)

        # Tripwire: a truncated stream that ended without error must not become a
        # "ready" model. content-length is authoritative when the server sent one.
        if total and part.stat().st_size != total:
            raise RuntimeError(
                f"Download incomplete ({part.stat().st_size} of {total} bytes) — try again to resume."
            )
        part.replace(target)
        with _dl_lock:
            _downloads[download_id].update({"state": "done", "bytes_done":
                                            _downloads[download_id].get("bytes_total")})
    except Exception as e:
        with _dl_lock:
            _downloads[download_id].update({"state": "error", "error": str(e)})


class DownloadRequest(BaseModel):
    model_id: str | None = None
    force: bool = False  # override the RAM pre-check


@router.post("/download")
def start_download(body: DownloadRequest):
    cfg = config.load()
    model_id = body.model_id or cfg.get("local_model_id") or config.DEFAULT_LOCAL_MODEL
    entry = get_model(model_id)
    if entry is None:
        raise HTTPException(404, "Unknown model.")

    target = local_model_path(model_id)
    if target and target.exists():
        raise HTTPException(400, "That model is already downloaded.")

    # Disk pre-check: need ~1.5× the model size free.
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(MODELS_DIR).free
    if free < entry["size_bytes"] * 1.5:
        need = entry["size_bytes"] * 1.5 / 1e9
        raise HTTPException(400, f"Not enough free disk space — about {need:.1f} GB needed.")

    # RAM pre-check (overridable): warn users whose machine may not run the model.
    if not body.force:
        total_gb = psutil.virtual_memory().total / 1e9
        if total_gb < entry["min_ram_gb"]:
            raise HTTPException(
                400,
                f"This model recommends {entry['min_ram_gb']} GB of RAM; this machine "
                f"has about {total_gb:.0f} GB. Download anyway to proceed.",
            )

    download_id = str(uuid.uuid4())
    with _dl_lock:
        _evict_downloads()
        # Refuse a second concurrent download.
        if any(v.get("state") in ("downloading", "resuming", "pending")
               for v in _downloads.values()):
            raise HTTPException(409, "A download is already in progress.")
        _downloads[download_id] = {"state": "pending", "bytes_done": 0,
                                   "bytes_total": entry["size_bytes"],
                                   "created": time.time(), "model_id": model_id}
    threading.Thread(target=_run_download, args=(download_id, model_id), daemon=True).start()
    return {"download_id": download_id}


@router.get("/download/status/{download_id}")
def download_status(download_id: str):
    with _dl_lock:
        s = _downloads.get(download_id)
    if not s:
        raise HTTPException(404, "Download not found")
    return s


@router.get("/download/status")
def latest_download_status():
    """The most recent download's status, if any (for reconnecting UIs)."""
    with _dl_lock:
        if not _downloads:
            return {"state": "idle"}
        latest = max(_downloads.values(), key=lambda v: v.get("created", 0))
    return latest


@router.delete("/model")
def delete_model(model_id: str | None = None):
    # Deleting the .part file out from under the download thread would make the
    # download fail at the final rename — refuse while one is running.
    with _dl_lock:
        if any(v.get("state") in ("downloading", "resuming", "pending")
               for v in _downloads.values()):
            raise HTTPException(409, "A download is in progress — wait for it to finish first.")
    cfg = config.load()
    mid = model_id or cfg.get("local_model_id") or config.DEFAULT_LOCAL_MODEL
    path = local_model_path(mid)
    if path and path.exists():
        path.unlink()
    # Also clear any leftover partial file.
    if path:
        part = path.with_suffix(path.suffix + ".part")
        if part.exists():
            part.unlink()
    return {"ok": True}
