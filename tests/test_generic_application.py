# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Generic (untargeted) application: role brief synthesis, the readiness gate,
and the guarantee that no posting is ever fetched for it. Run: uv run pytest"""

import pytest

from app.services.cv_renderer import GENERIC_URL, profile_ready, role_brief

FULL = {
    "personal": {"professional_title": "Data Scientist"},
    "experience": [{"id": "a", "title": "Analyst"}],
    "preferences": {
        "target_roles": ["Data Scientist", "ML Engineer"],
        "looking_for": "Impact-driven research teams",
        "avoid": "Pure sales roles",
        "locations": ["Ghent", "Brussels"],
        "remote": "Hybrid",
        "languages": ["Dutch", "English"],
        "notes": "Prefers 4/5ths.",
    },
}

MINIMAL = {"experience": [{"id": "a"}], "preferences": {"target_roles": ["Teacher"]}}


def test_brief_carries_every_preference():
    brief = role_brief(FULL)
    for expected in ("Data Scientist, ML Engineer", "Impact-driven research teams",
                     "Pure sales roles", "Ghent, Brussels", "Hybrid",
                     "Dutch, English", "Prefers 4/5ths."):
        assert expected in brief, expected
    assert "no specific job posting" in brief  # the model must not invent an employer


def test_brief_tolerates_a_minimal_profile():
    brief = role_brief(MINIMAL)
    assert "Teacher" in brief
    assert "None" not in brief and "\n\n\n" not in brief  # no empty/placeholder lines
    assert role_brief({})  # a bare profile still yields the framing header


def test_readiness_names_what_is_missing():
    assert profile_ready(FULL) == []
    assert profile_ready({"preferences": {"target_roles": ["X"]}}) == ["experience"]
    assert profile_ready({"experience": [{"id": "a"}]}) == ["target_roles"]
    assert set(profile_ready({})) == {"target_roles", "experience"}


def test_generic_url_is_not_fetchable():
    # The sentinel must never look like something http machinery would follow.
    assert not GENERIC_URL.startswith(("http://", "https://"))


@pytest.mark.parametrize("endpoint", ["/api/cv/generic", "/api/letters/generic"])
def test_unready_profile_is_rejected(endpoint, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app
    import app.api.cv as cv_api
    import app.api.letters as letters_api

    monkeypatch.setattr(cv_api, "load_profile", lambda: {})
    monkeypatch.setattr(letters_api, "load_profile", lambda: {})
    r = TestClient(app).post(endpoint, json={"lang": "en"})
    assert r.status_code == 400
    assert "target_roles" in r.text or "target role" in r.text.lower()


def test_generic_lang_defaults_to_app_language(monkeypatch):
    """No posting to detect a language from, so the app's own language wins.
    An explicit lang from the client still overrides it."""
    import app.api.cv as cv_api

    monkeypatch.setattr(cv_api.config, "load", lambda: {"app_language": "nl"})
    assert cv_api.generic_lang(None) == "nl"
    assert cv_api.generic_lang("fr") == "fr"
    monkeypatch.setattr(cv_api.config, "load", lambda: {})
    assert cv_api.generic_lang(None) == "en"


def _generic_row(**kw):
    return {"id": "h1", "slug": "general", "job_url": GENERIC_URL, "lang": "en",
            "plans_json": None, "plan_json": None, **kw}


def _stub_retailor_io(monkeypatch, fetch):
    """Everything _retailor touches besides the branch under test."""
    import app.api.cv as cv_api

    monkeypatch.setattr(cv_api, "fetch_job_description", fetch)
    monkeypatch.setattr(cv_api.config, "load", lambda: {})
    monkeypatch.setattr(cv_api.config, "require_engine", lambda cfg: None)
    monkeypatch.setattr(cv_api, "load_profile", lambda: FULL)
    monkeypatch.setattr(cv_api, "ensure_cv_labels", lambda *a, **k: None)
    monkeypatch.setattr(cv_api, "_render_and_save", lambda *a, **k: "general")
    monkeypatch.setattr(cv_api, "_persist_plans", lambda *a, **k: None)

    seen = {}

    def fake_tailor(profile, job_url, cfg, lang, prompt, job_text=None):
        seen["job_text"] = job_text
        seen["url"] = job_url
        from app.services.cv_generator import TailoringPlan
        return TailoringPlan(job_title="T", employer="E", slug="general", summary="S",
                             selected_experience_ids=[], adjusted_responsibilities={},
                             highlighted_skills=[], tailoring_notes="")

    monkeypatch.setattr(cv_api, "tailor", fake_tailor)
    return seen


def test_retailor_generic_rebuilds_the_brief_instead_of_fetching(monkeypatch):
    """The relang/regenerate path: the sentinel has no page to fetch, so the
    brief is rebuilt from the CURRENT profile (that's what makes a regenerate
    pick up preference edits)."""
    import app.api.cv as cv_api

    def boom(*a, **k):
        raise AssertionError("fetched the sentinel URL")

    seen = _stub_retailor_io(monkeypatch, boom)
    cv_api._retailor("h1", _generic_row(), "nl")
    assert "Data Scientist, ML Engineer" in seen["job_text"]
    assert "no specific job posting" in seen["job_text"]


def test_retailor_still_fetches_for_a_real_posting(monkeypatch):
    """Guard the other side of the branch: normal CVs must keep re-fetching."""
    import app.api.cv as cv_api

    seen = _stub_retailor_io(monkeypatch, lambda url: f"POSTING AT {url}")
    cv_api._retailor("h1", _generic_row(job_url="https://example.com/job/1"), "en")
    assert seen["job_text"] == "POSTING AT https://example.com/job/1"


def test_letter_reuses_the_brief_for_the_sentinel(monkeypatch):
    """_cached_posting_text is the letter side's fetch guard."""
    import app.api.letters as letters_api

    def no_db():
        raise AssertionError("hit the DB for the sentinel")

    monkeypatch.setattr(letters_api.db, "get_db", no_db)
    assert "Data Scientist, ML Engineer" in letters_api._cached_posting_text(GENERIC_URL, FULL)


def test_generic_generation_never_fetches(monkeypatch):
    """The whole point of the brief: tailor()/build_guide() get their job_text
    supplied, so the sentinel is never handed to the network."""
    import app.services.cv_generator as gen

    def boom(*a, **k):
        raise AssertionError("fetched a posting for the generic application")

    monkeypatch.setattr(gen, "fetch_job_description", boom)
    monkeypatch.setattr(gen, "fetch_text", boom)

    captured = {}

    def fake_complete(messages, **kwargs):
        captured["user"] = messages[-1]["content"]
        raise RuntimeError("stop here — we only care about what was sent")

    monkeypatch.setattr(gen, "complete", fake_complete)
    with pytest.raises(RuntimeError):
        gen.tailor(FULL, GENERIC_URL, {}, "en", job_text=role_brief(FULL))
    assert "Data Scientist, ML Engineer" in captured["user"]
