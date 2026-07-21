# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""The link-hash skip only fires when the source's openings were really captured.

A hash can match while the last scan stamped it without storing anything (an
early scan that extracted nothing, then skipped forever after) — that hid every
euraxess job. _has_stored_openings guards the skip: no stored opening still on
the page ⇒ re-scan. Run with: uv run pytest
"""

import uuid

import pytest

from app import db
from app.api import jobs


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "jobs.db")
    db.init_db()
    return db.DB_PATH


def _insert(url, source_url):
    with db.get_db() as conn:
        conn.execute(
            """INSERT INTO job_openings (id, url, title, source_url, status, created_at)
               VALUES (?, ?, ?, ?, 'seen', ?)""",
            (str(uuid.uuid4()), url, url, source_url, jobs._now()),
        )


def test_poisoned_hash_rescans(temp_db):
    # Source stamped a hash but none of its stored openings are on the page now.
    _insert("https://src/jobs/OLD", "https://src")
    page = {"https://src/jobs/1", "https://src/jobs/2"}
    assert jobs._has_stored_openings("https://src", page) is False


def test_covered_source_skips(temp_db):
    _insert("https://src/jobs/1", "https://src")
    page = {"https://src/jobs/1", "https://src/jobs/2"}
    assert jobs._has_stored_openings("https://src", page) is True


def test_no_openings_rescans(temp_db):
    assert jobs._has_stored_openings("https://src", {"https://src/jobs/1"}) is False
