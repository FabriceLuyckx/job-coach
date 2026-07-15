"""Provider-neutral LLM interface.

Every AI feature in the app calls :func:`complete`, which resolves the configured
engine (OpenRouter or a local GGUF model) and dispatches to the matching provider
in ``app/services/engines/``. Providers return a uniform :class:`LLMResponse` so
the rest of the app never sees provider-specific response shapes.

``tool_args`` / ``message_text`` defensively parse that uniform response: the model
occasionally returns no tool call or malformed JSON; that should surface as a clear,
retryable message, not a stack trace.
"""

import json
import threading
from contextvars import ContextVar
from dataclasses import dataclass, field


class AIResponseError(ValueError):
    """The model returned something we couldn't parse into the expected shape."""


class GenerationCancelled(Exception):
    """The caller asked to stop this generation (user hit Cancel). Distinct from a
    failure — callers map it to a 'cancelled' job, not an error."""


# The cancel token for the generation running on the current thread. An async job
# worker sets this before calling complete(); complete() forwards it to the engine
# so a Cancel can interrupt a slow local model mid-generation and free the engine.
# A ContextVar (not a plain arg) so it reaches complete() without threading a
# `cancel` param through every service function (tailor, build_guide, …).
current_cancel: ContextVar[threading.Event | None] = ContextVar("current_cancel", default=None)


@dataclass
class ToolCall:
    name: str
    arguments: str  # raw JSON string as emitted by the model


@dataclass
class LLMResponse:
    """Uniform result of an LLM call, independent of provider."""
    text: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)


def complete(
    messages: list[dict],
    *,
    tools: list[dict] | None = None,
    tool_choice: dict | None = None,
    cfg: dict | None = None,
    max_tokens: int | None = None,
    cancel: threading.Event | None = None,
) -> LLMResponse:
    """Run one chat completion against the configured engine.

    Resolves the engine from ``cfg`` (or the persisted config when None) and
    dispatches to the matching provider. Raises ValueError when no engine is
    configured/ready, so threaded callers can surface ``str(e)`` directly.

    ``cancel`` (or the thread's ``current_cancel`` token) lets a Cancel interrupt a
    slow generation and free the engine; the engine raises ``GenerationCancelled``.
    """
    # Imported here to avoid a config → llm import cycle.
    from app import config

    cancel = cancel or current_cancel.get()
    engine = config.require_engine(cfg)
    if engine.provider == "local":
        from app.services.engines import local
        return local.complete(
            engine, messages, tools=tools, tool_choice=tool_choice, max_tokens=max_tokens, cancel=cancel
        )
    from app.services.engines import openrouter
    return openrouter.complete(
        engine, messages, tools=tools, tool_choice=tool_choice, max_tokens=max_tokens, cancel=cancel
    )


def tool_args(response: LLMResponse, required: tuple[str, ...] = ()) -> dict:
    """Extract and parse the first tool call's arguments from an LLMResponse.

    Raises AIResponseError with a user-readable message when the response has no
    tool call, the arguments aren't valid JSON, or a required key is missing.
    """
    calls = response.tool_calls
    if not calls:
        raise AIResponseError("The AI returned an unexpected response — please try again.")
    try:
        args = json.loads(calls[0].arguments)
    except (json.JSONDecodeError, TypeError):
        raise AIResponseError("The AI returned malformed data — please try again.")
    if not isinstance(args, dict):
        raise AIResponseError("The AI returned malformed data — please try again.")
    missing = [k for k in required if k not in args]
    if missing:
        raise AIResponseError(
            f"The AI response was missing fields ({', '.join(missing)}) — please try again."
        )
    return args


def message_text(response: LLMResponse) -> str:
    """The assistant message's text content, or raise AIResponseError."""
    content = response.text
    if not content or not content.strip():
        raise AIResponseError("The AI returned an empty response — please try again.")
    return content.strip()
