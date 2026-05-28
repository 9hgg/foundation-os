"""Core protocol and value objects for provider-agnostic LLM access."""

from __future__ import annotations

from collections.abc import Sequence
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Protocol


class LLMEmptyResponseError(RuntimeError):
    """Raised when a provider returns no usable content for a completion."""


class LLMConfigurationError(LLMEmptyResponseError):
    """Raised when LLM client configuration is invalid or incomplete."""


@dataclass(frozen=True)
class LLMMessage:
    """Normalized chat message passed to an LLM provider."""

    role: str
    content: str


@dataclass(frozen=True)
class LLMTokenUsage:
    """Normalized token usage for one provider call."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass(frozen=True)
class LLMResponse:
    """Provider response with raw payload preserved for debugging if needed."""

    text: str
    model: str
    raw: object | None = None
    usage: LLMTokenUsage = LLMTokenUsage()


@dataclass(frozen=True)
class EmbeddingResponse:
    """Provider embedding response."""

    embeddings: list[list[float]]
    model: str
    raw: object | None = None


@dataclass(frozen=True)
class LLMTokenUsageSummary:
    """Cumulative token usage across a logical assistant task."""

    request_tokens: int = 0
    response_tokens: int = 0
    total_tokens: int = 0
    request_count: int = 0


_LLM_TOKEN_USAGE_SUMMARY: ContextVar[LLMTokenUsageSummary] = ContextVar(
    "_LLM_TOKEN_USAGE_SUMMARY",
    default=LLMTokenUsageSummary(),
)


def estimate_token_count(text: str) -> int:
    """Return a lightweight fallback token estimate."""

    return max(1, len(text) // 4) if text else 0


def estimate_messages_token_count(messages: Sequence[LLMMessage]) -> int:
    """Estimate token usage for a list of chat messages."""

    return sum(estimate_token_count(f"{message.role}: {message.content}") for message in messages)


def reset_llm_token_usage_summary() -> None:
    """Reset the cumulative token usage tracker for the current context."""

    _LLM_TOKEN_USAGE_SUMMARY.set(LLMTokenUsageSummary())


def record_llm_token_usage(usage: LLMTokenUsage) -> None:
    """Accumulate usage from one provider call into the current-context summary."""

    current = _LLM_TOKEN_USAGE_SUMMARY.get()
    _LLM_TOKEN_USAGE_SUMMARY.set(
        LLMTokenUsageSummary(
            request_tokens=current.request_tokens + usage.prompt_tokens,
            response_tokens=current.response_tokens + usage.completion_tokens,
            total_tokens=current.total_tokens + usage.total_tokens,
            request_count=current.request_count + 1,
        )
    )


def get_llm_token_usage_summary() -> LLMTokenUsageSummary:
    """Return the cumulative token usage for the current context."""

    return _LLM_TOKEN_USAGE_SUMMARY.get()


class LLMClient(Protocol):
    """Low-level LLM transport interface.

    Implement this once for your provider. Keep assistant planning/tool logic out of
    this package.

    This client can be used for multiple models :

    ```python
    client.complete(messages, model=ModelClass.FAST)
    client.complete(messages, model=ModelClass.SMART)
    client.complete(messages, model="claude-opus-4")
    ```

    """

    def complete(
        self,
        messages: Sequence[LLMMessage],
        *,
        model: str | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        ...

    def check(self) -> None:
        """Check that the client is properly configured and can connect to the provider.

        Raises LLMConfigurationError if configuration is invalid or connectivity fails.
        """
        ...


class EmbeddingClient(Protocol):
    """Low-level text embedding interface."""

    def embed(
        self,
        texts: Sequence[str],
        *,
        model: str | None = None,
    ) -> EmbeddingResponse:
        ...

    def check(self) -> None:
        """Check that the client is properly configured and can connect to the provider.

        Raises LLMConfigurationError if configuration is invalid or connectivity fails.
        """
        ...
