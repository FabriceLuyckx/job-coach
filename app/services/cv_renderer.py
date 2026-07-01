"""
Shared CV rendering utilities.

Used by:
  - scripts/generate_cv.py  (Phase 2 CLI)
  - scripts/tailor_cv.py    (Phase 3 CLI)
  - app/api/cv.py            (Phase 4 FastAPI endpoint)
"""

import base64
import html as html_lib
import json
import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from markupsafe import Markup

from app.paths import (  # noqa: E402  (re-exported for callers and scripts)
    OUTPUT_DIR,
    PHOTO_DIR,
    PROFILE_PATH,
    RESOURCE_DIR,
    TEMPLATES_DIR,
)

# Kept for the CLIs that print output paths relative to the repo root. In a
# source checkout RESOURCE_DIR is the repo root, so this is unchanged for them.
ROOT = RESOURCE_DIR

MONTH_ABBR = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
}

# Section titles only — per-skill-group headings now come from the profile data
# (skills.groups[].label), so the old fixed group label keys were removed.
LABELS: dict[str, dict[str, str]] = {
    "en": {
        "links": "Links", "skills": "Skills", "languages": "Languages",
        "education": "Education", "grants": "Grants & Fellowships",
        "experience": "Career Path", "publications": "Selected Publications",
        "projects": "Projects", "certifications": "Certifications",
        "awards": "Awards", "teaching": "Teaching", "present": "Present",
    },
    "nl": {
        "links": "Links", "skills": "Vaardigheden", "languages": "Talen",
        "education": "Opleiding", "grants": "Beurzen & Fellowships",
        "experience": "Loopbaan", "publications": "Selectie Publicaties",
        "projects": "Projecten", "certifications": "Certificaten",
        "awards": "Onderscheidingen", "teaching": "Onderwijs", "present": "Heden",
    },
}

# Star-rating proficiency scale shared by the language editor and normalization.
CEFR_LABELS: dict[int, str] = {
    1: "A1 Beginner", 2: "A2 Elementary", 3: "B1 Intermediate",
    4: "B2/C1 Advanced", 5: "C2 Native / Fluent",
}

# Generic editable groups seeded when a profile has no skills data at all.
DEFAULT_SKILL_GROUPS: list[dict] = [
    {"label": "Technical skills", "items": []},
    {"label": "Tools & software", "items": []},
    {"label": "Soft skills", "items": []},
]


def _groups_from_legacy(skills: dict) -> list[dict]:
    """Convert the old fixed skill categories into named groups (non-empty only)."""
    groups: list[dict] = []
    prog = skills.get("programming") or {}
    prog_items = list(prog.get("production") or []) + list(prog.get("research") or [])
    if prog_items:
        groups.append({"label": "Programming", "items": prog_items})
    if skills.get("visualization"):
        groups.append({"label": "Visualisation", "items": list(skills["visualization"])})
    cloud = skills.get("cloud_devops") or {}
    cloud_items = ["AWS " + a for a in (cloud.get("aws") or [])] + list(cloud.get("tools") or [])
    if cloud_items:
        groups.append({"label": "Cloud & DevOps", "items": cloud_items})
    if skills.get("databases"):
        groups.append({"label": "Databases", "items": list(skills["databases"])})
    if skills.get("big_data"):
        groups.append({"label": "Big data", "items": list(skills["big_data"])})
    if skills.get("ml_statistical"):
        groups.append({"label": "ML / Statistical", "items": list(skills["ml_statistical"])})
    if skills.get("current_tools"):
        groups.append({"label": "Tools", "items": list(skills["current_tools"])})
    return groups


def normalize_skills(skills: dict | None) -> dict:
    """Return skills in the generic {groups, languages} shape.

    Idempotent: if a `groups` key is already present it is left untouched (covers
    already-migrated saves, including a deliberately empty list). Otherwise the old
    fixed categories are converted; if there is no legacy data either, generic
    editable groups are seeded so any new user has something to fill in.
    """
    skills = dict(skills or {})

    languages: list[dict] = []
    for l in skills.get("languages") or []:
        if not isinstance(l, dict):
            continue
        level = l.get("level") or 0
        languages.append({
            "language": l.get("language", ""),
            "level": level,
            "label": l.get("label") or CEFR_LABELS.get(level, ""),
        })

    if "groups" in skills:
        groups = skills.get("groups") or []
    else:
        groups = _groups_from_legacy(skills) or [dict(g) for g in DEFAULT_SKILL_GROUPS]

    return {"groups": groups, "languages": languages}


def load_profile(path: Path = PROFILE_PATH) -> dict:
    """Read profile.json and normalize its skills to the groups+languages shape, so
    legacy and migrated files both render and edit identically."""
    profile = json.loads(path.read_text(encoding="utf-8"))
    profile["skills"] = normalize_skills(profile.get("skills"))
    return profile


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def format_date(value: str) -> str:
    """Convert 'YYYY-MM' to 'Mon YYYY'; pass other strings through unchanged."""
    if not value or len(value) != 7 or value[4] != "-":
        return value or ""
    year, month = value[:4], value[5:]
    return f"{MONTH_ABBR.get(month, month)} {year}"


def strip_scheme(url: str) -> str:
    """Remove https:// and www. prefix for compact display."""
    return re.sub(r"^https?://(www\.)?", "", url).rstrip("/")


def richtext(value: str) -> Markup:
    """Render lightweight inline markup: **bold** and *italic*. HTML-escapes the
    text first, so user content can't inject markup, then adds <strong>/<em>."""
    s = html_lib.escape(value or "")
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)        # **bold**
    s = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<em>\1</em>", s)  # *italic*
    return Markup(s)


def teaching_line(teaching) -> str:
    """Build a compact one-line teaching summary from structured teaching data.

    Used as the generic-CV fallback when no AI-tailored `teaching.cv_summary` is
    present. Returns '' when there is nothing to show (so the template hides the
    section). For tailored CVs, cv_summary takes precedence in the template.
    """
    if not isinstance(teaching, dict):
        return ""
    parts: list[str] = []
    for f in teaching.get("formal_experience") or []:
        typ = (f.get("type") or "").strip()
        inst = (f.get("institution") or "").strip()
        if typ and inst:
            parts.append(f"{typ} at {inst}")
        elif typ or inst:
            parts.append(typ or inst)
    insts: list[str] = []
    for g in teaching.get("guest_lectures") or []:
        inst = (g.get("institution") or "").strip()
        if inst and inst not in insts:
            insts.append(inst)
    if insts:
        parts.append("Guest lectures at " + ", ".join(insts))
    if (teaching.get("student_supervision") or "").strip():
        parts.append("student supervision")
    return " · ".join(parts)


def load_photo() -> str | None:
    """Return a base64 data URI for profile/photo.{jpg,jpeg,png,webp}, or None."""
    for ext in ("jpg", "jpeg", "png", "webp"):
        path = PHOTO_DIR / f"photo.{ext}"
        if path.exists():
            mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
            data = base64.b64encode(path.read_bytes()).decode()
            return f"data:{mime};base64,{data}"
    return None


def build_env() -> Environment:
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))
    env.filters["format_date"] = format_date
    env.filters["strip_scheme"] = strip_scheme
    env.filters["richtext"] = richtext
    env.filters["teaching_line"] = teaching_line
    return env
