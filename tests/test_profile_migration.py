"""Profile schema v1 → v2 migration tests. Run with: uv run pytest"""

import copy

import pytest

from app.services.cv_renderer import normalize_profile

# A minimal but representative v1 profile (the pre-v2 questionnaire shape).
V1 = {
    "meta": {"version": "1.0", "schema": "career-profile-v1"},
    "personal": {
        "name": "Jane Doe",
        "professional_title": "Data Scientist",
        "links": {
            "linkedin": "https://linkedin.com/in/jane",
            "github": "https://github.com/jane",
            "google_scholar": "",
        },
        "keywords": ["Data"],
    },
    "narrative": {
        "target_roles_description": "I turn data into decisions.",
        "target_industries": ["Tech"],
        "differentiation": "Research + engineering.",
        "problems_enjoyed": "Building products.",
        "topics_to_teach": ["Statistics"],
        "research_themes": "Human behaviour.",
        "work_to_avoid": "Pure admin.",
    },
    "experience": [
        {
            "id": "job-1",
            "title": "Engineer",
            "employer": "Globex",
            "start_date": "2020-04",
            "end_date": "2022-12",
            "is_current": False,
            "full_time": False,
            "team_size": 4,
            "reporting_structure": "Part of the eng team",
            "technical_difficulty": "Streaming pipelines",
            "impact": "Grew fast",
            "responsibilities": ["Built pipelines"],
            "achievements": ["Co-built A/B testing"],
            "mentored": True,
            "presentations": ["internal"],
            "technologies": ["Python"],
            "relevance": {
                "teaching": "Explained results to non-technical staff",
                "research": "A/B testing framework",
                "leadership": None,
                "interdisciplinarity": None,
            },
        }
    ],
    "academic": {
        "research_areas": ["ML"],
        "methods": {
            "neural_analyses": ["EEG"],
            "computational_modelling": ["Bayesian inference"],
        },
        "datasets_tools": {"data_types": ["Time series"], "tools": ["Python"]},
        "interdisciplinary_work": ["Cross-domain ML"],
        "collaborators": [{"name": "John", "affiliation": "Uni"}],
    },
    "skills": {"groups": [{"label": "Programming", "items": ["Python"]}], "languages": []},
    "work_preferences": {
        "commute_radius": ["Ghent"],
        "remote_hybrid": "Hybrid",
        "institution_type_preference": "University",
        "research_vs_teaching": "Both",
        "leadership_interest": "Yes",
        "salary_current_gross": 4500,
        "salary_mobility_budget": 400,
        "schedule": "Full-time",
        "language_preferences": ["English"],
        "relocation": "Open",
    },
    "publications": [{"citation": "Doe (2020). Title.", "description": "note"}],
    "grants": [],
    "teaching": {
        "formal_experience": [], "guest_lectures": [], "subjects_to_teach": ["Stats"],
        "student_supervision": "", "mentoring": "", "educational_materials": "",
    },
}


def test_summary_split_from_looking_for():
    p = normalize_profile(copy.deepcopy(V1))
    assert p["summary"] == "I turn data into decisions."
    assert p["narrative"]["looking_for"] == "I turn data into decisions."
    assert "target_roles_description" not in p["narrative"]
    assert "research_themes" not in p["narrative"]
    assert "topics_to_teach" not in p["narrative"]


def test_links_dict_to_list():
    p = normalize_profile(copy.deepcopy(V1))
    links = p["personal"]["links"]
    assert links == [
        {"label": "LinkedIn", "url": "https://linkedin.com/in/jane"},
        {"label": "GitHub", "url": "https://github.com/jane"},
    ]  # empty google_scholar dropped


def test_experience_collapsed():
    p = normalize_profile(copy.deepcopy(V1))
    e = p["experience"][0]
    # achievements merged into responsibilities
    assert e["responsibilities"] == ["Built pipelines", "Co-built A/B testing"]
    # relevance object → note
    assert "Teaching:" in e["relevance_note"] and "Research:" in e["relevance_note"]
    # assorted fields → ai_context, including part-time flag
    assert "Reporting:" in e["ai_context"]
    assert "Part-time role." in e["ai_context"]
    # retired keys gone
    for k in ("is_current", "full_time", "team_size", "reporting_structure",
              "impact", "mentored", "presentations", "achievements", "relevance"):
        assert k not in e


def test_academic_methods_to_groups():
    p = normalize_profile(copy.deepcopy(V1))
    labels = [g["label"] for g in p["academic"]["methods"]]
    assert "Neural / brain analysis" in labels
    assert "Computational modelling" in labels
    assert "Data types" in labels and "Tools" in labels
    assert "datasets_tools" not in p["academic"]
    assert p["academic"]["research_themes"] == "Human behaviour."
    assert p["academic"]["topics_to_teach"] == ["Statistics"]


def test_work_preferences_migrated():
    p = normalize_profile(copy.deepcopy(V1))
    wp = p["work_preferences"]
    assert wp["salary"]["min"] == 4500
    assert wp["salary"]["currency"] == "EUR"
    assert "400" in wp["salary"]["notes"]
    assert "University" in wp["organisation_preferences"]
    for k in ("salary_current_gross", "salary_mobility_budget",
              "institution_type_preference", "research_vs_teaching"):
        assert k not in wp
    assert wp["contract_types"] == []
    assert "availability" in wp and "travel" in wp


def test_new_sections_and_meta():
    p = normalize_profile(copy.deepcopy(V1))
    for k in ("volunteering", "courses", "memberships", "custom_sections"):
        assert p[k] == []
    assert p["meta"]["schema"] == "career-profile-v2"
    # enabled_sections seeded from data presence
    es = p["meta"]["enabled_sections"]
    assert "academic" in es and "publications" in es and "career_context" in es


def test_idempotent_on_v2():
    once = normalize_profile(copy.deepcopy(V1))
    twice = normalize_profile(copy.deepcopy(once))
    assert once == twice


def test_professional_title_reaches_matcher(monkeypatch):
    """Regression for F8: filter_openings must read professional_title, not title."""
    import app.services.job_scanner as js

    captured = {}

    def fake_complete(messages, **kw):
        captured["system"] = messages[0]["content"]
        raise RuntimeError("stop after capture")

    monkeypatch.setattr(js, "complete", fake_complete)
    p = normalize_profile(copy.deepcopy(V1))
    with pytest.raises(RuntimeError):
        js.filter_openings([{"title": "X", "url": "http://x"}], p, {"openrouter_api_key": "k"})
    assert "Data Scientist" in captured.get("system", "")
