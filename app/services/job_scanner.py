"""
Job scanner — scans each saved source page for openings and filters new ones
against the candidate profile via OpenRouter.

Two phases per source, to reduce token cost:
  1. extract_openings(): read the listing page's links, return ALL openings
     {url, title}. Cheap — no profile context.
  2. dedup against job_openings (by url) → only genuinely NEW openings.
  3. filter_openings(): evaluate only the new openings against the profile.
     The big profile-context call is skipped entirely when nothing is new.

The page is read as its actual <a href> links (not stripped text) so the LLM
picks real URLs rather than inventing them. JS-rendered boards fall back to a
headless Playwright render.
"""

import json
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from app.services.llm import complete, tool_args

# Below this many usable links we assume the page is JS-rendered and re-fetch it
# with a headless browser.
_MIN_LINKS = 5

# Editable via Settings → "Job Suggestions — Link Extraction Prompt".
DEFAULT_EXTRACT_PROMPT = """You are given the list of links found on a job-listing page.
Identify which links point to individual job openings (vacancy / position detail pages).
Return each opening's title and its link, copied verbatim from the candidate links.
Ignore navigation, filters, pagination, login, language switches and category links.
Do not invent or modify URLs — only return links present in the list."""

# Editable via Settings → "Job Suggestions — Relevance Filter Prompt".
DEFAULT_SCAN_PROMPT = """You filter job openings for a candidate.
Return only the openings that genuinely match their goals, role type, location and
language preferences. Be selective — skip purely administrative or off-target roles.
For each match, give a one-line reason and the posting's language as 'en' or 'nl'."""

_EXTRACT_TOOL = {
    "type": "function",
    "function": {
        "name": "job_openings",
        "description": "The links that are individual job openings",
        "parameters": {
            "type": "object",
            "required": ["openings"],
            "properties": {
                "openings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["url", "title"],
                        "properties": {
                            "url": {"type": "string", "description": "The opening's link, copied verbatim from the candidate links"},
                            "title": {"type": "string", "description": "Job title"},
                        },
                    },
                }
            },
        },
    },
}

_FILTER_TOOL = {
    "type": "function",
    "function": {
        "name": "relevant_openings",
        "description": "The openings that genuinely match the candidate's profile and preferences",
        "parameters": {
            "type": "object",
            "required": ["interesting"],
            "properties": {
                "interesting": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["url", "reason", "lang"],
                        "properties": {
                            "url": {"type": "string", "description": "URL of an interesting opening (must match one of the candidate URLs)"},
                            "reason": {"type": "string", "description": "One-line reason it fits the profile"},
                            "lang": {"type": "string", "description": "ISO 639-1 code (e.g. 'en', 'nl', 'fr') of the language the posting is written in"},
                        },
                    },
                }
            },
        },
    },
}


def _links_from_html(html: str, page_url: str) -> list[dict]:
    """All <a> with non-empty text + href, absolute-resolved and deduped by url."""
    soup = BeautifulSoup(html, "html.parser")
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        text = a.get_text(" ", strip=True)
        href = urljoin(page_url, a["href"].strip())
        if not text or not href.startswith("http") or href in seen:
            continue
        seen.add(href)
        out.append({"text": text[:200], "href": href})
    return out


def fetch_listing_links(url: str) -> list[dict]:
    """Return the page's links as [{text, href}]. Tries a plain HTTP fetch first
    and falls back to a headless Playwright render for JS-built job boards."""
    try:
        r = httpx.get(url, follow_redirects=True, timeout=15,
                      headers={"User-Agent": "Mozilla/5.0 (compatible; job-coach/1.0)"})
        r.raise_for_status()
        links = _links_from_html(r.text, url)
    except Exception:
        links = []
    if len(links) >= _MIN_LINKS:
        return links
    # ponytail: link-count threshold heuristic; bump _MIN_LINKS if a real board slips through.
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page()
            page.goto(url, wait_until="networkidle", timeout=30000)
            return _links_from_html(page.content(), url)
        finally:
            browser.close()


def extract_openings(page_url: str, cfg: dict, prompt: str | None = None) -> list[dict]:
    """Return every job opening on the listing page as {url, title}, chosen from
    the page's real links so URLs are never invented."""
    links = fetch_listing_links(page_url)
    if not links:
        return []
    listing = "\n".join(f"- {l['text']} → {l['href']}" for l in links)
    resp = complete(
        [
            {"role": "system", "content": prompt or DEFAULT_EXTRACT_PROMPT},
            {"role": "user", "content": f"Listing page: {page_url}\n\nLinks found:\n{listing[:14000]}"},
        ],
        tools=[_EXTRACT_TOOL],
        tool_choice={"type": "function", "function": {"name": "job_openings"}},
        cfg=cfg,
        max_tokens=2048,
    )
    args = tool_args(resp)
    valid = {l["href"] for l in links}
    out, seen = [], set()
    for o in args.get("openings", []):
        url = urljoin(page_url, (o.get("url") or "").strip())
        title = (o.get("title") or "").strip()
        # Only keep URLs that were actually on the page — guards against any
        # remaining hallucination.
        if url in valid and title and url not in seen:
            seen.add(url)
            out.append({"url": url, "title": title})
    return out


def filter_openings(openings: list[dict], profile: dict, cfg: dict,
                    prompt: str | None = None) -> dict[str, dict]:
    """Given NEW openings, return {url: {reason, lang}} for those matching the profile."""
    if not openings:
        return {}
    # Only the parts of the profile that drive job relevance — keeps tokens down.
    trimmed = {
        "professional_title": profile.get("personal", {}).get("professional_title"),
        "summary": profile.get("summary"),
        "narrative": profile.get("narrative"),
        "work_preferences": profile.get("work_preferences"),
        "skills": profile.get("skills"),
    }
    listing = "\n".join(f"- {o['title']} — {o['url']}" for o in openings)
    # Write the one-line reason in the user's UI language.
    from app.i18n.languages import lang_name
    app_lang = (cfg or {}).get("app_language") or "en"
    reason_lang = f"\n\nWrite each 'reason' in {lang_name(app_lang)}." if app_lang != "en" else ""
    resp = complete(
        [
            {"role": "system", "content":
                f"{prompt or DEFAULT_SCAN_PROMPT}{reason_lang}\n\n"
                f"CANDIDATE PROFILE:\n{json.dumps(trimmed, ensure_ascii=False, indent=2)}"},
            {"role": "user", "content": f"Candidate openings:\n{listing}"},
        ],
        tools=[_FILTER_TOOL],
        tool_choice={"type": "function", "function": {"name": "relevant_openings"}},
        cfg=cfg,
        max_tokens=2048,
    )
    args = tool_args(resp)
    out = {}
    for i in args.get("interesting", []):
        if i.get("url"):
            code = str(i.get("lang") or "").lower()[:2]
            out[i["url"]] = {"reason": i.get("reason", ""),
                             "lang": code if len(code) == 2 and code.isalpha() else "en"}
    return out
