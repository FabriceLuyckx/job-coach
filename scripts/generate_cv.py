#!/usr/bin/env python3
"""Render a CV HTML file from profile/profile.json (no AI — full profile, no tailoring).

Usage:
    uv run python scripts/generate_cv.py                                  # output/cv_en.html
    uv run python scripts/generate_cv.py --lang nl                        # output/cv_nl.html
    uv run python scripts/generate_cv.py --job "IMEC Data Scientist"      # output/imec-data-scientist/cv_en.html
    uv run python scripts/generate_cv.py --job "UGent" --lang nl          # output/ugent/cv_nl.html

PDF export:
    Use the "Download PDF" button in the web app for a correctly paginated PDF
    (rendered server-side with headless Chromium).

For AI-tailored CVs (adapted to a specific job description), use scripts/tailor_cv.py instead.
"""

import argparse
import json
import sys

from app.services.cv_renderer import (
    LABELS,
    OUTPUT_DIR,
    PROFILE_PATH,
    ROOT,
    build_env,
    load_photo,
    load_profile,
    slugify,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Render a full CV from profile/profile.json"
    )
    parser.add_argument("--lang",     choices=list(LABELS), default="en")
    parser.add_argument("--job",      default="",
                        help="Job title/company slug for output directory")
    parser.add_argument("--template", default="default.html")
    args = parser.parse_args()

    if not PROFILE_PATH.exists():
        print(f"Error: {PROFILE_PATH} not found")
        sys.exit(1)

    profile = load_profile()
    include_photo = profile.get("cv_design_preferences", {}).get("include_photo", False)
    photo_uri = load_photo() if include_photo else None

    env = build_env()
    html = env.get_template(args.template).render(
        **profile,
        labels=LABELS[args.lang],
        lang=args.lang,
        photo=photo_uri,
    )

    out_dir = (OUTPUT_DIR / slugify(args.job)) if args.job else OUTPUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"cv_{args.lang}.html"
    out_path.write_text(html, encoding="utf-8")

    print(f"Done → {out_path.relative_to(ROOT)}")
    print('PDF: use the "Download PDF" button in the web app for a paginated PDF.')


if __name__ == "__main__":
    main()
