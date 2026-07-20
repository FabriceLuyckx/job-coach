# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""A regenerated letter keeps the application's original date.

A language change deletes the old letter row and inserts a new one, so without
this the Applications header date jumped to today and the row jumped to the top
of the list.
"""

import sqlite3

from app.api.letters import _added_at


def _conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("CREATE TABLE letter_history (id TEXT, job_url TEXT, created_at TEXT)")
    return c


def test_first_letter_gets_now():
    with _conn() as c:
        assert _added_at(c, "https://example.com/job/1") >= "2026"


def test_regenerated_letter_inherits_the_original_date():
    with _conn() as c:
        c.execute("INSERT INTO letter_history VALUES ('a', 'https://x/1', '2026-01-05T10:00:00')")
        assert _added_at(c, "https://x/1") == "2026-01-05T10:00:00"


def test_other_applications_dont_leak():
    with _conn() as c:
        c.execute("INSERT INTO letter_history VALUES ('a', 'https://x/1', '2026-01-05T10:00:00')")
        assert _added_at(c, "https://x/2") >= "2026-07"
