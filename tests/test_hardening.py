"""Backend hardening tests: upload validation, zip-bomb guard, slug cleaning,
LLM config/response guards. Run with: uv run pytest"""

import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from app import config
from app.api.cv import _clean_slug
from app.main import app
from app.services.llm import AIResponseError, tool_args

client = TestClient(app)


# ---------- photo upload ----------

def _upload_photo(name: str, data: bytes):
    return client.post("/api/settings/photo", files={"file": (name, data, "image/png")})


def test_photo_rejects_bad_extension():
    r = _upload_photo("evil.svg", b"<svg/>")
    assert r.status_code == 400


def test_photo_rejects_wrong_magic_bytes():
    # Valid extension, but the bytes aren't a PNG.
    r = _upload_photo("photo.png", b"#!/bin/sh\necho pwned\n")
    assert r.status_code == 400
    assert "image" in r.json()["detail"].lower()


def test_photo_rejects_oversize(monkeypatch):
    import app.api.settings as settings_api
    monkeypatch.setattr(settings_api, "MAX_PHOTO_BYTES", 100)
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200
    r = _upload_photo("photo.png", png)
    assert r.status_code == 400
    assert "large" in r.json()["detail"].lower()


# ---------- backup import ----------

def _zip_bytes(entries: dict[str, bytes], manifest: bool = True) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        if manifest:
            zf.writestr("manifest.json", json.dumps({"marker": "job-coach-backup"}))
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


def _import(data: bytes):
    return client.post("/api/backup/import", files={"file": ("b.zip", data, "application/zip")})


def test_import_rejects_non_zip():
    assert _import(b"not a zip").status_code == 400


def test_import_rejects_missing_manifest():
    r = _import(_zip_bytes({"output/x.html": b"hi"}, manifest=False))
    assert r.status_code == 400


def test_import_rejects_traversal():
    r = _import(_zip_bytes({"output/../../etc/passwd": b"x"}))
    assert r.status_code == 400


def test_import_rejects_zip_bomb(monkeypatch):
    import app.api.backup as backup_api
    monkeypatch.setattr(backup_api, "MAX_EXTRACTED_BYTES", 1000)
    r = _import(_zip_bytes({"output/big.html": b"\x00" * 5000}))
    assert r.status_code == 400
    assert "large" in r.json()["detail"].lower()


# ---------- config / LLM helpers ----------

def test_require_engine_raises_without_key():
    with pytest.raises(ValueError, match="Settings"):
        config.require_engine({"openrouter_api_key": ""})


def test_require_engine_returns_openrouter_defaults():
    eng = config.require_engine({"openrouter_api_key": "sk-or-x", "openrouter_model": ""})
    assert eng.provider == "openrouter"
    assert eng.api_key == "sk-or-x"
    assert eng.model == config.DEFAULT_MODEL


def test_require_engine_local_not_downloaded_raises():
    with pytest.raises(ValueError, match="not downloaded"):
        config.require_engine({"llm_provider": "local", "local_model_id": "qwen3-4b-instruct"})


def test_clean_slug_strips_traversal():
    assert _clean_slug("../../etc") == "etc"
    assert _clean_slug("my-cv-slug") == "my-cv-slug"
    assert "/" not in _clean_slug("a/b/c")


def _fake_response(arguments: str | None):
    from app.services.llm import LLMResponse, ToolCall
    if arguments is None:
        return LLMResponse(text=None, tool_calls=[])
    return LLMResponse(text=None, tool_calls=[ToolCall(name="t", arguments=arguments)])


def test_tool_args_no_tool_call():
    with pytest.raises(AIResponseError):
        tool_args(_fake_response(None))


def test_tool_args_bad_json():
    with pytest.raises(AIResponseError):
        tool_args(_fake_response("{not json"))


def test_tool_args_missing_required():
    with pytest.raises(AIResponseError, match="slug"):
        tool_args(_fake_response('{"title": "x"}'), required=("slug",))


def test_tool_args_ok():
    assert tool_args(_fake_response('{"a": 1}'), required=("a",)) == {"a": 1}


# ---------- profile validation ----------

def test_put_profile_rejects_missing_personal():
    r = client.put("/api/profile", json={"foo": "bar"})
    assert r.status_code == 400


# ---------- settings prompt validation ----------

def test_cv_prompt_requires_lang_placeholder():
    r = client.put("/api/settings", json={"cv_prompt": "no placeholder here"})
    assert r.status_code == 400
    assert "lang_name" in r.json()["detail"]
# ---------- job scanner: prescreen skip + posting review ----------

def test_prescreen_skips_llm_at_or_below_threshold(monkeypatch):
    """≤ _PRESCREEN_MIN new openings ⇒ keep them all without an LLM call."""
    import app.services.job_scanner as js

    def boom(*a, **k):
        raise AssertionError("prescreen should not call the LLM at this size")

    monkeypatch.setattr(js, "complete", boom)
    openings = [{"title": f"J{i}", "url": f"http://x/{i}"} for i in range(js._PRESCREEN_MIN)]
    assert js.prescreen_openings(openings, {}, {}) == openings


def test_review_posting_builds_digest_and_verdict(monkeypatch):
    """review_posting returns a 2-letter lang and a digest with only stated fields
    (empty/'unknown' dropped)."""
    import app.services.job_scanner as js

    def fake_complete(messages, **kw):
        return _fake_response(json.dumps({
            "match": True, "reason": "fits", "lang": "NL-be",
            "employer": "Acme", "remote": "unknown", "salary": "",
            "requirements": ["Python"],
        }))

    monkeypatch.setattr(js, "complete", fake_complete)
    r = js.review_posting({"title": "X", "url": "http://x"}, "text", {}, {})
    assert r["match"] is True and r["lang"] == "nl"
    assert r["digest"] == {"employer": "Acme", "requirements": ["Python"]}

# ---------- i18n changed-key detection (pre-commit hook) ----------

def test_changed_keys_detects_new_and_updated():
    from scripts.translate_locales import changed_keys
    en = {"a": "one", "b": "two", "c": "three"}
    head = {"a": "one", "b": "TWO-old"}  # a unchanged, b edited, c new
    assert changed_keys(en, head) == {"b", "c"}
    assert changed_keys(en, en) == set()
