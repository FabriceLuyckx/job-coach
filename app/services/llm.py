"""Shared OpenRouter client construction and response validation.

Every LLM call in the app goes through OpenRouter with the OpenAI SDK. This
module centralises client construction (so timeouts are always set — a hung
model call must never block a worker thread forever) and defensive parsing of
tool-call responses (the model occasionally returns no tool call or malformed
JSON; that should surface as a clear, retryable message, not a stack trace).
"""

import json

from openai import OpenAI

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class AIResponseError(ValueError):
    """The model returned something we couldn't parse into the expected shape."""


def make_client(api_key: str) -> OpenAI:
    return OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=api_key,
        timeout=120.0,
        max_retries=1,
    )


def tool_args(response, required: tuple[str, ...] = ()) -> dict:
    """Extract and parse the first tool call's arguments from a chat completion.

    Raises AIResponseError with a user-readable message when the response has no
    tool call, the arguments aren't valid JSON, or a required key is missing.
    """
    choices = getattr(response, "choices", None)
    message = choices[0].message if choices else None
    calls = getattr(message, "tool_calls", None) if message else None
    if not calls:
        raise AIResponseError("The AI returned an unexpected response — please try again.")
    try:
        args = json.loads(calls[0].function.arguments)
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


def message_text(response) -> str:
    """The assistant message's text content, or raise AIResponseError."""
    choices = getattr(response, "choices", None)
    message = choices[0].message if choices else None
    content = getattr(message, "content", None) if message else None
    if not content or not content.strip():
        raise AIResponseError("The AI returned an empty response — please try again.")
    return content.strip()
