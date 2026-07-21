# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Paginated archival lists + availability flagging (paginate-job-listings).

The filtered-out and history lists page server-side, and a filtered-out opening
gone from its source page (available=0) drops off the list and out of re-check.
Run with: uv run pytest
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


def _insert(url, status, available=1, posting_text="body"):
    with db.get_db() as conn:
        conn.execute(
            """INSERT INTO job_openings
               (id, url, title, source_url, status, available, posting_text, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), url, url, "https://src", status, available,
             posting_text, jobs._now()),
        )


def test_filtered_pages_and_reports_total(temp_db):
    for i in range(25):
        _insert(f"https://job/{i}", "seen")
    p0 = jobs.list_openings_page("filtered", offset=0, limit=20)
    assert p0["total"] == 25
    assert len(p0["items"]) == 20
    p1 = jobs.list_openings_page("filtered", offset=20, limit=20)
    assert len(p1["items"]) == 5  # the rest
    # No overlap between pages.
    assert not {o["url"] for o in p0["items"]} & {o["url"] for o in p1["items"]}


def test_unavailable_seen_row_is_hidden(temp_db):
    _insert("https://live", "seen", available=1)
    _insert("https://gone", "seen", available=0)
    r = jobs.list_openings_page("filtered", 0, 20)
    urls = {o["url"] for o in r["items"]}
    assert urls == {"https://live"}
    assert r["total"] == 1


def test_history_group_is_decided_only(temp_db):
    _insert("https://a", "accepted")
    _insert("https://r", "rejected")
    _insert("https://s", "seen")
    _insert("https://g", "suggested")
    r = jobs.list_openings_page("history", 0, 20)
    assert {o["url"] for o in r["items"]} == {"https://a", "https://r"}


def test_unknown_group_is_rejected(temp_db):
    with pytest.raises(jobs.HTTPException) as e:
        jobs.list_openings_page("bogus", 0, 20)
    assert e.value.status_code == 400


def test_openings_returns_suggested_only(temp_db):
    _insert("https://s", "suggested")
    _insert("https://seen", "seen")
    _insert("https://acc", "accepted")
    assert {o["url"] for o in jobs.list_openings()} == {"https://s"}


def test_recheckable_excludes_unavailable(temp_db, monkeypatch):
    _insert("https://live", "seen", available=1)
    _insert("https://gone", "seen", available=0)
    monkeypatch.setattr(jobs.config, "load", lambda: {})
    monkeypatch.setattr(jobs, "load_profile", lambda: {})
    assert jobs.last_scan()["recheckable"] == 1
