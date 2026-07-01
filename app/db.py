"""SQLite database setup. Used for cv_history (Phase 4) and jobs (Phase 5)."""

import sqlite3
from contextlib import contextmanager

from app.paths import DB_PATH


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cv_history (
                id              TEXT PRIMARY KEY,
                slug            TEXT NOT NULL,
                job_title       TEXT NOT NULL,
                employer        TEXT NOT NULL,
                job_url         TEXT,
                lang            TEXT NOT NULL DEFAULT 'en',
                tailoring_notes TEXT,
                summary         TEXT,
                plan_json       TEXT,
                created_at      TEXT NOT NULL
            )
        """)
        # Migrate existing tables that may lack newer columns.
        # plans_json holds per-language tailoring plans: {"en": {...}, "nl": {...}}
        # so language switches and edits don't clobber each other.
        for col, coltype in [("summary", "TEXT"), ("plan_json", "TEXT"), ("plans_json", "TEXT")]:
            try:
                conn.execute(f"ALTER TABLE cv_history ADD COLUMN {col} {coltype}")
            except Exception:
                pass

        # Phase 5 — job sources the user adds, and openings the scan has seen.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS job_sources (
                id         TEXT PRIMARY KEY,
                url        TEXT UNIQUE NOT NULL,
                name       TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        # Every opening found on a listing page is stored here (keyed by url) so
        # the next scan recognises it as already-seen and skips the profile filter.
        # status: 'seen' (found, not interesting — dedup memory only),
        # 'suggested' (interesting, awaiting decision), 'accepted', 'rejected'.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS job_openings (
                id           TEXT PRIMARY KEY,
                url          TEXT UNIQUE NOT NULL,
                title        TEXT NOT NULL,
                source_url   TEXT NOT NULL,
                status       TEXT NOT NULL DEFAULT 'suggested',
                reason       TEXT,
                lang         TEXT NOT NULL DEFAULT 'en',
                cv_slug      TEXT,
                created_at   TEXT NOT NULL,
                decided_at   TEXT
            )
        """)
        try:
            conn.execute("ALTER TABLE job_openings ADD COLUMN lang TEXT NOT NULL DEFAULT 'en'")
        except Exception:
            pass


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
