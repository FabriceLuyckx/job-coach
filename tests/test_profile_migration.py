# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Profile schema v1 → v5 migration tests. Run with: uv run pytest"""

import copy

import pytest

from app.services.cv_renderer import normalize_profile, profile_for_tailoring

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
        "formal_experience": [
            {"type": "Tutorial teaching", "course": "Intro Stats", "institution": "Ghent Uni",
             "years": "2018-2019", "description": "Tutored small groups."},
        ],
        "guest_lectures": [{"course": "Applied ML", "institution": "VUB"}],
        "subjects_to_teach": ["Stats"],
        "student_supervision": "Supervised 3 undergrads.",
        "mentoring": "Mentored junior engineers.",
        "educational_materials": "",
    },
    "cv_design_preferences": {
        "style": "Minimalist", "aesthetic": "Modern", "font_type": "Sans-serif",
        "layout": "Two-column", "spacing": "Spacious", "accent_color": "#123456",
        "include_photo": True, "format_style": "Executive", "typography": "Contemporary",
        "paper_size": "A4",
    },
}


def test_summary_split_from_looking_for():
    p = normalize_profile(copy.deepcopy(V1))
    assert p["summary"] == "I turn data into decisions."
    assert "narrative" not in p
    assert p["preferences"]["looking_for"].startswith("I turn data into decisions.")


def test_links_dict_to_list():
    p = normalize_profile(copy.deepcopy(V1))
    links = p["personal"]["links"]
    assert links == [
        {"label": "LinkedIn", "url": "https://linkedin.com/in/jane"},
        {"label": "GitHub", "url": "https://github.com/jane"},
    ]  # empty google_scholar dropped


def test_keywords_dropped():
    p = normalize_profile(copy.deepcopy(V1))
    assert "keywords" not in p["personal"]


def test_experience_collapsed_to_ai_notes():
    p = normalize_profile(copy.deepcopy(V1))
    e = p["experience"][0]
    # achievements merged into responsibilities
    assert e["responsibilities"] == ["Built pipelines", "Co-built A/B testing"]
    # relevance object + assorted fields → one ai_notes field
    assert "Teaching:" in e["ai_notes"] and "Research:" in e["ai_notes"]
    assert "Reporting:" in e["ai_notes"]
    assert "Part-time role." in e["ai_notes"]
    # retired/superseded keys gone
    for k in ("is_current", "full_time", "team_size", "reporting_structure",
              "impact", "mentored", "presentations", "achievements", "relevance",
              "relevance_note", "ai_context"):
        assert k not in e


def test_academic_dissolved_v5():
    p = normalize_profile(copy.deepcopy(V1))
    # academic section is gone entirely
    assert "academic" not in p
    # research_areas → a "Research areas" skills group (printable, tag-shaped)
    ra = next(g for g in p["skills"]["groups"] if g["label"] == "Research areas")
    assert ra["items"] == ["ML"]
    # research_themes prose → preferences.notes (AI-only)
    notes = p["preferences"]["notes"]
    assert "Human behaviour." in notes  # original text preserved
    assert "Neural / brain analysis: EEG" in notes
    assert "Computational modelling: Bayesian inference" in notes
    assert "Data types: Time series" in notes
    assert "Interdisciplinary work: Cross-domain ML" in notes
    assert "Collaborators: John (Uni)" in notes
    # academic.topics_to_teach (via narrative) + teaching.subjects_to_teach both
    # relocate to preferences.looking_for (R3: forward-looking data, not a CV section)
    looking_for = p["preferences"]["looking_for"]
    assert "Statistics" in looking_for
    assert "Stats" in looking_for


def test_teaching_entries_v4_shape():
    p = normalize_profile(copy.deepcopy(V1))
    t = p["teaching"]
    assert set(t.keys()) == {"entries"}
    types = {e["type"] for e in t["entries"]}
    assert "tutorials_seminars" in types  # "Tutorial teaching" keyword-matched
    assert "guest_lecture" in types
    tutorial = next(e for e in t["entries"] if e["type"] == "tutorials_seminars")
    assert tutorial["subject"] == "Intro Stats"  # course → subject
    assert tutorial["type_other"] == ""
    guest = next(e for e in t["entries"] if e["type"] == "guest_lecture")
    assert guest["institution"] == "VUB"
    # student_supervision + mentoring (folded into v3 teaching.notes) relocate via
    # academic.research_themes into preferences.notes — AI-only, never printed on the CV
    assert "Teaching notes:" in p["preferences"]["notes"]
    assert "Supervised 3 undergrads." in p["preferences"]["notes"]
    assert "Mentored junior engineers." in p["preferences"]["notes"]


def test_teaching_type_unmatched_keyword_becomes_other():
    p = normalize_profile({
        "personal": {"name": "X"},
        "teaching": {"entries": [{"type": "Freelance consulting", "course": "N/A",
                                   "institution": "", "years": "", "description": ""}]},
    })
    e = p["teaching"]["entries"][0]
    assert e["type"] == "other"
    assert e["type_other"] == "Freelance consulting"
    assert e["subject"] == "N/A"


def test_design_prefs_trimmed():
    p = normalize_profile(copy.deepcopy(V1))
    assert p["cv_design_preferences"] == {
        "accent_color": "#123456", "include_photo": True, "template": "default"}


def test_preferences_migrated():
    p = normalize_profile(copy.deepcopy(V1))
    prefs = p["preferences"]
    assert set(prefs.keys()) == {"target_roles", "looking_for", "avoid", "locations", "remote", "languages", "notes"}
    assert prefs["target_roles"] == []
    assert prefs["locations"] == ["Ghent"]
    assert prefs["remote"] == "Hybrid"
    assert prefs["languages"] == ["English"]
    assert prefs["avoid"] == "Pure admin."
    assert "University" in prefs["notes"]  # organisation_preferences folded in
    assert "4500" in prefs["notes"]  # salary folded in
    assert "narrative" not in p
    assert "work_preferences" not in p


def test_grants_year_fields_collapse_to_years():
    p = normalize_profile({
        "personal": {"name": "X"},
        "grants": [
            {"name": "Fellowship A", "year": 2021},
            {"name": "Fellowship B", "year_start": 2019, "year_end": 2021},
        ],
    })
    a, b = p["grants"]
    assert a["years"] == "2021"
    assert b["years"] == "2019–2021"
    for g in (a, b):
        assert g["funder"] == ""
        assert g["amount"] == ""
        assert "year" not in g and "year_start" not in g and "year_end" not in g


def test_headline_folds_into_summary():
    p = normalize_profile({
        "personal": {"name": "X", "headline": "Builder of things"},
        "summary": "I ship products.",
    })
    assert "headline" not in p["personal"]
    assert p["summary"] == "Builder of things\nI ship products."


def test_headline_empty_leaves_summary_untouched():
    p = normalize_profile({"personal": {"name": "X"}, "summary": "I ship products."})
    assert p["summary"] == "I ship products."


def test_education_and_publications_gain_optional_fields():
    p = normalize_profile({
        "personal": {"name": "X"},
        "education": [{"degree": "MSc", "field": "CS", "institution": "Ghent"}],
        "publications": [{"citation": "Doe (2020). Title."}],
    })
    assert p["education"][0]["description"] == ""
    assert p["publications"][0]["url"] == ""


def test_new_sections_and_meta():
    p = normalize_profile(copy.deepcopy(V1))
    for k in ("volunteering", "courses", "memberships", "custom_sections"):
        assert p[k] == []
    assert p["meta"]["schema"] == "career-profile-v5"
    # enabled_sections seeded from data presence; academic/career_context no longer exist
    es = p["meta"]["enabled_sections"]
    assert "publications" in es
    assert "academic" not in es
    assert "career_context" not in es


def test_idempotent():
    once = normalize_profile(copy.deepcopy(V1))
    twice = normalize_profile(copy.deepcopy(once))
    assert once == twice


def test_profile_for_tailoring_excludes_preferences():
    p = normalize_profile(copy.deepcopy(V1))
    tailoring_view = profile_for_tailoring(p)
    assert "preferences" not in tailoring_view
    assert "cv_design_preferences" not in tailoring_view
    assert "meta" not in tailoring_view
    # printable content still present; academic dissolved in v5
    assert "experience" in tailoring_view
    assert "academic" not in tailoring_view


def test_academic_merges_into_existing_research_areas_group_v4():
    """v4→v5: research_areas merge into an existing 'Research areas' skills group
    without duplicates; academic drops out of a stored enabled_sections list."""
    p = normalize_profile({
        "meta": {"schema": "career-profile-v4",
                 "enabled_sections": ["academic", "publications"]},
        "personal": {"name": "X"},
        "skills": {"groups": [{"label": "Research areas", "items": ["ML", "Old"]}],
                   "languages": []},
        "academic": {"research_areas": ["ML", "New"], "research_themes": "Themes text"},
    })
    assert "academic" not in p
    ra = next(g for g in p["skills"]["groups"] if g["label"] == "Research areas")
    assert ra["items"] == ["ML", "Old", "New"]  # deduped, order preserved
    assert "Themes text" in p["preferences"]["notes"]
    assert "academic" not in p["meta"]["enabled_sections"]
    assert "publications" in p["meta"]["enabled_sections"]


def test_professional_title_reaches_matcher(monkeypatch):
    """Regression for F8: the per-posting review must read professional_title, not title."""
    import app.services.job_scanner as js

    captured = {}

    def fake_complete(messages, **kw):
        captured["system"] = messages[0]["content"]
        raise RuntimeError("stop after capture")

    monkeypatch.setattr(js, "complete", fake_complete)
    p = normalize_profile(copy.deepcopy(V1))
    with pytest.raises(RuntimeError):
        js.review_posting({"title": "X", "url": "http://x"}, "posting text",
                          p, {"openrouter_api_key": "k"})
    assert "Data Scientist" in captured.get("system", "")
