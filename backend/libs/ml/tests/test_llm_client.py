"""Tests for libs/ml/llm/client.py — pure utility functions, no HTTP calls."""

from __future__ import annotations

from libs.ml.llm.client import (
    LLMMessage,
    LLMResponse,
    LLMTokenUsage,
    LLMTokenUsageSummary,
    estimate_messages_token_count,
    estimate_token_count,
    get_llm_token_usage_summary,
    record_llm_token_usage,
    reset_llm_token_usage_summary,
)


def test_estimate_token_count_non_empty() -> None:
    assert estimate_token_count("hello world") > 0


def test_estimate_token_count_empty() -> None:
    assert estimate_token_count("") == 0


def test_estimate_token_count_proportional() -> None:
    short = estimate_token_count("hi")
    long = estimate_token_count("hi " * 100)
    assert long > short


def test_estimate_messages_token_count() -> None:
    messages = [
        LLMMessage(role="system", content="You are helpful."),
        LLMMessage(role="user", content="What is the capital of France?"),
    ]
    total = estimate_messages_token_count(messages)
    assert total > 0


def test_llm_message_fields() -> None:
    m = LLMMessage(role="user", content="hello")
    assert m.role == "user"
    assert m.content == "hello"


def test_llm_response_fields() -> None:
    r = LLMResponse(text="answer", model="gpt-4")
    assert r.text == "answer"
    assert r.model == "gpt-4"


def test_llm_token_usage_defaults() -> None:
    u = LLMTokenUsage()
    assert u.prompt_tokens == 0
    assert u.completion_tokens == 0
    assert u.total_tokens == 0


def test_record_and_get_token_usage() -> None:
    reset_llm_token_usage_summary()
    record_llm_token_usage(LLMTokenUsage(prompt_tokens=10, completion_tokens=5, total_tokens=15))
    summary = get_llm_token_usage_summary()
    assert summary.request_tokens == 10
    assert summary.response_tokens == 5
    assert summary.total_tokens == 15
    assert summary.request_count == 1


def test_reset_token_usage_summary() -> None:
    record_llm_token_usage(LLMTokenUsage(prompt_tokens=100, completion_tokens=50, total_tokens=150))
    reset_llm_token_usage_summary()
    summary = get_llm_token_usage_summary()
    assert summary.request_count == 0
    assert summary.total_tokens == 0


def test_accumulate_multiple_calls() -> None:
    reset_llm_token_usage_summary()
    record_llm_token_usage(LLMTokenUsage(prompt_tokens=10, completion_tokens=5, total_tokens=15))
    record_llm_token_usage(LLMTokenUsage(prompt_tokens=20, completion_tokens=8, total_tokens=28))
    summary = get_llm_token_usage_summary()
    assert summary.request_count == 2
    assert summary.request_tokens == 30
    assert summary.response_tokens == 13
