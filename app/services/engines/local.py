# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Local GGUF inference provider (llama-cpp-python).

Runs the downloaded model in-process. Two design points make a 4B model reliable
and safe here:

* **Schema-forced JSON, not native tool calls.** For a forced-tool request we pass
  the tool's JSON-schema as ``response_format={"type": "json_object", "schema": …}``
  so llama.cpp compiles it to a grammar and the model can only emit schema-valid
  JSON. The result is wrapped as a single ToolCall so the rest of the app is
  provider-agnostic.
* **Serialized access.** llama.cpp is not thread-safe; a module-level lock means
  concurrent API requests queue rather than corrupt the context. The model is
  loaded lazily on first use and kept resident.

Context overflow is guarded by trimming the longest message to fit ``n_ctx`` minus
the reply budget, so an oversized profile/posting degrades instead of crashing.
"""

import threading

from app.services.engines.registry import get_model, local_model_path
from app.services.llm import GenerationCancelled, LLMResponse, ToolCall

# Loaded model + the id it was loaded for, so a model switch reloads.
_llm = None
_llm_model_id: str | None = None
_lock = threading.Lock()

# Reserve this many tokens of the context window for the model's reply when the
# caller doesn't cap max_tokens.
_DEFAULT_REPLY_BUDGET = 1024


def _load(model_id: str):
    """Return a resident Llama for the given registry id, loading it if needed.
    Caller must hold _lock."""
    global _llm, _llm_model_id
    if _llm is not None and _llm_model_id == model_id:
        return _llm

    try:
        from llama_cpp import Llama
    except ImportError as e:
        raise RuntimeError(
            "The local AI engine isn't installed. Reinstall with the local extra "
            "(uv sync --extra local) or use the OpenRouter engine in Settings."
        ) from e

    entry = get_model(model_id)
    path = local_model_path(model_id)
    if entry is None or path is None or not path.exists():
        raise RuntimeError("Local AI model not downloaded yet — finish setup in Settings.")

    if _llm is not None:
        # Free the previously loaded model before swapping.
        _llm = None

    _llm = Llama(
        model_path=str(path),
        n_ctx=entry.get("n_ctx", 8192),
        n_gpu_layers=-1,   # offload all layers to GPU (Metal); ignored on CPU builds
        verbose=False,
    )
    _llm_model_id = model_id
    return _llm


def _forced_tool(tools, tool_choice):
    """Return the tool dict named by a forced tool_choice, or None."""
    if not tools or not tool_choice:
        return None
    name = (tool_choice.get("function") or {}).get("name")
    for t in tools:
        if (t.get("function") or {}).get("name") == name:
            return t
    return None


def _fit_context(llm, messages, reply_budget):
    """Trim the longest message's content so the prompt fits the context window.

    A rough token estimate via llama.tokenize(); if the prompt is too long we cut
    the tail of the biggest message (profiles/postings front-load their signal).
    Returns a possibly-modified copy of messages.
    """
    n_ctx = llm.n_ctx()
    budget = max(256, n_ctx - reply_budget)

    def count(msgs):
        text = "\n".join(m.get("content", "") or "" for m in msgs)
        return len(llm.tokenize(text.encode("utf-8", "ignore"), add_bos=False))

    msgs = [dict(m) for m in messages]
    total = count(msgs)
    if total <= budget:
        return msgs

    # Trim the longest message repeatedly until it fits (or nothing left to cut).
    for _ in range(8):
        idx = max(range(len(msgs)), key=lambda i: len(msgs[i].get("content", "") or ""))
        content = msgs[idx].get("content", "") or ""
        if len(content) < 200:
            break
        over = total - budget
        # ~4 chars/token heuristic, with headroom, capped at 90% of the message.
        cut = min(int(over * 4 * 1.2), int(len(content) * 0.9))
        msgs[idx]["content"] = content[: len(content) - cut] + "\n…[truncated]"
        total = count(msgs)
        if total <= budget:
            break
    return msgs


def _stream_content(llm, kwargs: dict, cancel: threading.Event) -> str:
    """Generate with streaming so the model can be interrupted mid-flight: each
    chunk is one step of compute, so checking `cancel` between chunks and stopping
    is a real interrupt (frees the engine within ~one token). Used only when a
    cancel token is present — otherwise the plain non-streaming call is simpler."""
    parts: list[str] = []
    stream = llm.create_chat_completion(**kwargs, stream=True)
    try:
        for chunk in stream:
            if cancel.is_set():
                raise GenerationCancelled()
            delta = (chunk.get("choices") or [{}])[0].get("delta") or {}
            piece = delta.get("content")
            if piece:
                parts.append(piece)
    finally:
        close = getattr(stream, "close", None)
        if close:
            close()  # stop llama.cpp advancing the (abandoned) generator
    return "".join(parts)


def complete(engine, messages, *, tools=None, tool_choice=None, max_tokens=None, cancel=None) -> LLMResponse:
    if cancel is not None and cancel.is_set():
        raise GenerationCancelled()
    with _lock:
        if cancel is not None and cancel.is_set():
            # Cancelled while queued behind another job — skip generation entirely.
            raise GenerationCancelled()
        llm = _load(engine.local_model_id)

        reply_budget = max_tokens or _DEFAULT_REPLY_BUDGET
        msgs = _fit_context(llm, messages, reply_budget)

        kwargs: dict = {"messages": msgs, "max_tokens": reply_budget, "temperature": 0.3}

        tool = _forced_tool(tools, tool_choice)
        if tool is not None:
            fn = tool["function"]
            schema = fn.get("parameters") or {"type": "object"}
            # Nudge the model with the tool's intent, then constrain output to its schema.
            desc = fn.get("description") or ""
            if desc and msgs and msgs[0].get("role") == "system":
                msgs[0] = {**msgs[0], "content": f"{msgs[0]['content']}\n\nRespond with JSON: {desc}"}
            kwargs["response_format"] = {"type": "json_object", "schema": schema}

        if cancel is not None:
            content = _stream_content(llm, kwargs, cancel)
        else:
            resp = llm.create_chat_completion(**kwargs)
            content = ((resp.get("choices") or [{}])[0].get("message") or {}).get("content")

    if tool is not None:
        # The whole content is the schema-constrained JSON object.
        return LLMResponse(text=None, tool_calls=[ToolCall(name=tool["function"]["name"],
                                                           arguments=content or "{}")])
    return LLMResponse(text=content, tool_calls=[])
