# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Shared page fetching: plain HTTP with a headless-browser fallback.

Used by both the CV generator (posting text) and the job scanner (listing
links). Lives in its own module so neither of those has to import the other —
keeping it dependency-free avoids import cycles.
"""

from concurrent.futures import ThreadPoolExecutor

import httpx
from bs4 import BeautifulSoup

_UA = "Mozilla/5.0 (compatible; job-coach/1.0)"

# Below this many characters we assume a page was JS-rendered and re-fetch it
# with a headless browser.
_MIN_TEXT = 500


def text_from_html(html: str) -> str:
    """Readable body text, with nav/header/footer/script/style/aside stripped."""
    soup = BeautifulSoup(html or "", "html.parser")
    for tag in soup(["nav", "header", "footer", "script", "style", "aside"]):
        tag.decompose()
    return soup.get_text(separator="\n", strip=True)


def http_get(url: str) -> str:
    """Plain HTTP GET → raw HTML, or "" on any failure (caller falls back)."""
    try:
        r = httpx.get(url, follow_redirects=True, timeout=15, headers={"User-Agent": _UA})
        r.raise_for_status()
        return r.text
    except Exception:
        return ""


def render_html(url: str, browser=None) -> str:
    """Headless-render a page → HTML. Pass a live Playwright browser to reuse it
    across many pages (one launch per scan); otherwise launch a throwaway one."""
    if browser is not None:
        page = browser.new_page()
        try:
            page.goto(url, wait_until="networkidle", timeout=30000)
            return page.content()
        finally:
            page.close()
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        try:
            return render_html(url, b)
        finally:
            b.close()


def fetch_text(url: str) -> str:
    """Readable text for one URL: HTTP first, headless render if too short.
    Launches its own browser only when the fallback is needed."""
    text = text_from_html(http_get(url))
    if len(text) >= _MIN_TEXT:
        return text
    return text_from_html(render_html(url))


def fetch_texts(urls: list[str], max_workers: int = 4) -> dict[str, str]:
    """Readable text for many URLs. HTTP fetches run in parallel (I/O-bound);
    pages that come back too short are rendered sequentially through ONE shared
    browser (one launch total, and Playwright's sync API stays single-threaded).
    Returns {url: text}; "" means even rendering yielded nothing.

    ponytail: max_workers is a constant; make it config only if a huge board
    proves it matters. LLM review stays sequential (the local engine serialises
    it behind a lock anyway) — parallelising the fetches is where the wall-clock
    goes."""
    # De-dupe while preserving order (a listing can surface the same URL twice).
    ordered = list(dict.fromkeys(urls))
    results: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        for url, html in zip(ordered, pool.map(http_get, ordered)):
            results[url] = text_from_html(html)
    too_short = [u for u, t in results.items() if len(t) < _MIN_TEXT]
    if too_short:
        # A broken/missing browser must degrade to the HTTP results (callers
        # treat empty text as "couldn't read"), never abort the whole batch.
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                browser = p.chromium.launch()
                try:
                    for u in too_short:
                        try:
                            results[u] = text_from_html(render_html(u, browser))
                        except Exception:
                            pass  # keep the (short/empty) HTTP result
                finally:
                    browser.close()
        except Exception:
            pass
    return results
