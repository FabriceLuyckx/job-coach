# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Engine status + download-manager API tests (no real model/download)."""

from collections import namedtuple

from app import config
from app.api import engine


def test_engine_status_openrouter_ready():
    s = engine._engine_status({"llm_provider": "openrouter", "openrouter_api_key": "sk-or-x"})
    assert s["provider"] == "openrouter" and s["ready"] is True


def test_engine_status_openrouter_no_key():
    s = engine._engine_status({"llm_provider": "openrouter", "openrouter_api_key": ""})
    assert s["ready"] is False


def test_engine_status_follows_the_selected_provider():
    # A stored OpenRouter key must not make Anthropic report ready, and the
    # not-ready detail has to name the provider the user actually picked.
    cfg = {"llm_provider": "anthropic", "openrouter_api_key": "sk-or-x"}
    s = engine._engine_status(cfg)
    assert s["provider"] == "anthropic" and s["ready"] is False
    assert "Anthropic" in s["detail"]
    assert engine._engine_status({**cfg, "anthropic_api_key": "sk-ant-x"})["ready"] is True


def test_engine_status_custom_ready_without_a_key():
    s = engine._engine_status({"llm_provider": "custom",
                               "custom_base_url": "http://localhost:11434/v1"})
    assert s["provider"] == "custom" and s["ready"] is True


def test_settings_masks_every_stored_api_key(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.api import settings as settings_api

    cfg = {"openrouter_api_key": "sk-or-abcd1234", "anthropic_api_key": "sk-ant-wxyz",
           "openai_api_key": "", "openai_model": "gpt-x"}
    monkeypatch.setattr(settings_api.config, "load", lambda: {**config._DEFAULTS, **cfg})

    providers = TestClient(app).get("/api/settings").json()["providers"]
    blob = TestClient(app).get("/api/settings").text
    for secret in ("sk-or-abcd1234", "sk-ant-wxyz"):
        assert secret not in blob
    assert providers["openrouter"] == {**providers["openrouter"],
                                       "key_set": True, "key_preview": "...1234"}
    assert providers["anthropic"]["key_set"] is True
    assert providers["openai"]["key_set"] is False and providers["openai"]["model"] == "gpt-x"
    # Every preset is offered, each with somewhere to get a key and a default model.
    assert providers["gemini"]["key_url"] and providers["gemini"]["default_model"]


def test_every_paid_preset_links_to_its_own_billing_page():
    """Only OpenRouter reports a balance to the key we hold, so for the others the
    link to their dashboard is the only cost signal the user gets — a preset that
    forgets it leaves that provider with no way to see what it is spending."""
    from app.services.engines.remote import PRESETS
    for pid, preset in PRESETS.items():
        # 'custom' is the user's own server: no key page, no bill.
        expected = pid != "custom"
        assert bool(preset["billing_url"]) is expected, pid
        assert bool(preset["key_url"]) is expected, pid
        assert preset["billing_url"].startswith("https://") or not expected


class _Resp:
    def __init__(self, payload): self._p = payload
    def raise_for_status(self): pass
    def json(self): return self._p


def test_remote_models_reads_the_providers_own_list(monkeypatch):
    calls = {}

    def fake_get(url, headers=None, timeout=None):
        calls["url"] = url
        calls["auth"] = (headers or {}).get("Authorization")
        return _Resp({"data": [{"id": "gpt-4o"}, {"id": "gpt-4o-mini"}, {"id": "gpt-4o"}]})

    monkeypatch.setattr(engine.config, "load", lambda: {"llm_provider": "openai",
                                                        "openai_api_key": "sk-x"})
    monkeypatch.setattr(engine.httpx, "get", fake_get)
    out = engine.remote_models()
    assert out == {"models": ["gpt-4o", "gpt-4o-mini"]}  # deduped + sorted
    assert calls["url"] == "https://api.openai.com/v1/models"
    assert calls["auth"] == "Bearer sk-x"


def test_remote_models_strips_geminis_models_prefix(monkeypatch):
    # Gemini lists "models/gemini-2.5-flash" but 404s unless the request names
    # the bare id, so a name copied from its own list must still work.
    monkeypatch.setattr(engine.config, "load", lambda: {"gemini_api_key": "k"})
    monkeypatch.setattr(engine.httpx, "get",
                        lambda *a, **k: _Resp({"data": [{"id": "models/gemini-2.5-flash"}]}))
    assert engine.remote_models(provider="gemini") == {"models": ["gemini-2.5-flash"]}


def test_remote_models_sends_no_auth_header_without_a_key(monkeypatch):
    # OpenRouter's list is public — useful before a key exists — and an empty
    # Bearer would get it rejected.
    seen = {}

    def fake_get(url, headers=None, timeout=None):
        seen["headers"] = headers
        return _Resp({"data": [{"id": "anthropic/claude-sonnet-5"}]})

    monkeypatch.setattr(engine.config, "load", lambda: {"openrouter_api_key": ""})
    monkeypatch.setattr(engine.httpx, "get", fake_get)
    assert engine.remote_models(provider="openrouter")["models"]
    assert seen["headers"] == {}


def test_remote_models_never_raises(monkeypatch):
    """A server with no /models (or one that's down) must leave the field usable."""
    monkeypatch.setattr(engine.config, "load",
                        lambda: {"llm_provider": "custom", "custom_base_url": "http://x/v1"})
    monkeypatch.setattr(engine.httpx, "get",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    assert engine.remote_models() == {"models": []}
    # Same for a provider with nowhere to ask.
    monkeypatch.setattr(engine.config, "load", lambda: {"llm_provider": "custom"})
    assert engine.remote_models() == {"models": []}
    assert engine.remote_models(provider="nope") == {"models": []}


def test_engine_status_local_not_downloaded(monkeypatch):
    monkeypatch.setattr(engine, "local_model_path", lambda mid: None)
    s = engine._engine_status({"llm_provider": "local", "local_model_id": "qwen3-4b-instruct"})
    assert s["provider"] == "local" and s["ready"] is False
    assert s["model"]["id"] == "qwen3-4b-instruct"


def test_curated_models_fit_a_modest_machine():
    """The target machine is a 16 GB laptop with no GPU: one option must run on
    8 GB, and nothing may need more than 16."""
    from app.services.engines.registry import LOCAL_MODELS
    assert any(e["min_ram_gb"] <= 8 for e in LOCAL_MODELS.values())
    assert all(e["min_ram_gb"] <= 16 for e in LOCAL_MODELS.values())


def test_models_list_merges_customs_with_flags(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    custom = {"custom-mine": {"label": "mine.gguf", "url": "https://x/mine.gguf",
                              "filename": "mine.gguf", "size_bytes": 10, "min_ram_gb": 3,
                              "n_ctx": 8192, "custom": True}}
    # The registry reads config lazily, so patching app.config covers both it
    # and the API module.
    monkeypatch.setattr(config, "load",
                        lambda: {"local_custom_models": custom, "local_model_id": "custom-mine"})
    monkeypatch.setattr(engine, "local_model_path", lambda mid: None)

    rows = {m["id"]: m for m in TestClient(app).get("/api/engine/models").json()}
    assert rows["custom-mine"]["custom"] is True and rows["custom-mine"]["active"] is True
    # Curated entries still listed, and exactly one is the recommended default.
    assert rows["qwen3-8b"]["custom"] is False and rows["qwen3-8b"]["active"] is False
    assert [m for m in rows.values() if m["recommended"]] == [rows[config.DEFAULT_LOCAL_MODEL]]


def test_deleting_custom_model_removes_file_and_config_entry(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from app.main import app

    gguf = tmp_path / "mine.gguf"
    gguf.write_bytes(b"x")
    custom = {"custom-mine": {"label": "mine.gguf", "url": "https://x/mine.gguf",
                              "filename": "mine.gguf", "size_bytes": 1, "min_ram_gb": 3,
                              "n_ctx": 8192, "custom": True}}
    cfg = {"local_custom_models": custom, "local_model_id": "custom-mine"}
    saved: dict = {}
    monkeypatch.setattr(config, "load", lambda: cfg)
    monkeypatch.setattr(config, "save", saved.update)
    monkeypatch.setattr(engine, "local_model_path", lambda mid: gguf)

    r = TestClient(app).delete("/api/engine/model?model_id=custom-mine")
    assert r.status_code == 200
    assert not gguf.exists()
    assert saved["local_custom_models"] == {}


def test_download_refuses_when_disk_full(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    Usage = namedtuple("Usage", "total used free")
    monkeypatch.setattr(engine.shutil, "disk_usage", lambda p: Usage(0, 0, 1000))
    # Ensure the model isn't already downloaded so we reach the disk check.
    monkeypatch.setattr(engine, "local_model_path", lambda mid: None)
    r = TestClient(app).post("/api/engine/download", json={"model_id": "qwen3-4b-instruct"})
    assert r.status_code == 400
    assert "disk" in r.json()["detail"].lower()


def test_download_ram_check_overridable(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    Usage = namedtuple("Usage", "total used free")
    monkeypatch.setattr(engine.shutil, "disk_usage", lambda p: Usage(0, 0, 10**13))
    monkeypatch.setattr(engine, "local_model_path", lambda mid: None)

    class VM:
        total = 2 * 10**9  # 2 GB — below the model's min_ram_gb
    monkeypatch.setattr(engine.psutil, "virtual_memory", lambda: VM())

    client = TestClient(app)
    r = client.post("/api/engine/download", json={"model_id": "qwen3-4b-instruct"})
    assert r.status_code == 400 and "RAM" in r.json()["detail"]

    # With force=true it should get past the RAM gate (thread start is harmless
    # since the fake path never actually downloads within the test window).
    monkeypatch.setattr(engine.threading, "Thread", lambda *a, **k: type("T", (), {"start": lambda self: None})())
    r2 = client.post("/api/engine/download", json={"model_id": "qwen3-4b-instruct", "force": True})
    assert r2.status_code == 200 and "download_id" in r2.json()
