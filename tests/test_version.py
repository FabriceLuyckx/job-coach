# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""app_version() + /api/version. Run with: uv run pytest"""

import tomllib
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.system import app_version
from app.main import app

client = TestClient(app)


def _pyproject_version() -> str:
    pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
    return tomllib.loads(pyproject.read_text())["project"]["version"]


def test_app_version_matches_pyproject():
    assert app_version() == _pyproject_version()
    assert app_version() != "unknown"


def test_version_endpoint():
    r = client.get("/api/version")
    assert r.status_code == 200
    assert r.json() == {"version": _pyproject_version()}
