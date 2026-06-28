"""
Shared CV rendering utilities.

Used by:
  - scripts/generate_cv.py  (Phase 2 CLI)
  - scripts/tailor_cv.py    (Phase 3 CLI)
  - app/api/cv.py            (Phase 4 FastAPI endpoint)
"""

import base64
import html as html_lib
import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from markupsafe import Markup

ROOT = Path(__file__).resolve().parent.parent.parent
PROFILE_PATH = ROOT / "profile" / "profile.json"
TEMPLATES_DIR = ROOT / "templates" / "cv"
OUTPUT_DIR = ROOT / "output"

MONTH_ABBR = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
}

LABELS: dict[str, dict[str, str]] = {
    "en": {
        "links": "Links", "skills": "Skills", "programming": "Programming",
        "visualisation": "Visualisation", "cloud_devops": "Cloud & DevOps",
        "big_data": "Big Data", "databases": "Databases", "languages": "Languages",
        "education": "Education", "grants": "Grants & Fellowships",
        "experience": "Career Path", "publications": "Selected Publications",
        "projects": "Projects", "certifications": "Certifications",
        "awards": "Awards", "present": "Present",
    },
    "nl": {
        "links": "Links", "skills": "Vaardigheden", "programming": "Programmeren",
        "visualisation": "Visualisatie", "cloud_devops": "Cloud & DevOps",
        "big_data": "Big Data", "databases": "Databases", "languages": "Talen",
        "education": "Opleiding", "grants": "Beurzen & Fellowships",
        "experience": "Loopbaan", "publications": "Selectie Publicaties",
        "projects": "Projecten", "certifications": "Certificaten",
        "awards": "Onderscheidingen", "present": "Heden",
    },
}


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


def load_photo() -> str | None:
    """Return a base64 data URI for profile/photo.{jpg,jpeg,png,webp}, or None."""
    for ext in ("jpg", "jpeg", "png", "webp"):
        path = ROOT / "profile" / f"photo.{ext}"
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
    return env
