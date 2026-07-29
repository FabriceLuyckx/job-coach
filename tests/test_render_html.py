# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""A rendered page that loaded is never discarded for failing to go network-idle.

Chatty SPAs (vdab.be, reproduced) keep polling forever, so networkidle never
fires — the settle timeout must be swallowed and the loaded content returned.
Real navigation failures still raise. Run with: uv run pytest
"""

import pytest
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from app.services.headless import render_html


class _StubPage:
    def __init__(self, goto_exc=None, settle_exc=None):
        self._goto_exc = goto_exc
        self._settle_exc = settle_exc
        self.closed = False

    def goto(self, url, wait_until=None, timeout=None):
        assert wait_until == "domcontentloaded"
        if self._goto_exc:
            raise self._goto_exc

    def wait_for_load_state(self, state, timeout=None):
        assert state == "networkidle"
        if self._settle_exc:
            raise self._settle_exc

    def content(self):
        return "<html>posting text</html>"

    def close(self):
        self.closed = True


class _StubBrowser:
    def __init__(self, page):
        self._page = page

    def new_page(self):
        return self._page


def test_settle_timeout_is_swallowed_and_content_returned():
    page = _StubPage(settle_exc=PlaywrightTimeoutError("never idle"))
    assert render_html("https://x", _StubBrowser(page)) == "<html>posting text</html>"
    assert page.closed


def test_goto_failure_still_raises():
    page = _StubPage(goto_exc=RuntimeError("DNS failure"))
    with pytest.raises(RuntimeError):
        render_html("https://x", _StubBrowser(page))
    assert page.closed
