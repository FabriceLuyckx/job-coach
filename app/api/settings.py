import base64
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from app import config
from app.services.cv_renderer import ROOT

router = APIRouter(prefix="/api/settings", tags=["settings"])

PHOTO_DIR = ROOT / "profile"
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


class SettingsIn(BaseModel):
    openrouter_api_key: str | None = None
    openrouter_model: str | None = None


@router.get("")
def get_settings():
    cfg = config.load()
    key = cfg.get("openrouter_api_key", "")
    return {
        "openrouter_api_key_set": bool(key),
        "openrouter_api_key_preview": f"...{key[-4:]}" if len(key) > 4 else ("set" if key else ""),
        "openrouter_model": cfg.get("openrouter_model", ""),
    }


@router.put("")
def put_settings(body: SettingsIn):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    config.save(updates)
    return {"ok": True}


@router.post("/photo")
async def upload_photo(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTS:
        raise HTTPException(400, f"Unsupported file type: {suffix}")
    for ext in ("jpg", "jpeg", "png", "webp"):
        old = PHOTO_DIR / f"photo.{ext}"
        if old.exists():
            old.unlink()
    dest = PHOTO_DIR / f"photo{suffix}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"ok": True, "filename": dest.name}


@router.delete("/photo")
def delete_photo():
    deleted = False
    for ext in ("jpg", "jpeg", "png", "webp"):
        p = PHOTO_DIR / f"photo.{ext}"
        if p.exists():
            p.unlink()
            deleted = True
    return {"ok": True, "deleted": deleted}


@router.get("/photo")
def get_photo():
    for ext in ("jpg", "jpeg", "png", "webp"):
        p = PHOTO_DIR / f"photo.{ext}"
        if p.exists():
            mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
            data = base64.b64encode(p.read_bytes()).decode()
            return {"exists": True, "data_uri": f"data:{mime};base64,{data}"}
    return {"exists": False, "data_uri": None}
