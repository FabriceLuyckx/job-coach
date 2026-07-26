# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from app import config
from app.services.cv_generator import DEFAULT_CV_PROMPT
from app.services.cv_renderer import PHOTO_EXTS, load_photo
from app.services.job_scanner import DEFAULT_EXTRACT_PROMPT, DEFAULT_SCAN_PROMPT
from app.services.letter_guide import DEFAULT_LETTER_PROMPT
from app.paths import PHOTO_DIR

router = APIRouter(prefix="/api/settings", tags=["settings"])

ALLOWED_EXTS = {f".{ext}" for ext in PHOTO_EXTS}
MAX_PHOTO_BYTES = 10 * 1024 * 1024

# Magic-byte signatures so a renamed non-image can't be saved as the CV photo.
_IMAGE_SIGNATURES = {
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".webp": (b"RIFF",),  # + 'WEBP' at offset 8, checked separately
}


def _looks_like_image(suffix: str, head: bytes) -> bool:
    if not any(head.startswith(sig) for sig in _IMAGE_SIGNATURES.get(suffix, ())):
        return False
    if suffix == ".webp":
        return head[8:12] == b"WEBP"
    return True


class SettingsIn(BaseModel):
    openrouter_api_key: str | None = None
    openrouter_model: str | None = None
    cv_prompt: str | None = None
    letter_prompt: str | None = None
    scan_extract_prompt: str | None = None
    scan_filter_prompt: str | None = None
    # AI engine + UI language + onboarding marker.
    llm_provider: str | None = None
    local_model_id: str | None = None
    app_language: str | None = None
    onboarding_done: bool | None = None
    auto_update_check: bool | None = None


@router.get("")
def get_settings():
    cfg = config.load()
    key = cfg.get("openrouter_api_key", "")
    return {
        "openrouter_api_key_set": bool(key),
        "openrouter_api_key_preview": f"...{key[-4:]}" if len(key) > 4 else ("set" if key else ""),
        "openrouter_model": cfg.get("openrouter_model", ""),
        "cv_prompt": cfg.get("cv_prompt") or DEFAULT_CV_PROMPT,
        "cv_prompt_default": DEFAULT_CV_PROMPT,
        "letter_prompt": cfg.get("letter_prompt") or DEFAULT_LETTER_PROMPT,
        "letter_prompt_default": DEFAULT_LETTER_PROMPT,
        "scan_extract_prompt": cfg.get("scan_extract_prompt") or DEFAULT_EXTRACT_PROMPT,
        "scan_extract_prompt_default": DEFAULT_EXTRACT_PROMPT,
        "scan_filter_prompt": cfg.get("scan_filter_prompt") or DEFAULT_SCAN_PROMPT,
        "scan_filter_prompt_default": DEFAULT_SCAN_PROMPT,
        "llm_provider": cfg.get("llm_provider") or "openrouter",
        "local_model_id": cfg.get("local_model_id") or config.DEFAULT_LOCAL_MODEL,
        "app_language": cfg.get("app_language") or "en",
        "onboarding_done": bool(cfg.get("onboarding_done")),
        "auto_update_check": bool(cfg.get("auto_update_check", True)),
    }


def _verify_openrouter_key(key: str) -> None:
    """Zero-cost validity check: GET /api/v1/key returns the key's metadata
    without spending any tokens. Raises HTTPException on a bad/unreachable key."""
    try:
        r = httpx.get(
            "https://openrouter.ai/api/v1/key",
            headers={"Authorization": f"Bearer {key}"},
            timeout=10,
        )
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Could not reach OpenRouter to validate the key: {e}")
    if r.status_code in (401, 403):
        raise HTTPException(400, "OpenRouter rejected this API key (invalid or revoked).")
    if r.status_code != 200:
        raise HTTPException(400, f"OpenRouter key check failed (HTTP {r.status_code}).")


@router.get("/openrouter-usage")
def openrouter_usage():
    """Live credit balance + usage for the stored key. Both reads are zero-cost
    (no tokens spent): /api/v1/credits gives the account balance, /api/v1/key the
    per-key usage/limit as a fallback. Normalised so the UI degrades gracefully."""
    cfg = config.load()
    key = cfg.get("openrouter_api_key", "")
    if not key:
        raise HTTPException(400, "No OpenRouter API key set.")
    headers = {"Authorization": f"Bearer {key}"}
    out: dict = {"balance": None, "usage": None, "remaining": None, "is_free_tier": None}
    try:
        kr = httpx.get("https://openrouter.ai/api/v1/key", headers=headers, timeout=10)
        if kr.status_code in (401, 403):
            raise HTTPException(400, "OpenRouter rejected this API key (invalid or revoked).")
        if kr.status_code == 200:
            d = kr.json().get("data", {}) or {}
            out["usage"] = d.get("usage")
            out["remaining"] = d.get("limit_remaining")
            out["is_free_tier"] = d.get("is_free_tier")
        cr = httpx.get("https://openrouter.ai/api/v1/credits", headers=headers, timeout=10)
        if cr.status_code == 200:
            c = cr.json().get("data", {}) or {}
            tc, tu = c.get("total_credits"), c.get("total_usage")
            if tc is not None and tu is not None:
                out["balance"] = round(tc - tu, 4)
                out["usage"] = round(tu, 4)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Could not reach OpenRouter: {e}")
    return out


@router.put("")
def put_settings(body: SettingsIn):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    # Validate a newly supplied key before persisting it, so a bad key is
    # caught here rather than on the first CV generation / job scan.
    if updates.get("openrouter_api_key"):
        _verify_openrouter_key(updates["openrouter_api_key"])
    # The tailoring prompt must keep its language placeholder, or every CV would
    # silently come out in English regardless of the requested language.
    if updates.get("cv_prompt") and "{lang_name}" not in updates["cv_prompt"]:
        raise HTTPException(400, "The CV prompt must contain the {lang_name} placeholder.")
    if updates.get("letter_prompt") and "{lang_name}" not in updates["letter_prompt"]:
        raise HTTPException(400, "The cover-letter prompt must contain the {lang_name} placeholder.")
    config.save(updates)
    return {"ok": True}


@router.post("/photo")
def upload_photo(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTS:
        raise HTTPException(400, f"Unsupported file type: {suffix or '(none)'}")
    data = file.file.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(400, "Photo is too large (max 10 MB).")
    if not _looks_like_image(suffix, data[:16]):
        raise HTTPException(400, "That file doesn't look like a valid JPEG/PNG/WebP image.")
    for ext in PHOTO_EXTS:
        old = PHOTO_DIR / f"photo.{ext}"
        if old.exists():
            old.unlink()
    dest = PHOTO_DIR / f"photo{suffix}"
    dest.write_bytes(data)
    return {"ok": True, "filename": dest.name}


@router.delete("/photo")
def delete_photo():
    deleted = False
    for ext in PHOTO_EXTS:
        p = PHOTO_DIR / f"photo.{ext}"
        if p.exists():
            p.unlink()
            deleted = True
    return {"ok": True, "deleted": deleted}


@router.get("/photo")
def get_photo():
    uri = load_photo()
    return {"exists": uri is not None, "data_uri": uri}
