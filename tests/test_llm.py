# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Engine-abstraction tests: complete() dispatch + response parsing. Run with pytest."""

import pytest

from app import config
from app.services import llm
from app.services.engines.remote import PRESETS
from app.services.llm import AIResponseError, LLMResponse, ToolCall, message_text, tool_args


def test_complete_dispatches_to_remote(monkeypatch):
    captured = {}

    def fake_remote_complete(engine, messages, **kw):
        captured["provider"] = engine.provider
        captured["model"] = engine.model
        captured["kw"] = kw
        return LLMResponse(text="hi", tool_calls=[])

    import app.services.engines.remote as remote
    monkeypatch.setattr(remote, "complete", fake_remote_complete)

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
    assert (eng.provider, eng.api_key, eng.model) == (
        "openrouter", "k", PRESETS["openrouter"]["default_model"])


# ---------- provider presets ----------

@pytest.mark.parametrize("provider", ["anthropic", "openai", "gemini"])
def test_require_engine_resolves_each_preset(provider):
    eng = config.require_engine({"llm_provider": provider, f"{provider}_api_key": "k"})
    assert eng.provider == provider
    assert eng.api_key == "k"
    assert eng.base_url == PRESETS[provider]["base_url"]
    # An empty model falls back to the preset's default, not to OpenRouter's.
    assert eng.model == PRESETS[provider]["default_model"]


@pytest.mark.parametrize("provider", ["anthropic", "openai", "gemini"])
def test_require_engine_names_the_selected_provider_when_key_missing(provider):
    # An OpenRouter key must not make another provider look ready.
    cfg = {"llm_provider": provider, "openrouter_api_key": "sk-or-x"}
    with pytest.raises(ValueError, match=config.provider_label(provider)):
        config.require_engine(cfg)


def test_require_engine_keeps_each_providers_own_model():
    cfg = {"llm_provider": "openai", "openai_api_key": "k", "openai_model": "gpt-x",
           "openrouter_model": "anthropic/claude-sonnet-5"}
    assert config.require_engine(cfg).model == "gpt-x"


def test_require_engine_custom_requires_base_url():
    with pytest.raises(ValueError, match="server address"):
        config.require_engine({"llm_provider": "custom", "custom_api_key": "k"})


def test_require_engine_custom_allows_blank_key():
    # Self-hosted servers (Ollama, LM Studio) often require no key at all.
    eng = config.require_engine(
        {"llm_provider": "custom", "custom_base_url": "http://localhost:11434/v1",
         "custom_model": "llama3"})
    assert (eng.base_url, eng.api_key, eng.model) == ("http://localhost:11434/v1", "", "llama3")


def test_require_engine_rejects_unknown_provider():
    with pytest.raises(ValueError, match="Unknown AI provider"):
        config.require_engine({"llm_provider": "nope", "nope_api_key": "k"})


# ---------- remote.complete() request shaping ----------

class _FakeCompletions:
    def __init__(self, sink):
        self.sink = sink

    def create(self, **kwargs):
        self.sink.update(kwargs)
        return type("Resp", (), {"choices": []})()


def _fake_openai(sink):
    def factory(**client_kwargs):
        sink["client"] = client_kwargs
        chat = type("Chat", (), {"completions": _FakeCompletions(sink)})()
        return type("Client", (), {"chat": chat})()
    return factory


def _call(monkeypatch, provider, **kw):
    from app.services.engines import remote
    sink: dict = {}
    monkeypatch.setattr(remote, "OpenAI", _fake_openai(sink))
    engine = config.EngineConfig(
        provider=provider, api_key="k", model="m",
        base_url=PRESETS[provider]["base_url"] or "http://localhost:11434/v1")
    remote.complete(engine, [{"role": "user", "content": "x"}], **kw)
    return sink


def test_remote_uses_the_engines_base_url(monkeypatch):
    sink = _call(monkeypatch, "gemini")
    assert sink["client"]["base_url"] == PRESETS["gemini"]["base_url"]
    assert sink["client"]["api_key"] == "k"


def test_remote_anthropic_always_sends_max_tokens(monkeypatch):
    # Anthropic's endpoint rejects a request without it, and most calls pass none.
    sink = _call(monkeypatch, "anthropic")
    assert sink["max_tokens"] == PRESETS["anthropic"]["default_max_tokens"]


def test_remote_caller_max_tokens_wins(monkeypatch):
    sink = _call(monkeypatch, "anthropic", max_tokens=123)
    assert sink["max_tokens"] == 123


def test_remote_openai_renames_the_max_tokens_param(monkeypatch):
    sink = _call(monkeypatch, "openai", max_tokens=99)
    assert sink["max_completion_tokens"] == 99
    assert "max_tokens" not in sink


def test_remote_omits_max_tokens_when_preset_has_no_default(monkeypatch):
    sink = _call(monkeypatch, "openrouter")
    assert "max_tokens" not in sink


def test_remote_sends_a_placeholder_key_for_keyless_servers(monkeypatch):
    from app.services.engines import remote
    sink: dict = {}
    monkeypatch.setattr(remote, "OpenAI", _fake_openai(sink))
    engine = config.EngineConfig(provider="custom", api_key="", model="llama3",
                                 base_url="http://localhost:11434/v1")
    remote.complete(engine, [{"role": "user", "content": "x"}])
    assert sink["client"]["api_key"]  # the SDK requires a non-empty string
