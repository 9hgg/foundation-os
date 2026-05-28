"""Observation primitives for bounded prompt-safe runtime signals."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass(frozen=True)
class Observation:
    """A bounded prompt-safe signal derived from tool execution."""

    key: str
    tool_name: str
    content: str
    artifact_key: str | None = None
    source_step_id: str | None = None
    phase: Literal["planning", "step"] = "step"
    metadata: dict[str, Any] = field(default_factory=dict)

    def describe_for_prompt(self) -> dict[str, object]:
        """Return prompt-safe observation metadata."""

        return {
            "key": self.key,
            "tool_name": self.tool_name,
            "content": self.content,
            "artifact_key": self.artifact_key,
            "source_step_id": self.source_step_id,
            "phase": self.phase,
            "metadata": self.metadata,
        }
