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
