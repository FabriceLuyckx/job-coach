"""
CV tailoring service — fetches a job description and uses an LLM via OpenRouter
to produce a tailoring plan.

Called by:
  - scripts/tailor_cv.py  (Phase 3 CLI)
  - app/api/cv.py          (Phase 4 FastAPI endpoint)
"""

import copy
import json
import re
from dataclasses import dataclass, field

import httpx
from bs4 import BeautifulSoup

from app.services.llm import make_client, tool_args


@dataclass
class TailoringPlan:
    job_title: str
    employer: str
    slug: str
    summary: str
    selected_experience_ids: list[str]
    adjusted_responsibilities: dict[str, list[str]]
    highlighted_skills: list[str]
    tailoring_notes: str
    include_publications: bool = True
    # Teaching: shown on the CV only when relevant to the role (e.g. lecturer /
    # academic / training jobs). When included, teaching_summary is a compact
    # one-line blurb in the target language; empty otherwise.
    include_teaching: bool = False
    teaching_summary: str = ""
    # Deprecated: achievements are now folded into adjusted_responsibilities
    # (one combined bullet list per role). Kept so older stored plans that still
    # carry this key continue to deserialize; it is no longer rendered.
    adjusted_achievements: dict[str, list[str]] = field(default_factory=dict)
    # For non-English CVs: {english sidebar string → translation}. Covers the
    # static sidebar text (education degrees/fields, distinctions, grant names,
    # language names) that isn't part of the editable per-role content.
    sidebar_translations: dict[str, str] = field(default_factory=dict)
    # Optional printable sections the model judged irrelevant to this role and
    # wants dropped (e.g. "volunteering", "certifications"). Additive to the
    # dedicated include_publications / include_teaching gates.
    excluded_sections: list[str] = field(default_factory=list)


_TOOL = {
    "type": "function",
    "function": {
        "name": "cv_tailoring_plan",
        "description": "Structured plan for tailoring a CV to a specific job opening",
        "parameters": {
            "type": "object",
            "required": [
                "job_title", "employer", "slug", "summary",
                "selected_experience_ids", "adjusted_responsibilities",
                "sidebar_translations",
                "highlighted_skills", "tailoring_notes", "include_publications",
                "include_teaching", "teaching_summary",
            ],
            "properties": {
                "job_title": {
                    "type": "string",
                    "description": "Job title as listed in the posting",
                },
                "employer": {
                    "type": "string",
                    "description": "Employer or institution name",
                },
                "slug": {
                    "type": "string",
                    "description": "URL-safe output directory slug, e.g. 'ugent-data-scientist'",
                },
                "summary": {
                    "type": "string",
                    "description": "Professional summary tailored to this role, max 5 sentences, first person",
                },
                "selected_experience_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Profile experience IDs to include, ordered by relevance",
                },
                "adjusted_responsibilities": {
                    "type": "object",
                    "description": "Map of experience ID → up to 4 bullet points per role, in the target language, combining the most relevant responsibilities and achievements for this job",
                    "additionalProperties": {"type": "array", "items": {"type": "string"}},
                },
                "sidebar_translations": {
                    "type": "object",
                    "description": "For non-English CVs only: map each English sidebar string that should be translated — education fields of study, distinctions, grant/fellowship names, and language names like 'Dutch'/'English' — to its translation in the target language. Keep degree titles (e.g. 'Doctor of Philosophy (PhD)'), skill/tool names and most institution names in English (omit them). Return an empty object for English CVs.",
                    "additionalProperties": {"type": "string"},
                },
                "highlighted_skills": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Skills to emphasise, drawn from the candidate's existing skill set",
                },
                "tailoring_notes": {
                    "type": "string",
                    "description": "Brief explanation of the tailoring choices made",
                },
                "include_publications": {
                    "type": "boolean",
                    "description": "Set to true only for academic/research/university roles. Set to false for all industry, data engineering, commercial, or technology roles where peer-reviewed publications are not part of the hiring criteria.",
                },
                "include_teaching": {
                    "type": "boolean",
                    "description": "Set to true only when teaching/lecturing/training/supervision is relevant to the role (e.g. lecturer, teaching assistant, academic, or jobs that value training others). Set to false otherwise.",
                },
                "teaching_summary": {
                    "type": "string",
                    "description": "When include_teaching is true, a compact ONE-LINE teaching summary in the target language drawn from the profile's teaching data (formal teaching, guest lectures, supervision) — e.g. 'Guest lecturer at UGent and AMS; tutorials at Oxford; supervised multiple students'. Empty string when include_teaching is false.",
                },
                "excluded_sections": {
                    "type": "array",
                    "items": {"type": "string", "enum": [
                        "projects", "volunteering", "certifications", "courses",
                        "awards", "memberships", "grants", "custom_sections",
                    ]},
                    "description": "Optional CV sections present in the profile that are NOT relevant to this role and should be dropped from the CV. Omit or leave empty to keep them all. Do not list publications or teaching here — those have their own flags.",
                },
            },
        },
    },
}

_LANG_NAMES = {"en": "English", "nl": "Dutch (Nederlands)"}

# Editable via Settings → "CV Generator Prompt". {lang_name} is substituted at
# call time. The candidate profile JSON is appended automatically after this.
DEFAULT_CV_PROMPT = """You are an expert career coach helping tailor CVs to specific job openings.

Rules:
- Write ALL generated text (summary, responsibility bullets) in {lang_name}
- Write the summary in first person (I, my)
- Professional summary: maximum 4 sentences, direct and specific to this role
- Select only experience entries that are genuinely relevant to the role
- For each selected role, write a SINGLE list of at most 4 bullet points that combines its most relevant responsibilities and achievements for this job, in adjusted_responsibilities
- For non-English CVs, also translate the static sidebar text (education fields of study, distinctions, grant names, language names) via sidebar_translations; keep degree titles (e.g. "Doctor of Philosophy (PhD)", "Master's Degree"), skill/tool names and institution names in English
- Mirror the language of the job description, but only honestly
- Do not invent skills or experience not present in the profile
- Keep bullets concise (one line each); never more than 4 per role
- Publications section: set include_publications=true ONLY for research/academic/university roles; set false for industry, tech, or data engineering roles
- Teaching section: set include_teaching=true ONLY when teaching/lecturing/training/supervision matters for the role; when true, write teaching_summary as a single compact line in {lang_name} drawn from the profile's teaching data; otherwise set include_teaching=false and teaching_summary=""
- Optional sections (projects, volunteering, certifications, courses, awards, memberships, grants, custom_sections): list in excluded_sections any that are clearly irrelevant to this role so they are dropped; keep the rest
- Use the experience relevance notes in the profile to decide which entries best match the role type"""


def fetch_job_description(url: str) -> str:
    r = httpx.get(
        url,
        follow_redirects=True,
        timeout=15,
        headers={"User-Agent": "Mozilla/5.0 (compatible; job-coach/1.0)"},
    )
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    for tag in soup(["nav", "header", "footer", "script", "style", "aside"]):
        tag.decompose()
    return soup.get_text(separator="\n", strip=True)


def tailor(
    profile: dict, job_url: str, api_key: str, model: str,
    lang: str = "en", prompt: str | None = None,
) -> TailoringPlan:
    """
    Call an LLM via OpenRouter to produce a CV tailoring plan for a given job URL.

    Args:
        profile:  Loaded profile.json as a dict
        job_url:  Public URL of the job posting
        api_key:  OpenRouter API key
        model:    OpenRouter model string, e.g. 'anthropic/claude-sonnet-4-6'
        lang:     Output language code ('en' or 'nl')
        prompt:   System instructions (DEFAULT_CV_PROMPT if None); {lang_name} is substituted

    Returns:
        TailoringPlan with all fields needed to render a tailored CV
    """
    lang_name = _LANG_NAMES.get(lang, "English")
    job_text = fetch_job_description(job_url)

    instructions = (prompt or DEFAULT_CV_PROMPT).replace("{lang_name}", lang_name)

    client = make_client(api_key)

    response = client.chat.completions.create(
        model=model,
        max_tokens=2048,
        messages=[
            {
                "role": "system",
                "content": (
                    f"{instructions}\n\n"
                    f"CANDIDATE PROFILE:\n{json.dumps(profile, ensure_ascii=False, indent=2)}"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Tailor a CV for this job posting.\n\nURL: {job_url}\n\n"
                    f"{job_text[:8000]}"
                ),
            },
        ],
        tools=[_TOOL],
        tool_choice={"type": "function", "function": {"name": "cv_tailoring_plan"}},
    )

    d = tool_args(response, required=(
        "job_title", "employer", "slug", "summary",
        "selected_experience_ids", "adjusted_responsibilities",
        "highlighted_skills", "tailoring_notes",
    ))
    slug = re.sub(r"[^a-z0-9]+", "-", str(d["slug"]).lower()).strip("-")

    # Hard cap at 4 bullets per role regardless of what the model returns.
    bullets = {eid: list(b)[:4] for eid, b in dict(d["adjusted_responsibilities"]).items()}

    return TailoringPlan(
        job_title=d["job_title"],
        employer=d["employer"],
        slug=slug,
        summary=d["summary"],
        selected_experience_ids=d["selected_experience_ids"],
        adjusted_responsibilities=bullets,
        highlighted_skills=d["highlighted_skills"],
        tailoring_notes=d["tailoring_notes"],
        include_publications=d.get("include_publications", True),
        include_teaching=d.get("include_teaching", False),
        teaching_summary=d.get("teaching_summary", "") or "",
        sidebar_translations=d.get("sidebar_translations", {}) or {},
        excluded_sections=list(d.get("excluded_sections", []) or []),
    )


def _is_active(entry: dict) -> bool:
    """A role is active if flagged is_current or it has no end date."""
    if entry.get("is_current"):
        return True
    end = str(entry.get("end_date") or entry.get("end") or "").strip()
    return not end or end.lower() in ("present", "current", "now", "heden", "nu")


def _start_key(entry: dict) -> tuple[int, int]:
    """(year, month) of the start date, for descending sort. Missing → 0."""
    for field in ("start_date", "start"):
        val = str(entry.get(field) or "").strip()
        if not val:
            continue
        parts = re.split(r"[-/]", val)
        try:
            return (int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
        except (ValueError, IndexError):
            continue
    return (0, 0)


def apply_tailoring(profile: dict, plan: TailoringPlan) -> dict:
    """Merge a TailoringPlan into a profile dict, returning a modified copy."""
    p = copy.deepcopy(profile)
    # v2: the CV professional summary is a top-level field. Keep writing the legacy
    # narrative key too so CVs from tailoring plans stored before v2 still render.
    p["summary"] = plan.summary
    p.setdefault("narrative", {})["target_roles_description"] = plan.summary

    exp_by_id = {e["id"]: e for e in p.get("experience", []) if e.get("id")}
    filtered = []
    for eid in plan.selected_experience_ids:
        if eid not in exp_by_id:
            continue
        entry = exp_by_id[eid]
        if eid in plan.adjusted_responsibilities:
            entry["responsibilities"] = plan.adjusted_responsibilities[eid][:4]
        entry["achievements"] = []  # achievements are folded into the bullet list above
        filtered.append(entry)

    # Active roles first (in selected order); past roles below, newest start first.
    active = [e for e in filtered if _is_active(e)]
    past = sorted((e for e in filtered if not _is_active(e)), key=_start_key, reverse=True)
    p["experience"] = active + past

    if not plan.include_publications:
        p["publications"] = []

    # Drop any optional printable sections the model judged irrelevant. Publications
    # and teaching keep their dedicated gates above/below; everything else here.
    _EXCLUDABLE = {
        "projects", "volunteering", "certifications", "courses",
        "awards", "memberships", "grants", "custom_sections",
    }
    for key in plan.excluded_sections:
        if key in _EXCLUDABLE:
            p[key] = []

    # Teaching renders from teaching.cv_summary (a compact one-liner). When the
    # role doesn't warrant teaching, set it empty so the template guard hides it;
    # otherwise use the model's tailored summary. Setting the key (even to "")
    # also overrides the template's generic-CV fallback line.
    p.setdefault("teaching", {})
    p["teaching"]["cv_summary"] = plan.teaching_summary if plan.include_teaching else ""

    # Translate static sidebar text (education, grants, languages) for non-English
    # CVs. Only strings the model chose to translate are replaced; the rest stay.
    tr = plan.sidebar_translations or {}
    if tr:
        def t(s):
            return tr.get(s, s) if isinstance(s, str) else s
        for edu in p.get("education", []):
            # Degree titles stay in English everywhere (e.g. "Doctor of Philosophy
            # (PhD)", "Master's Degree") — translations were awkward, and keeping
            # them English also preserves the template's "hide High School" filter.
            for k in ("field", "institution", "distinction"):
                if edu.get(k):
                    edu[k] = t(edu[k])
        for grant in p.get("grants", []):
            if grant.get("name"):
                grant["name"] = t(grant["name"])
        for lang_item in p.get("skills", {}).get("languages", []):
            if lang_item.get("language"):
                lang_item["language"] = t(lang_item["language"])
        for g in p.get("skills", {}).get("groups", []):
            if g.get("label"):
                g["label"] = t(g["label"])

    return p


if __name__ == "__main__":
    # ponytail: self-check for the active-first / start-date ordering
    exp = [
        {"id": "a", "start_date": "2016-01", "end_date": "2016-06"},
        {"id": "b", "start_date": "2023-03", "end_date": None, "is_current": True},
        {"id": "c", "start_date": "2020-04", "end_date": "2021-11"},
    ]
    prof = {"narrative": {}, "experience": exp, "publications": [1]}
    plan = TailoringPlan("t", "e", "s", "sum", ["a", "b", "c"], {}, [], "n")
    order = [e["id"] for e in apply_tailoring(prof, plan)["experience"]]
    assert order == ["b", "c", "a"], order  # active first, then newest start
    print("ok", order)
