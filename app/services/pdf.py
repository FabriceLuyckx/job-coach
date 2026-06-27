"""
HTML → PDF rendering via headless Chromium (Playwright).

Renders the CV HTML with the same engine the browser uses, so the print
layout (@page size/margins, fixed sidebar, web fonts, colour backgrounds)
comes out exactly as designed — unlike the old "Cmd+P → Save as PDF" flow.
"""

from playwright.sync_api import sync_playwright


def html_to_pdf(html: str) -> bytes:
    """Render a full HTML document to a PDF byte string (A4, print styles)."""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page()
            # wait_until="networkidle" lets the Google Fonts request finish so
            # the PDF uses Inter rather than a fallback face.
            page.set_content(html, wait_until="networkidle")
            page.emulate_media(media="print")
            return page.pdf(
                format="A4",
                print_background=True,
                prefer_css_page_size=True,
            )
        finally:
            browser.close()
