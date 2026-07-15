"""detect_language: code validation + fallback. Run with: uv run pytest"""

from app.services import cv_generator
from app.services.llm import LLMResponse, ToolCall


def _fake_complete(lang_value):
    def _complete(messages, **kwargs):
        return LLMResponse(tool_calls=[ToolCall(name="detected_language",
                                                arguments=f'{{"lang": "{lang_value}"}}')])
    return _complete


def test_valid_code_passes_through(monkeypatch):
    monkeypatch.setattr(cv_generator, "complete", _fake_complete("NL"))
    assert cv_generator.detect_language("http://x", cfg={}, job_text="Vacature ...") == "nl"


def test_bad_code_falls_back_to_en(monkeypatch):
    # Non-alpha / wrong-length codes must not leak through.
    monkeypatch.setattr(cv_generator, "complete", _fake_complete("12"))
    assert cv_generator.detect_language("http://x", cfg={}, job_text="...") == "en"
    monkeypatch.setattr(cv_generator, "complete", _fake_complete(""))
    assert cv_generator.detect_language("http://x", cfg={}, job_text="...") == "en"
