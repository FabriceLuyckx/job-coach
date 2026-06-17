import json
from fastapi import APIRouter, HTTPException
from app.services.cv_renderer import PROFILE_PATH

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("")
def get_profile():
    if not PROFILE_PATH.exists():
        raise HTTPException(404, "profile.json not found")
    return json.loads(PROFILE_PATH.read_text(encoding="utf-8"))


@router.put("")
def put_profile(body: dict):
    PROFILE_PATH.write_text(json.dumps(body, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"ok": True}
