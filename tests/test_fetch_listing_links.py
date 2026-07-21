# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""fetch_listing_links renders first, falls back to httpx.

A JS-built board can serve only static nav chrome over plain HTTP — enough links
to clear a count threshold while carrying zero postings (this hid imec's jobs).
So render_html is tried first; httpx is the fallback only when the render fails
or comes back thin. Run with: uv run pytest
"""

from app.services import job_scanner


def _html(hrefs):
    return "".join(f'<a href="{h}">{h}</a>' for h in hrefs)


def test_prefers_render_over_thin_httpx(monkeypatch):
    # httpx sees only nav chrome; the render exposes the real (more) links.
    monkeypatch.setattr(job_scanner, "http_get",
                        lambda url: _html(["https://x/about", "https://x/contact"]))
    monkeypatch.setattr(job_scanner, "render_html",
                        lambda url: _html([f"https://x/job/{i}" for i in range(6)]))
    links = job_scanner.fetch_listing_links("https://x/jobs")
    assert len(links) == 6
    assert all("/job/" in l["href"] for l in links)


def test_falls_back_to_httpx_when_render_fails(monkeypatch):
    def boom(url):
        raise RuntimeError("no chromium")
    monkeypatch.setattr(job_scanner, "render_html", boom)
    monkeypatch.setattr(job_scanner, "http_get",
                        lambda url: _html(["https://x/job/1", "https://x/job/2"]))
    links = job_scanner.fetch_listing_links("https://x/jobs")
    assert [l["href"] for l in links] == ["https://x/job/1", "https://x/job/2"]


def test_falls_back_when_render_is_thin(monkeypatch):
    # A blocked render returns almost nothing; httpx had the real page.
    monkeypatch.setattr(job_scanner, "render_html", lambda url: _html(["https://x/"]))
    monkeypatch.setattr(job_scanner, "http_get",
                        lambda url: _html([f"https://x/job/{i}" for i in range(8)]))
    links = job_scanner.fetch_listing_links("https://x/jobs")
    assert len(links) == 8
