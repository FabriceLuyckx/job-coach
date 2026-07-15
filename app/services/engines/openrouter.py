# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""OpenRouter provider — chat completions via the OpenAI SDK.

Centralises client construction (timeouts are always set — a hung model call must
never block a worker thread forever) and maps the OpenAI response into the app's
uniform ``LLMResponse``.
"""

from openai import OpenAI

from app.services.llm import GenerationCancelled, LLMResponse, ToolCall

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def _make_client(api_key: str) -> OpenAI:
    return OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=api_key,
        timeout=120.0,
        max_retries=1,
    )


def complete(engine, messages, *, tools=None, tool_choice=None, max_tokens=None, cancel=None) -> LLMResponse:
    # ponytail: OpenRouter runs remotely (no local CPU load) and the client already
    # caps each call at 120s, so we only honour an already-set cancel here rather
    # than streaming to interrupt mid-flight. The frontend's Cancel stops the wait.
    if cancel is not None and cancel.is_set():
        raise GenerationCancelled()
    client = _make_client(engine.api_key)
    kwargs: dict = {"model": engine.model, "messages": messages}
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    if tools is not None:
        kwargs["tools"] = tools
    if tool_choice is not None:
        kwargs["tool_choice"] = tool_choice

    resp = client.chat.completions.create(**kwargs)

    choices = getattr(resp, "choices", None)
    message = choices[0].message if choices else None
    text = getattr(message, "content", None) if message else None
    raw_calls = getattr(message, "tool_calls", None) if message else None
    calls = [
        ToolCall(name=c.function.name, arguments=c.function.arguments)
        for c in (raw_calls or [])
    ]
    return LLMResponse(text=text, tool_calls=calls)
