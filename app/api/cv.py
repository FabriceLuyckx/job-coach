import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app import config
from app.services.cv_generator import apply_tailoring, fetch_job_description, tailor
from app.services.cv_renderer import (
    LABELS,
    OUTPUT_DIR,
    PROFILE_PATH,
    build_env,
    load_photo,
)

router = APIRouter(prefix="/api/cv", tags=["cv"])

_PREVIEW_STORE: dict[str, str] = {}


class GenerateRequest(BaseModel):
    url: str
    lang: str = "en"


@router.post("/generate")
def generate_cv(body: GenerateRequest):
    if body.lang not in LABELS:
        raise HTTPException(400, f"Unknown lang '{body.lang}'. Choices: {list(LABELS)}")

    cfg = config.load()
    api_key = cfg.get("openrouter_api_key", "")
    model = cfg.get("openrouter_model", "anthropic/claude-sonnet-4-6")
    if not api_key:
        raise HTTPException(400, "OpenRouter API key not configured. Set it in Settings.")

    if not PROFILE_PATH.exists():
        raise HTTPException(500, "profile.json not found")
    profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))

    try:
        plan = tailor(profile, body.url, api_key, model)
    except Exception as e:
        raise HTTPException(500, f"Tailoring failed: {e}") from e

    tailored = apply_tailoring(profile, plan)

    include_photo = profile.get("cv_design_preferences", {}).get("include_photo", False)
    photo_uri = load_photo() if include_photo else None

    env = build_env()
    html = env.get_template("default.html").render(
        **tailored,
        labels=LABELS[body.lang],
        lang=body.lang,
        photo=photo_uri,
    )

    slug = plan.slug
    _PREVIEW_STORE[slug] = html

    out_dir = OUTPUT_DIR / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"cv_{body.lang}.html").write_text(html, encoding="utf-8")

    return {
        "slug": slug,
        "job_title": plan.job_title,
        "employer": plan.employer,
        "tailoring_notes": plan.tailoring_notes,
        "preview_url": f"/api/cv/preview/{slug}",
    }


@router.get("/preview/{slug}", response_class=HTMLResponse)
def preview_cv(slug: str):
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    if slug in _PREVIEW_STORE:
        return HTMLResponse(_PREVIEW_STORE[slug])
    for lang in ("en", "nl"):
        path = OUTPUT_DIR / slug / f"cv_{lang}.html"
        if path.exists():
            return HTMLResponse(path.read_text(encoding="utf-8"))
    raise HTTPException(404, "CV not found")
