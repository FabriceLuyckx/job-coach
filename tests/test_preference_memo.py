# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Learned-preferences memo: capture reject notes, rebuild only on change.

The reject action stores an optional note (server-side, feeds the memo) and makes
no LLM call. The memo is rebuilt from the whole accept/reject history only when a
cheap signature (count + latest decided_at) changes; otherwise the cache is
reused. Run with: uv run pytest
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


def _insert(url, status, decided_at, reason=None, user_note=None):
    with db.get_db() as conn:
        conn.execute(
            """INSERT INTO job_openings
               (id, url, title, source_url, status, reason, user_note, created_at, decided_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), url, url, "https://src", status, reason, user_note,
             jobs._now(), decided_at),
        )


def test_reject_stores_note(temp_db):
    _insert("https://job/1", "suggested", None)
    with db.get_db() as conn:
        oid = conn.execute("SELECT id FROM job_openings WHERE url = ?", ("https://job/1",)).fetchone()["id"]
    jobs.reject_opening(oid, jobs.RejectRequest(note="  too senior  "))
    with db.get_db() as conn:
        row = conn.execute("SELECT status, user_note FROM job_openings WHERE id = ?", (oid,)).fetchone()
    assert row["status"] == "rejected"
    assert row["user_note"] == "too senior"  # trimmed


def test_reject_empty_note_is_null(temp_db):
    _insert("https://job/2", "suggested", None)
    with db.get_db() as conn:
        oid = conn.execute("SELECT id FROM job_openings WHERE url = ?", ("https://job/2",)).fetchone()["id"]
    jobs.reject_opening(oid, jobs.RejectRequest(note="   "))
    with db.get_db() as conn:
        row = conn.execute("SELECT status, user_note FROM job_openings WHERE id = ?", (oid,)).fetchone()
    assert row["status"] == "rejected"
    assert row["user_note"] is None


def test_memo_rebuilds_only_on_change(temp_db, monkeypatch):
    calls = {"n": 0}

    def fake_build(accepted, rejected, cfg):
        calls["n"] += 1
        return f"memo#{calls['n']}"

    saved = {}
    monkeypatch.setattr(jobs, "build_preference_memo", fake_build)
    monkeypatch.setattr(jobs.config, "save", lambda d: saved.update(d))

    _insert("https://job/a", "accepted", "2026-07-20T10:00:00", reason="great fit")
    _insert("https://job/b", "rejected", "2026-07-20T11:00:00", user_note="too admin")

    cfg = {}
    m1 = jobs._preference_memo(cfg)
    assert m1 == "memo#1" and calls["n"] == 1

    # Same decisions → same signature → cache reused, no rebuild.
    cfg2 = {**saved}
    m2 = jobs._preference_memo(cfg2)
    assert m2 == "memo#1" and calls["n"] == 1

    # A new decision changes the signature → one rebuild.
    _insert("https://job/c", "rejected", "2026-07-20T12:00:00", user_note="wrong city")
    m3 = jobs._preference_memo({**saved})
    assert m3 == "memo#2" and calls["n"] == 2


def test_no_decisions_no_memo_no_build(temp_db, monkeypatch):
    calls = {"n": 0}
    monkeypatch.setattr(jobs, "build_preference_memo",
                        lambda *a: calls.__setitem__("n", calls["n"] + 1) or "x")
    assert jobs._preference_memo({}) == ""
    assert calls["n"] == 0
