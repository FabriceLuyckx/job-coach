# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

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

from app.i18n.languages import lang_name
from app.services.cv_renderer import profile_for_tailoring
from app.services.headless import fetch_text
from app.services.llm import complete, tool_args


@dataclass
class TailoringPlan:
    job_title: str
    employer: str
    slug: str
    summary: str
    selected_experience_ids: list[str]
    adjusted_responsibilities: dict[str, list[str]]
    tailoring_notes: str
    # Deprecated: skill highlighting is gone — the AI marked skills the user had
    # no control over, on a CV going out over their name. Kept so older stored
    # plans still deserialize; never requested, never rendered.
    highlighted_skills: list[str] = field(default_factory=list)
    # Deprecated: achievements are now folded into adjusted_responsibilities
    # (one combined bullet list per role). Kept so older stored plans that still
    # carry this key continue to deserialize; it is no longer rendered.
    adjusted_achievements: dict[str, list[str]] = field(default_factory=dict)
    # Deprecated (profile v4): publications/teaching are now gated via
    # excluded_sections. Kept so older stored plans still deserialize.
    include_publications: bool = True
    include_teaching: bool = False
    teaching_summary: str = ""
    # For non-English CVs: {english sidebar string → translation}. Covers the
    # static sidebar text (education degrees/fields, distinctions, grant names,
    # language names) that isn't part of the editable per-role content.
    sidebar_translations: dict[str, str] = field(default_factory=dict)
    # Optional printable sections the model judged irrelevant to this role and
    # wants dropped (e.g. "volunteering", "publications", "teaching").
    excluded_sections: list[str] = field(default_factory=list)
    # Sections the *user* chose to hide (section toggles in the editor). Distinct
    # from excluded_sections (the AI's relevance call): this is a pure display
    # choice, applied via the template so preview, PDF, and next session agree.
    hidden_sections: list[str] = field(default_factory=list)
    # The same pair one level down, for individual skills: the model's relevance
    # call and the user's display choice. visible = profile skills − both lists.
    # Two lists rather than one merged set because "what did the AI leave out?"
    # is exactly what the editor has to answer.
    excluded_skills: list[str] = field(default_factory=list)
    hidden_skills: list[str] = field(default_factory=list)


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
                "sidebar_translations", "tailoring_notes",
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
                # Replaced per call by _tool_for(), which enumerates the exact
                # profile strings as properties — see _translatable().
                "sidebar_translations": {
                    "type": "object",
                    "description": "For non-English CVs only: translations of the CV's static sidebar text.",
                    "additionalProperties": {"type": "string"},
                },
                "tailoring_notes": {
                    "type": "string",
                    "description": "Brief explanation of the tailoring choices made",
                },
                "excluded_sections": {
                    "type": "array",
                    "items": {"type": "string", "enum": [
                        "projects", "volunteering", "certifications", "courses",
                        "awards", "memberships", "grants", "custom_sections",
                        "publications", "teaching",
                    ]},
                    "description": "Optional CV sections present in the profile that are NOT relevant to this role and should be dropped from the CV. Set 'publications' and 'teaching' only for non-academic, non-training roles. Omit or leave empty to keep everything.",
                },
            },
        },
    },
}


def _translatable(profile: dict) -> list[str]:
    """The exact profile strings a non-English CV should have translated.

    apply_tailoring() substitutes sidebar_translations by exact string match, so
    only real profile strings can ever land on the CV. Left free-form, the model
    answered with category buckets instead — {"languages": "Nederlands, Engels…"} —
    which matched nothing, so a Dutch CV silently kept its English skill headings
    and language names. Enumerating these as schema properties makes that
    unrepresentable: the local engine compiles the schema to a grammar, so the
    keys can only be strings from this list.

    Deliberately excluded (they stay English, per the prompt): degree titles,
    institution names, and the skill items themselves — 'Python' is 'Python'.
    """
    skills = profile.get("skills") or {}
    values = [
        *(edu.get(k) for edu in profile.get("education") or [] for k in ("field", "distinction")),
        *(g.get("name") for g in profile.get("grants") or []),
        *(lang.get("language") for lang in skills.get("languages") or []),
        *(g.get("label") for g in skills.get("groups") or []),
        *(sec.get("title") for sec in profile.get("custom_sections") or []),
    ]
    # dict, not set: stable order keeps the schema (and its grammar) reproducible.
    return list({v: None for v in values if isinstance(v, str) and v.strip()})


def skill_items(profile: dict) -> list[str]:
    """Every skill string in the profile, in CV order. dict, not set: a stable
    order keeps the tool schema (and the grammar it compiles to) reproducible."""
    groups = ((profile.get("skills") or {}).get("groups")) or []
    return list({t: None for g in groups for t in (g.get("items") or [])
                 if isinstance(t, str) and t.strip()})


def _tool_for(profile: dict, lang: str) -> dict:
    """The tailoring tool with sidebar_translations pinned to this profile's
    strings — or dropped entirely for an English CV, where there is nothing to
    translate and an empty object is just one more thing to get wrong.
    excluded_skills is pinned the same way, for the same reason: the local engine
    grammars on the schema, so a hallucinated or near-miss skill name is
    unrepresentable — a name that misses would otherwise delete a real skill."""
    tool = copy.deepcopy(_TOOL)
    params = tool["function"]["parameters"]
    skills = skill_items(profile)
    if skills:
        params["properties"]["excluded_skills"] = {
            "type": "array",
            "items": {"type": "string", "enum": skills},
            "description": (
                "Skills from the profile that are NOT relevant to this role and "
                "should be left off the CV. Each entry must be one exact string "
                "from this profile. Keep transferable skills that support the "
                "role even when the posting doesn't name them; omit or leave "
                "empty to keep everything."
            ),
        }
    strings = _translatable(profile) if lang != "en" else []
    if strings:
        params["properties"]["sidebar_translations"] = {
            "type": "object",
            "description": (
                f"Each key is a string from the profile; set its value to that "
                f"string translated into {lang_name(lang)}. Omit any key that "
                f"should stay in English (degree titles, tool names)."
            ),
            "properties": {s: {"type": "string"} for s in strings},
            "additionalProperties": False,
        }
    else:
        params["properties"].pop("sidebar_translations")
        params["required"] = [k for k in params["required"] if k != "sidebar_translations"]
    return tool


# Editable via Settings → "CV Generator Prompt". {lang_name} is substituted at
# call time. The candidate profile JSON is appended automatically after this.
DEFAULT_CV_PROMPT = """You are an expert career coach helping tailor CVs to specific job openings.

Rules:
- Write ALL generated text (summary, responsibility bullets) in {lang_name}
- Write the summary in first person (I, my)
- Professional summary: maximum 4 sentences, direct and specific to this role
- The CV ALWAYS shows the candidate's full work history — you never choose which roles appear, only how each role's bullets read
- For EVERY role in the profile's experience, write a SINGLE list of 1–4 bullet points (keyed by that role's id in adjusted_responsibilities) that combines its most relevant responsibilities and achievements for this job. 4 is a ceiling, not a target: include only bullets genuinely relevant to this job — a role with little bearing on it may warrant just one or two strong bullets. Do not pad to reach four. Still write at least one bullet for every role.
- selected_experience_ids: list the roles most relevant to this job (advisory ordering hint only — it does not drop any role)
- For non-English CVs, fill in sidebar_translations: every key is one exact string copied from the profile — translate each into {lang_name} as its value, and omit any that should stay as-is. Keep degree titles (e.g. "Doctor of Philosophy (PhD)", "Master's Degree") and skill/tool names (Python, AWS) in English; DO translate skill group headings, language names, education fields of study, distinctions and grant names
- Mirror the language of the job description, but only honestly
- Do not invent skills or experience not present in the profile
- Keep bullets concise (one line each); never more than 4 per role, and fewer when fewer are directly applicable
- Optional sections (projects, volunteering, certifications, courses, awards, memberships, grants, custom_sections, publications, teaching): list in excluded_sections any that are clearly irrelevant to this role so they are dropped; keep publications and teaching only for academic, research, or training-heavy roles; keep the rest
- Skills: list in excluded_skills any profile skills that are clearly irrelevant to this role so they are left off the CV — each entry must be one exact skill string from the profile. Keep transferable skills (communication, project management) that support the role even when the posting doesn't name them; leave it empty to keep everything
- Use each role's ai_notes field in the profile to decide which entries best match the role type"""


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s)).strip().casefold()


def resolve_skills(profile: dict, names) -> list[str]:
    """Map names to the profile's own skill strings, dropping what doesn't match.

    ponytail: the per-call enum in _tool_for is the mechanism; this is a safety
    net for a provider that ignores it, so it stays narrow on purpose — case,
    whitespace and a parenthetical qualifier on the profile side, nothing more.
    "R" must never resolve to "React".
    """
    canon: dict[str, str] = {}
    for item in skill_items(profile):
        canon.setdefault(_norm(item), item)
        bare = _norm(re.sub(r"\([^)]*\)", "", item))
        if bare:
            canon.setdefault(bare, item)
    return list({canon[k]: None for n in (names or [])
                 if (k := _norm(n)) in canon})


def visible_skills(profile: dict, plan: "TailoringPlan") -> list[dict]:
    """The profile's skill groups minus both exclusion lists, with a group left
    with nothing dropped entirely — so "drop the whole group" needs no second
    field, and no template ever prints an empty heading."""
    off = {_norm(s) for s in (*plan.excluded_skills, *plan.hidden_skills)}
    out = []
    for g in ((profile.get("skills") or {}).get("groups")) or []:
        items = [t for t in (g.get("items") or []) if _norm(t) not in off]
        if items:
            out.append({**g, "items": items})
    return out


def fetch_job_description(url: str) -> str:
    """Extract the readable text of a job posting. Falls back to a headless
    Playwright render for JS-built postings (launch-per-call — the scanner's
    batch path in headless.fetch_texts reuses one browser instead)."""
    return fetch_text(url)


_DETECT_TOOL = {
    "type": "function",
    "function": {
        "name": "detected_language",
        "description": "The language a job posting is written in",
        "parameters": {
            "type": "object",
            "required": ["lang"],
            "properties": {
                "lang": {"type": "string", "description": "ISO 639-1 code (e.g. 'en', 'nl', 'fr') of the language the posting is written in"},
            },
        },
    },
}


def detect_language(url: str, cfg: dict, job_text: str | None = None) -> str:
    """Detect the language of a job posting from its URL. Returns a 2-letter
    ISO 639-1 code, defaulting to 'en' if it can't be determined. Used to
    auto-fill the language for a manually-pasted Applications URL."""
    if job_text is None:
        job_text = fetch_job_description(url)
    response = complete(
        [
            {"role": "system", "content":
                "Identify the language a job posting is written in and return it "
                "as an ISO 639-1 code."},
            {"role": "user", "content": f"JOB POSTING\nURL: {url}\n\n{(job_text or '')[:4000]}"},
        ],
        tools=[_DETECT_TOOL],
        tool_choice={"type": "function", "function": {"name": "detected_language"}},
        cfg=cfg,
        max_tokens=64,
    )
    code = str(tool_args(response, required=("lang",)).get("lang") or "").lower()[:2]
    return code if len(code) == 2 and code.isalpha() else "en"


def tailor(
    profile: dict, job_url: str, cfg: dict,
    lang: str = "en", prompt: str | None = None, job_text: str | None = None,
) -> TailoringPlan:
    """
    Call the configured LLM engine to produce a CV tailoring plan for a job URL.

    Args:
        profile:  Loaded profile.json as a dict
        job_url:  Public URL of the job posting
        cfg:      App config dict (selects the AI engine)
        lang:     Output language code (e.g. 'en', 'nl')
        prompt:   System instructions (DEFAULT_CV_PROMPT if None); {lang_name} is substituted
        job_text: Pre-fetched posting text (from the scanner's cache); if None the
                  posting is fetched here. Skips a redundant re-scrape on accept.

    Returns:
        TailoringPlan with all fields needed to render a tailored CV
    """
    if job_text is None:
        job_text = fetch_job_description(job_url)

    instructions = (prompt or DEFAULT_CV_PROMPT).replace("{lang_name}", lang_name(lang))

    response = complete(
        [
            {
                "role": "system",
                "content": (
                    f"{instructions}\n\n"
                    f"CANDIDATE PROFILE:\n{json.dumps(profile_for_tailoring(profile), ensure_ascii=False, indent=2)}"
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
        tools=[_tool_for(profile, lang)],
        tool_choice={"type": "function", "function": {"name": "cv_tailoring_plan"}},
        cfg=cfg,
        max_tokens=4096,  # 2048 truncated the JSON plan on large profiles → AIResponseError
    )

    d = tool_args(response, required=(
        "job_title", "employer", "slug", "summary",
        "selected_experience_ids", "adjusted_responsibilities", "tailoring_notes",
    ))
    slug = re.sub(r"[^a-z0-9]+", "-", str(d["slug"]).lower()).strip("-")

    # Hard cap at 4 bullets per role regardless of what the model returns.
    bullets = {eid: list(b)[:4] for eid, b in dict(d["adjusted_responsibilities"]).items()}

    plan = TailoringPlan(
        job_title=d["job_title"],
        employer=d["employer"],
        slug=slug,
        summary=d["summary"],
        selected_experience_ids=d["selected_experience_ids"],
        adjusted_responsibilities=bullets,
        tailoring_notes=d["tailoring_notes"],
        sidebar_translations=d.get("sidebar_translations", {}) or {},
        excluded_sections=list(d.get("excluded_sections", []) or []),
        excluded_skills=resolve_skills(profile, d.get("excluded_skills")),
    )
    # Fail open, twice: a name that didn't resolve is already gone (leaving its
    # skill on the CV), and a selection that would leave no skills at all is
    # discarded whole rather than silently emptying the section.
    if plan.excluded_skills and not visible_skills(profile, plan):
        plan.excluded_skills = []
    return plan


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


def ordered_experience(profile: dict) -> list[dict]:
    """Every career-history entry in the CV's canonical order: active roles first,
    then past roles by newest start date. The full history is always shown — the
    single source of order for both the rendered CV and the plan editor."""
    exp = profile.get("experience", [])
    active = [e for e in exp if _is_active(e)]
    past = sorted((e for e in exp if not _is_active(e)), key=_start_key, reverse=True)
    return active + past


def apply_tailoring(profile: dict, plan: TailoringPlan) -> dict:
    """Merge a TailoringPlan into a profile dict, returning a modified copy."""
    p = copy.deepcopy(profile)
    p["summary"] = plan.summary

    # The full career history is ALWAYS shown — tailoring only rewrites the bullets
    # under each role (adjusted_responsibilities), never which roles appear. A role
    # the AI didn't tailor keeps its own responsibilities.
    for entry in p.get("experience", []):
        eid = entry.get("id")
        if eid and eid in plan.adjusted_responsibilities:
            entry["responsibilities"] = plan.adjusted_responsibilities[eid][:4]
        else:
            # Untailored role: keep its own bullets but still cap at 4 — a full
            # career path shows every role, not every bullet of every role.
            entry["responsibilities"] = list(entry.get("responsibilities", []))[:4]
        entry["achievements"] = []  # achievements are folded into the bullet list above
    p["experience"] = ordered_experience(p)

    # Drop any optional printable sections the model judged irrelevant.
    _EXCLUDABLE = {
        "projects", "volunteering", "certifications", "courses",
        "awards", "memberships", "grants", "custom_sections", "publications",
    }
    for key in plan.excluded_sections:
        if key in _EXCLUDABLE:
            p[key] = []
    if "teaching" in plan.excluded_sections:
        p["teaching"] = {"entries": []}

    # The template renders the skills it is given and does no matching of its
    # own; composing against the *current* profile means a stale name in either
    # list simply matches nothing after a profile edit — no cleanup pass.
    if p.get("skills"):
        p["skills"]["groups"] = visible_skills(p, plan)

    # Translate static sidebar text for non-English CVs. Substitution is by exact
    # string match, and the keys offered to the model are built from these very
    # fields (_translatable) — the two lists must stay in step, or a string gets
    # translated in the plan and never swapped in (or vice versa).
    tr = plan.sidebar_translations or {}
    if tr:
        def t(s):
            return tr.get(s, s) if isinstance(s, str) else s
        for edu in p.get("education", []):
            # Degree titles and institutions stay in English everywhere (e.g.
            # "Doctor of Philosophy (PhD)") — translations were awkward, and
            # keeping them English also preserves the template's "hide High
            # School" filter.
            for k in ("field", "distinction"):
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
        for sec in p.get("custom_sections", []):
            if sec.get("title"):
                sec["title"] = t(sec["title"])

    return p


if __name__ == "__main__":
    # ponytail: self-check for the active-first / start-date ordering
    exp = [
        {"id": "a", "start_date": "2016-01", "end_date": "2016-06"},
        {"id": "b", "start_date": "2023-03", "end_date": None, "is_current": True},
        {"id": "c", "start_date": "2020-04", "end_date": "2021-11"},
    ]
    prof = {"experience": exp, "publications": [1]}
    plan = TailoringPlan("t", "e", "s", "sum", ["a", "b", "c"], {}, "n")
    order = [e["id"] for e in apply_tailoring(prof, plan)["experience"]]
    assert order == ["b", "c", "a"], order  # active first, then newest start
    # The full history always shows, even when the AI selected nothing.
    empty = TailoringPlan("t", "e", "s", "sum", [], {}, "n")
    assert [e["id"] for e in apply_tailoring(prof, empty)["experience"]] == ["b", "c", "a"]
    # An untailored role caps its own bullets at 4 (full path ≠ all bullets).
    prof2 = {"experience": [{"id": "a", "responsibilities": [1, 2, 3, 4, 5, 6]}]}
    out = apply_tailoring(prof2, empty)["experience"][0]["responsibilities"]
    assert len(out) == 4, out
    print("ok", order)
