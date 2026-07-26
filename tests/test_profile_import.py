# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""CV import + tailoring-gate tests. Run with: uv run pytest"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.cv_renderer import blank_profile
from app.services.cv_importer import pdf_to_text

client = TestClient(app)


def test_blank_profile_is_valid_v5():
    b = blank_profile()
    assert b["meta"]["schema"] == "career-profile-v5"
    assert b["personal"]["name"] == ""
    assert "keywords" not in b["personal"]
    assert "headline" not in b["personal"]
    assert b["experience"] == []
    assert b["meta"]["enabled_sections"] == []
    # Every preference is unanswered — a new install must not ship opinions the
    # user never gave (a "Hybrid" working style used to be defaulted in here and
    # went straight into the job-matching brief).
    assert b["preferences"] == {
        "target_roles": [], "looking_for": "", "avoid": "", "locations": [],
        "remote": "", "notes": "", "employment_types": [],
        "hours": "", "salary": "", "availability": "", "travel": "",
    }
    # Languages are profile-owned and required: one empty, *unrated* row to fill in.
    assert b["skills"]["languages"] == [{"language": "", "level": 0, "label": ""}]
    # Same for skills: a group to type in, with no invented group name.
    assert b["skills"]["groups"] == [{"label": "", "items": []}]


def test_first_run_seeding_leaves_the_profile_empty(tmp_path, monkeypatch):
    """A packaged first run used to copy profile.example.json into the data dir,
    so a fresh install opened on a sample person's jobs, languages and enabled
    sections presented as the user's own answers."""
    from app import paths
    monkeypatch.setattr(paths, "PROFILE_DIR", tmp_path / "profile")
    monkeypatch.setattr(paths, "PROFILE_PATH", tmp_path / "profile" / "profile.json")
    paths.seed_data_dir()
    assert (tmp_path / "profile").is_dir()
    assert not (tmp_path / "profile" / "profile.json").exists()


def test_data_dir_env_override(tmp_path, monkeypatch):
    """MYJOBCOACH_DATA_DIR is how a dev exercises a real first run. If it silently
    stops being honoured, that check reads the repo's own config/profile/db and
    "fresh install" tests nothing."""
    import importlib

    from app import paths

    fresh = (tmp_path / "fresh").resolve()
    monkeypatch.setenv("MYJOBCOACH_DATA_DIR", str(fresh))
    try:
        p = importlib.reload(paths)
        assert p.DATA_DIR == fresh
        assert p.CONFIG_PATH == fresh / "config.json"
        assert p.PROFILE_PATH == fresh / "profile" / "profile.json"
        assert p.DB_PATH == fresh / "jobs" / "jobs.db"
    finally:
        monkeypatch.delenv("MYJOBCOACH_DATA_DIR")
        importlib.reload(paths)  # other modules bound their paths at import


def test_pdf_to_text_rejects_non_pdf():
    with pytest.raises(ValueError):
        pdf_to_text(b"this is not a pdf")


def test_import_requires_text_or_file(monkeypatch):
    import app.api.profile as prof
    monkeypatch.setattr(prof.config, "require_engine", lambda cfg=None: None)
    r = client.post("/api/profile/import", data={"text": ""})
    assert r.status_code == 400


def test_import_rejects_oversize_pdf(monkeypatch):
    import app.api.profile as prof
    import app.services.cv_importer as importer
    monkeypatch.setattr(prof.config, "require_engine", lambda cfg=None: None)
    monkeypatch.setattr(prof, "MAX_CV_BYTES", 100)
    big = b"%PDF-1.4" + b"\x00" * 500
    r = client.post("/api/profile/import", files={"file": ("cv.pdf", big, "application/pdf")})
    assert r.status_code == 400
    assert "large" in r.json()["detail"].lower()
    assert importer.MAX_CV_BYTES == 5 * 1024 * 1024  # module constant untouched


def test_import_happy_path(monkeypatch):
    import app.api.profile as prof
    monkeypatch.setattr(prof.config, "require_engine", lambda cfg=None: None)
    monkeypatch.setattr(prof, "extract_profile", lambda text, cfg: {
        "meta": {"schema": "career-profile-v4"},
        "personal": {"name": "Zed", "professional_title": "Chef",
                     "location": {"city": "", "country": ""}, "links": []},
        "summary": "", "experience": [], "skills": {},
    })
    r = client.post("/api/profile/import", data={"text": "my cv text"})
    assert r.status_code == 200
    body = r.json()
    assert body["personal"]["name"] == "Zed"
    # extract_profile returned a v4-shaped dict; normalize upgrades it to v5
    assert body["meta"]["schema"] == "career-profile-v5"


def test_excluded_sections_gate():
    from app.services.cv_generator import TailoringPlan, apply_tailoring
    p = {"summary": "", "experience": [], "volunteering": [1],
         "awards": [1], "certifications": [1], "publications": [1],
         "teaching": {"entries": [1]}}
    plan = TailoringPlan("t", "e", "s", "sum", [], {}, [], "n",
                         excluded_sections=["volunteering", "certifications", "publications", "teaching"])
    out = apply_tailoring(p, plan)
    assert out["volunteering"] == [] and out["certifications"] == []
    assert out["publications"] == [] and out["teaching"] == {"entries": []}
    assert out["awards"] == [1]  # not excluded, kept
    assert out["summary"] == "sum"
