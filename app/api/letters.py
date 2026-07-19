# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Cover-letter guide endpoints (Phase: cover-letter-guide).

Reuses the CV router's async job store (run_async + GET /api/cv/status/{id}),
so the frontend's pollCVJob works unchanged.
"""

import json
import uuid
from dataclasses import asdict
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config, db
from app.api.cv import _clean_lang, generic_lang, require_ready_profile, run_async
from app.i18n.languages import is_valid_code
from app.services.cv_renderer import GENERIC_URL, load_profile, role_brief
from app.services.letter_guide import DEFAULT_LETTER_PROMPT, build_guide

router = APIRouter(prefix="/api/letters", tags=["letters"])


class GenerateRequest(BaseModel):
    url: str
    lang: str = "en"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cached_posting_text(url: str, profile: dict) -> str | None:
    """The posting text to reuse instead of fetching: the generic application's
    synthesized role brief (never fetchable), else a scan's cached posting so a
    URL from a scan isn't re-scraped."""
    if url == GENERIC_URL:
        return role_brief(profile)
    with db.get_db() as conn:
        row = conn.execute(
            "SELECT posting_text FROM job_openings WHERE url = ? AND posting_text IS NOT NULL",
            (url,),
        ).fetchone()
    return row["posting_text"] if row else None


def start_letter_generation(url: str, lang: str) -> str:
    """Kick off async cover-letter-guide generation; returns the poll job_id.
    Shared by POST /generate and the Jobs 'accept' flow. Reuses a scan's cached
    posting text (via _cached_posting_text) so an accepted job isn't re-scraped."""
    lang = _clean_lang(lang)
    if not is_valid_code(lang):
        raise HTTPException(400, f"Unknown language code '{lang}'.")
    cfg = config.load()
    config.require_engine(cfg)  # fail fast before starting the thread
    prompt = cfg.get("letter_prompt") or DEFAULT_LETTER_PROMPT

    def work(set_stage):
        profile = load_profile()
        job_text = _cached_posting_text(url, profile)
        if job_text is None:
            set_stage("fetching")
        set_stage("thinking")
        guide = build_guide(profile, url, cfg, lang, prompt, job_text=job_text)
        guide_dict = asdict(guide)
        row_id = str(uuid.uuid4())
        created = _now()
        with db.get_db() as conn:
            conn.execute(
                """INSERT INTO letter_history
                   (id, job_title, employer, job_url, lang, guide_json, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (row_id, guide.job_title, guide.employer, url, lang,
                 json.dumps(guide_dict), created),
            )
        return {
            "id": row_id, "job_title": guide.job_title, "employer": guide.employer,
            "job_url": url, "lang": lang, "guide": guide_dict, "created_at": created,
        }

    return run_async(work)


@router.post("/generate")
def generate_letter(body: GenerateRequest):
    return {"job_id": start_letter_generation(body.url, body.lang)}


class GenericRequest(BaseModel):
    lang: str | None = None  # omitted ⇒ the app's own language (see cv.generic_lang)


@router.post("/generic")
def generate_generic_letter(body: GenericRequest):
    """Guide for the untargeted application — built from the profile's role
    brief instead of a posting (no employer to name, no fetch)."""
    require_ready_profile()
    return {"job_id": start_letter_generation(GENERIC_URL, generic_lang(body.lang))}


@router.get("/history")
def get_history():
    with db.get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM letter_history ORDER BY created_at DESC"
        ).fetchall()
    return [{
        "id": r["id"], "job_title": r["job_title"], "employer": r["employer"],
        "job_url": r["job_url"], "lang": r["lang"],
        "guide": json.loads(r["guide_json"]), "created_at": r["created_at"],
    } for r in rows]


@router.delete("/history/{letter_id}")
def delete_history(letter_id: str):
    with db.get_db() as conn:
        row = conn.execute("SELECT id FROM letter_history WHERE id = ?", (letter_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Entry not found")
        conn.execute("DELETE FROM letter_history WHERE id = ?", (letter_id,))
    return {"ok": True}
