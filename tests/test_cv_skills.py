# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Per-CV skill selection: the model's enum, the resolver, the fail-open rules,
and the plan persistence / language carry-over around them. A selection that
misses would silently delete a real skill, so every path here has to leave MORE
on the CV when it goes wrong, never less. Run with: uv run pytest"""

import json

import pytest

from app.paths import RESOURCE_DIR
from app.services.cv_generator import (
    TailoringPlan, _tool_for, apply_tailoring, resolve_skills, skill_items,
    visible_skills,
)
from app.services.cv_renderer import normalize_profile


@pytest.fixture(scope="module")
def profile():
    return normalize_profile(json.loads(
        (RESOURCE_DIR / "profile" / "profile.example.json").read_text(encoding="utf-8")))


def _plan(**kw):
    return TailoringPlan(**{
        "job_title": "T", "employer": "E", "slug": "s", "summary": "S",
        "selected_experience_ids": [], "adjusted_responsibilities": {},
        "tailoring_notes": "", **kw})


# ── The schema the model answers against ────────────────────────────────────

def test_schema_enumerates_exactly_the_profile_skills(profile):
    schema = _tool_for(profile, "en")["function"]["parameters"]["properties"]["excluded_skills"]
    assert schema["items"]["enum"] == skill_items(profile)
    in_profile = {t for g in profile["skills"]["groups"] for t in g["items"]}
    assert set(schema["items"]["enum"]) == in_profile


def test_schema_omits_the_field_without_skills():
    params = _tool_for({"skills": {"groups": []}}, "en")["function"]["parameters"]
    assert "excluded_skills" not in params["properties"]


# ── Resolution ──────────────────────────────────────────────────────────────

def test_resolve_tolerates_case_and_whitespace():
    p = {"skills": {"groups": [{"label": "G", "items": ["Data analysis", "Python"]}]}}
    assert resolve_skills(p, ["  data   ANALYSIS "]) == ["Data analysis"]


def test_resolve_strips_a_parenthetical_on_the_profile_side():
    p = {"skills": {"groups": [{"label": "G", "items": ["R (tidyverse)"]}]}}
    assert resolve_skills(p, ["R"]) == ["R (tidyverse)"]


def test_resolve_is_not_fuzzy():
    """The enum is the mechanism; the resolver must not guess. A prefix match
    here would drop React because the model said "R"."""
    p = {"skills": {"groups": [{"label": "G", "items": ["React"]}]}}
    assert resolve_skills(p, ["R", "Rea", "Angular", ""]) == []


def test_resolve_dedupes_and_keeps_profile_spelling():
    p = {"skills": {"groups": [{"label": "G", "items": ["SQL", "Python"]}]}}
    assert resolve_skills(p, ["sql", "SQL", "PYTHON"]) == ["SQL", "Python"]


# ── Composition + fail-open ─────────────────────────────────────────────────

SAMPLE = {"skills": {"groups": [
    {"label": "Tech", "items": ["Python", "SQL"]},
    {"label": "Soft", "items": ["Teamwork"]},
]}}


def test_excluded_and_hidden_both_come_off():
    out = visible_skills(SAMPLE, _plan(excluded_skills=["Python"], hidden_skills=["SQL"]))
    assert out == [{"label": "Soft", "items": ["Teamwork"]}]


def test_an_emptied_group_disappears():
    out = visible_skills(SAMPLE, _plan(excluded_skills=["Teamwork"]))
    assert [g["label"] for g in out] == ["Tech"]


def test_selecting_nothing_keeps_everything():
    assert visible_skills(SAMPLE, _plan()) == SAMPLE["skills"]["groups"]


def test_an_unresolvable_name_leaves_its_skill_on_the_cv():
    out = apply_tailoring(SAMPLE, _plan(excluded_skills=["Fortran"]))
    assert out["skills"]["groups"] == SAMPLE["skills"]["groups"]


def test_a_skill_deleted_from_the_profile_stops_mattering():
    thin = {"skills": {"groups": [{"label": "Tech", "items": ["Python"]}]}}
    out = apply_tailoring(thin, _plan(excluded_skills=["SQL"], hidden_skills=["Teamwork"]))
    assert out["skills"]["groups"] == thin["skills"]["groups"]


def test_apply_tailoring_does_not_touch_the_profile():
    before = json.dumps(SAMPLE, sort_keys=True)
    apply_tailoring(SAMPLE, _plan(excluded_skills=["Python", "SQL"]))
    assert json.dumps(SAMPLE, sort_keys=True) == before


def test_a_degenerate_selection_is_discarded_whole(profile, monkeypatch):
    """A model that calls every skill irrelevant must not empty the section."""
    from app.services import cv_generator as gen

    every = skill_items(profile)
    monkeypatch.setattr(gen, "fetch_job_description", lambda url: "job text")
    monkeypatch.setattr(gen, "complete", lambda *a, **k: object())
    monkeypatch.setattr(gen, "tool_args", lambda *a, **k: {
        "job_title": "T", "employer": "E", "slug": "s", "summary": "S",
        "selected_experience_ids": [], "adjusted_responsibilities": {},
        "tailoring_notes": "",
        "excluded_skills": every,
    })
    plan = gen.tailor(profile, "http://x", {}, "en")
    assert plan.excluded_skills == []
    assert visible_skills(profile, plan) == profile["skills"]["groups"]


# ── Persistence + language carry-over (API) ─────────────────────────────────

@pytest.fixture
def cv_client(tmp_path, monkeypatch, profile):
    """A TestClient over a throwaway DB holding one CV history row + plan."""
    from dataclasses import asdict

    from fastapi.testclient import TestClient

    from app import db
    from app.api import cv as cv_api
    from app.main import app

    monkeypatch.setattr(db, "DB_PATH", tmp_path / "jobs.db")
    db.init_db()
    profile_file = tmp_path / "profile.json"
    profile_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(cv_api, "PROFILE_PATH", profile_file)
    monkeypatch.setattr(cv_api, "load_profile", lambda: profile)
    monkeypatch.setattr(cv_api, "OUTPUT_DIR", tmp_path / "output")

    plan = _plan(slug="cv-slug")
    with db.get_db() as conn:
        conn.execute(
            "INSERT INTO cv_history (id, slug, job_title, employer, job_url, lang, "
            "created_at, plans_json) VALUES (?,?,?,?,?,?,?,?)",
            ("cv1", "cv-slug", "T", "E", "http://job", "en", "2026-01-01",
             json.dumps({"en": asdict(plan)})),
        )
    return TestClient(app)


def _stored_plans() -> dict:
    from app import db
    with db.get_db() as conn:
        row = dict(conn.execute("SELECT * FROM cv_history WHERE id = 'cv1'").fetchone())
    return json.loads(row["plans_json"])


def test_plan_endpoint_persists_both_lists(cv_client, profile):
    drop = skill_items(profile)[0]
    r = cv_client.put("/api/cv/plan/cv1", json={
        "summary": "S", "roles": [],
        "hidden_skills": [drop], "excluded_skills": ["Not a skill"],
    })
    assert r.status_code == 200, r.text
    got = cv_client.get("/api/cv/plan/cv1").json()
    assert got["hidden_skills"] == [drop]
    assert got["excluded_skills"] == []            # unresolvable name dropped
    assert got["skill_groups"] == [
        {"label": g["label"], "items": g["items"]} for g in profile["skills"]["groups"]]


def test_omitted_lists_are_left_untouched(cv_client, profile):
    drop = skill_items(profile)[0]
    cv_client.put("/api/cv/plan/cv1", json={"summary": "S", "roles": [], "hidden_skills": [drop]})
    cv_client.put("/api/cv/plan/cv1", json={"summary": "S2", "roles": []})
    assert cv_client.get("/api/cv/plan/cv1").json()["hidden_skills"] == [drop]


def test_a_language_change_keeps_the_skill_choices(cv_client, profile, monkeypatch):
    """The choices describe the application, not its prose — and skill names are
    never translated, so a Dutch CV must not quietly get every skill back."""
    from app import db
    from app.api import cv as cv_api

    hide, exclude = skill_items(profile)[:2]
    cv_client.put("/api/cv/plan/cv1", json={
        "summary": "S", "roles": [], "hidden_skills": [hide], "excluded_skills": [exclude]})

    # The fresh plan for the new language selects nothing of its own.
    monkeypatch.setattr(cv_api, "_tailor_or_502",
                        lambda *a, **k: _plan(slug="cv-slug", summary="Nederlands"))
    monkeypatch.setattr(cv_api, "fetch_job_description", lambda url: "job text")
    monkeypatch.setattr(cv_api, "ensure_cv_labels", lambda *a, **k: None)
    monkeypatch.setattr(cv_api.config, "require_engine", lambda cfg: None)

    with db.get_db() as conn:
        row = dict(conn.execute("SELECT * FROM cv_history WHERE id = 'cv1'").fetchone())
    cv_api._retailor("cv1", row, "nl")

    plans = _stored_plans()
    assert plans["nl"]["hidden_skills"] == [hide]
    assert plans["nl"]["excluded_skills"] == [exclude]


def test_regenerating_without_keeping_edits_re_selects(cv_client, profile, monkeypatch):
    from app import db
    from app.api import cv as cv_api

    hide = skill_items(profile)[0]
    cv_client.put("/api/cv/plan/cv1", json={"summary": "S", "roles": [], "hidden_skills": [hide]})

    monkeypatch.setattr(cv_api, "_tailor_or_502", lambda *a, **k: _plan(slug="cv-slug"))
    monkeypatch.setattr(cv_api, "fetch_job_description", lambda url: "job text")
    monkeypatch.setattr(cv_api, "ensure_cv_labels", lambda *a, **k: None)
    monkeypatch.setattr(cv_api.config, "require_engine", lambda cfg: None)

    with db.get_db() as conn:
        row = dict(conn.execute("SELECT * FROM cv_history WHERE id = 'cv1'").fetchone())
    cv_api._retailor("cv1", row, "en")

    assert _stored_plans()["en"]["hidden_skills"] == []
