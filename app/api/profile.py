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
