"""
Verify the scanner actually reads a listing page's openings.

Usage:
    uv run python scripts/scan_debug.py --url https://example.com/jobs

Prints: the links found (and whether the Playwright fallback fired), the
openings the LLM extracted from those links, and — against your profile — the
ones it judged interesting with their reason + detected language.
"""

import argparse

from app import config
from app.services import job_scanner
from app.services.cv_renderer import load_profile


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="A job-listing page URL")
    args = ap.parse_args()

    cfg = config.load()
    try:
        config.require_engine(cfg)
    except ValueError as e:
        raise SystemExit(str(e))

    links = job_scanner.fetch_listing_links(args.url)
    print(f"\n[1] {len(links)} links found "
          f"({'httpx' if len(links) >= job_scanner._MIN_LINKS else 'Playwright fallback'}):")
    for l in links[:40]:
        print(f"    {l['text'][:60]!r:64} {l['href']}")

    openings = job_scanner.extract_openings(args.url, cfg,
                                            cfg.get("scan_extract_prompt") or None)
    print(f"\n[2] LLM extracted {len(openings)} openings:")
    for o in openings:
        print(f"    {o['title'][:60]!r:64} {o['url']}")

    profile = load_profile()
    matches = job_scanner.filter_openings(openings, profile, cfg,
                                          cfg.get("scan_filter_prompt") or None)
    print(f"\n[3] {len(matches)} judged interesting:")
    for url, m in matches.items():
        print(f"    [{m['lang']}] {url}\n        {m['reason']}")
    print()


if __name__ == "__main__":
    main()
