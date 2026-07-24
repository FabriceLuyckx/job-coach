# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

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
            zf.writestr("manifest.json", json.dumps({"marker": "myjobcoach-backup"}))
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


def test_require_engine_local_not_downloaded_raises(monkeypatch):
    from app.services.engines import registry
    monkeypatch.setattr(registry, "local_model_path", lambda mid: None)
    with pytest.raises(ValueError, match="not downloaded"):
        config.require_engine({"llm_provider": "local", "local_model_id": "qwen3-4b-instruct"})


def test_gguf_url_requires_https():
    from app.api.engine import validate_gguf_url
    with pytest.raises(ValueError, match="https"):
        validate_gguf_url("http://example.com/model.gguf")
    with pytest.raises(ValueError, match="https"):
        validate_gguf_url("file:///etc/passwd.gguf")


def test_gguf_url_requires_gguf_suffix():
    from app.api.engine import validate_gguf_url
    with pytest.raises(ValueError, match=r"\.gguf"):
        validate_gguf_url("https://example.com/model.bin")


def test_gguf_url_sanitizes_hostile_basename():
    from app.api.engine import validate_gguf_url
    # Traversal lives in the path, so the basename is what matters — and it is
    # stripped to a plain name that cannot escape MODELS_DIR.
    _, name = validate_gguf_url("https://example.com/a/../../etc/we ird;rm -rf.gguf")
    assert name == "weirdrm-rf.gguf"
    assert "/" not in name and ".." not in name


def test_gguf_url_rejects_empty_after_sanitize():
    from app.api.engine import validate_gguf_url
    with pytest.raises(ValueError, match="file name"):
        validate_gguf_url("https://example.com/%20%2F.gguf")


def test_gguf_url_rewrites_huggingface_blob():
    from app.api.engine import validate_gguf_url
    url, name = validate_gguf_url("https://huggingface.co/o/r/blob/main/m.gguf")
    assert url == "https://huggingface.co/o/r/resolve/main/m.gguf"
    assert name == "m.gguf"


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


# ---------- profile normalization ----------

def test_normalize_defaults_target_roles():
    from app.services.cv_renderer import normalize_profile
    p = normalize_profile({"meta": {"schema": "career-profile-v5"},
                           "preferences": {"looking_for": "x"}})
    assert p["preferences"]["target_roles"] == []


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


# ---------- job suggestions: review / recheck / check ----------

def test_review_one_keeps_reason_for_non_match(monkeypatch):
    """A non-match still records the reviewer's reason (so it's auditable in the
    'Filtered out' list) and caches the posting text + digest."""
    import app.api.jobs as jobs
    monkeypatch.setattr(jobs, "review_posting", lambda *a, **k: {
        "match": False, "reason": "too senior", "lang": "en", "digest": {"employer": "X"}})
    row = jobs._review_one({"title": "T", "url": "u"}, "posting text", {}, {}, None)
    assert row["status"] == "seen"
    assert row["reason"] == "too senior"
    assert row["posting_text"] == "posting text"
    assert json.loads(row["posting_json"]) == {"employer": "X"}


def test_review_one_empty_text_is_suggested_caveat(monkeypatch):
    """Empty text ⇒ suggested-with-caveat, and the reviewer is never called."""
    import app.api.jobs as jobs

    def boom(*a, **k):
        raise AssertionError("must not review empty text")

    monkeypatch.setattr(jobs, "review_posting", boom)
    row = jobs._review_one({"title": "T", "url": "u"}, "", {}, {}, None)
    assert row["status"] == "suggested"
    assert "couldn't read" in row["reason"].lower()
    assert row["posting_text"] is None


def test_review_one_review_error_is_suggested_caveat(monkeypatch):
    """A review exception must not bury the job — it stays suggested-with-caveat."""
    import app.api.jobs as jobs

    def boom(*a, **k):
        raise RuntimeError("llm down")

    monkeypatch.setattr(jobs, "review_posting", boom)
    row = jobs._review_one({"title": "T", "url": "u"}, "some text", {}, {}, None)
    assert row["status"] == "suggested"
    assert "couldn't read" in row["reason"].lower()


def test_fetch_texts_parallel_http_skips_render(monkeypatch):
    """When HTTP text is long enough, fetch_texts dedupes and never touches the
    headless browser."""
    import app.services.headless as h
    monkeypatch.setattr(h, "http_get", lambda url: "<p>" + "x" * 600 + "</p>")

    def no_render(*a, **k):
        raise AssertionError("render must not run when HTTP text is long enough")

    monkeypatch.setattr(h, "render_html", no_render)
    out = h.fetch_texts(["http://a", "http://b", "http://a"])  # 'a' duplicated
    assert set(out) == {"http://a", "http://b"}
    assert all(len(v) >= 500 for v in out.values())


def test_recheck_llm_failure_keeps_old_verdict(monkeypatch):
    """An LLM error during /recheck must keep the row's old verdict + digest —
    never mass-promote filtered rows with the fetch caveat."""
    import app.api.jobs as jobs
    from app import db
    db.init_db()
    url = "http://example.test/recheck-fail-xyz"
    oid = "test-recheck-fail-xyz"

    monkeypatch.setattr(jobs.config, "require_engine", lambda cfg: None)
    monkeypatch.setattr(jobs.config, "save", lambda d: None)  # don't touch real config.json
    monkeypatch.setattr(jobs, "load_profile", lambda: {})

    def boom(*a, **k):
        raise RuntimeError("llm down")

    monkeypatch.setattr(jobs, "review_posting", boom)
    with db.get_db() as conn:
        conn.execute("DELETE FROM job_openings WHERE url = ?", (url,))
        conn.execute(
            """INSERT INTO job_openings (id, url, title, source_url, status, reason,
               lang, posting_text, posting_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (oid, url, "Old", url, "seen", "old reason", "en", "cached text",
             '{"employer": "ACME"}', "2026-01-01T00:00:00Z"),
        )
    sid = "test-recheck-scan"
    import threading
    jobs._scans[sid] = {"status": "pending", "created": 0, "cancel": threading.Event()}
    try:
        jobs._run_recheck(sid)
        assert jobs._scans[sid]["status"] == "done"
        assert jobs._scans[sid]["found"] == 0
        with db.get_db() as conn:
            row = dict(conn.execute("SELECT * FROM job_openings WHERE id = ?", (oid,)).fetchone())
        assert row["status"] == "seen"
        assert row["reason"] == "old reason"
        assert row["posting_json"] == '{"employer": "ACME"}'
    finally:
        jobs._scans.pop(sid, None)
        with db.get_db() as conn:
            conn.execute("DELETE FROM job_openings WHERE url = ?", (url,))


def test_add_source_disambiguates_same_host():
    """Two boards on one host get distinguishable names (second gains its path)."""
    from app import db
    db.init_db()
    u1, u2 = "http://dupe-host.test/jobs", "http://dupe-host.test/teaching/vacancies"
    with db.get_db() as conn:
        conn.execute("DELETE FROM job_sources WHERE url IN (?, ?)", (u1, u2))
    try:
        r1 = client.post("/api/jobs/sources", json={"url": u1})
        r2 = client.post("/api/jobs/sources", json={"url": u2})
        assert r1.json()["name"] == "dupe-host.test"
        assert r2.json()["name"] == "dupe-host.test/teaching"
    finally:
        with db.get_db() as conn:
            conn.execute("DELETE FROM job_sources WHERE url IN (?, ?)", (u1, u2))


def test_check_existing_url_returns_row_without_llm(monkeypatch):
    """POST /jobs/check on a URL already in the DB returns the stored row (with
    digest, no posting_text) and never calls the LLM."""
    from app import db
    import app.services.job_scanner as js
    db.init_db()
    url = "http://example.test/check-existing-xyz"
    oid = "test-check-existing-xyz"

    def no_llm(*a, **k):
        raise AssertionError("existing URL must not trigger an LLM call")

    monkeypatch.setattr(js, "complete", no_llm)
    with db.get_db() as conn:
        conn.execute("DELETE FROM job_openings WHERE url = ?", (url,))
        conn.execute(
            """INSERT INTO job_openings (id, url, title, source_url, status, reason,
               lang, posting_text, posting_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (oid, url, "Cached", url, "seen", "nope", "en", "cached text",
             '{"employer": "ACME"}', "2026-01-01T00:00:00Z"),
        )
    try:
        r = client.post("/api/jobs/check", json={"url": url})
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "Cached"
        assert body["digest"] == {"employer": "ACME"}
        assert "posting_text" not in body
    finally:
        with db.get_db() as conn:
            conn.execute("DELETE FROM job_openings WHERE url = ?", (url,))


# ---------- CV plan: hidden_sections round-trip + bullet cap ----------

def test_tailoring_plan_backcompat_hidden_sections():
    """Old stored plans (no hidden_sections key) still deserialize, defaulting []."""
    from app.services.cv_generator import TailoringPlan
    p = TailoringPlan(job_title="t", employer="e", slug="s", summary="x",
                      selected_experience_ids=[], adjusted_responsibilities={},
                      highlighted_skills=[], tailoring_notes="n")
    assert p.hidden_sections == []


def test_put_plan_saves_hidden_and_caps_bullets(monkeypatch, tmp_path):
    """PUT /plan persists hidden_sections and never keeps more than 4 bullets;
    GET /plan hydrates hidden_sections + highlighted_skills for the editor."""
    from app import db
    import app.api.cv as cvapi
    from app.services.cv_renderer import blank_profile
    db.init_db()
    hid = "test-plan-hidden-xyz"
    plan = {
        "job_title": "T", "employer": "E", "slug": "s", "summary": "sum",
        "selected_experience_ids": ["e1"], "adjusted_responsibilities": {"e1": ["a"]},
        "highlighted_skills": ["Python"], "tailoring_notes": "n",
    }
    with db.get_db() as conn:
        conn.execute("DELETE FROM cv_history WHERE id = ?", (hid,))
        conn.execute(
            """INSERT INTO cv_history (id, slug, job_title, employer, job_url, lang,
               plans_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (hid, "s", "T", "E", "http://x", "en", json.dumps({"en": plan}),
             "2026-01-01T00:00:00Z"),
        )
    prof = blank_profile()
    prof["experience"] = [{"id": "e1", "title": "Dev", "employer": "E", "responsibilities": []}]
    monkeypatch.setattr(cvapi, "load_profile", lambda: prof)
    monkeypatch.setattr(cvapi, "PROFILE_PATH", tmp_path)  # .exists() → True
    try:
        r = client.put(f"/api/cv/plan/{hid}", json={
            "summary": "new", "roles": [{"id": "e1", "bullets": ["1", "2", "3", "4", "5"]}],
            "hidden_sections": ["publications", "grants"], "excluded_sections": [],
        })
        assert r.status_code == 200
        g = client.get(f"/api/cv/plan/{hid}").json()
        assert g["hidden_sections"] == ["publications", "grants"]
        assert g["highlighted_skills"] == ["Python"]
        role = next(x for x in g["roles"] if x["id"] == "e1")
        assert role["bullets"] == ["1", "2", "3", "4"]  # capped at 4
    finally:
        with db.get_db() as conn:
            conn.execute("DELETE FROM cv_history WHERE id = ?", (hid,))


# ---------- i18n changed-key detection (pre-commit hook) ----------

def test_changed_keys_detects_new_and_updated():
    from scripts.translate_locales import changed_keys
    en = {"a": "one", "b": "two", "c": "three"}
    head = {"a": "one", "b": "TWO-old"}  # a unchanged, b edited, c new
    assert changed_keys(en, head) == {"b", "c"}
    assert changed_keys(en, en) == set()


# ---------- job-scan cancel endpoint ----------

def test_cancel_scan_unknown_id_404():
    assert client.post("/api/jobs/scan/cancel/nope").status_code == 404


def test_cancel_scan_sets_event():
    import app.api.jobs as jobs_api
    import threading
    sid = "test-scan"
    ev = threading.Event()
    jobs_api._scans[sid] = {"status": "running", "created": 0, "cancel": ev}
    try:
        assert client.post(f"/api/jobs/scan/cancel/{sid}").status_code == 200
        assert ev.is_set()
        # The cancel Event must never leak into the JSON status response.
        assert "cancel" not in client.get(f"/api/jobs/scan/status/{sid}").json()
    finally:
        jobs_api._scans.pop(sid, None)
