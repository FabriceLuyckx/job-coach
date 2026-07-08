"""Local (llama.cpp) engine tests — no real model needed; the Llama class is faked."""

import sys
import types

import pytest

from app.config import EngineConfig
from app.services.engines import local


class _FakeLlama:
    """Minimal stand-in for llama_cpp.Llama capturing the create_chat_completion call."""
    last_kwargs: dict = {}

    def __init__(self, **kw):
        self.init_kwargs = kw

    def n_ctx(self):
        return 8192

    def tokenize(self, b, add_bos=False):
        # ~4 bytes/token, good enough for the fit-context test.
        return [0] * (len(b) // 4)

    def create_chat_completion(self, **kw):
        _FakeLlama.last_kwargs = kw
        return {"choices": [{"message": {"content": '{"ok": true}'}}]}


@pytest.fixture(autouse=True)
def _fake_llama_module(monkeypatch, tmp_path):
    # Inject a fake llama_cpp module and a downloaded model file.
    mod = types.ModuleType("llama_cpp")
    mod.Llama = _FakeLlama
    monkeypatch.setitem(sys.modules, "llama_cpp", mod)

    gguf = tmp_path / "model.gguf"
    gguf.write_bytes(b"GGUF")
    monkeypatch.setattr(local, "local_model_path", lambda mid: gguf, raising=False)
    from app.services.engines import registry
    monkeypatch.setattr(local, "get_model", lambda mid: {"n_ctx": 8192, "label": "x"}, raising=False)
    # reset the module singleton between tests
    local._llm = None
    local._llm_model_id = None
    yield


def _engine():
    return EngineConfig(provider="local", local_model_id="qwen3-4b-instruct")


def test_forced_tool_uses_schema_and_wraps_toolcall():
    tools = [{"type": "function", "function": {
        "name": "plan", "description": "make a plan",
        "parameters": {"type": "object", "properties": {"ok": {"type": "boolean"}}}}}]
    resp = local.complete(
        _engine(),
        [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}],
        tools=tools,
        tool_choice={"type": "function", "function": {"name": "plan"}},
        max_tokens=256,
    )
    # response_format carried the tool's JSON schema
    rf = _FakeLlama.last_kwargs["response_format"]
    assert rf["type"] == "json_object"
    assert rf["schema"]["properties"]["ok"]["type"] == "boolean"
    # result surfaced as a single ToolCall with the model's JSON
    assert resp.tool_calls and resp.tool_calls[0].name == "plan"
    assert resp.tool_calls[0].arguments == '{"ok": true}'
    assert resp.text is None


def test_toolless_call_returns_text():
    resp = local.complete(_engine(), [{"role": "user", "content": "hi"}], max_tokens=64)
    assert resp.text == '{"ok": true}'
    assert resp.tool_calls == []
    assert "response_format" not in _FakeLlama.last_kwargs


def test_fit_context_truncates_oversized_prompt():
    huge = "x" * 200_000  # ~50k tokens at 4 bytes/token, over the 8192 window
    local.complete(_engine(), [{"role": "user", "content": huge}], max_tokens=256)
    sent = _FakeLlama.last_kwargs["messages"][0]["content"]
    assert len(sent) < len(huge)
    assert sent.endswith("…[truncated]")
