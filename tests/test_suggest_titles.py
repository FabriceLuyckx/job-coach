# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""POST /api/profile/suggest-titles: shape, the server-side cap, and the
unusable-profile gate. Run with: uv run pytest"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api import profile as profile_api
from app.main import app
from app.services.llm import LLMResponse, ToolCall

USABLE = {
    "personal": {"professional_title": "Data Scientist"},
    "experience": [{"title": "Analyst", "employer": "Globex"}],
    "skills": {"groups": [{"label": "Code", "items": ["Python"]}], "languages": []},
}


def _stub(monkeypatch, titles, profile=USABLE):
    monkeypatch.setattr(profile_api.config, "load", lambda: {})
    monkeypatch.setattr(profile_api.config, "require_engine", lambda cfg: None)
    monkeypatch.setattr(profile_api, "PROFILE_PATH", Path(__file__))
    monkeypatch.setattr(profile_api, "load_profile", lambda: profile)
    monkeypatch.setattr(profile_api, "complete", lambda messages, **kw: LLMResponse(
        tool_calls=[ToolCall(name="suggested_titles",
                             arguments=json.dumps({"titles": titles}))]))
    return TestClient(app)


def test_returns_the_suggested_titles(monkeypatch):
    c = _stub(monkeypatch, ["Data Scientist", "ML Engineer"])
    r = c.post("/api/profile/suggest-titles")
    assert r.status_code == 200
    assert r.json()["titles"] == ["Data Scientist", "ML Engineer"]


def test_titles_are_capped_and_cleaned(monkeypatch):
    long_title = "Senior " * 20 + "Engineer"
    c = _stub(monkeypatch, [long_title, "  Analyst  ", "", "Analyst", None] + [f"T{i}" for i in range(10)])
    titles = c.post("/api/profile/suggest-titles").json()["titles"]
    assert all(len(t) <= profile_api.MAX_TITLE_LEN for t in titles)
    assert len(titles) <= profile_api.MAX_TITLES
    assert "Analyst" in titles  # trimmed
    assert titles.count("Analyst") == 1  # deduped
    assert "" not in titles


@pytest.mark.parametrize("profile", [
    {"personal": {"professional_title": ""}, "experience": []},
    {},
])
def test_unusable_profile_is_rejected_without_an_llm_call(monkeypatch, profile):
    monkeypatch.setattr(profile_api.config, "load", lambda: {})
    monkeypatch.setattr(profile_api.config, "require_engine", lambda cfg: None)
    monkeypatch.setattr(profile_api, "PROFILE_PATH", Path(__file__))
    monkeypatch.setattr(profile_api, "load_profile", lambda: profile)

    def boom(*a, **k):
        raise AssertionError("must not call the engine for an unusable profile")

    monkeypatch.setattr(profile_api, "complete", boom)
    assert TestClient(app).post("/api/profile/suggest-titles").status_code == 400
