# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""CV template registry, design-preference validation, and per-template smoke
renders. No LLM anywhere in this feature, so none of this needs mocking.
Run with: uv run pytest"""

import json
import re

import pytest

from app.paths import RESOURCE_DIR, TEMPLATES_DIR
from app.services.cv_renderer import (
    _migrate_design_prefs_v3, build_env, cv_labels, list_templates, normalize_profile,
    template_ids,
)

EXAMPLE_PROFILE = RESOURCE_DIR / "profile" / "profile.example.json"
PHOTO_URI = "data:image/png;base64,AAA"


@pytest.fixture(scope="module")
def profile():
    return normalize_profile(json.loads(EXAMPLE_PROFILE.read_text(encoding="utf-8")))


def render(template_id: str, profile: dict, photo=None, hidden=()) -> str:
    return build_env().get_template(f"{template_id}.html").render(
        **profile, labels=cv_labels("en"), lang="en", photo=photo,
        hidden_sections=list(hidden),
    )


# ── Registry ────────────────────────────────────────────────────────────────

def test_manifest_and_template_files_agree():
    """Every registry id has a template file, and every template file is listed —
    so a template can't ship unpickable, and the picker can't offer a 404."""
    ids = template_ids()
    on_disk = {p.stem for p in TEMPLATES_DIR.glob("*.html") if not p.stem.startswith("_")}
    assert ids == on_disk


def test_manifest_palettes_are_well_formed():
    palettes = list_templates()["palettes"]
    assert palettes, "manifest ships no palettes"
    for pal in palettes:
        prefs = _migrate_design_prefs_v3(
            {"accent_color": pal["accent_color"], "colors": pal["colors"]})
        assert prefs["accent_color"] == pal["accent_color"], \
            f"{pal['id']} accent would be rejected by normalize"
        assert prefs["colors"] == pal["colors"], \
            f"{pal['id']} colour slots would be rejected by normalize"
        assert set(pal["colors"]) == {"ink", "paper"}


def test_templates_endpoint_returns_registry():
    from fastapi.testclient import TestClient
    from app.main import app
    r = TestClient(app).get("/api/cv/templates")
    assert r.status_code == 200
    assert r.json() == list_templates()


# ── Design-preference validation ────────────────────────────────────────────
# These values are interpolated unescaped into the CV's <style>, so normalize is
# the sanitization boundary.

@pytest.mark.parametrize("bad", [
    "red",                       # not hex
    "#FFF",                      # short form
    "#GGGGGG",                   # not hex digits
    "#1B3A6B; } body { x: y",    # CSS injection attempt
    "",
    None,
    123,
])
def test_invalid_accent_falls_back_to_default(bad):
    assert _migrate_design_prefs_v3({"accent_color": bad})["accent_color"] == "#1B3A6B"


def test_valid_accent_and_colors_pass_through():
    out = _migrate_design_prefs_v3({
        "accent_color": "#1f5F3f",
        "colors": {"ink": "#1E1E1E", "paper": "#FFFFFF"},
    })
    assert out["accent_color"] == "#1f5F3f"
    assert out["colors"] == {"ink": "#1E1E1E", "paper": "#FFFFFF"}


def test_invalid_colour_slots_are_dropped():
    out = _migrate_design_prefs_v3({"colors": {"ink": "</style><script>", "paper": "#FFFFFF"}})
    assert out["colors"] == {"paper": "#FFFFFF"}
    # No salvageable slot ⇒ no key at all, so templates use their own defaults.
    assert "colors" not in _migrate_design_prefs_v3({"colors": {"ink": "nope"}})


@pytest.mark.parametrize("name", ["nonexistent", "../../etc/passwd", "", None, 7])
def test_unknown_template_falls_back_to_default(name):
    assert _migrate_design_prefs_v3({"template": name})["template"] == "default"


def test_known_template_is_kept():
    assert _migrate_design_prefs_v3({"template": "classic"})["template"] == "classic"


def test_photo_crop_is_clamped():
    out = _migrate_design_prefs_v3({"photo_crop": {"zoom": 99, "x": -40, "y": 50}})
    assert out["photo_crop"] == {"zoom": 3.0, "x": 0.0, "y": 50.0}
    # Zoom floors below 1: the photo is letterboxed, so pulling back past its
    # own edges is a real framing, not junk input.
    assert _migrate_design_prefs_v3({"photo_crop": {"zoom": 0.7}})["photo_crop"]["zoom"] == 0.7
    assert _migrate_design_prefs_v3({"photo_crop": {"zoom": 0.1}})["photo_crop"]["zoom"] == 0.5


def test_photo_crop_junk_falls_back_to_centered():
    out = _migrate_design_prefs_v3({"photo_crop": {"zoom": "scale(9) rotate(2deg)", "x": None}})
    assert out["photo_crop"] == {"zoom": 1.0, "x": 50.0, "y": 50.0}


def test_photo_crop_absent_stays_absent():
    assert "photo_crop" not in _migrate_design_prefs_v3({})


def test_zero_crop_offset_survives():
    """0 is a legitimate edge-anchored crop — it must not be read as 'missing'."""
    out = _migrate_design_prefs_v3({"photo_crop": {"zoom": 1, "x": 0, "y": 0}})
    assert out["photo_crop"] == {"zoom": 1.0, "x": 0.0, "y": 0.0}


# ── Rendering contract ──────────────────────────────────────────────────────

@pytest.mark.parametrize("tpl", sorted(template_ids()))
def test_smoke_render_with_photo(tpl, profile):
    html = render(tpl, profile, photo=PHOTO_URI)
    assert 'data-section=' in html
    assert 'data-section="photo"' in html
    assert 'data-section="experience"' in html


@pytest.mark.parametrize("tpl", sorted(template_ids()))
def test_render_without_photo_has_no_photo_element(tpl, profile):
    assert 'data-section="photo"' not in render(tpl, profile, photo=None)


def sections_in(html: str) -> set[str]:
    return set(re.findall(r'data-section="([a-z_]+)"', html))


@pytest.mark.parametrize("tpl", sorted(template_ids()))
def test_every_rendered_section_can_be_hidden(tpl, profile):
    """The editor offers a checkbox for every data-section it finds in the
    preview, so a section that renders but ignores `hidden` gives the user a
    dead toggle (this is how Teaching shipped un-removable). The example profile
    fills every optional section, so what renders here is the full set."""
    rendered = sections_in(render(tpl, profile, photo=PHOTO_URI))
    assert {"teaching", "custom_sections", "photo"} <= rendered, "example profile got thinner"
    assert sections_in(render(tpl, profile, photo=PHOTO_URI, hidden=sorted(rendered))) == set()


@pytest.mark.parametrize("tpl", sorted(template_ids()))
def test_palette_colours_reach_the_stylesheet(tpl, profile):
    p = dict(profile)
    p["cv_design_preferences"] = {
        "accent_color": "#123456", "colors": {"ink": "#654321", "paper": "#FEFEFE"},
        "include_photo": True, "template": tpl,
    }
    html = render(tpl, p)
    assert "#123456" in html and "#654321" in html and "#FEFEFE" in html


@pytest.mark.parametrize("tpl", sorted(template_ids()))
def test_crop_params_reach_every_template(tpl, profile):
    p = dict(profile)
    p["cv_design_preferences"] = {
        "accent_color": "#1B3A6B", "include_photo": True, "template": tpl,
        "photo_crop": {"zoom": 1.8, "x": 25, "y": 75},
    }
    html = render(tpl, p, photo=PHOTO_URI)
    # Panning is a translate, not object-position: object-position stops at the
    # photo's slack inside its box, which is zero on one axis under `contain`.
    assert "translate(-25%, 25%)" in html
    assert "scale(1.8)" in html
    assert "object-position" not in html


def _plan(**kw):
    from app.services.cv_generator import TailoringPlan
    return TailoringPlan(**{
        "job_title": "T", "employer": "E", "slug": "test-slug", "summary": "S",
        "selected_experience_ids": [], "adjusted_responsibilities": {},
        "tailoring_notes": "", **kw})


def test_render_html_photo_is_per_cv_not_global(monkeypatch, profile):
    """include_photo must NOT gate rendering (that made the per-CV photo toggle a
    no-op); the photo is passed whenever the file exists, and plan.hidden_sections
    — seeded from include_photo at generation time — controls visibility."""
    from app.api import cv as cv_api
    monkeypatch.setattr(cv_api, "load_photo", lambda: PHOTO_URI)
    p = dict(profile)
    p["cv_design_preferences"] = {**profile["cv_design_preferences"], "include_photo": False}
    assert 'data-section="photo"' in cv_api._render_html(_plan(), p, "en")
    assert 'data-section="photo"' not in cv_api._render_html(
        _plan(hidden_sections=["photo"]), p, "en")


def test_unique_slug_appends_suffix(monkeypatch):
    from app.api import cv as cv_api

    class FakeConn:
        def execute(self, *_):
            return self
        def fetchall(self):
            return [{"slug": "taken"}, {"slug": "taken-2"}]
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    monkeypatch.setattr(cv_api.db, "get_db", lambda: FakeConn())
    assert cv_api._unique_slug("fresh") == "fresh"
    assert cv_api._unique_slug("taken") == "taken-3"


@pytest.mark.parametrize("tpl", sorted(template_ids()))
def test_render_survives_a_blank_profile(tpl):
    """A brand-new user has no data yet; the picker must still preview safely."""
    from app.services.cv_renderer import blank_profile
    assert render(tpl, blank_profile())


# ── Section content rules (shared by every template via _sections.html) ──────

SINGLE_COLUMN = ["classic", "banner", "minimal"]


def test_sort_by_year_puts_newest_first_and_undated_last():
    from app.services.cv_renderer import sort_by_year
    items = [{"years": ""}, {"years": "2019–2021"}, {"year": 2024}, {"years": "2022"}]
    assert [i.get("years", i.get("year")) for i in sort_by_year(items)] == \
        [2024, "2022", "2019–2021", ""]


@pytest.mark.parametrize("tpl", sorted(template_ids()))
def test_dated_entries_render_newest_first(tpl, profile):
    """Free-text years ("2019–2021") sort on the last year they mention, and an
    entry with no year at all goes last instead of wherever it was typed."""
    p = dict(profile)
    p["teaching"] = {"entries": [
        {"type": "other", "type_other": "Undated talk", "years": ""},
        {"type": "other", "type_other": "Older course", "years": "2015–2016"},
        {"type": "other", "type_other": "Newer course", "years": "2021"},
    ]}
    html = render(tpl, p)
    order = [html.index(x) for x in ("Newer course", "Older course", "Undated talk")]
    assert order == sorted(order), "teaching entries are not newest-first"


@pytest.mark.parametrize("tpl", SINGLE_COLUMN)
def test_single_column_links_sit_in_the_header(tpl, profile):
    """Without a sidebar, a links *section* lands at the foot of the CV — the
    last place anyone looks for a profile URL. They belong on the contact line."""
    html = render(tpl, profile)
    assert html.index("linkedin.com/in/janedoe") < html.index('class="section"')
    assert 'data-section="links"' in html          # still editor-toggleable
    assert html.count('data-section="links"') == 1  # header only, no bottom section


@pytest.mark.parametrize("tpl", SINGLE_COLUMN)
def test_links_section_can_still_be_hidden(tpl, profile):
    assert "linkedin.com/in/janedoe" not in render(tpl, profile, hidden=["links"])


# ── Per-CV skill selection (composed by apply_tailoring, rendered as given) ──

def _tailored(tpl, profile, **plan_kw):
    from app.services.cv_generator import apply_tailoring
    return render(tpl, apply_tailoring(profile, _plan(**plan_kw)))


@pytest.mark.parametrize("tpl", sorted(template_ids()))
def test_excluded_skills_do_not_render(tpl, profile):
    html = _tailored(tpl, profile, excluded_skills=["Docker"], hidden_skills=["Python"])
    assert ">Docker<" not in html and ">Python<" not in html
    assert ">git<" in html and ">SQL<" in html  # their groups survive


@pytest.mark.parametrize("tpl", sorted(template_ids()))
def test_an_emptied_group_prints_no_heading(tpl, profile):
    html = _tailored(tpl, profile, excluded_skills=["Communication", "Team leadership"])
    assert "Soft skills" not in html
    assert "Programming" in html


@pytest.mark.parametrize("tpl", sorted(template_ids()))
def test_the_skills_section_disappears_when_nothing_is_visible(tpl, profile):
    every = [t for g in profile["skills"]["groups"] for t in g["items"]]
    html = _tailored(tpl, profile, hidden_skills=every)
    assert 'data-section="skills"' not in html
