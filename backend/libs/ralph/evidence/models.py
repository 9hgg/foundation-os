"""Evidence primitives for artifact-grounded reasoning."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from libs.ralph.state.artifacts import render_prompt_safe_value
from libs.utils.types import BaseModelWithConfig


@dataclass(frozen=True)
class Evidence:
    """A deliberate, replayable extraction over an artifact."""

    key: str
    artifact_key: str
    kind: Literal["property", "filter", "comparison"]
    expression: str
    value: Any
    name: str | None = None
    description: str | None = None
    source_step_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def display(self) -> str:
        """Render the consciously extracted value for judge prompts."""

        return render_prompt_safe_value(self.value)

    def describe_for_prompt(self) -> dict[str, object]:
        """Return prompt-safe evidence metadata and display value."""

        return {
            "key": self.key,
            "artifact_key": self.artifact_key,
            "kind": self.kind,
            "name": self.name,
            "description": self.description,
            "expression": self.expression,
            "source_step_id": self.source_step_id,
            "display": self.display(),
        }


class EvidenceReceipt(BaseModelWithConfig):
    """Structured response returned by the create_evidence tool."""

    key: str
    artifact_key: str
    kind: str
    name: str | None = None
    description: str | None = None
    expression: str
    display: str
