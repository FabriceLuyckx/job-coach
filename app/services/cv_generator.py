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
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup
from openai import OpenAI


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
                "highlighted_skills", "tailoring_notes",
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
                    "description": "3-4 sentence professional summary tailored to this role",
                },
                "selected_experience_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Profile experience IDs to include, ordered by relevance",
                },
                "adjusted_responsibilities": {
                    "type": "object",
                    "description": "Map of experience ID → rewritten responsibility bullets (2-4 per role)",
                    "additionalProperties": {"type": "array", "items": {"type": "string"}},
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
            },
        },
    },
}


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


def tailor(profile: dict, job_url: str, api_key: str, model: str) -> TailoringPlan:
    """
    Call an LLM via OpenRouter to produce a CV tailoring plan for a given job URL.

    Args:
        profile:  Loaded profile.json as a dict
        job_url:  Public URL of the job posting
        api_key:  OpenRouter API key
        model:    OpenRouter model string, e.g. 'anthropic/claude-sonnet-4-6'

    Returns:
        TailoringPlan with all fields needed to render a tailored CV
    """
    job_text = fetch_job_description(job_url)

    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )

    response = client.chat.completions.create(
        model=model,
        max_tokens=2048,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert career coach helping tailor CVs to specific job openings.\n\n"
                    "Rules:\n"
                    "- Select only experience entries that are genuinely relevant to the role\n"
                    "- Rewrite responsibility bullets to mirror the language of the job description, but only honestly\n"
                    "- The summary must be 3-4 sentences, direct and specific to this role\n"
                    "- Do not invent skills or experience not present in the profile\n"
                    "- Keep bullets concise (one line each)\n\n"
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

    tool_call = response.choices[0].message.tool_calls[0]
    d = json.loads(tool_call.function.arguments)
    slug = re.sub(r"[^a-z0-9]+", "-", d["slug"].lower()).strip("-")

    return TailoringPlan(
        job_title=d["job_title"],
        employer=d["employer"],
        slug=slug,
        summary=d["summary"],
        selected_experience_ids=d["selected_experience_ids"],
        adjusted_responsibilities=d["adjusted_responsibilities"],
        highlighted_skills=d["highlighted_skills"],
        tailoring_notes=d["tailoring_notes"],
    )


def apply_tailoring(profile: dict, plan: TailoringPlan) -> dict:
    """Merge a TailoringPlan into a profile dict, returning a modified copy."""
    p = copy.deepcopy(profile)
    p["narrative"]["target_roles_description"] = plan.summary

    exp_by_id = {e["id"]: e for e in p["experience"]}
    filtered = []
    for eid in plan.selected_experience_ids:
        if eid not in exp_by_id:
            continue
        entry = exp_by_id[eid]
        if eid in plan.adjusted_responsibilities:
            entry["responsibilities"] = plan.adjusted_responsibilities[eid]
        filtered.append(entry)
    p["experience"] = filtered

    return p
