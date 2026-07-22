# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""
Cover-letter guide service — reads a job posting and produces a tailored
*writing skeleton* (sections + the real facts to cite), NOT a written letter.
The candidate writes the letter themselves; the AI only says what to cover.

Mirrors cv_generator.py's shape: dataclass, _TOOL schema, default prompt,
one public build_guide().
"""

import json
from dataclasses import asdict, dataclass, field

from app.i18n.languages import lang_name
from app.services.headless import fetch_text
from app.services.llm import complete, tool_args


@dataclass
class LetterGuide:
    job_title: str
    employer: str
    structure: list[dict]          # 3–5 items: {title, goal, evidence: [str]}
    # ponytail: tips were generic per-letter boilerplate (address a real person,
    # quantify, ~word count, tone) — the same reminders under every letter. They
    # now live once as a static block in the letter explainer, not generated here.
    # Field kept + defaulted so old stored rows still reshape.
    tips: list[str] = field(default_factory=list)


_TOOL = {
    "type": "function",
    "function": {
        "name": "letter_guide",
        "description": "A tailored cover-letter WRITING SKELETON (sections + real facts to cite, never finished prose).",
        "parameters": {
            "type": "object",
            "required": ["job_title", "employer", "structure"],
            "properties": {
                "job_title": {"type": "string", "description": "Job title as listed in the posting"},
                "employer": {"type": "string", "description": "Employer or institution name"},
                "structure": {
                    "type": "array",
                    "minItems": 3,
                    "maxItems": 5,
                    "description": "3–5 sections you name for this posting — each a paragraph of the letter itself (never a generic tips/advice/checklist section). Each an object with a title, a goal, and the real profile facts to cite.",
                    "items": {
                        "type": "object",
                        "required": ["title", "goal", "evidence"],
                        "properties": {
                            "title": {"type": "string", "description": "Short section label"},
                            "goal": {"type": "string", "description": "What this section must achieve (an instruction to the writer, not a sentence to paste)"},
                            "evidence": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Real profile facts to cite in this section (a role, project, or skill). Never invent experience.",
                            },
                        },
                    },
                },
            },
        },
    },
}

# Editable via Settings → "Cover Letter — guide prompt". {lang_name} is
# substituted at call time. The candidate profile JSON is appended automatically.
DEFAULT_LETTER_PROMPT = """You are a cover-letter writing coach. You NEVER write the letter — you produce a skeleton the candidate uses to write it themselves in their own words.

Rules:
- Write ALL output in {lang_name}.
- NEVER write letter sentences or paragraphs to paste. Every goal is an instruction to the writer, e.g. "Open by naming what draws you to them — cite a specific product or mission" — not "I have long admired your mission."
- structure: 3–5 sections you name and order for THIS posting (e.g. a hook, why-you, why-them, close). Every section is a paragraph OF THE LETTER — never a generic "tips"/"advice"/"checklist" section. Give each a clear goal and the specific real profile facts (a role, project, or skill) to cite there. No generic advice like "show enthusiasm", and never invent experience the candidate doesn't have.
- Use the profile's preferences (looking_for, notes) to ground the motivation section in what the candidate actually wants from a role."""


def _reshape(d: dict) -> LetterGuide:
    """Turn a validated tool-args dict into a LetterGuide. Factored out so the
    reshaping is testable without an LLM call."""
    return LetterGuide(
        job_title=d["job_title"],
        employer=d["employer"],
        structure=list(d["structure"]),
        tips=list(d.get("tips", []) or []),
    )


def build_guide(
    profile: dict, job_url: str, cfg: dict,
    lang: str = "en", prompt: str | None = None, job_text: str | None = None,
) -> LetterGuide:
    """Call the configured LLM engine to produce a cover-letter writing guide.

    profile:  the profile minus meta/cv_design_preferences (preferences kept —
              they carry the motivation data a letter needs).
    job_text: pre-fetched posting text (from the scan cache); fetched here if None.
    """
    if job_text is None:
        job_text = fetch_text(job_url)

    instructions = (prompt or DEFAULT_LETTER_PROMPT).replace("{lang_name}", lang_name(lang))
    letter_profile = {k: v for k, v in profile.items() if k not in ("meta", "cv_design_preferences")}

    response = complete(
        [
            {
                "role": "system",
                "content": (
                    f"{instructions}\n\n"
                    f"CANDIDATE PROFILE:\n{json.dumps(letter_profile, ensure_ascii=False, indent=2)}"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Produce a cover-letter writing guide for this job posting.\n\n"
                    f"URL: {job_url}\n\n{job_text[:8000]}"
                ),
            },
        ],
        tools=[_TOOL],
        tool_choice={"type": "function", "function": {"name": "letter_guide"}},
        cfg=cfg,
        max_tokens=4096,
    )

    d = tool_args(response, required=("job_title", "employer", "structure"))
    return _reshape(d)


if __name__ == "__main__":
    # ponytail: self-check — reshaping survives the asdict round-trip, tips defaults to []
    sample = {
        "job_title": "Data Scientist", "employer": "ACME",
        "structure": [{"title": "Opener", "goal": "Name the product that drew you", "evidence": ["3y at Realo"]}],
    }
    g = asdict(_reshape(sample))
    assert g["tips"] == [], g["tips"]
    assert g["structure"][0]["evidence"] == ["3y at Realo"]
    assert set(g) == {"job_title", "employer", "structure", "tips"}
    print("ok", g["job_title"])
