# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

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
from app.api.letters import start_letter_generation
from app.services.cv_generator import fetch_job_description
from app.services.cv_renderer import load_profile
from app.services.headless import fetch_texts
from app.services.job_scanner import (
    _MIN_LINKS, extract_openings, fetch_listing_links, links_hash,
    prescreen_openings, review_posting,
)
from app.services.llm import GenerationCancelled, current_cancel

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

_FETCH_CAVEAT = "Matched by title — couldn't read the posting page."


def _opening_dict(r: dict) -> dict:
    """Shape a job_openings row for the client: parse the digest JSON, drop the
    bulky posting_text cache (server-only)."""
    d = dict(r)
    pj = d.pop("posting_json", None)
    d.pop("posting_text", None)
    d["digest"] = json.loads(pj) if pj else None
    return d

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


def _source_error(e: Exception) -> str:
    """Why a source couldn't be read, in words a non-technical user can act on.

    The raw exception (`HTTPStatusError: 403 Client Error: Forbidden for url...`)
    used to be interpolated straight into the UI. Keep the detail in the server
    log, hand the user something they can decide about.
    """
    status = getattr(getattr(e, "response", None), "status_code", None)
    if status == 404:
        return "the page wasn't found — check the address"
    if status in (401, 403):
        return "the site blocked us from reading it"
    if status and status >= 500:
        return "the site is having problems right now"
    name = type(e).__name__.lower()
    if "timeout" in name:
        return "the site took too long to respond"
    if "connect" in name or "dns" in name or "resolve" in name:
        return "we couldn't reach the site — check the address or your connection"
    return "the page couldn't be read"


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
    parsed = urlparse(url)
    name = parsed.netloc.replace("www.", "") or url
    sid = str(uuid.uuid4())
    with db.get_db() as conn:
        if conn.execute("SELECT 1 FROM job_sources WHERE url = ?", (url,)).fetchone():
            raise HTTPException(409, "That source is already added.")
        # Two boards on one host would be indistinguishable — disambiguate the
        # new one with its first path segment ("example.com/teaching").
        if conn.execute("SELECT 1 FROM job_sources WHERE name = ?", (name,)).fetchone():
            segment = next((s for s in parsed.path.split("/") if s), "")
            if segment:
                name = f"{name}/{segment}"
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


def _review_one(opening: dict, text: str, profile: dict, cfg: dict,
                filter_prompt: str | None) -> dict:
    """Judge one posting from its (already-fetched) text and shape a DB row.
    Empty text or a review error ⇒ suggested-with-caveat: a plausible job that
    survived the title prescreen must never be silently buried."""
    row = {"status": "seen", "reason": None, "lang": "en",
           "posting_text": None, "posting_json": None}
    if not text:
        return {**row, "status": "suggested", "reason": _FETCH_CAVEAT}
    try:
        r = review_posting(opening, text, profile, cfg, filter_prompt)
    except GenerationCancelled:
        raise  # a cancel must stop the scan, not masquerade as a suggested job
    except Exception:
        return {**row, "status": "suggested", "reason": _FETCH_CAVEAT}
    row["posting_text"] = text[:20000]
    row["posting_json"] = json.dumps(r["digest"]) if r["digest"] else None
    row["lang"] = r["lang"]
    row["reason"] = r["reason"]  # keep the reason even for non-matches (auditable)
    if r["match"]:
        row["status"] = "suggested"
    return row


def _insert_opening(conn, opening: dict, source_url: str, row: dict) -> None:
    """Persist one reviewed opening. INSERT OR IGNORE so a concurrent/duplicate
    URL is harmless — the point of writing per-opening is that a later cancel
    never discards a verdict already stored here."""
    conn.execute(
        """INSERT OR IGNORE INTO job_openings
           (id, url, title, source_url, status, reason, lang,
            posting_text, posting_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (str(uuid.uuid4()), opening["url"], opening["title"], source_url,
         row["status"], row["reason"], row["lang"],
         row["posting_text"], row["posting_json"], _now()),
    )


def _mark_scanned(sid: str, lhash: str) -> None:
    """Stamp a source as fully scanned: record its link-set hash (skip marker for
    next time) and the scan time. Only called once a source completes uncancelled."""
    with db.get_db() as conn:
        conn.execute("UPDATE job_sources SET links_hash = ?, last_scanned = ? WHERE id = ?",
                     (lhash, _now(), sid))


def _run_scan(scan_id: str) -> None:
    with _scans_lock:
        cancel = _scans[scan_id]["cancel"]
    token = current_cancel.set(cancel)  # makes every complete() inside interruptible
    found = 0
    errors: dict[str, str] = {}  # source id → what went wrong (id, not name:
    # names are derived from the hostname, so two sources on one host collide)
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

        for i, src in enumerate(sources):
            if cancel.is_set():
                break
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
                    _mark_scanned(src["id"], lhash)  # source WAS checked, just empty
                    continue
                openings = extract_openings(src["url"], cfg, extract_prompt, links=links)
                new = [o for o in openings if o["url"] not in known]
                survivors = prescreen_openings(new, profile, cfg) if new else []
            except GenerationCancelled:
                raise  # cancel — stop the whole scan, don't record it as a source error
            except Exception as e:
                errors[src["id"]] = _source_error(e)
                continue

            # Incremental persistence: write each verdict the moment it exists so a
            # cancel never discards paid LLM work. Prescreened-out openings have a
            # final 'seen' verdict now (no review coming); survivors are inserted
            # after their review below. A re-scan re-reviews nothing already stored.
            survivor_urls = {o["url"] for o in survivors}
            with db.get_db() as conn:
                # Availability sweep: this source's link set just changed, so any
                # filtered-out ('seen') opening whose URL fell off the page is no
                # longer applyable — mark it unavailable so it leaves the filtered
                # list and re-check. Reappearing URLs flip back to 1, so a transient
                # miss self-heals. Guard on a healthy link set (a flaky JS render
                # yielding a handful of links must not false-flag live jobs). Compare
                # against raw hrefs, not the LLM's extract output (non-deterministic).
                if len(links) >= _MIN_LINKS:
                    link_hrefs = {l["href"] for l in links}
                    for r in conn.execute(
                        "SELECT id, url FROM job_openings WHERE source_url = ? AND status = 'seen'",
                        (src["url"],),
                    ).fetchall():
                        conn.execute("UPDATE job_openings SET available = ? WHERE id = ?",
                                     (1 if r["url"] in link_hrefs else 0, r["id"]))
                for o in new:
                    if o["url"] in survivor_urls:
                        continue
                    _insert_opening(conn, o, src["url"],
                                    {"status": "seen", "reason": None, "lang": "en",
                                     "posting_text": None, "posting_json": None})
                    known.add(o["url"])

            # Fetch every surviving posting in parallel (I/O-bound), then review
            # them one at a time — the local engine serialises LLM calls anyway,
            # so the parallelism that matters is the fetching.
            texts = fetch_texts([o["url"] for o in survivors])
            interrupted = False
            for j, o in enumerate(survivors):
                if cancel.is_set():
                    interrupted = True
                    break
                with _scans_lock:
                    _scans[scan_id].update({"reading_current": j + 1,
                                            "reading_total": len(survivors)})
                row = _review_one(o, texts.get(o["url"]) or "", profile, cfg, filter_prompt)
                with db.get_db() as conn:
                    _insert_opening(conn, o, src["url"], row)
                known.add(o["url"])
                if row["status"] == "suggested":
                    found += 1

            if interrupted or cancel.is_set():
                break  # source incomplete: leave its skip marker unset so it's re-examined
            _mark_scanned(src["id"], lhash)

        if cancel.is_set():
            with _scans_lock:
                _scans[scan_id].update({"status": "cancelled", "found": found, "errors": errors})
            return
        config.save({"jobs_last_scan": _now()})  # ponytail: scan time in config.json to avoid a one-value table.
        with _scans_lock:
            _scans[scan_id].update({"status": "done", "found": found, "errors": errors})
    except GenerationCancelled:
        with _scans_lock:
            _scans[scan_id].update({"status": "cancelled", "found": found, "errors": errors})
    except Exception as e:
        with _scans_lock:
            _scans[scan_id].update({"status": "error", "error": str(e)})
    finally:
        current_cancel.reset(token)


def _start_or_attach(kind: str, target) -> dict:
    """Start a scan/re-check, or hand back the one already running.

    The page remembers its scan id only in memory, so a hard refresh mid-scan
    loses it while the server keeps going. Without this guard the next click
    starts a *second* concurrent job — and since the local engine serialises all
    AI behind one lock, two scans just take turns and double the cost.
    """
    with _scans_lock:
        _evict_scans()
        for sid, s in _scans.items():
            if s.get("status") in ("pending", "running"):
                return {"scan_id": sid, "kind": s.get("kind", "scan"), "already_running": True}
        scan_id = str(uuid.uuid4())
        _scans[scan_id] = {"status": "pending", "created": time.time(),
                           "kind": kind, "cancel": threading.Event()}
    threading.Thread(target=target, args=(scan_id,), daemon=True).start()
    return {"scan_id": scan_id, "kind": kind, "already_running": False}


@router.post("/scan")
def scan():
    return _start_or_attach("scan", _run_scan)


def _run_recheck(scan_id: str) -> None:
    """Re-judge already-seen openings against the CURRENT profile, using their
    cached posting text (no fetching). Newly matching ones become suggestions.
    Reuses the scan status dict so the UI poller works unchanged."""
    with _scans_lock:
        cancel = _scans[scan_id]["cancel"]
    token = current_cancel.set(cancel)
    found = 0
    try:
        with _scans_lock:
            _scans[scan_id]["status"] = "running"
        cfg = config.load()
        config.require_engine(cfg)
        filter_prompt = cfg.get("scan_filter_prompt") or None
        profile = load_profile()

        with db.get_db() as conn:
            rows = [dict(r) for r in conn.execute(
                """SELECT * FROM job_openings
                   WHERE status = 'seen' AND available = 1
                     AND posting_text IS NOT NULL AND posting_text != ''
                   ORDER BY created_at DESC LIMIT 100"""
            ).fetchall()]

        for i, row in enumerate(rows):
            if cancel.is_set():
                break
            with _scans_lock:
                _scans[scan_id].update({"reading_current": i + 1, "reading_total": len(rows)})
            r = _review_one({"title": row["title"], "url": row["url"]},
                            row["posting_text"], profile, cfg, filter_prompt)
            # The caveat path (posting_text None despite non-empty input) means
            # the REVIEW failed, not the page read. Unlike a scan — where a new
            # opening must not be buried — these rows already hold a valid old
            # verdict: keep it rather than promoting on an LLM hiccup (which
            # would also wipe the stored digest).
            if r["posting_text"] is None:
                continue
            with db.get_db() as conn:
                conn.execute(
                    "UPDATE job_openings SET status = ?, reason = ?, lang = ?, posting_json = ? WHERE id = ?",
                    (r["status"], r["reason"], r["lang"], r["posting_json"], row["id"]),
                )
            if r["status"] == "suggested":
                found += 1

        if cancel.is_set():
            with _scans_lock:
                _scans[scan_id].update({"status": "cancelled", "found": found, "errors": {}})
            return
        config.save({"jobs_last_recheck": _now()})  # clears the profile-changed nudge
        with _scans_lock:
            _scans[scan_id].update({"status": "done", "found": found, "errors": {}})
    except GenerationCancelled:
        with _scans_lock:
            _scans[scan_id].update({"status": "cancelled", "found": found, "errors": {}})
    except Exception as e:
        with _scans_lock:
            _scans[scan_id].update({"status": "error", "error": str(e)})
    finally:
        current_cancel.reset(token)


@router.post("/recheck")
def recheck():
    """Re-judge past 'filtered out' openings against your current Preferences."""
    return _start_or_attach("recheck", _run_recheck)


@router.get("/scan/status/{scan_id}")
def scan_status(scan_id: str):
    with _scans_lock:
        s = _scans.get(scan_id)
    if not s:
        raise HTTPException(404, "Scan not found")
    # Strip the internal cancel Event (not JSON-serialisable).
    return {k: v for k, v in s.items() if k != "cancel"}


@router.post("/scan/cancel/{scan_id}")
def cancel_scan(scan_id: str):
    """Signal a running scan/recheck to stop — interrupts the in-flight local
    generation so the engine is freed. 404 if the scan id is unknown."""
    with _scans_lock:
        s = _scans.get(scan_id)
    if not s:
        raise HTTPException(404, "Scan not found")
    s["cancel"].set()
    return {"ok": True}


@router.get("/last-scan")
def last_scan():
    """Last scan time, plus whether the profile was edited since the last scan
    OR re-check — a nudge to re-check filtered jobs against changed Preferences."""
    cfg = config.load()
    scanned = cfg.get("jobs_last_scan")
    # ISO-8601 UTC strings, so max() is chronological.
    judged = max(filter(None, [scanned, cfg.get("jobs_last_recheck")]), default=None)
    changed = False
    try:
        updated = load_profile().get("meta", {}).get("last_updated")
        changed = bool(updated) and (not judged or updated > judged)
    except Exception:
        pass  # a missing/broken profile just means "no nudge"
    # How many filtered-out openings a re-check could actually re-judge. The
    # client can't derive this: it only sees the newest 50 'seen' rows, while a
    # re-check reaches 100 — so a client-side guess disables the button while
    # re-checkable rows sit just past its window. Same WHERE as _run_recheck.
    with db.get_db() as conn:
        recheckable = conn.execute(
            """SELECT COUNT(*) FROM job_openings
               WHERE status = 'seen' AND available = 1
                 AND posting_text IS NOT NULL AND posting_text != ''"""
        ).fetchone()[0]
    return {"last_scan": scanned, "profile_changed": changed, "recheckable": recheckable}


@router.get("/openings")
def list_openings():
    """The live suggestion board: 'suggested' openings only, newest first. The
    filtered-out and history lists are paged separately via /openings/page."""
    with db.get_db() as conn:
        rows = conn.execute(
            """SELECT * FROM job_openings WHERE status = 'suggested'
               ORDER BY COALESCE(decided_at, created_at) DESC"""
        ).fetchall()
    return [_opening_dict(r) for r in rows]


# Each archival list is one WHERE clause; both share ordering, limit and offset.
_GROUP_WHERE = {
    "filtered": "status = 'seen' AND available = 1",
    "history": "status IN ('accepted', 'rejected')",
}


@router.get("/openings/page")
def list_openings_page(group: str, offset: int = 0, limit: int = 20):
    """One page of an archival list. group='filtered' (available seen rows) or
    'history' (accepted/rejected). Returns {items, total} for the pager."""
    where = _GROUP_WHERE.get(group)
    if where is None:
        raise HTTPException(400, "Unknown group")
    with db.get_db() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM job_openings WHERE {where}").fetchone()[0]
        rows = conn.execute(
            f"""SELECT * FROM job_openings WHERE {where}
                ORDER BY COALESCE(decided_at, created_at) DESC LIMIT ? OFFSET ?""",
            (limit, offset),
        ).fetchall()
    return {"items": [_opening_dict(r) for r in rows], "total": total}


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
    """Mark accepted and kick off CV + cover-letter-guide generation from the job
    URL. Returns both poll job_ids so the UI can hand off to the Applications page."""
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM job_openings WHERE id = ?", (oid,)).fetchone()
        if not row:
            raise HTTPException(404, "Opening not found")
        row = dict(row)
    lang = row.get("lang") or "en"
    # Reuse the posting text the scan already fetched — no re-scrape. Both the CV
    # and the letter guide are generated for the accepted job (letter_guide looks
    # up the same cached posting_text itself).
    cv_job_id = start_generation(row["url"], lang, job_text=row.get("posting_text") or None)
    letter_job_id = start_letter_generation(row["url"], lang)
    with db.get_db() as conn:
        conn.execute(
            "UPDATE job_openings SET status = 'accepted', decided_at = ? WHERE id = ?",
            (_now(), oid),
        )
    return {"cv_job_id": cv_job_id, "letter_job_id": letter_job_id,
            "job_url": row["url"], "lang": lang}


@router.post("/check")
def check_opening(body: SourceRequest):
    """Judge a single job URL the same way a scan would — for a posting the user
    found elsewhere. Returns the opening row (with digest) whether it matches or
    not: a non-match is stored as 'seen' but always reported back, never hidden."""
    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "Enter a full URL starting with http:// or https://")

    with db.get_db() as conn:
        existing = conn.execute("SELECT * FROM job_openings WHERE url = ?", (url,)).fetchone()
    if existing:
        return _opening_dict(dict(existing))  # already known — no second LLM call

    cfg = config.load()
    try:
        config.require_engine(cfg)
        profile = load_profile()
    except ValueError as e:
        raise HTTPException(400, str(e))
    filter_prompt = cfg.get("scan_filter_prompt") or None
    try:
        text = fetch_job_description(url)
    except Exception as e:
        raise HTTPException(502, f"Couldn't read that job page: {e}")
    # _review_one never raises (a bad read ⇒ suggested-with-caveat), so the
    # user always gets an opening back rather than an error.
    r = _review_one({"title": "", "url": url}, text, profile, cfg, filter_prompt)

    digest = json.loads(r["posting_json"]) if r["posting_json"] else {}
    title = digest.get("employer") or (digest.get("summary") or "")[:60] or urlparse(url).netloc.replace("www.", "")
    oid = str(uuid.uuid4())
    with db.get_db() as conn:
        conn.execute(
            """INSERT INTO job_openings
               (id, url, title, source_url, status, reason, lang,
                posting_text, posting_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (oid, url, title, url, r["status"], r["reason"], r["lang"],
             r["posting_text"], r["posting_json"], _now()),
        )
        row = conn.execute("SELECT * FROM job_openings WHERE id = ?", (oid,)).fetchone()
    return _opening_dict(dict(row))
