"""Phase 5 — job sources, scanning, and suggestion accept/reject."""

import threading
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config, db
from app.api.cv import start_generation
from app.services.cv_renderer import load_profile
from app.services.job_scanner import extract_openings, filter_openings

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

# In-memory scan status, mirroring the CV-generate pattern.
_scans: dict[str, dict] = {}
_scans_lock = threading.Lock()
_SCAN_TTL = 3600  # seconds a finished scan status stays queryable


def _evict_scans() -> None:
    """Drop hour-old scan statuses so a long-lived process doesn't leak memory.
    Caller must hold _scans_lock."""
    cutoff = time.time() - _SCAN_TTL
    for sid in [s for s, v in _scans.items() if v.get("created", 0) < cutoff]:
        del _scans[sid]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SourceRequest(BaseModel):
    url: str


@router.get("/sources")
def list_sources():
    with db.get_db() as conn:
        rows = conn.execute("SELECT * FROM job_sources ORDER BY created_at").fetchall()
    return [dict(r) for r in rows]


@router.post("/sources")
def add_source(body: SourceRequest):
    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "Enter a full URL starting with http:// or https://")
    name = urlparse(url).netloc.replace("www.", "") or url
    sid = str(uuid.uuid4())
    with db.get_db() as conn:
        if conn.execute("SELECT 1 FROM job_sources WHERE url = ?", (url,)).fetchone():
            raise HTTPException(409, "That source is already added.")
        conn.execute(
            "INSERT INTO job_sources (id, url, name, created_at) VALUES (?, ?, ?, ?)",
            (sid, url, name, _now()),
        )
    return {"id": sid, "url": url, "name": name}


@router.delete("/sources/{sid}")
def delete_source(sid: str):
    with db.get_db() as conn:
        conn.execute("DELETE FROM job_sources WHERE id = ?", (sid,))
    return {"ok": True}


def _run_scan(scan_id: str) -> None:
    try:
        with _scans_lock:
            _scans[scan_id]["status"] = "running"

        cfg = config.load()
        api_key, model = config.require_llm(cfg)
        extract_prompt = cfg.get("scan_extract_prompt") or None
        filter_prompt = cfg.get("scan_filter_prompt") or None
        profile = load_profile()

        with db.get_db() as conn:
            sources = [dict(r) for r in conn.execute("SELECT * FROM job_sources").fetchall()]
            known = {r["url"] for r in conn.execute("SELECT url FROM job_openings").fetchall()}

        found = 0
        errors: dict[str, str] = {}  # source name → what went wrong
        for i, src in enumerate(sources):
            with _scans_lock:
                _scans[scan_id].update({"current": i + 1, "total": len(sources),
                                        "source": src["name"] or src["url"]})
            # One bad source shouldn't abort the whole scan — but the user must
            # be able to see which source failed and why.
            try:
                openings = extract_openings(src["url"], api_key, model, extract_prompt)
                new = [o for o in openings if o["url"] not in known]
                matches = filter_openings(new, profile, api_key, model, filter_prompt) if new else {}
            except Exception as e:
                errors[src["name"] or src["url"]] = str(e)
                continue
            with db.get_db() as conn:
                for o in new:
                    m = matches.get(o["url"])
                    conn.execute(
                        """INSERT OR IGNORE INTO job_openings
                           (id, url, title, source_url, status, reason, lang, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                        (str(uuid.uuid4()), o["url"], o["title"], src["url"],
                         "suggested" if m else "seen",
                         m["reason"] if m else None, m["lang"] if m else "en", _now()),
                    )
                    known.add(o["url"])
                    if m:
                        found += 1

        config.save({"jobs_last_scan": _now()})  # ponytail: scan time in config.json to avoid a one-value table.
        with _scans_lock:
            _scans[scan_id].update({"status": "done", "found": found, "errors": errors})
    except Exception as e:
        with _scans_lock:
            _scans[scan_id].update({"status": "error", "error": str(e)})


@router.post("/scan")
def scan():
    scan_id = str(uuid.uuid4())
    with _scans_lock:
        _evict_scans()
        _scans[scan_id] = {"status": "pending", "created": time.time()}
    threading.Thread(target=_run_scan, args=(scan_id,), daemon=True).start()
    return {"scan_id": scan_id}


@router.get("/scan/status/{scan_id}")
def scan_status(scan_id: str):
    with _scans_lock:
        s = _scans.get(scan_id)
    if not s:
        raise HTTPException(404, "Scan not found")
    return s


@router.get("/last-scan")
def last_scan():
    return {"last_scan": config.load().get("jobs_last_scan")}


@router.get("/openings")
def list_openings():
    """Suggested + decided openings, newest decision/discovery first.
    'seen' rows are dedup memory only and stay hidden."""
    with db.get_db() as conn:
        rows = conn.execute(
            """SELECT * FROM job_openings WHERE status != 'seen'
               ORDER BY COALESCE(decided_at, created_at) DESC"""
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/openings/{oid}/reject")
def reject_opening(oid: str):
    with db.get_db() as conn:
        if not conn.execute("SELECT 1 FROM job_openings WHERE id = ?", (oid,)).fetchone():
            raise HTTPException(404, "Opening not found")
        conn.execute(
            "UPDATE job_openings SET status = 'rejected', decided_at = ? WHERE id = ?",
            (_now(), oid),
        )
    return {"ok": True}


@router.post("/openings/{oid}/restore")
def restore_opening(oid: str):
    """Put a decided opening back among the suggestions (the Undo for reject)."""
    with db.get_db() as conn:
        if not conn.execute("SELECT 1 FROM job_openings WHERE id = ?", (oid,)).fetchone():
            raise HTTPException(404, "Opening not found")
        conn.execute(
            "UPDATE job_openings SET status = 'suggested', decided_at = NULL WHERE id = ?",
            (oid,),
        )
    return {"ok": True}


@router.post("/openings/{oid}/accept")
def accept_opening(oid: str):
    """Mark accepted and kick off CV generation from the job URL.
    Returns the CV poll job_id so the UI can hand off to the CV Generator."""
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM job_openings WHERE id = ?", (oid,)).fetchone()
        if not row:
            raise HTTPException(404, "Opening not found")
        row = dict(row)
    job_id = start_generation(row["url"], row.get("lang") or "en")
    with db.get_db() as conn:
        conn.execute(
            "UPDATE job_openings SET status = 'accepted', decided_at = ? WHERE id = ?",
            (_now(), oid),
        )
    return {"cv_job_id": job_id, "job_url": row["url"], "lang": row.get("lang") or "en"}
