"""
CV import — extract a structured career profile from an existing CV (pasted text
or an uploaded PDF) via one forced-tool LLM call.

The extraction schema mirrors the current profile subset; the caller runs the
result through normalize_profile() so it becomes a full, editable profile.
Anything that doesn't fit a schema field is placed into a custom section rather
than invented away, so nothing from the source CV is silently lost.
"""

import io
import json

from app.services.llm import complete, tool_args

# Uploaded CV size cap (PDF). Matches the spirit of the photo/backup guards.
MAX_CV_BYTES = 5 * 1024 * 1024


def pdf_to_text(data: bytes) -> str:
    """Extract text from a PDF byte string. Raises ValueError on unreadable input."""
    if not data.startswith(b"%PDF"):
        raise ValueError("That doesn't look like a PDF file.")
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    except Exception as e:
        raise ValueError(f"Couldn't read the PDF ({e}).")


_IMPORT_TOOL = {
    "type": "function",
    "function": {
        "name": "extracted_profile",
        "description": "The candidate's career details extracted from their CV",
        "parameters": {
            "type": "object",
            "required": ["personal", "summary", "experience", "education", "skills"],
            "properties": {
                "personal": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "professional_title": {"type": "string"},
                        "email": {"type": "string"},
                        "phone": {"type": "string"},
                        "city": {"type": "string"},
                        "country": {"type": "string"},
                        "links": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "label": {"type": "string"},
                                    "url": {"type": "string"},
                                },
                            },
                        },
                    },
                },
                "summary": {"type": "string", "description": "Professional summary / profile statement"},
                "experience": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "employer": {"type": "string"},
                            "location": {"type": "string"},
                            "start_date": {"type": "string", "description": "YYYY-MM if known, else YYYY or empty"},
                            "end_date": {"type": "string", "description": "YYYY-MM / YYYY, or empty for current roles"},
                            "responsibilities": {"type": "array", "items": {"type": "string"}},
                            "technologies": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                },
                "education": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "degree": {"type": "string"},
                            "field": {"type": "string"},
                            "institution": {"type": "string"},
                            "location": {"type": "string"},
                            "start_year": {"type": "integer"},
                            "end_year": {"type": "integer"},
                            "distinction": {"type": "string"},
                            "description": {"type": "string", "description": "Thesis topic, specialisation, or relevant coursework, if mentioned"},
                        },
                    },
                },
                "skills": {
                    "type": "object",
                    "properties": {
                        "groups": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "label": {"type": "string"},
                                    "items": {"type": "array", "items": {"type": "string"}},
                                },
                            },
                        },
                        "languages": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "language": {"type": "string"},
                                    "level": {"type": "integer", "description": "1 (beginner) to 5 (native/fluent)"},
                                },
                            },
                        },
                    },
                },
                "certifications": {
                    "type": "array",
                    "items": {"type": "object", "properties": {
                        "name": {"type": "string"}, "issuer": {"type": "string"}, "year": {"type": "integer"}}},
                },
                "courses": {
                    "type": "array",
                    "items": {"type": "object", "properties": {
                        "name": {"type": "string"}, "provider": {"type": "string"}, "year": {"type": "integer"}}},
                },
                "awards": {
                    "type": "array",
                    "items": {"type": "object", "properties": {
                        "name": {"type": "string"}, "year": {"type": "integer"}, "description": {"type": "string"}}},
                },
                "projects": {
                    "type": "array",
                    "items": {"type": "object", "properties": {
                        "name": {"type": "string"}, "description": {"type": "string"},
                        "url": {"type": "string"}, "technologies": {"type": "array", "items": {"type": "string"}}}},
                },
                "volunteering": {
                    "type": "array",
                    "items": {"type": "object", "properties": {
                        "role": {"type": "string"}, "organisation": {"type": "string"},
                        "start_date": {"type": "string"}, "end_date": {"type": "string"},
                        "description": {"type": "string"}}},
                },
                "memberships": {
                    "type": "array",
                    "items": {"type": "object", "properties": {
                        "name": {"type": "string"}, "role": {"type": "string"}, "year": {"type": "integer"}}},
                },
                "publications": {
                    "type": "array",
                    "items": {"type": "object", "properties": {
                        "citation": {"type": "string"}, "url": {"type": "string", "description": "DOI or link, if mentioned"}}},
                },
                "custom_sections": {
                    "type": "array",
                    "description": "Anything on the CV that doesn't fit the fields above (e.g. licences, exhibitions, references), preserved verbatim.",
                    "items": {"type": "object", "properties": {
                        "title": {"type": "string"},
                        "items": {"type": "array", "items": {"type": "object", "properties": {
                            "heading": {"type": "string"}, "subheading": {"type": "string"},
                            "date": {"type": "string"}, "description": {"type": "string"}}}}}},
                },
            },
        },
    },
}

_IMPORT_PROMPT = """You extract a structured career profile from a CV.
Rules:
- Use only information present in the CV. Never invent facts, dates, or skills.
- Leave a field empty (or omit it) when the CV does not provide it.
- Keep the person's own wording for bullet points and summaries.
- Put anything that doesn't fit the provided fields into a custom section, so nothing is lost.
- For language levels, map to a 1-5 scale (1 = basic, 5 = native/fluent)."""


def _raw_to_v2(d: dict) -> dict:
    """Reshape the flat extraction output into the nested v2 profile shape."""
    per = d.get("personal") or {}
    profile = {
        "meta": {"version": "4.0", "schema": "career-profile-v4"},
        "personal": {
            "name": per.get("name", ""),
            "professional_title": per.get("professional_title", ""),
            "email": per.get("email", ""),
            "phone": per.get("phone", ""),
            "location": {"city": per.get("city", ""), "country": per.get("country", "")},
            "links": [l for l in (per.get("links") or []) if l.get("url")],
        },
        "summary": d.get("summary", "") or "",
        "experience": [
            {
                "title": e.get("title", ""), "employer": e.get("employer", ""),
                "location": e.get("location", ""), "start_date": e.get("start_date", "") or "",
                "end_date": (e.get("end_date") or None) or None,
                "responsibilities": e.get("responsibilities", []) or [],
                "technologies": e.get("technologies", []) or [],
            }
            for e in (d.get("experience") or [])
        ],
        "education": d.get("education") or [],
        "skills": d.get("skills") or {},
        "certifications": d.get("certifications") or [],
        "courses": d.get("courses") or [],
        "awards": d.get("awards") or [],
        "projects": d.get("projects") or [],
        "volunteering": d.get("volunteering") or [],
        "memberships": d.get("memberships") or [],
        "publications": d.get("publications") or [],
        "custom_sections": d.get("custom_sections") or [],
    }
    return profile


def extract_profile(cv_text: str, cfg: dict) -> dict:
    """Return a v2-shaped profile dict extracted from CV text (caller normalizes)."""
    if not cv_text.strip():
        raise ValueError("No CV text to import.")
    resp = complete(
        [
            {"role": "system", "content": _IMPORT_PROMPT},
            {"role": "user", "content": f"CV to extract:\n\n{cv_text[:16000]}"},
        ],
        tools=[_IMPORT_TOOL],
        tool_choice={"type": "function", "function": {"name": "extracted_profile"}},
        cfg=cfg,
        max_tokens=4096,
    )
    d = tool_args(resp, required=("personal",))
    return _raw_to_v2(d)
