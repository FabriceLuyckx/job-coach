"""SQLite database setup. Used for cv_history (Phase 4) and jobs (Phase 5)."""

import sqlite3
from contextlib import contextmanager

from app.paths import DB_PATH


def _add_column(conn: sqlite3.Connection, table: str, column_ddl: str) -> None:
    """ALTER TABLE ... ADD COLUMN that tolerates the column already existing but
    still surfaces real failures (locked DB, disk full)."""
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column_ddl}")
    except sqlite3.OperationalError as e:
        if "duplicate column" not in str(e).lower():
            raise


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_db() as conn:
        # WAL lets the background scan/generation threads write while foreground
        # requests read, instead of tripping over "database is locked".
        conn.execute("PRAGMA journal_mode=WAL")
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
        for col in ("summary TEXT", "plan_json TEXT", "plans_json TEXT"):
            _add_column(conn, "cv_history", col)

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
        _add_column(conn, "job_openings", "lang TEXT NOT NULL DEFAULT 'en'")


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
