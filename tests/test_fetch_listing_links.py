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


def test_extract_sends_late_job_links_to_the_llm(monkeypatch):
    # Regression: a page that front-loads nav/facet links must not push real job
    # links past the truncation cap (euraxess: every job link sat beyond char 14k).
    nav = [{"text": "Filter option " + "x" * 60, "href": f"https://x/search?f={i}"}
           for i in range(300)]  # bulky facet links first
    job = {"text": "Data Scientist", "href": "https://x/jobs/999"}
    links = nav + [job]
    listing = "\n".join(f"- {l['text']} → {l['href']}" for l in links)
    assert len(listing) > 14000  # would have been cut under the old cap
    assert len(listing) < job_scanner._MAX_LISTING_CHARS  # fits under the new one

    sent = {}
    monkeypatch.setattr(job_scanner, "complete",
                        lambda messages, **kw: sent.update(content=messages[-1]["content"]) or "resp")
    monkeypatch.setattr(job_scanner, "tool_args", lambda resp, **kw: {"openings": []})
    job_scanner.extract_openings("https://x/jobs", {}, links=links)
    assert "https://x/jobs/999" in sent["content"]  # the job link reached the model

def test_textless_anchors_fall_back_to_label_alt_or_slug():
    # Regression: 11.be advertised its one vacancy as an image-only banner link
    # (<a><img></a>, no text/alt/aria-label) — dropped entirely, so the job was
    # invisible to the extractor. Fallback chain: aria-label → img alt → URL slug.
    html = (
        '<a href="/a" aria-label="Data Analyst"></a>'
        '<a href="/vacatures/datamanager-mvx-0?utm=x"><img src="/banner.png"/></a>'
        '<a href="/b"><img src="/i.png" alt="Project Officer"/></a>'
        '<a href="/icon"><svg></svg></a>'  # icon link: still dropped
        '<a href="https://ads.example.com/promo"><img src="/ad.png"/></a>'  # external ad banner: dropped
    )
    links = job_scanner._links_from_html(html, "https://11.be/vacatures")
    by_href = {l["href"]: l["text"] for l in links}
    assert by_href["https://11.be/a"] == "Data Analyst"
    assert by_href["https://11.be/vacatures/datamanager-mvx-0?utm=x"] == "datamanager mvx 0"
    assert by_href["https://11.be/b"] == "Project Officer"
    assert "https://11.be/icon" not in by_href
    # The slug fallback is same-host only: a textless, alt-less image link to
    # another domain is an ad, not one of this site's postings.
    assert "https://ads.example.com/promo" not in by_href
