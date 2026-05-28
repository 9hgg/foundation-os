"""Minimal abstractions for provider-agnostic LLM calls and structured output."""

from .client import (
    EmbeddingClient,
    EmbeddingResponse,
    LLMClient,
    LLMConfigurationError,
    LLMEmptyResponseError,
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
from .instructor import instructor_query
from .providers import EDFIAGLLMClient, OllamaEmbeddingClient, OllamaLLMClient, OpenAILLMClient
from .structured import structured_completion

__all__ = [
    "EDFIAGLLMClient",
    "EmbeddingClient",
    "EmbeddingResponse",
    "LLMClient",
    "LLMConfigurationError",
    "LLMEmptyResponseError",
    "LLMMessage",
    "LLMResponse",
    "LLMTokenUsage",
    "LLMTokenUsageSummary",
    "OllamaEmbeddingClient",
    "OllamaLLMClient",
    "OpenAILLMClient",
    "estimate_messages_token_count",
    "estimate_token_count",
    "get_llm_token_usage_summary",
    "instructor_query",
    "record_llm_token_usage",
    "reset_llm_token_usage_summary",
    "structured_completion",
]
