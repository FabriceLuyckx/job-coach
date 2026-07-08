"""Engine-abstraction tests: complete() dispatch + response parsing. Run with pytest."""

import pytest

from app import config
from app.services import llm
from app.services.llm import AIResponseError, LLMResponse, ToolCall, message_text, tool_args


def test_complete_dispatches_to_openrouter(monkeypatch):
    captured = {}

    def fake_or_complete(engine, messages, **kw):
        captured["provider"] = engine.provider
        captured["model"] = engine.model
        captured["kw"] = kw
        return LLMResponse(text="hi", tool_calls=[])

    import app.services.engines.openrouter as orouter
    monkeypatch.setattr(orouter, "complete", fake_or_complete)

    resp = llm.complete(
        [{"role": "user", "content": "x"}],
        cfg={"openrouter_api_key": "sk-or-x", "openrouter_model": "m"},
        max_tokens=64,
    )
    assert resp.text == "hi"
    assert captured["provider"] == "openrouter"
    assert captured["model"] == "m"
    assert captured["kw"]["max_tokens"] == 64


def test_complete_raises_without_engine():
    with pytest.raises(ValueError, match="Settings"):
        llm.complete([{"role": "user", "content": "x"}], cfg={"openrouter_api_key": ""})


def test_tool_args_and_message_text_roundtrip():
    r = LLMResponse(text=None, tool_calls=[ToolCall(name="t", arguments='{"a": 1}')])
    assert tool_args(r, required=("a",)) == {"a": 1}
    with pytest.raises(AIResponseError):
        message_text(r)  # no text content
    assert message_text(LLMResponse(text="  hello  ")) == "hello"


def test_engine_config_openrouter_defaults():
    eng = config.require_engine({"openrouter_api_key": "k"})
    assert (eng.provider, eng.api_key, eng.model) == ("openrouter", "k", config.DEFAULT_MODEL)
