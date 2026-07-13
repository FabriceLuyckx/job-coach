"""
Cover-letter guide service — reads a job posting and produces a tailored
*writing guide* (outline, pointers, evidence map), NOT a written letter. The
candidate writes the letter themselves; the AI only says what to cover.

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
    angle: str                     # one-sentence positioning: the story this letter should tell
    structure: list[dict]          # 3–5 items: {title, goal, pointers: [str]}
    evidence: list[dict]           # {job_need, your_match}
    tone: str                      # formality, length target, language notes
    gaps: list[str] = field(default_factory=list)  # requirements the profile doesn't cover + how to frame honestly


_TOOL = {
    "type": "function",
    "function": {
        "name": "letter_guide",
        "description": "A tailored cover-letter WRITING GUIDE (pointers and evidence, never finished prose).",
        "parameters": {
            "type": "object",
            "required": ["job_title", "employer", "angle", "structure", "evidence", "tone"],
            "properties": {
                "job_title": {"type": "string", "description": "Job title as listed in the posting"},
                "employer": {"type": "string", "description": "Employer or institution name"},
                "angle": {
                    "type": "string",
                    "description": "One sentence: the positioning/story this letter should tell.",
                },
                "structure": {
                    "type": "array",
                    "description": "3–5 paragraphs. Each an object with a title, a goal, and 2–4 concrete pointers.",
                    "items": {
                        "type": "object",
                        "required": ["title", "goal", "pointers"],
                        "properties": {
                            "title": {"type": "string", "description": "Short paragraph label"},
                            "goal": {"type": "string", "description": "What this paragraph must achieve"},
                            "pointers": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "2–4 instructions/questions to the writer (not sentences to paste)",
                            },
                        },
                    },
                },
                "evidence": {
                    "type": "array",
                    "description": "Posting requirement → a specific, real profile fact to cite for it.",
                    "items": {
                        "type": "object",
                        "required": ["job_need", "your_match"],
                        "properties": {
                            "job_need": {"type": "string", "description": "A top requirement from the posting"},
                            "your_match": {"type": "string", "description": "The concrete profile item that answers it"},
                        },
                    },
                },
                "gaps": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Honest gaps the profile doesn't cover, each with how to frame it (not hide it). Omit if none.",
                },
                "tone": {
                    "type": "string",
                    "description": "Formality, length target, and language notes for the letter.",
                },
            },
        },
    },
}

# Editable via Settings → "Cover Letter — guide prompt". {lang_name} is
# substituted at call time. The candidate profile JSON is appended automatically.
DEFAULT_LETTER_PROMPT = """You are a cover-letter writing coach. You NEVER write the letter — you produce a plan the candidate uses to write it themselves in their own words.

Rules:
- Write ALL output in {lang_name}.
- NEVER write letter sentences or paragraphs to paste. Every pointer is an instruction or question to the writer, e.g. "Explain what drew you to them — name the specific product or mission" — not "I have long admired your mission."
- structure: 3–5 paragraphs. Give each a clear goal and 2–4 concrete pointers grounded in THIS posting and THIS profile. No generic advice like "show enthusiasm".
- evidence: pick the posting's top requirements and map each to a specific, real profile item (a role, project, or skill). Never invent experience the candidate doesn't have.
- Use the profile's preferences (looking_for, notes) to ground the motivation paragraph in what the candidate actually wants from a role.
- gaps: name honest gaps between the posting and the profile and suggest how to frame them, not hide them. Omit if there are none worth flagging.
- angle: one sentence naming the single strongest positioning for this application.
- tone: note the formality, a length target, and the language to write in."""


def _reshape(d: dict) -> LetterGuide:
    """Turn a validated tool-args dict into a LetterGuide. Factored out so the
    reshaping is testable without an LLM call."""
    return LetterGuide(
        job_title=d["job_title"],
        employer=d["employer"],
        angle=d["angle"],
        structure=list(d["structure"]),
        evidence=list(d["evidence"]),
        tone=d["tone"],
        gaps=list(d.get("gaps", []) or []),
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

    d = tool_args(response, required=("job_title", "employer", "angle", "structure", "evidence", "tone"))
    return _reshape(d)


if __name__ == "__main__":
    # ponytail: self-check — reshaping survives the asdict round-trip, gaps defaults to []
    sample = {
        "job_title": "Data Scientist", "employer": "ACME", "angle": "You solve X.",
        "structure": [{"title": "Opener", "goal": "Hook", "pointers": ["Name the product"]}],
        "evidence": [{"job_need": "Python", "your_match": "3y at Realo"}],
        "tone": "Formal, one page, in English.",
    }
    g = asdict(_reshape(sample))
    assert g["gaps"] == [], g["gaps"]
    assert g["structure"][0]["pointers"] == ["Name the product"]
    assert set(g) >= {"job_title", "employer", "angle", "structure", "evidence", "tone", "gaps"}
    print("ok", g["job_title"])
