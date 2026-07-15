# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Cover-letter guide reshaping — no LLM call, just the dict → dataclass step."""

from dataclasses import asdict

from app.services.letter_guide import _reshape


def _sample():
    return {
        "job_title": "Data Scientist",
        "employer": "ACME",
        "angle": "You turn messy data into decisions.",
        "structure": [{"title": "Opener", "goal": "Hook", "pointers": ["Name the product"]}],
        "evidence": [{"job_need": "Python", "your_match": "3y at Realo"}],
        "tone": "Formal, one page.",
    }


def test_required_keys_survive():
    g = asdict(_reshape(_sample()))
    for k in ("job_title", "employer", "angle", "structure", "evidence", "tone", "gaps"):
        assert k in g


def test_gaps_defaults_empty():
    assert _reshape(_sample()).gaps == []


def test_gaps_passthrough():
    d = _sample() | {"gaps": ["No PhD — frame the applied experience instead."]}
    assert _reshape(d).gaps == ["No PhD — frame the applied experience instead."]
