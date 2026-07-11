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

# Teaching entry "type" — a select in the UI; "other" reveals a free-text type_other.
TEACHING_TYPES = (
    "course_instructor", "guest_lecture", "tutorials_seminars",
    "workshop_training", "supervision", "other",
)

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
# career_context lived here in v2; in v3 its fields moved to the (non-optional)
# Preferences page, so it's no longer a toggle.
OPTIONAL_SECTIONS = (
    "projects", "certifications", "awards", "publications", "grants",
    "teaching",
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
    if key == "teaching":
        return bool((p.get("teaching") or {}).get("entries"))
    return False


# ── Profile schema v3 migration ──────────────────────────────────────────────
# v3 prunes v2's questionnaire-shaped structure down to what's actually read by
# the CV template or the AI pipelines (see docs/plans/profile-v3-restructure.md).
# Runs after the v1→v2 step above, on its output, so these only ever see v2
# shapes. Each pops the v2-only keys it consumes, so re-running normalize_profile
# on an already-v3 profile (which the v1→v2 step re-pads with empty defaults)
# folds in nothing new — idempotent.

def _migrate_experience_v3(exp: dict) -> dict:
    """v2's two free-text AI notes (relevance_note, ai_context) → one ai_notes."""
    e = dict(exp)
    if "ai_notes" not in e:
        e["ai_notes"] = "\n".join(_nonempty(e.get("relevance_note"), e.get("ai_context")))
    e.pop("relevance_note", None)
    e.pop("ai_context", None)
    e.setdefault("ai_notes", "")
    return e


def _migrate_academic_v3(academic: dict | None) -> tuple[dict, list[str]]:
    """v2 academic (method groups, interdisciplinary work, collaborators) → v3's
    research_areas + free-text research_themes, with the structured detail folded
    into readable lines. Returns (academic_v3, topics_to_teach) — the caller merges
    topics_to_teach into teaching.subjects_to_teach."""
    a = dict(academic or {})
    lines: list[str] = []
    for g in (a.pop("methods", None) or []):
        if isinstance(g, dict) and g.get("items"):
            lines.append(f"{g.get('label') or 'Methods'}: {', '.join(g['items'])}")
    interdisciplinary = a.pop("interdisciplinary_work", None) or []
    if interdisciplinary:
        lines.append("Interdisciplinary work: " + ", ".join(interdisciplinary))
    collaborators = a.pop("collaborators", None) or []
    names = [
        c.get("name", "") + (f" ({c['affiliation']})" if c.get("affiliation") else "")
        for c in collaborators if isinstance(c, dict) and c.get("name")
    ]
    if names:
        lines.append("Collaborators: " + ", ".join(names))
    topics = list(a.pop("topics_to_teach", None) or [])

    research_themes = "\n".join(_nonempty(a.get("research_themes")) + lines)
    return {
        "research_areas": list(a.get("research_areas") or []),
        "research_themes": research_themes,
    }, topics


def _migrate_teaching_v3(teaching: dict | None, extra_subjects: list[str]) -> dict:
    """v2 teaching (formal_experience + guest_lectures + 3 free-text fields) → v3's
    single entries list + one free-text notes field."""
    t = dict(teaching or {})
    entries = t.pop("entries", None)
    if entries is None:
        entries = []
        for f in (t.pop("formal_experience", None) or []):
            if isinstance(f, dict):
                entries.append({
                    "type": f.get("type", ""), "course": f.get("course", ""),
                    "institution": f.get("institution", ""), "years": f.get("years", ""),
                    "description": f.get("description", ""),
                })
        for g in (t.pop("guest_lectures", None) or []):
            if isinstance(g, dict):
                entries.append({
                    "type": "Guest lecture", "course": g.get("course", ""),
                    "institution": g.get("institution", ""), "years": "", "description": "",
                })
    else:
        t.pop("formal_experience", None)
        t.pop("guest_lectures", None)

    if "notes" not in t:
        lines: list[str] = []
        for label, key in (("Student supervision", "student_supervision"),
                            ("Mentoring", "mentoring"),
                            ("Educational materials", "educational_materials")):
            v = t.get(key)
            if isinstance(v, str) and v.strip():
                lines.append(f"{label}: {v.strip()}")
        t["notes"] = "\n".join(lines)
    t.pop("student_supervision", None)
    t.pop("mentoring", None)
    t.pop("educational_materials", None)

    t["subjects_to_teach"] = list(dict.fromkeys(list(t.get("subjects_to_teach") or []) + extra_subjects))
    t["entries"] = entries
    t.setdefault("notes", "")
    return t


def _migrate_design_prefs_v3(prefs: dict | None) -> dict:
    """v2 cv_design_preferences had 10 questionnaire fields; only these two are
    ever read (Settings UI + the CV template's accent colour)."""
    d = dict(prefs or {})
    return {
        "accent_color": d.get("accent_color") or "#1B3A6B",
        "include_photo": bool(d.get("include_photo", False)),
    }


# ── Profile schema v4 migration ──────────────────────────────────────────────
# v4 gives each remaining loosely-typed section its own topic-shaped fields
# instead of collapsing them further (see docs/plans/profile-v4-radical-simplification.md).
# Runs after the v3 step, on its output. Each pops the v3-only keys it consumes,
# so re-running normalize_profile on an already-v4 profile (whose keys the v1→v2
# step re-pads with empty/default stubs) folds in nothing new — idempotent.

def _map_teaching_type(raw: str) -> tuple[str, str]:
    """Best-effort keyword match from a free-text v3 teaching type to the v4 enum."""
    t = (raw or "").strip()
    if not t:
        return "", ""
    low = t.lower()
    if "guest" in low:
        return "guest_lecture", ""
    if "tutorial" in low or "seminar" in low:
        return "tutorials_seminars", ""
    if "workshop" in low or "training" in low:
        return "workshop_training", ""
    if "supervis" in low:
        return "supervision", ""
    if any(k in low for k in ("lectur", "instruct", "course", "taught")):
        return "course_instructor", ""
    return "other", t


def _migrate_teaching_entry_v4(entry: dict) -> dict:
    """v3 {type (free text), course} → v4 {type (enum), type_other, subject}."""
    e = dict(entry)
    if "type_other" not in e:
        typ, other = _map_teaching_type(e.pop("type", ""))
        e["type"] = typ
        e["type_other"] = other
        course = e.pop("course", None)
        if course is not None:
            e["subject"] = course
    e.setdefault("type", "")
    e.setdefault("type_other", "")
    e.setdefault("subject", "")
    e.setdefault("institution", "")
    e.setdefault("years", "")
    e.setdefault("description", "")
    return e


def _migrate_teaching_v4(teaching: dict | None) -> tuple[dict, list[str], str]:
    """v3 teaching {subjects_to_teach, entries, notes} → v4 {entries} only.

    Returns (new_teaching, subjects_to_teach, notes) — the caller relocates the
    first into preferences.looking_for and the second into academic.research_themes
    (R3: forward-looking/free-form data doesn't belong in a CV history section).
    """
    t = dict(teaching or {})
    entries = [_migrate_teaching_entry_v4(e) for e in (t.get("entries") or []) if isinstance(e, dict)]
    subjects = list(t.pop("subjects_to_teach", None) or [])
    notes = (t.pop("notes", None) or "").strip()
    return {"entries": entries}, subjects, notes


def _migrate_grants_v4(grants: list | None) -> list[dict]:
    """v3 {year, year_start, year_end} → v4 free-text `years`; add optional funder/amount."""
    out = []
    for g in grants or []:
        if not isinstance(g, dict):
            continue
        g = dict(g)
        if "years" not in g:
            year = g.pop("year", None)
            y1 = g.pop("year_start", None)
            y2 = g.pop("year_end", None)
            if year:
                g["years"] = str(year)
            elif y1 or y2:
                g["years"] = f"{y1 or ''}–{y2 or ''}"
            else:
                g["years"] = ""
        else:
            g.pop("year", None)
            g.pop("year_start", None)
            g.pop("year_end", None)
        g.setdefault("name", "")
        g.setdefault("funder", "")
        g.setdefault("amount", "")
        out.append(g)
    return out


def _migrate_education_v4(education: list | None) -> list[dict]:
    """Add optional `description` (thesis topic / specialisation / coursework)."""
    out = []
    for edu in education or []:
        if not isinstance(edu, dict):
            continue
        edu = dict(edu)
        edu.setdefault("description", "")
        out.append(edu)
    return out


def _migrate_publications_v4(publications: list | None) -> list[dict]:
    """Add optional `url` (DOI or link)."""
    out = []
    for pub in publications or []:
        if not isinstance(pub, dict):
            continue
        pub = dict(pub)
        pub.setdefault("url", "")
        out.append(pub)
    return out


def _migrate_personal_v4(personal: dict, summary: str) -> tuple[dict, str]:
    """Drop personal.headline; fold non-empty text into summary as its first line."""
    p = dict(personal)
    headline = (p.pop("headline", "") or "").strip()
    if headline:
        summary = f"{headline}\n{summary}" if summary else headline
    return p, summary


def _migrate_preferences_v4(narrative: dict, wp: dict, extra_looking_for: list[str]) -> dict:
    """narrative + work_preferences (incl. salary) → one `preferences` object.

    Its only consumer is the job-matching filter prompt, so free text is the
    right shape here — unlike CV sections, whose structure is consumed by
    template/tailoring-plan code.
    """
    looking_lines = _nonempty(narrative.get("looking_for"))
    industries = narrative.get("target_industries") or []
    if industries:
        looking_lines.append("Target industries: " + ", ".join(industries))
    looking_lines += _nonempty(narrative.get("differentiation"), narrative.get("problems_enjoyed"))
    if extra_looking_for:
        looking_lines.append("Subjects I can teach: " + ", ".join(extra_looking_for))

    notes_lines: list[str] = []
    if wp.get("relocation"):
        notes_lines.append(f"Relocation: {wp['relocation']}")
    if wp.get("contract_types"):
        notes_lines.append("Contract types: " + ", ".join(wp["contract_types"]))
    if wp.get("schedule"):
        notes_lines.append(f"Schedule: {wp['schedule']}")
    if wp.get("availability"):
        notes_lines.append(f"Availability: {wp['availability']}")
    if wp.get("travel"):
        notes_lines.append(f"Travel: {wp['travel']}")
    if wp.get("organisation_preferences"):
        notes_lines.append(f"Organisation preferences: {wp['organisation_preferences']}")
    salary = wp.get("salary") or {}
    if salary.get("min") or salary.get("max"):
        rng = f"{salary.get('min') or '?'}–{salary.get('max') or '?'}"
        line = f"Salary: {rng} {salary.get('currency', '')}/{salary.get('period', '')}"
        if salary.get("notes"):
            line += f" ({salary['notes']})"
        notes_lines.append(line)
    elif salary.get("notes"):
        notes_lines.append(f"Salary notes: {salary['notes']}")

    return {
        "looking_for": "\n".join(looking_lines),
        "avoid": (narrative.get("work_to_avoid") or "").strip(),
        "locations": list(wp.get("commute_radius") or []),
        "remote": wp.get("remote_hybrid") or "",
        "languages": list(wp.get("language_preferences") or []),
        "notes": "\n".join(notes_lines),
    }


def normalize_profile(profile: dict) -> dict:
    """Upgrade a v1/partial profile to the current (v5) shape in memory.

    Idempotent: an already-v5 profile passes through unchanged. Callers persist
    the result on the next save, so old files migrate transparently.
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

    # ── v2 → v3 ──
    p["experience"] = [_migrate_experience_v3(e) for e in p["experience"]]
    p["personal"].pop("keywords", None)
    academic_v3, extra_subjects = _migrate_academic_v3(p["academic"])
    p["academic"] = academic_v3
    p["teaching"] = _migrate_teaching_v3(p["teaching"], extra_subjects)
    p["cv_design_preferences"] = _migrate_design_prefs_v3(p.get("cv_design_preferences"))

    # ── v3 → v4 ──
    p["personal"], p["summary"] = _migrate_personal_v4(p["personal"], p["summary"])
    p["education"] = _migrate_education_v4(p["education"])
    p["publications"] = _migrate_publications_v4(p["publications"])
    p["grants"] = _migrate_grants_v4(p["grants"])
    new_teaching, extra_looking_for, teaching_notes = _migrate_teaching_v4(p["teaching"])
    p["teaching"] = new_teaching
    if teaching_notes:
        line = f"Teaching notes: {teaching_notes}"
        themes = p["academic"].get("research_themes", "")
        p["academic"]["research_themes"] = f"{themes}\n{line}" if themes else line
    if "preferences" not in p:
        p["preferences"] = _migrate_preferences_v4(
            p.get("narrative") or {}, p.get("work_preferences") or {}, extra_looking_for)
    p.pop("narrative", None)
    p.pop("work_preferences", None)

    # ── v4 → v5 ── academic dissolves: research_areas → a "Research areas" skills
    # group (printable, tag-shaped); research_themes → preferences.notes (AI-only prose).
    a = p.pop("academic", None) or {}
    areas = [str(x).strip() for x in (a.get("research_areas") or []) if str(x).strip()]
    if areas:
        groups = p["skills"]["groups"]
        tgt = next((g for g in groups
                    if str(g.get("label", "")).strip().lower() == "research areas"), None)
        if tgt is None:
            tgt = {"label": "Research areas", "items": []}
            groups.append(tgt)
        tgt["items"] = list(tgt["items"]) + [x for x in areas if x not in tgt["items"]]
    themes = str(a.get("research_themes") or "").strip()
    if themes:
        notes = str(p["preferences"].get("notes") or "")
        if themes not in notes:  # guard against re-appending on a restored/merged file
            block = f"Research background: {themes}"
            p["preferences"]["notes"] = f"{notes}\n\n{block}".strip()

    meta = dict(p.get("meta") or {})
    meta["schema"] = "career-profile-v5"
    if "enabled_sections" not in meta:
        meta["enabled_sections"] = [k for k in OPTIONAL_SECTIONS if _optional_has_data(p, k)]
    else:
        meta["enabled_sections"] = [k for k in meta["enabled_sections"]
                                    if k not in ("career_context", "academic")]
    p["meta"] = meta
    return p


def profile_for_tailoring(profile: dict) -> dict:
    """Everything the CV-tailoring model may see: printable sections and
    per-role ai_notes. Never preferences, cv_design_preferences, or meta
    — those are the Preferences page's data, not the CV's."""
    return {k: v for k, v in profile.items()
            if k not in ("preferences", "cv_design_preferences", "meta")}


def blank_profile() -> dict:
    """A pristine, career-neutral v5 profile — seeded for a brand-new user instead
    of an example person's data. normalize_profile fills in the rest of the shape."""
    return normalize_profile({
        "meta": {"version": "5.0", "schema": "career-profile-v5"},
        "personal": {
            "name": "", "professional_title": "", "email": "", "phone": "",
            "location": {"city": "", "country": ""}, "links": [],
        },
        "summary": "",
        "experience": [],
        "skills": {"groups": [dict(g) for g in DEFAULT_SKILL_GROUPS], "languages": []},
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
    return env
