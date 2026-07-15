# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Backup & restore — export all user data to one .zip and re-import it elsewhere.

Lets a user move to a new computer (or recover after a reinstall) and pick up
exactly where they left off. A backup bundles everything in the writable data
dir that represents their work:

* ``config.json``          — settings (the OpenRouter API key is stripped out; it
                             never leaves the machine, and is re-entered on the new one).
* ``profile/profile.json`` — the career profile, plus the CV ``photo.*`` if set.
* ``jobs/jobs.db``         — job sources, accept/reject history, and generated-CV
                             metadata (summaries + per-language tailoring plans).
* ``output/``              — the generated CV HTML files themselves, so "Open CV"
                             keeps working immediately after a restore.

Read-only bundled assets (templates, the frontend) are shipped with the app and
are deliberately *not* part of a backup. Import is a full restore: it replaces
the current profile/jobs/output data with the backup's contents.
"""

import io
import json
import shutil
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from app import config, db, paths
from app.services.cv_renderer import PHOTO_EXTS

router = APIRouter(prefix="/api/backup", tags=["backup"])

MANIFEST_NAME = "manifest.json"
BACKUP_MARKER = "job-coach-backup"
# Top-level archive entries we recognise; anything else is ignored on import.
ALLOWED_TOP = {"config.json", "profile", "jobs", "output", "locales", MANIFEST_NAME}

# Upload/extraction caps: a backup is profile JSON + a photo + a small SQLite DB
# + generated CV HTML, so these are generous. They exist to stop a corrupt or
# malicious zip from filling RAM (upload) or disk (zip bomb).
MAX_UPLOAD_BYTES = 200 * 1024 * 1024
MAX_EXTRACTED_BYTES = 500 * 1024 * 1024


# Settings we deliberately strip from an exported config.json — secrets that
# shouldn't travel in a file the user may email or store in the cloud. The user
# re-enters their key on the new machine.
SENSITIVE_CONFIG_KEYS = {"openrouter_api_key"}


def _backup_files() -> list[tuple[object, str]]:
    """(absolute source path, archive name) pairs for the plain-file members.

    config.json is handled separately in :func:`export_backup` so its API key can
    be stripped, so it is intentionally not listed here.
    """
    items: list[tuple[object, str]] = []
    if paths.PROFILE_PATH.exists():
        items.append((paths.PROFILE_PATH, "profile/profile.json"))
    for ext in PHOTO_EXTS:
        photo = paths.PHOTO_DIR / f"photo.{ext}"
        if photo.exists():
            items.append((photo, f"profile/{photo.name}"))
    if paths.DB_PATH.exists():
        items.append((paths.DB_PATH, "jobs/jobs.db"))
    if paths.OUTPUT_DIR.exists():
        for p in paths.OUTPUT_DIR.rglob("*"):
            if p.is_file():
                rel = p.relative_to(paths.OUTPUT_DIR).as_posix()
                items.append((p, f"output/{rel}"))
    # On-device generated locales (Tier-2 UI translations + CV label sets).
    if paths.LOCALES_DIR.exists():
        for p in paths.LOCALES_DIR.glob("*.json"):
            items.append((p, f"locales/{p.name}"))
    return items


@router.get("/export")
def export_backup():
    """Bundle all user data into a single .zip download."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            MANIFEST_NAME,
            json.dumps(
                {
                    "marker": BACKUP_MARKER,
                    "app": "Job Coach",
                    "version": 1,
                    "exported_at": datetime.now(timezone.utc).isoformat(),
                },
                indent=2,
            ),
        )
        # Settings, minus any secrets (the API key never leaves this machine).
        safe_config = {k: v for k, v in config.load().items() if k not in SENSITIVE_CONFIG_KEYS}
        zf.writestr("config.json", json.dumps(safe_config, indent=2))
        for src, arcname in _backup_files():
            zf.write(src, arcname)
    stamp = datetime.now().strftime("%Y-%m-%d")
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="job-coach-backup-{stamp}.zip"'},
    )


def _safe_members(zf: zipfile.ZipFile) -> list[str]:
    """Names to extract — only our known top-level entries, no path traversal."""
    out: list[str] = []
    for name in zf.namelist():
        if name.endswith("/"):
            continue
        norm = name.replace("\\", "/")
        parts = norm.split("/")
        if parts[0] not in ALLOWED_TOP:
            continue
        if norm.startswith("/") or ".." in parts:
            raise HTTPException(400, "Backup contains an unsafe path and was rejected.")
        out.append(norm)
    return out


@router.post("/import")
def import_backup(file: UploadFile = File(...)):
    """Restore a backup produced by /export, replacing current user data.

    Sync on purpose: the zip/file work is blocking, so FastAPI runs this in its
    threadpool instead of stalling the event loop for the whole restore."""
    raw = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "Backup file is too large (max 200 MB).")
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise HTTPException(400, "That file isn't a valid .zip backup.")

    with zf:
        if MANIFEST_NAME not in zf.namelist():
            raise HTTPException(400, "This zip isn't a Job Coach backup (no manifest).")
        try:
            manifest = json.loads(zf.read(MANIFEST_NAME))
        except Exception:
            manifest = {}
        if manifest.get("marker") != BACKUP_MARKER:
            raise HTTPException(400, "This zip isn't a Job Coach backup.")

        members = _safe_members(zf)

        # Zip-bomb guard: refuse archives whose declared uncompressed size is
        # far beyond anything a real backup contains.
        total_size = sum(zf.getinfo(name).file_size for name in members)
        if total_size > MAX_EXTRACTED_BYTES:
            raise HTTPException(400, "Backup contents are too large to restore.")

        # Full-restore semantics: clear the data we own before extracting, so a
        # leftover photo variant or stale generated CV can't survive the restore.
        if any(m.startswith("profile/") for m in members):
            for ext in PHOTO_EXTS:
                (paths.PHOTO_DIR / f"photo.{ext}").unlink(missing_ok=True)
        if any(m.startswith("output/") for m in members) and paths.OUTPUT_DIR.exists():
            shutil.rmtree(paths.OUTPUT_DIR)

        for name in members:
            if name == MANIFEST_NAME:
                continue
            if name == "config.json":
                # Merge settings rather than overwrite, so a backup (which carries
                # no API key) can't blank a key already configured on this machine.
                try:
                    incoming = json.loads(zf.read(name))
                except Exception:
                    incoming = {}
                incoming = {k: v for k, v in incoming.items() if k not in SENSITIVE_CONFIG_KEYS}
                config.save(incoming)
                continue
            dest = paths.DATA_DIR / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(name) as srcf, dest.open("wb") as out:
                shutil.copyfileobj(srcf, out)

    # Re-apply schema migrations in case the imported database predates a column.
    db.init_db()
    return {"ok": True}
