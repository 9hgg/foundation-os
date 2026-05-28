"""Deterministic preprocessing hooks that enrich the assistant context."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..state.artifacts import Artifact


@dataclass(frozen=True)
class PreprocessorResult:
    """Structured output returned by a context preprocessor."""

    artifacts: list[Artifact]
    hints: dict[str, object]


class ContextPreprocessor(Protocol):
    """Protocol for synchronous context enrichment passes."""

    name: str

    def applies(self, messages: list[dict[str, str]]) -> bool:
        ...

    def run(self, messages: list[dict[str, str]]) -> PreprocessorResult:
        ...


class RegexResourcePreprocessor:
    """Base class for deterministic app/domain-specific enrichers."""

    name = "regex_resource"

    def applies(self, messages: list[dict[str, str]]) -> bool:
        """Return whether this preprocessor should run for the given messages."""

        return False

    def run(self, messages: list[dict[str, str]]) -> PreprocessorResult:
        """Return discovered artifacts and lightweight hints."""

        return PreprocessorResult(artifacts=[], hints={})
