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

# Accepted CV-photo file extensions, shared by upload, serving, and backup.
PHOTO_EXTS = ("jpg", "jpeg", "png", "webp")

MONTH_ABBR = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
}

# Section titles only — per-skill-group headings now come from the profile data
# (skills.groups[].label). Reviewed translations live in app/i18n/cv_labels.json;
# on-device generated label sets (Phase D) live under DATA_DIR/locales.
_CV_LABELS_PATH = RESOURCE_DIR / "app" / "i18n" / "cv_labels.json"
LABELS: dict[str, dict[str, str]] = json.loads(_CV_LABELS_PATH.read_text(encoding="utf-8"))


def cv_labels(lang: str) -> dict[str, str]:
    """CV section labels for a language, falling back to English per missing key.

    Order of lookup: bundled reviewed labels (LABELS) → on-device generated labels
    (DATA_DIR/locales/cv_labels.<lang>.json, written by Phase D) → English.
    """
    en = LABELS["en"]
    if lang == "en":
        return dict(en)
    labels = dict(LABELS.get(lang) or {})
    if not labels:
        # Phase D: a generated label set may exist on disk for a Tier-2 language.
        from app.paths import LOCALES_DIR
        gen = LOCALES_DIR / f"cv_labels.{lang}.json"
        if gen.exists():
            try:
                labels = json.loads(gen.read_text(encoding="utf-8"))
            except (ValueError, OSError):
                labels = {}
    # English fallback for any missing key so a CV never shows a blank heading.
    return {k: labels.get(k) or v for k, v in en.items()}

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


# ── Profile schema v2 migration ──────────────────────────────────────────────
# v2 replaces one specific user's questionnaire-shaped fields with career-neutral
# equivalents. normalize_profile() upgrades a v1 (or partial) profile in memory on
# every load; the first auto-save then persists the v2 shape. Idempotent on v2.

# Optional sections keyed the same on the backend and the frontend registry. Used
# to seed meta.enabled_sections when migrating a profile that predates it.
OPTIONAL_SECTIONS = (
    "projects", "certifications", "awards", "publications", "grants",
    "academic", "teaching", "career_context",
    "volunteering", "courses", "memberships", "custom_sections",
)


def _nonempty(*vals) -> list[str]:
    """Return the given values that are non-empty strings, stripped."""
    return [str(v).strip() for v in vals if isinstance(v, str) and v.strip()]


def _migrate_links(personal: dict) -> None:
    """v1 links dict {linkedin, github, google_scholar} → v2 ordered list."""
    links = personal.get("links")
    if isinstance(links, list):
        # Already v2 — keep only well-formed entries.
        personal["links"] = [
            {"label": str(l.get("label", "")).strip(), "url": str(l.get("url", "")).strip()}
            for l in links if isinstance(l, dict) and str(l.get("url", "")).strip()
        ]
        return
    labels = {"linkedin": "LinkedIn", "github": "GitHub", "google_scholar": "Google Scholar"}
    out: list[dict] = []
    if isinstance(links, dict):
        # Preserve known order first, then any extra custom keys.
        for key in ("linkedin", "github", "google_scholar"):
            url = str(links.get(key) or "").strip()
            if url:
                out.append({"label": labels[key], "url": url})
        for key, url in links.items():
            if key in labels:
                continue
            url = str(url or "").strip()
            if url:
                out.append({"label": key.replace("_", " ").title(), "url": url})
    personal["links"] = out


def _migrate_experience(exp: dict) -> dict:
    """Collapse the v1 interview-style fields into responsibilities + two optional
    free-text notes (relevance_note, ai_context)."""
    e = dict(exp)

    # achievements folded into the single bullet list.
    if "achievements" in e:
        ach = [a for a in (e.pop("achievements") or []) if str(a).strip()]
        e["responsibilities"] = list(e.get("responsibilities") or []) + ach

    # relevance {4 fixed axes} → one optional note.
    if "relevance_note" not in e:
        rel = e.pop("relevance", None)
        lines: list[str] = []
        if isinstance(rel, dict):
            for k in ("teaching", "research", "leadership", "interdisciplinarity"):
                v = rel.get(k)
                if isinstance(v, str) and v.strip():
                    lines.append(f"{k.capitalize()}: {v.strip()}")
        e["relevance_note"] = "\n".join(lines)
    else:
        e.pop("relevance", None)

    # Assorted never-printed fields → one optional "notes for the AI" blob.
    if "ai_context" not in e:
        parts: list[str] = []
        for label, key in (
            ("Reporting", "reporting_structure"),
            ("Technical difficulty", "technical_difficulty"),
            ("Impact", "impact"),
            ("Mentoring", "mentoring_detail"),
            ("Presentations", "presentations_detail"),
        ):
            v = e.get(key)
            if isinstance(v, str) and v.strip():
                parts.append(f"{label}: {v.strip()}")
        if e.get("mentored") and not e.get("mentoring_detail"):
            parts.append("Mentored others.")
        pres = e.get("presentations")
        if pres and not e.get("presentations_detail"):
            parts.append("Presentations: " + ", ".join(str(p) for p in pres))
        if e.get("full_time") is False:
            parts.append("Part-time role.")
        e["ai_context"] = "\n".join(parts)

    # Drop the retired v1 keys (is_current is derived from an empty end_date).
    for key in (
        "reporting_structure", "technical_difficulty", "impact", "mentored",
        "mentoring_detail", "presentations", "presentations_detail",
        "team_size", "full_time", "is_current",
    ):
        e.pop(key, None)

    e.setdefault("id", "")
    e.setdefault("title", "")
    e.setdefault("employer", "")
    e.setdefault("location", "")
    e.setdefault("start_date", "")
    e.setdefault("end_date", None)
    e.setdefault("responsibilities", [])
    e.setdefault("technologies", [])
    e.setdefault("relevance_note", "")
    e.setdefault("ai_context", "")
    return e


def _migrate_academic(academic: dict | None) -> dict:
    """v1 academic (neural/computational method buckets + datasets_tools) → v2 with
    user-named method groups; research_themes/topics_to_teach move in from narrative."""
    a = dict(academic or {})
    if "methods" in a and isinstance(a["methods"], list):
        method_groups = [
            {"label": str(g.get("label", "")).strip(), "items": list(g.get("items") or [])}
            for g in a["methods"] if isinstance(g, dict)
        ]
    else:
        method_groups = []
        methods = a.get("methods") if isinstance(a.get("methods"), dict) else {}
        for key, label in (("neural_analyses", "Neural / brain analysis"),
                           ("computational_modelling", "Computational modelling")):
            items = list(methods.get(key) or [])
            if items:
                method_groups.append({"label": label, "items": items})
        dt = a.get("datasets_tools") or {}
        if dt.get("data_types"):
            method_groups.append({"label": "Data types", "items": list(dt["data_types"])})
        if dt.get("tools"):
            method_groups.append({"label": "Tools", "items": list(dt["tools"])})
    a.pop("datasets_tools", None)
    a["methods"] = method_groups
    a.setdefault("research_areas", [])
    a.setdefault("interdisciplinary_work", [])
    a.setdefault("collaborators", [])
    a.setdefault("research_themes", "")
    a.setdefault("topics_to_teach", [])
    return a


def _migrate_work_preferences(wp: dict | None) -> dict:
    """Academic niche fields → free-text organisation_preferences; the two salary
    numbers → an expected min/max/currency/period object; add the common gaps."""
    w = dict(wp or {})
    if "salary" not in w or not isinstance(w.get("salary"), dict):
        w["salary"] = {
            "min": w.get("salary_current_gross") or None,
            "max": None,
            "currency": "EUR",
            "period": "month",
            "notes": (f"Mobility budget: {w['salary_mobility_budget']}"
                      if w.get("salary_mobility_budget") else ""),
        }
    if "organisation_preferences" not in w:
        w["organisation_preferences"] = "\n".join(_nonempty(
            w.get("institution_type_preference"),
            w.get("research_vs_teaching"),
            w.get("leadership_interest"),
        ))
    for key in ("salary_current_gross", "salary_mobility_budget",
                "institution_type_preference", "research_vs_teaching", "leadership_interest"):
        w.pop(key, None)
    w.setdefault("commute_radius", [])
    w.setdefault("remote_hybrid", "Hybrid")
    w.setdefault("schedule", "")
    w.setdefault("language_preferences", [])
    w.setdefault("relocation", "")
    w.setdefault("contract_types", [])
    w.setdefault("availability", "")
    w.setdefault("travel", "")
    return w


def _optional_has_data(p: dict, key: str) -> bool:
    """Backend mirror of the frontend optionalHasData — used to seed enabled_sections."""
    if key in ("projects", "certifications", "awards", "publications", "grants",
               "volunteering", "courses", "memberships", "custom_sections"):
        return bool(p.get(key))
    if key == "academic":
        a = p.get("academic") or {}
        return bool(a.get("research_areas") or a.get("methods") or a.get("collaborators")
                    or a.get("interdisciplinary_work") or a.get("research_themes")
                    or a.get("topics_to_teach"))
    if key == "teaching":
        t = p.get("teaching") or {}
        return bool(t.get("subjects_to_teach") or t.get("formal_experience")
                    or t.get("guest_lectures") or t.get("student_supervision")
                    or t.get("mentoring") or t.get("educational_materials"))
    if key == "career_context":
        n = p.get("narrative") or {}
        return bool(n.get("target_industries") or n.get("differentiation")
                    or n.get("problems_enjoyed") or n.get("work_to_avoid")
                    or n.get("looking_for"))
    return False


def normalize_profile(profile: dict) -> dict:
    """Upgrade a v1/partial profile to the career-neutral v2 shape in memory.

    Idempotent: a v2 profile passes through unchanged. Callers persist the result
    on the next save, so old files migrate transparently.
    """
    p = dict(profile)
    p["skills"] = normalize_skills(p.get("skills"))

    personal = dict(p.get("personal") or {})
    _migrate_links(personal)
    p["personal"] = personal

    narrative = dict(p.get("narrative") or {})
    # CV professional summary is now a top-level field; "what I'm looking for" is a
    # separate, jobs-facing narrative field seeded from the same v1 text.
    if "summary" not in p:
        p["summary"] = narrative.get("target_roles_description", "") or ""
    if "looking_for" not in narrative:
        narrative["looking_for"] = narrative.get("target_roles_description", "") or ""
    # research_themes / topics_to_teach move under academic (below); drop the
    # v1-only key from narrative.
    moved_research_themes = narrative.pop("research_themes", "")
    moved_topics = narrative.pop("topics_to_teach", [])
    narrative.pop("target_roles_description", None)
    narrative.setdefault("target_industries", [])
    narrative.setdefault("differentiation", "")
    narrative.setdefault("problems_enjoyed", "")
    narrative.setdefault("work_to_avoid", "")
    p["narrative"] = narrative

    p["experience"] = [_migrate_experience(e) for e in (p.get("experience") or []) if isinstance(e, dict)]

    academic = _migrate_academic(p.get("academic"))
    if not academic.get("research_themes") and moved_research_themes:
        academic["research_themes"] = moved_research_themes
    if not academic.get("topics_to_teach") and moved_topics:
        academic["topics_to_teach"] = moved_topics
    p["academic"] = academic

    p["work_preferences"] = _migrate_work_preferences(p.get("work_preferences"))

    teaching = dict(p.get("teaching") or {})
    teaching.setdefault("formal_experience", [])
    teaching.setdefault("guest_lectures", [])
    teaching.setdefault("subjects_to_teach", [])
    teaching.setdefault("student_supervision", "")
    teaching.setdefault("mentoring", "")
    teaching.setdefault("educational_materials", "")
    p["teaching"] = teaching

    p.setdefault("education", [])
    p.setdefault("publications", [])
    p.setdefault("grants", [])

    # Optional collections default to empty lists.
    for key in ("projects", "certifications", "awards",
                "volunteering", "courses", "memberships", "custom_sections"):
        p.setdefault(key, [])

    meta = dict(p.get("meta") or {})
    meta["schema"] = "career-profile-v2"
    if "enabled_sections" not in meta:
        meta["enabled_sections"] = [k for k in OPTIONAL_SECTIONS if _optional_has_data(p, k)]
    p["meta"] = meta
    return p


def blank_profile() -> dict:
    """A pristine, career-neutral v2 profile — seeded for a brand-new user instead
    of an example person's data. normalize_profile fills in the rest of the shape."""
    return normalize_profile({
        "meta": {"version": "2.0", "schema": "career-profile-v2"},
        "personal": {
            "name": "", "professional_title": "", "email": "", "phone": "",
            "location": {"city": "", "country": ""}, "links": [], "keywords": [],
        },
        "summary": "",
        "narrative": {},
        "experience": [],
        "skills": {"groups": [dict(g) for g in DEFAULT_SKILL_GROUPS], "languages": []},
        "work_preferences": {},
        "cv_design_preferences": {
            "accent_color": "#1B3A6B", "include_photo": False,
        },
    })


def load_profile(path: Path = PROFILE_PATH) -> dict:
    """Read profile.json and upgrade it to the v2 shape, so legacy and migrated
    files both render and edit identically.

    Raises ValueError with a user-readable message when the file is missing or
    corrupt, so callers surface a clear error instead of a stack trace."""
    try:
        profile = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ValueError("profile.json not found — fill in your Profile first.")
    except json.JSONDecodeError as e:
        raise ValueError(f"profile.json is not valid JSON ({e}). Fix or restore the file.")
    if not isinstance(profile, dict):
        raise ValueError("profile.json must contain a JSON object.")
    return normalize_profile(profile)


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
    for ext in PHOTO_EXTS:
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
