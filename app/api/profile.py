import json

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from app import config
from app.services.cv_renderer import PROFILE_PATH, blank_profile, load_profile, normalize_profile
from app.services.cv_importer import MAX_CV_BYTES, extract_profile, pdf_to_text
from app.services.llm import AIResponseError

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("")
def get_profile():
    # A brand-new install has no profile.json yet — return a blank v2 skeleton so
    # the editor opens on an empty state rather than erroring.
    if not PROFILE_PATH.exists():
        return blank_profile()
    try:
        return load_profile()
    except ValueError as e:
        raise HTTPException(500, str(e))


@router.put("")
def put_profile(body: dict):
    # Minimal shape check: a bad save would brick every CV render afterwards.
    if "personal" not in body:
        raise HTTPException(400, "Profile must include at least a 'personal' section.")
    PROFILE_PATH.write_text(json.dumps(body, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"ok": True}


@router.post("/import")
def import_profile(file: UploadFile | None = File(default=None), text: str = Form(default="")):
    """Extract a structured profile from an uploaded CV (PDF) or pasted text via one
    LLM call. Returns the normalized profile for review in the editor — it is NOT
    saved here; the client persists it on the next auto-save."""
    cfg = config.load()
    try:
        config.require_engine(cfg)
    except ValueError as e:
        raise HTTPException(400, str(e))

    cv_text = text or ""
    if file is not None:
        data = file.file.read(MAX_CV_BYTES + 1)
        if len(data) > MAX_CV_BYTES:
            raise HTTPException(400, "That file is too large (max 5 MB).")
        try:
            cv_text = pdf_to_text(data)
        except ValueError as e:
            raise HTTPException(400, str(e))

    if not cv_text.strip():
        raise HTTPException(400, "Paste your CV text or upload a PDF to import.")

    try:
        raw = extract_profile(cv_text, cfg)
    except AIResponseError:
        raise HTTPException(502, "The AI returned an unexpected response — try again.")
    except Exception as e:
        raise HTTPException(502, f"Couldn't import the CV ({e}).")

    return normalize_profile(raw)
