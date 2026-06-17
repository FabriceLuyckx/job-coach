"""SQLite database setup. Used for cv_history (Phase 4) and jobs (Phase 5)."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "jobs" / "jobs.db"


def init_db() -> None:
    DB_PATH.parent.mkdir(exist_ok=True)
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
        # Migrate existing tables that may lack newer columns
        for col, coltype in [("summary", "TEXT"), ("plan_json", "TEXT")]:
            try:
                conn.execute(f"ALTER TABLE cv_history ADD COLUMN {col} {coltype}")
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
