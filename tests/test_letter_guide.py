# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Cover-letter guide reshaping — no LLM call, just the dict → dataclass step."""

from dataclasses import asdict

from app.services.letter_guide import _reshape


def _sample():
    return {
        "job_title": "Data Scientist",
        "employer": "ACME",
        "structure": [
            {"title": "Opener", "goal": "Name what drew you to them", "evidence": ["3y at Realo"]},
        ],
        "tips": ["Address the hiring manager by name.", "Keep it to ~300 words."],
    }


def test_required_keys_survive():
    g = asdict(_reshape(_sample()))
    assert set(g) == {"job_title", "employer", "structure", "tips"}


def test_section_evidence_survives():
    g = _reshape(_sample())
    assert g.structure[0]["evidence"] == ["3y at Realo"]


def test_tips_defaults_empty():
    d = _sample()
    del d["tips"]
    assert _reshape(d).tips == []


def test_tips_passthrough():
    assert _reshape(_sample()).tips[0] == "Address the hiring manager by name."
