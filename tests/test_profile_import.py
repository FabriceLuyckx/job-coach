"""CV import + tailoring-gate tests. Run with: uv run pytest"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.cv_renderer import blank_profile
from app.services.cv_importer import pdf_to_text

client = TestClient(app)


def test_blank_profile_is_valid_v2():
    b = blank_profile()
    assert b["meta"]["schema"] == "career-profile-v2"
    assert b["personal"]["name"] == ""
    assert b["experience"] == []
    assert b["meta"]["enabled_sections"] == []


def test_pdf_to_text_rejects_non_pdf():
    with pytest.raises(ValueError):
        pdf_to_text(b"this is not a pdf")


def test_import_requires_text_or_file(monkeypatch):
    import app.api.profile as prof
    monkeypatch.setattr(prof.config, "require_llm", lambda cfg=None: ("k", "m"))
    r = client.post("/api/profile/import", data={"text": ""})
    assert r.status_code == 400


def test_import_rejects_oversize_pdf(monkeypatch):
    import app.api.profile as prof
    import app.services.cv_importer as importer
    monkeypatch.setattr(prof.config, "require_llm", lambda cfg=None: ("k", "m"))
    monkeypatch.setattr(prof, "MAX_CV_BYTES", 100)
    big = b"%PDF-1.4" + b"\x00" * 500
    r = client.post("/api/profile/import", files={"file": ("cv.pdf", big, "application/pdf")})
    assert r.status_code == 400
    assert "large" in r.json()["detail"].lower()
    assert importer.MAX_CV_BYTES == 5 * 1024 * 1024  # module constant untouched


def test_import_happy_path(monkeypatch):
    import app.api.profile as prof
    monkeypatch.setattr(prof.config, "require_llm", lambda cfg=None: ("k", "m"))
    monkeypatch.setattr(prof, "extract_profile", lambda text, key, model: {
        "meta": {"schema": "career-profile-v2"},
        "personal": {"name": "Zed", "professional_title": "Chef",
                     "location": {"city": "", "country": ""}, "links": [], "keywords": []},
        "summary": "", "narrative": {}, "experience": [], "skills": {}, "work_preferences": {},
    })
    r = client.post("/api/profile/import", data={"text": "my cv text"})
    assert r.status_code == 200
    body = r.json()
    assert body["personal"]["name"] == "Zed"
    assert body["meta"]["schema"] == "career-profile-v2"


def test_excluded_sections_gate():
    from app.services.cv_generator import TailoringPlan, apply_tailoring
    p = {"summary": "", "experience": [], "volunteering": [1],
         "awards": [1], "certifications": [1], "publications": [1]}
    plan = TailoringPlan("t", "e", "s", "sum", [], {}, [], "n",
                         excluded_sections=["volunteering", "certifications"])
    out = apply_tailoring(p, plan)
    assert out["volunteering"] == [] and out["certifications"] == []
    assert out["awards"] == [1]  # not excluded, kept
    assert out["summary"] == "sum"
