"""Helpers for turning free-form LLM output into validated Pydantic models."""

import json
import logging
from collections.abc import Sequence
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from libs.ml.llm.schema_rendering import compact_json_schema
from libs.ml.tracing import TRACE

from .client import (
    LLMClient,
    LLMConfigurationError,
    LLMEmptyResponseError,
    LLMMessage,
    LLMResponse,
    estimate_messages_token_count,
    record_llm_token_usage,
)

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger(__name__)


class StructuredCompletionError(ValueError):
    """Raised when structured completion cannot be validated after all retries."""

    def __init__(self, schema_name: str) -> None:
        super().__init__(f"Could not parse structured LLM response as {schema_name}")


def _simplify_validation_error(exc: Exception) -> str:
    """Extract the human-readable core from a pydantic or JSON validation error."""

    lines = []
    for line in str(exc).splitlines():
        stripped = line.strip()
        if stripped.startswith("For further information visit"):
            continue
        if "[type=" in stripped:
            stripped = stripped[: stripped.index("[type=")].rstrip()
        if stripped:
            lines.append(stripped)
    result = "\n".join(lines)
    if "key must be a string" in result:
        result += '\nNote: all JSON keys must be quoted strings — write {"key": value}, not {key: value}.'
    return result


def _make_validation_retry_message(exc: Exception, last_response_text: str | None) -> str:
    """Build a follow-up message that shows the failing output alongside a clean error."""

    error_summary = _simplify_validation_error(exc)
    if last_response_text:
        preview = last_response_text if len(last_response_text) <= 500 else f"{last_response_text[:500]}...<truncated>"
        return (
            f"Your previous response:\n{preview}\n\n"
            f"The above was invalid. Return corrected JSON only.\n"
            f"Error: {error_summary}"
        )
    return f"The previous output was invalid. Return corrected JSON only.\nError: {error_summary}"


_SCHEMA_PREFIX = "Return only valid JSON matching this expected output schema: "


def _format_request_messages(messages: Sequence[LLMMessage]) -> str:
    """Render request messages in a readable log-friendly layout."""

    rendered: list[str] = []
    for index, message in enumerate(messages):
        content = message.content.strip()
        if message.role == "system" and content.startswith(_SCHEMA_PREFIX):
            schema_text = content.removeprefix(_SCHEMA_PREFIX).strip()
            rendered.append(f"Expected output schema of your response:\n{schema_text}")
            continue
        if message.role == "user":
            label = "Your objective" if index == 0 else "Follow-up instruction"
            rendered.append(f"{label}:\n{content or '<empty>'}")
            continue
        if message.role == "system":
            rendered.append(f"System instruction:\n{content or '<empty>'}")
            continue
        rendered.append(f"{message.role}:\n{content or '<empty>'}")
    return "\n\n".join(rendered)


def _log_llm_messages(messages: Sequence[LLMMessage], *, model: str | None, attempt: int) -> None:
    """Print the exact message list sent to the model for one attempt."""

    formatted_messages = _format_request_messages(messages)
    logger.debug(
        "LLM REQUEST - model=%r - attempt=%d\n%s",
        model,
        attempt,
        formatted_messages,
    )
    TRACE.text_block(
        f"LLM REQUEST - model={model!r} - attempt={attempt}",
        formatted_messages,
        style="blue",
    )
    token_estimate = estimate_messages_token_count(messages)
    logger.debug("request tokens: ~%d", token_estimate)
    TRACE.line(f"request tokens: ~{token_estimate}", style="blue")


def _log_llm_response(response: LLMResponse, *, attempt: int) -> None:
    """Print the raw text returned by the model for one attempt."""

    logger.debug(
        "LLM RESPONSE - model=%r - attempt=%d\n%s",
        response.model,
        attempt,
        response.text,
    )
    TRACE.text_block(
        f"LLM RESPONSE - model={response.model!r} - attempt={attempt}",
        response.text,
        style="blue",
    )
    token_line = (
        "response tokens: "
        f"{response.usage.completion_tokens} | "
        f"request tokens: {response.usage.prompt_tokens} | "
        f"total tokens: {response.usage.total_tokens}"
    )
    logger.debug(token_line)
    TRACE.line(token_line, style="blue")


def _find_balanced_json_block(text: str) -> str | None:
    """Return the first balanced JSON object or array found in ``text``."""

    start: int | None = None
    stack: list[str] = []
    in_string = False
    escape = False

    for index, char in enumerate(text):
        if char == '"' and not escape:
            in_string = not in_string

        if in_string:
            escape = char == "\\" and not escape
            continue

        if char in "{[":
            if start is None:
                start = index
            stack.append("}" if char == "{" else "]")
        elif char in "}]" and stack and char == stack[-1]:
            stack.pop()
            if start is not None and not stack:
                candidate = text[start : index + 1]
                try:
                    json.loads(candidate)
                except json.JSONDecodeError:
                    start = None
                else:
                    return candidate

        escape = False

    return None


def _repair_structural_json(text: str) -> str:
    """Repair small structural JSON issues such as mismatched closers."""

    chars = list(text)
    stack: list[str] = []
    in_string = False
    escape = False

    for index, char in enumerate(chars):
        if char == '"' and not escape:
            in_string = not in_string
        if in_string:
            escape = char == "\\" and not escape
            continue

        if char == "{":
            stack.append("}")
        elif char == "[":
            stack.append("]")
        elif char in "}]":
            if stack:
                expected = stack[-1]
                if char == expected:
                    stack.pop()
                else:
                    chars[index] = expected
                    stack.pop()
            else:
                chars[index] = ""

        escape = False

    repaired = "".join(chars)
    repaired = repaired.replace(",}", "}").replace(",]", "]")
    if stack:
        repaired = f"{repaired}{''.join(reversed(stack))}"
    return repaired


def _repair_unquoted_keys(text: str) -> str:
    """Quote bare identifier keys in a JSON-like string, leaving string values untouched."""

    result: list[str] = []
    i = 0
    in_string = False
    escape = False
    expect_key = False

    while i < len(text):
        char = text[i]

        if escape:
            result.append(char)
            escape = False
            i += 1
            continue

        if char == "\\" and in_string:
            result.append(char)
            escape = True
            i += 1
            continue

        if char == '"':
            in_string = not in_string
            result.append(char)
            i += 1
            if not in_string:
                expect_key = False
            continue

        if in_string:
            result.append(char)
            i += 1
            continue

        if char == "{":
            expect_key = True
            result.append(char)
            i += 1
            continue

        if char == ",":
            expect_key = True
            result.append(char)
            i += 1
            continue

        if char in "}]":
            expect_key = False
            result.append(char)
            i += 1
            continue

        if char == "[":
            expect_key = False
            result.append(char)
            i += 1
            continue

        if expect_key and (char.isalpha() or char == "_"):
            j = i
            while j < len(text) and (text[j].isalnum() or text[j] == "_"):
                j += 1
            k = j
            while k < len(text) and text[k] == " ":
                k += 1
            if k < len(text) and text[k] == ":":
                result.append('"')
                result.extend(text[i:j])
                result.append('"')
                i = j
                expect_key = False
                continue

        result.append(char)
        i += 1

    return "".join(result)


def _try_load(text: str) -> str | None:
    """Return text unchanged if it parses as valid JSON, else None."""

    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        return None


def _normalize_json_text(text: str) -> str:
    """Extract the first valid JSON object or array from a model response."""

    normalized = text.strip()
    if not normalized:
        return normalized

    if normalized.startswith("```"):
        lines = normalized.splitlines()
        if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].strip() == "```":
            normalized = "\n".join(lines[1:-1]).strip()

    key_repaired = _repair_unquoted_keys(normalized)
    candidates = [normalized, key_repaired, _repair_structural_json(key_repaired)]
    for candidate in candidates:
        if (result := _try_load(candidate) or _find_balanced_json_block(candidate)) is not None:
            return result

    return normalized


def structured_completion(
    client: LLMClient,
    messages: Sequence[LLMMessage],
    schema: type[T],
    *,
    model: str | None = None,
    retries: int = 2,
    temperature: float = 0.0,
) -> T:
    """Request JSON from the model, retrying until it validates against ``schema``."""

    TRACE.kv(
        "STRUCTURED COMPLETION",
        [
            ("schema", schema.__name__),
            ("model", model),
            ("messages", len(messages)),
            ("retries", retries),
        ],
        style="magenta",
    )
    schema_hint = schema.model_json_schema()
    compact_schema_hint = compact_json_schema(schema_hint)
    augmented = [
        *messages,
        LLMMessage(
            role="system",
            content=_SCHEMA_PREFIX + compact_schema_hint,
        ),
    ]

    last_error: Exception | None = None
    last_response_text: str | None = None
    for attempt in range(retries + 1):
        with TRACE.section(f"LLM ATTEMPT {attempt + 1}/{retries + 1} - {schema.__name__}", style="cyan"):
            _log_llm_messages(augmented, model=model, attempt=attempt + 1)
            logger.debug("attempt %d/%d schema=%s ~%d tokens", attempt + 1, retries + 1, schema.__name__, estimate_messages_token_count(augmented))
            try:
                response = client.complete(
                    augmented,
                    model=model,
                    temperature=temperature,
                )
                last_response_text = response.text
                _log_llm_response(response, attempt=attempt + 1)
                # Record token usage in the context
                record_llm_token_usage(response.usage)
                normalized_text = _normalize_json_text(response.text)
                parsed = schema.model_validate_json(normalized_text)
                logger.info("✓ %s  in=%d out=%d total=%d", response.model, response.usage.prompt_tokens, response.usage.completion_tokens, response.usage.total_tokens)
                if normalized_text != response.text:
                    TRACE.line(
                        f"extracted JSON block from model response for schema={schema.__name__}",
                        style="cyan",
                    )
                TRACE.line(
                    f"structured_completion parsed schema={schema.__name__} model={response.model!r}",
                    style="green",
                )
            except LLMConfigurationError:
                raise
            except LLMEmptyResponseError as exc:
                last_error = exc
                last_response_text = None
                logger.warning("empty response for %s, retrying", schema.__name__)
                TRACE.line(
                    f"structured_completion got empty response for {schema.__name__}, retrying",
                    style="yellow",
                )
                augmented = [
                    *augmented,
                    LLMMessage(
                        role="user",
                        content=(
                            "The previous output was empty. Return valid JSON only and do not omit the response body."
                        ),
                    ),
                ]
            except (ValidationError, ValueError, json.JSONDecodeError) as exc:
                last_error = exc
                # Still record tokens even if validation failed - we got a response
                if isinstance(exc, (ValidationError, ValueError, json.JSONDecodeError)):
                    try:
                        record_llm_token_usage(response.usage)
                    except NameError:
                        pass  # response may not be defined if error occurred earlier
                logger.warning("validation failed for %s: %s", schema.__name__, exc)
                TRACE.line(
                    f"structured_completion validation failed for {schema.__name__}: {exc}",
                    style="yellow",
                )
                augmented = [
                    *augmented,
                    LLMMessage(
                        role="user",
                        content=_make_validation_retry_message(exc, last_response_text),
                    ),
                ]
            else:
                return parsed

    TRACE.line(
        f"structured_completion exhausted retries for schema={schema.__name__}",
        style="red",
    )
    raise StructuredCompletionError(schema.__name__) from last_error
