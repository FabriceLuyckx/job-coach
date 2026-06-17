#!/usr/bin/env python3
"""AI-tailor a CV for a specific job posting URL.

Uses Claude to read the job description and adapt the CV content:
  - Rewrites the professional summary for this role
  - Selects only the most relevant experience entries
  - Rewrites responsibility bullets to match the job's language

Usage:
    uv run python scripts/tailor_cv.py --url https://example.com/jobs/123
    uv run python scripts/tailor_cv.py --url https://... --lang nl
    uv run python scripts/tailor_cv.py --url https://... --job "custom-slug"

Requires ANTHROPIC_API_KEY in .env or environment.

PDF export:
    Open the output file in Chrome → Cmd+P → Save as PDF
    → Paper: A4 · Margins: None · Background graphics: ON
"""

import argparse
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

from app import config as app_config
from app.services.cv_generator import apply_tailoring, tailor
from app.services.cv_renderer import (
    LABELS,
    OUTPUT_DIR,
    PROFILE_PATH,
    ROOT,
    build_env,
    load_photo,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="AI-tailor a CV for a specific job posting URL"
    )
    parser.add_argument("--url",      required=True, help="URL of the job posting")
    parser.add_argument("--lang",     choices=list(LABELS), default="en")
    parser.add_argument("--job",      default="",
                        help="Override the output directory slug (default: inferred by Claude)")
    parser.add_argument("--template", default="default.html")
    args = parser.parse_args()

    profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))

    cfg = app_config.load()
    api_key = os.environ.get("OPENROUTER_API_KEY") or cfg.get("openrouter_api_key", "")
    model = cfg.get("openrouter_model", "anthropic/claude-sonnet-4-6")
    if not api_key:
        print("\nConfiguration error: OpenRouter API key not set.")
        print("Set it via the Settings page or in config.json (openrouter_api_key).")
        sys.exit(1)

    print(f"Fetching job description from {args.url} …")
    try:
        plan = tailor(profile, args.url, api_key, model)
    except Exception as e:
        print(f"\nFailed to fetch or process job URL: {e}")
        sys.exit(1)

    print(f"Role:     {plan.job_title} @ {plan.employer}")
    print(f"Selected: {', '.join(plan.selected_experience_ids)}")
    print(f"Notes:    {plan.tailoring_notes}")

    tailored_profile = apply_tailoring(profile, plan)

    include_photo = profile.get("cv_design_preferences", {}).get("include_photo", False)
    photo_uri = load_photo() if include_photo else None

    env = build_env()
    html = env.get_template(args.template).render(
        **tailored_profile,
        labels=LABELS[args.lang],
        lang=args.lang,
        photo=photo_uri,
    )

    slug = args.job or plan.slug
    out_dir = OUTPUT_DIR / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"cv_{args.lang}.html"
    out_path.write_text(html, encoding="utf-8")

    print(f"\nDone → {out_path.relative_to(ROOT)}")
    print("PDF: Chrome → Cmd+P → Save as PDF → A4 · no margins · background graphics ON")


if __name__ == "__main__":
    main()
