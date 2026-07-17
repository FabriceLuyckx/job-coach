# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""sidebar_translations: the keys offered to the model and the strings
apply_tailoring() actually swaps out must be the same set. When they weren't —
the map was free-form, so the model answered {"languages": "Nederlands, Engels"}
— every key missed and Dutch CVs silently kept their English skill headings and
language names. Run with: uv run pytest"""

import json

import pytest

from app.paths import RESOURCE_DIR
from app.services.cv_generator import (
    TailoringPlan, _tool_for, _translatable, apply_tailoring,
)
from app.services.cv_renderer import normalize_profile


@pytest.fixture(scope="module")
def profile():
    return normalize_profile(json.loads(
        (RESOURCE_DIR / "profile" / "profile.example.json").read_text(encoding="utf-8")))


def _props(tool):
    return tool["function"]["parameters"]["properties"]


def test_schema_offers_only_real_profile_strings(profile):
    schema = _props(_tool_for(profile, "nl"))["sidebar_translations"]
    assert schema["additionalProperties"] is False, "free-form keys are the bug"
    blob = json.dumps(profile, ensure_ascii=False)
    for key in schema["properties"]:
        assert json.dumps(key, ensure_ascii=False)[1:-1] in blob, f"{key!r} is not in the profile"


def test_english_cv_has_no_translation_field(profile):
    params = _tool_for(profile, "en")["function"]["parameters"]
    assert "sidebar_translations" not in params["properties"]
    assert "sidebar_translations" not in params["required"]


def test_every_offered_string_is_applied(profile):
    """The end-to-end contract: translate everything the schema offers and none
    of it may survive in English on the CV."""
    offered = _translatable(profile)
    assert offered, "example profile has nothing translatable"
    plan = TailoringPlan(
        job_title="T", employer="E", slug="s", summary="S",
        selected_experience_ids=[], adjusted_responsibilities={},
        highlighted_skills=[], tailoring_notes="",
        sidebar_translations={s: f"NL::{s}" for s in offered},
    )
    out = apply_tailoring(profile, plan)
    translated = {
        *(edu.get(k) for edu in out["education"] for k in ("field", "distinction")),
        *(g["name"] for g in out["grants"]),
        *(x["language"] for x in out["skills"]["languages"]),
        *(g["label"] for g in out["skills"]["groups"]),
        *(s["title"] for s in out["custom_sections"]),
    }
    missed = [s for s in offered if s in translated]
    assert not missed, f"offered for translation but never substituted: {missed}"


def test_untranslated_strings_are_left_alone(profile):
    """A partial map is normal — the model omits what should stay English."""
    out = apply_tailoring(profile, TailoringPlan(
        job_title="T", employer="E", slug="s", summary="S",
        selected_experience_ids=[], adjusted_responsibilities={},
        highlighted_skills=[], tailoring_notes="",
        sidebar_translations={profile["skills"]["groups"][0]["label"]: "Vaardigheden"},
    ))
    assert out["skills"]["groups"][0]["label"] == "Vaardigheden"
    assert out["skills"]["languages"] == profile["skills"]["languages"]
