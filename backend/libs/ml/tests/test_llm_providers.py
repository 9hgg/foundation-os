"""Tests for libs/ml/llm/providers.py — LLM client construction and HTTP mocking."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from libs.ml.llm.client import LLMConfigurationError, LLMEmptyResponseError, LLMMessage
from libs.ml.llm.providers import OllamaLLMClient, OpenAILLMClient, _normalize_ollama_usage, _normalize_openai_usage


# ─── _normalize_*_usage helpers ──────────────────────────────────────────────

def test_normalize_ollama_usage_from_payload() -> None:
    usage = _normalize_ollama_usage(
        {"prompt_eval_count": 10, "eval_count": 5},
        [],
        "hello",
    )
    assert usage.prompt_tokens == 10
    assert usage.completion_tokens == 5
    assert usage.total_tokens == 15


def test_normalize_ollama_usage_fallback_estimate() -> None:
    usage = _normalize_ollama_usage({}, [LLMMessage(role="user", content="hi")], "hello")
    assert usage.prompt_tokens > 0
    assert usage.completion_tokens > 0


def test_normalize_openai_usage_from_payload() -> None:
    payload = {"usage": {"prompt_tokens": 20, "completion_tokens": 8, "total_tokens": 28}}
    usage = _normalize_openai_usage(payload, [], "answer")
    assert usage.prompt_tokens == 20
    assert usage.completion_tokens == 8
    assert usage.total_tokens == 28


def test_normalize_openai_usage_fallback() -> None:
    usage = _normalize_openai_usage({}, [LLMMessage(role="user", content="hi")], "answer")
    assert usage.prompt_tokens > 0


# ─── OllamaLLMClient ─────────────────────────────────────────────────────────

def test_ollama_client_defaults() -> None:
    client = OllamaLLMClient()
    assert client.model == "gemma4:e2b"
    assert "11434" in client.base_url or "localhost" in client.base_url


def test_ollama_client_custom_model() -> None:
    client = OllamaLLMClient(model="llama3", base_url="http://localhost:11434/api/chat")
    assert client.model == "llama3"


def test_ollama_client_complete_success() -> None:
    client = OllamaLLMClient(model="test-model", base_url="http://localhost:11434/api/chat")
    raw_response = {"message": {"content": "Paris"}, "prompt_eval_count": 5, "eval_count": 2}

    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps(raw_response).encode()

    mock_conn = MagicMock()
    mock_conn.getresponse.return_value = mock_response

    with patch("http.client.HTTPConnection", return_value=mock_conn):
        result = client.complete([LLMMessage(role="user", content="capital of France?")])

    assert result.text == "Paris"
    assert result.model == "test-model"


def test_ollama_client_raises_on_empty_content() -> None:
    client = OllamaLLMClient(model="m", base_url="http://localhost:11434/api/chat")
    raw_response = {"message": {"content": ""}}

    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps(raw_response).encode()
    mock_conn = MagicMock()
    mock_conn.getresponse.return_value = mock_response

    with patch("http.client.HTTPConnection", return_value=mock_conn):
        with pytest.raises(LLMEmptyResponseError):
            client.complete([LLMMessage(role="user", content="test")])


def test_ollama_client_raises_on_connection_error() -> None:
    client = OllamaLLMClient(model="m", base_url="http://localhost:11434/api/chat")
    mock_conn = MagicMock()
    mock_conn.request.side_effect = OSError("connection refused")

    with patch("http.client.HTTPConnection", return_value=mock_conn):
        with pytest.raises(LLMEmptyResponseError):
            client.complete([LLMMessage(role="user", content="test")])


# ─── OpenAILLMClient ─────────────────────────────────────────────────────────

def test_openai_client_defaults() -> None:
    client = OpenAILLMClient()
    assert client.model == "gpt-5.4-nano"
    assert client.api_key_env == "OPENAI_API_KEY"


def test_openai_client_raises_without_api_key() -> None:
    client = OpenAILLMClient(api_key="", api_key_env="NONEXISTENT_ENV_VAR_XYZ")
    with pytest.raises(LLMConfigurationError):
        client.complete([LLMMessage(role="user", content="test")])


def test_openai_client_complete_success() -> None:
    client = OpenAILLMClient(model="gpt-5.4-nano", api_key="test-key")
    raw_response = {
        "choices": [{"message": {"content": "Berlin"}}],
        "model": "gpt-5.4-nano",
        "usage": {"prompt_tokens": 10, "completion_tokens": 3, "total_tokens": 13},
    }

    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps(raw_response).encode()
    mock_conn = MagicMock()
    mock_conn.getresponse.return_value = mock_response

    with patch("http.client.HTTPSConnection", return_value=mock_conn):
        result = client.complete([LLMMessage(role="user", content="capital of Germany?")])

    assert result.text == "Berlin"
    assert result.model == "gpt-5.4-nano"
    assert result.usage.prompt_tokens == 10


def test_openai_client_raises_on_empty_content() -> None:
    client = OpenAILLMClient(api_key="test-key")
    raw_response = {"choices": [{"message": {"content": ""}}], "model": "gpt-5.4-nano", "usage": {}}

    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps(raw_response).encode()
    mock_conn = MagicMock()
    mock_conn.getresponse.return_value = mock_response

    with patch("http.client.HTTPSConnection", return_value=mock_conn):
        with pytest.raises(LLMEmptyResponseError):
            client.complete([LLMMessage(role="user", content="test")])


def test_openai_client_raises_on_connection_error() -> None:
    client = OpenAILLMClient(api_key="test-key")
    mock_conn = MagicMock()
    mock_conn.request.side_effect = OSError("network error")

    with patch("http.client.HTTPSConnection", return_value=mock_conn):
        with pytest.raises(LLMEmptyResponseError):
            client.complete([LLMMessage(role="user", content="test")])


def test_openai_client_uses_override_model() -> None:
    client = OpenAILLMClient(model="gpt-5.4-nano", api_key="test-key")
    raw_response = {
        "choices": [{"message": {"content": "answer"}}],
        "model": "gpt-4.1",
        "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
    }
    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps(raw_response).encode()
    mock_conn = MagicMock()
    mock_conn.getresponse.return_value = mock_response

    with patch("http.client.HTTPSConnection", return_value=mock_conn):
        result = client.complete([LLMMessage(role="user", content="q")], model="gpt-4.1")

    assert result.model == "gpt-4.1"
