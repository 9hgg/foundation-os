"""Tests for libs/ml/llm/structured.py — JSON parsing and structured_completion."""

from __future__ import annotations

import pytest
from pydantic import BaseModel

from libs.ml.llm.client import LLMMessage, LLMResponse, LLMTokenUsage
from libs.ml.llm.structured import (
    StructuredCompletionError,
    _find_balanced_json_block,
    _normalize_json_text,
    _simplify_validation_error,
    structured_completion,
)


# ─── Fake client ──────────────────────────────────────────────────────────────

class _FakeLLMClient:
    model = "fake-model"

    def __init__(self, response_text: str) -> None:
        self.response_text = response_text

    def complete(
        self,
        messages,
        *,
        model=None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        return LLMResponse(
            text=self.response_text,
            model=self.model,
            usage=LLMTokenUsage(prompt_tokens=5, completion_tokens=3, total_tokens=8),
        )


# ─── Schema used in tests ─────────────────────────────────────────────────────

class _Point(BaseModel):
    x: int
    y: int


class _Named(BaseModel):
    name: str
    score: float | None = None


# ─── _find_balanced_json_block ────────────────────────────────────────────────

def test_find_balanced_json_object() -> None:
    text = 'Some preamble {"key": 1} trailing text'
    result = _find_balanced_json_block(text)
    assert result == '{"key": 1}'


def test_find_balanced_json_array() -> None:
    text = "prefix [1, 2, 3] suffix"
    result = _find_balanced_json_block(text)
    assert result == "[1, 2, 3]"


def test_find_balanced_json_nested() -> None:
    text = '{"outer": {"inner": 42}}'
    result = _find_balanced_json_block(text)
    assert result == '{"outer": {"inner": 42}}'


def test_find_balanced_json_none_when_absent() -> None:
    result = _find_balanced_json_block("no json here at all")
    assert result is None


# ─── _normalize_json_text ─────────────────────────────────────────────────────

def test_normalize_plain_json() -> None:
    result = _normalize_json_text('{"x": 1}')
    assert result == '{"x": 1}'


def test_normalize_strips_markdown_fences() -> None:
    text = "```json\n{\"x\": 1}\n```"
    result = _normalize_json_text(text)
    assert '"x"' in result


def test_normalize_extracts_from_preamble() -> None:
    text = 'Here is the result: {"x": 99}'
    result = _normalize_json_text(text)
    assert "99" in result


def test_normalize_empty_returns_empty() -> None:
    assert _normalize_json_text("") == ""


# ─── _simplify_validation_error ───────────────────────────────────────────────

def test_simplify_removes_info_urls() -> None:
    exc = Exception("some error\nFor further information visit https://example.com")
    result = _simplify_validation_error(exc)
    assert "further information" not in result


def test_simplify_keeps_core_message() -> None:
    exc = Exception("value is not a valid integer")
    result = _simplify_validation_error(exc)
    assert "value is not a valid integer" in result


# ─── structured_completion ────────────────────────────────────────────────────

def test_structured_completion_happy_path() -> None:
    client = _FakeLLMClient('{"x": 3, "y": 7}')
    messages = [LLMMessage(role="user", content="give me a point")]
    result = structured_completion(client, messages, _Point)
    assert result.x == 3
    assert result.y == 7


def test_structured_completion_with_preamble() -> None:
    client = _FakeLLMClient('Here is the answer: {"x": 1, "y": 2}')
    messages = [LLMMessage(role="user", content="give me a point")]
    result = structured_completion(client, messages, _Point)
    assert result.x == 1
    assert result.y == 2


def test_structured_completion_with_markdown_fences() -> None:
    client = _FakeLLMClient('```json\n{"x": 5, "y": 6}\n```')
    messages = [LLMMessage(role="user", content="point")]
    result = structured_completion(client, messages, _Point)
    assert result.x == 5
    assert result.y == 6


def test_structured_completion_optional_field() -> None:
    client = _FakeLLMClient('{"name": "alice"}')
    messages = [LLMMessage(role="user", content="name")]
    result = structured_completion(client, messages, _Named)
    assert result.name == "alice"
    assert result.score is None


def test_structured_completion_raises_after_all_retries() -> None:
    client = _FakeLLMClient("this is not json at all, no braces")
    messages = [LLMMessage(role="user", content="test")]
    with pytest.raises(StructuredCompletionError):
        structured_completion(client, messages, _Point, retries=1)


def test_structured_completion_schema_name_in_error() -> None:
    client = _FakeLLMClient("garbage")
    with pytest.raises(StructuredCompletionError, match="_Point"):
        structured_completion(client, [LLMMessage(role="user", content="test")], _Point, retries=0)


def test_instructor_query_happy_path() -> None:
    from libs.ml.llm.instructor import instructor_query
    client = _FakeLLMClient('{"x": 10, "y": 20}')
    result = instructor_query(client, "give me a point", _Point)
    assert result.x == 10
    assert result.y == 20


def test_instructor_query_raises_on_bad_response() -> None:
    from libs.ml.llm.instructor import instructor_query
    client = _FakeLLMClient("not json")
    with pytest.raises(Exception):
        instructor_query(client, "give me a point", _Point, retries=1)


def test_structured_completion_retries_on_bad_response() -> None:
    call_count = 0

    class _RetryClient:
        model = "retry-model"

        def complete(self, messages, *, model=None, temperature=0.0) -> LLMResponse:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return LLMResponse(text="not json", model=self.model)
            return LLMResponse(text='{"x": 1, "y": 2}', model=self.model)

    result = structured_completion(_RetryClient(), [LLMMessage(role="user", content="test")], _Point, retries=2)
    assert result.x == 1
    assert call_count == 2
