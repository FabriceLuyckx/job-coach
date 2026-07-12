"""Phase 5 — job sources, scanning, and suggestion accept/reject."""

import json
import threading
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config, db
from app.api.cv import start_generation
from app.services.cv_generator import fetch_job_description
from app.services.cv_renderer import load_profile
from app.services.job_scanner import (
    extract_openings, fetch_listing_links, links_hash,
    prescreen_openings, review_posting,
)

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
        config.require_engine(cfg)  # fail fast before scanning any source
        extract_prompt = cfg.get("scan_extract_prompt") or None
        filter_prompt = cfg.get("scan_filter_prompt") or None
        profile = load_profile()

        with db.get_db() as conn:
            sources = [dict(r) for r in conn.execute("SELECT * FROM job_sources").fetchall()]
            known = {r["url"] for r in conn.execute("SELECT url FROM job_openings").fetchall()}

        found = 0
        errors: dict[str, str] = {}  # source name → what went wrong
        for i, src in enumerate(sources):
            name = src["name"] or src["url"]
            with _scans_lock:
                _scans[scan_id].update({"current": i + 1, "total": len(sources),
                                        "source": name, "reading_total": 0})
            # One bad source shouldn't abort the whole scan — but the user must
            # be able to see which source failed and why.
            try:
                # Phase C: skip the LLM entirely when the page's link set is
                # unchanged since last scan — nothing new can exist.
                links = fetch_listing_links(src["url"])
                lhash = links_hash(links)
                if lhash and lhash == src.get("links_hash"):
                    continue
                openings = extract_openings(src["url"], cfg, extract_prompt, links=links)
                new = [o for o in openings if o["url"] not in known]
                survivors = prescreen_openings(new, profile, cfg) if new else []
            except Exception as e:
                errors[name] = str(e)
                continue

            for j, o in enumerate(survivors):
                with _scans_lock:
                    _scans[scan_id].update({"reading_current": j + 1,
                                            "reading_total": len(survivors)})
                row = {"status": "seen", "reason": None, "lang": "en",
                       "posting_text": None, "posting_json": None}
                try:
                    text = fetch_job_description(o["url"])
                    r = review_posting(o, text, profile, cfg, filter_prompt)
                    row["posting_text"] = text[:20000]
                    row["posting_json"] = json.dumps(r["digest"]) if r["digest"] else None
                    row["lang"] = r["lang"]
                    if r["match"]:
                        row["status"], row["reason"] = "suggested", r["reason"]
                except Exception:
                    # A fetch/parse failure must not silently bury a plausible
                    # job: it survived the title prescreen, so keep it suggested
                    # with a caveat. (Surfaced on the card, not the source-error
                    # banner, which is reserved for whole-source failures.)
                    row["status"] = "suggested"
                    row["reason"] = "Matched by title — couldn't read the posting page."
                o["_row"] = row

            with db.get_db() as conn:
                for o in new:
                    r = o.get("_row") or {"status": "seen", "reason": None, "lang": "en",
                                          "posting_text": None, "posting_json": None}
                    conn.execute(
                        """INSERT OR IGNORE INTO job_openings
                           (id, url, title, source_url, status, reason, lang,
                            posting_text, posting_json, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (str(uuid.uuid4()), o["url"], o["title"], src["url"],
                         r["status"], r["reason"], r["lang"],
                         r["posting_text"], r["posting_json"], _now()),
                    )
                    known.add(o["url"])
                    if r["status"] == "suggested":
                        found += 1
                conn.execute("UPDATE job_sources SET links_hash = ? WHERE id = ?",
                             (lhash, src["id"]))

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
    out = []
    for r in rows:
        d = dict(r)
        pj = d.pop("posting_json", None)
        d.pop("posting_text", None)  # cache only — never shipped to the client
        d["digest"] = json.loads(pj) if pj else None
        out.append(d)
    return out


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
    # Reuse the posting text the scan already fetched — no re-scrape.
    job_id = start_generation(row["url"], row.get("lang") or "en",
                              job_text=row.get("posting_text") or None)
    with db.get_db() as conn:
        conn.execute(
            "UPDATE job_openings SET status = 'accepted', decided_at = ? WHERE id = ?",
            (_now(), oid),
        )
    return {"cv_job_id": job_id, "job_url": row["url"], "lang": row.get("lang") or "en"}
