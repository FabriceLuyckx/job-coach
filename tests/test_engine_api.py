# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Engine status + download-manager API tests (no real model/download)."""

from collections import namedtuple

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
