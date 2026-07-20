# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

import json
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from app import config
from app.services.cv_renderer import PROFILE_PATH, blank_profile, load_profile, normalize_profile
from app.services.cv_importer import MAX_CV_BYTES, extract_profile, pdf_to_text
from app.services.llm import AIResponseError, complete, tool_args

router = APIRouter(prefix="/api/profile", tags=["profile"])

# A chip row is not a paragraph: an unbounded title would break the layout and
# is useless as a scanner signal anyway.
MAX_TITLE_LEN = 60
MAX_TITLES = 8

_TITLES_TOOL = {
    "type": "function",
    "function": {
        "name": "suggested_titles",
        "description": "Job titles this person could realistically apply for",
        "parameters": {
            "type": "object",
            "required": ["titles"],
            "properties": {
                "titles": {
                    "type": "array",
                    "items": {"type": "string", "description": "A job title, as it would appear in a listing"},
                    "description": f"Up to {MAX_TITLES} job titles, most plausible first",
                },
            },
        },
    },
}


@router.get("")
def get_profile():
    # A brand-new install has no profile.json yet — return a blank v2 skeleton so
    # the editor opens on an empty state rather than erroring.
    if not PROFILE_PATH.exists():
        return blank_profile()
    try:
        return load_profile()
    except ValueError as e:
        raise HTTPException(500, str(e))


@router.put("")
def put_profile(body: dict):
    # Minimal shape check: a bad save would brick every CV render afterwards.
    if "personal" not in body:
        raise HTTPException(400, "Profile must include at least a 'personal' section.")
    # Stamp the edit time so the Jobs page can nudge "profile changed — re-check?".
    body.setdefault("meta", {})["last_updated"] = datetime.now(timezone.utc).isoformat()
    # Atomic write: a GET racing an in-flight save must never see a truncated file.
    tmp = PROFILE_PATH.with_name(PROFILE_PATH.name + ".tmp")
    tmp.write_text(json.dumps(body, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, PROFILE_PATH)
    return {"ok": True}


@router.post("/import")
def import_profile(file: UploadFile | None = File(default=None), text: str = Form(default="")):
    """Extract a structured profile from an uploaded CV (PDF) or pasted text via one
    LLM call. Returns the normalized profile for review in the editor — it is NOT
    saved here; the client persists it on the next auto-save."""
    cfg = config.load()
    try:
        config.require_engine(cfg)
    except ValueError as e:
        raise HTTPException(400, str(e))

    cv_text = text or ""
    if file is not None:
        data = file.file.read(MAX_CV_BYTES + 1)
        if len(data) > MAX_CV_BYTES:
            raise HTTPException(400, "That file is too large (max 5 MB).")
        try:
            cv_text = pdf_to_text(data)
        except ValueError as e:
            raise HTTPException(400, str(e))

    if not cv_text.strip():
        raise HTTPException(400, "Paste your CV text or upload a PDF to import.")

    try:
        raw = extract_profile(cv_text, cfg)
    except AIResponseError:
        raise HTTPException(502, "The AI returned an unexpected response — try again.")
    except Exception as e:
        raise HTTPException(502, f"Couldn't import the CV ({e}).")

    return normalize_profile(raw)


@router.post("/suggest-titles")
def suggest_titles():
    """Candidate job titles derived from the profile, for the Preferences page's
    target-roles question. On demand only — never called on page load.

    ponytail: synchronous, like /api/cv/detect-lang — the output is a handful of
    short strings. If a slow local engine starts timing out this call, move it
    onto the existing run_async job store rather than adding a new mechanism.
    """
    cfg = config.load()
    try:
        config.require_engine(cfg)
    except ValueError as e:
        raise HTTPException(400, str(e))

    profile = load_profile() if PROFILE_PATH.exists() else blank_profile()
    title = (profile.get("personal") or {}).get("professional_title", "").strip()
    experience = profile.get("experience") or []
    if not experience and not title:
        raise HTTPException(400, "Add your job title or some work experience first.")

    skills = profile.get("skills") or {}
    facts = {
        "professional_title": title,
        "experience": [{k: e.get(k, "") for k in ("title", "employer")} for e in experience],
        "skills": [s for g in (skills.get("groups") or []) for s in (g.get("items") or [])],
    }
    try:
        response = complete(
            [
                {"role": "system", "content":
                    "Suggest job titles this person could realistically apply for, based on "
                    f"their career profile. Return at most {MAX_TITLES} titles, most plausible "
                    "first. Use titles as they actually appear in job listings — no seniority "
                    "invented beyond the profile, no company names, no explanations."},
                {"role": "user", "content": json.dumps(facts, ensure_ascii=False)},
            ],
            tools=[_TITLES_TOOL],
            tool_choice={"type": "function", "function": {"name": "suggested_titles"}},
            cfg=cfg,
            max_tokens=300,
        )
        raw = tool_args(response, required=("titles",)).get("titles") or []
    except AIResponseError:
        raise HTTPException(502, "The AI returned an unexpected response — try again.")
    except Exception as e:
        raise HTTPException(502, f"Couldn't suggest titles ({e}).")

    # Cap server-side: the model is free to ignore both limits in the schema.
    titles = list({t.strip()[:MAX_TITLE_LEN]: None
                   for t in raw if isinstance(t, str) and t.strip()})
    return {"titles": titles[:MAX_TITLES]}
