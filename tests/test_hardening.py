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

def test_require_llm_raises_without_key():
    with pytest.raises(ValueError, match="Settings"):
        config.require_llm({"openrouter_api_key": ""})


def test_require_llm_returns_key_and_default_model():
    key, model = config.require_llm({"openrouter_api_key": "sk-or-x", "openrouter_model": ""})
    assert key == "sk-or-x"
    assert model == config.DEFAULT_MODEL


def test_clean_slug_strips_traversal():
    assert _clean_slug("../../etc") == "etc"
    assert _clean_slug("my-cv-slug") == "my-cv-slug"
    assert "/" not in _clean_slug("a/b/c")


class _Fake:
    def __init__(self, **kw):
        self.__dict__.update(kw)


def _fake_response(arguments: str | None):
    if arguments is None:
        return _Fake(choices=[_Fake(message=_Fake(tool_calls=None))])
    call = _Fake(function=_Fake(arguments=arguments))
    return _Fake(choices=[_Fake(message=_Fake(tool_calls=[call]))])


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
