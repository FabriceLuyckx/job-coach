# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""
Job scanner — scans each saved source page for openings and judges new ones
against the candidate profile via the configured LLM engine.

Per source, in cost order (cheap → expensive):
  1. extract_openings(): read the listing page's links, return ALL openings
     {url, title}. Cheap — no profile context.
  2. dedup against job_openings (by url) → only genuinely NEW openings.
  3. prescreen_openings(): high-recall title triage — drops only clearly
     off-target openings so we don't fetch every posting. Skipped (keep all)
     when there are ≤ 5 new openings — the triage call would cost more than it
     saves.
  4. review_posting(): fetch each surviving posting ONCE and make one LLM call
     that returns a match verdict AND a structured digest (employer, location,
     salary, deadline, requirements, summary). This is where preferences that a
     title can't express (avoid / notes / remote) finally get honoured.

The page is read as its actual <a href> links (not stripped text) so the LLM
picks real URLs rather than inventing them. JS-rendered boards fall back to a
headless Playwright render — both for listing pages (here) and posting pages
(fetch_job_description in cv_generator).
"""

import json
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from app.services.headless import http_get, render_html
from app.services.llm import complete, tool_args

# Below this many usable links we assume the page is JS-rendered and re-fetch it
# with a headless browser.
_MIN_LINKS = 5

# Skip the title prescreen (just read them all) at or below this many new
# openings — the triage LLM call would cost more than the postings it saves.
_PRESCREEN_MIN = 5

# Editable via Settings → "Job Suggestions — Link Extraction Prompt".
DEFAULT_EXTRACT_PROMPT = """You are given the list of links found on a job-listing page.
Identify which links point to individual job openings (vacancy / position detail pages).
Return each opening's title and its link, copied verbatim from the candidate links.
Ignore navigation, filters, pagination, login, language switches and category links.
Do not invent or modify URLs — only return links present in the list."""

# High-recall first pass on titles only. NOT user-editable (no demonstrated
# need for a third prompt in Settings) — the real judgement is review_posting.
DEFAULT_PRESCREEN_PROMPT = """You are doing a fast first-pass triage of job openings by their TITLE only.
Keep every opening that could plausibly fit the candidate. Exclude only the clearly
off-target ones — wrong field, or an obviously wrong location or language. When in doubt, KEEP it.
If the candidate lists preferences.target_roles, treat a title matching or adjacent to one of
those as a strong keep signal."""

# The per-posting verdict + digest prompt. Editable via Settings → "Job
# Suggestions — Relevance Filter Prompt" (config key scan_filter_prompt). Users
# who customized the old title-only prompt keep working — the tool schema, not
# the prose, defines the output shape.
DEFAULT_SCAN_PROMPT = """You are judging one job posting for a candidate.
Decide whether it genuinely matches their goals, role type, location, language and the
practical preferences in their profile — what they're looking for, what to avoid, their
remote/on-site preference, and the notes covering contract, schedule, salary and travel.
Weigh preferences.target_roles heavily. Set match=true only for a genuine fit.
Give the posting's language as an ISO 639-1 code ('en', 'nl', 'fr', …) and a one-line reason.
Also extract a short digest from the posting text: employer, location, remote type, contract,
salary, application deadline, a ~50-word neutral summary, and up to 5 key requirements.
Omit any digest field the posting does not state — never invent one."""

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

_PRESCREEN_TOOL = {
    "type": "function",
    "function": {
        "name": "prescreen",
        "description": "The openings worth reading in full (high recall — keep when unsure)",
        "parameters": {
            "type": "object",
            "required": ["keep"],
            "properties": {
                "keep": {
                    "type": "array",
                    "items": {"type": "string", "description": "URL of an opening to keep, matching one of the candidate URLs"},
                }
            },
        },
    },
}

_REVIEW_TOOL = {
    "type": "function",
    "function": {
        "name": "posting_review",
        "description": "Match verdict and a structured digest for one job posting, judged against the candidate",
        "parameters": {
            "type": "object",
            "required": ["match", "reason", "lang"],
            "properties": {
                "match": {"type": "boolean", "description": "True only if the posting genuinely fits the candidate's profile and preferences"},
                "reason": {"type": "string", "description": "One-line reason for the verdict"},
                "lang": {"type": "string", "description": "ISO 639-1 code (e.g. 'en', 'nl', 'fr') of the language the posting is written in"},
                "employer": {"type": "string", "description": "Hiring employer / organisation (omit if not stated)"},
                "location": {"type": "string", "description": "Job location (omit if not stated)"},
                "remote": {"type": "string", "enum": ["Remote", "Hybrid", "On-site", "unknown"], "description": "Remote arrangement"},
                "contract": {"type": "string", "description": "Contract type, e.g. permanent / fixed-term / part-time (omit if not stated)"},
                "salary": {"type": "string", "description": "Salary or pay range (omit if not stated)"},
                "deadline": {"type": "string", "description": "Application deadline (omit if not stated)"},
                "summary": {"type": "string", "description": "~50-word neutral summary of the role"},
                "requirements": {"type": "array", "items": {"type": "string"}, "description": "Up to 5 key requirements"},
            },
        },
    },
}

_DIGEST_FIELDS = ("employer", "location", "remote", "contract",
                  "salary", "deadline", "summary", "requirements")


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
    links = _links_from_html(http_get(url), url)
    if len(links) >= _MIN_LINKS:
        return links
    # ponytail: link-count threshold heuristic; bump _MIN_LINKS if a real board slips through.
    return _links_from_html(render_html(url), url)


def links_hash(links: list[dict]) -> str:
    """Stable hash of a listing page's link set. Same hash ⇒ nothing new can
    exist on the page, so the whole extract+review pipeline can be skipped."""
    import hashlib
    joined = "\n".join(sorted(l["href"] for l in links))
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def extract_openings(page_url: str, cfg: dict, prompt: str | None = None,
                     links: list[dict] | None = None) -> list[dict]:
    """Return every job opening on the listing page as {url, title}, chosen from
    the page's real links so URLs are never invented. Pass `links` to reuse a
    link set already fetched by the caller (avoids a second page fetch)."""
    if links is None:
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


def _trimmed_profile(profile: dict) -> dict:
    """Only the parts of the profile that drive job relevance — keeps tokens down."""
    return {
        "professional_title": profile.get("personal", {}).get("professional_title"),
        "summary": profile.get("summary"),
        "preferences": profile.get("preferences"),
        "skills": profile.get("skills"),
    }


def prescreen_openings(openings: list[dict], profile: dict, cfg: dict) -> list[dict]:
    """High-recall title triage: drop only clearly off-target openings so we
    don't fetch every posting. At or below _PRESCREEN_MIN openings, keep them all
    (the triage call would cost more than the postings it would save)."""
    if len(openings) <= _PRESCREEN_MIN:
        return openings
    listing = "\n".join(f"- {o['title']} — {o['url']}" for o in openings)
    resp = complete(
        [
            {"role": "system", "content":
                f"{DEFAULT_PRESCREEN_PROMPT}\n\n"
                f"CANDIDATE PROFILE:\n{json.dumps(_trimmed_profile(profile), ensure_ascii=False, indent=2)}"},
            {"role": "user", "content": f"Openings:\n{listing}"},
        ],
        tools=[_PRESCREEN_TOOL],
        tool_choice={"type": "function", "function": {"name": "prescreen"}},
        cfg=cfg,
        max_tokens=2048,
    )
    keep = {str(u) for u in tool_args(resp).get("keep", [])}
    survivors = [o for o in openings if o["url"] in keep]
    # ponytail: fail OPEN — if the model returns nothing usable, read them all
    # (extra cost) rather than silently burying every new opening.
    return survivors or openings


def review_posting(opening: dict, posting_text: str, profile: dict, cfg: dict,
                   prompt: str | None = None) -> dict:
    """One LLM call per posting: verdict + digest. Returns
    {match: bool, reason: str, lang: str (2-letter), digest: {only-present fields}}."""
    from app.i18n.languages import lang_name
    app_lang = (cfg or {}).get("app_language") or "en"
    reason_lang = f"\n\nWrite the 'reason' in {lang_name(app_lang)}." if app_lang != "en" else ""
    resp = complete(
        [
            {"role": "system", "content":
                f"{prompt or DEFAULT_SCAN_PROMPT}{reason_lang}\n\n"
                f"CANDIDATE PROFILE:\n{json.dumps(_trimmed_profile(profile), ensure_ascii=False, indent=2)}"},
            {"role": "user", "content":
                f"JOB POSTING\nTitle: {opening.get('title', '')}\nURL: {opening.get('url', '')}\n\n"
                f"{(posting_text or '')[:8000]}"},
        ],
        tools=[_REVIEW_TOOL],
        tool_choice={"type": "function", "function": {"name": "posting_review"}},
        cfg=cfg,
        max_tokens=1024,
    )
    args = tool_args(resp, required=("match", "reason", "lang"))
    code = str(args.get("lang") or "").lower()[:2]
    digest = {k: args[k] for k in _DIGEST_FIELDS
              if args.get(k) not in (None, "", [], "unknown")}
    return {
        "match": bool(args.get("match")),
        "reason": args.get("reason", ""),
        "lang": code if len(code) == 2 and code.isalpha() else "en",
        "digest": digest,
    }
