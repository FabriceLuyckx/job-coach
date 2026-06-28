import json
from fastapi import APIRouter, HTTPException
from app.services.cv_renderer import PROFILE_PATH, load_profile

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("")
def get_profile():
    if not PROFILE_PATH.exists():
        raise HTTPException(404, "profile.json not found")
    # Normalize skills (legacy categories → groups) so the editor always sees the
    # generic shape regardless of when the file was last saved.
    return load_profile()


@router.put("")
def put_profile(body: dict):
    PROFILE_PATH.write_text(json.dumps(body, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"ok": True}
