"""Observation storage for bounded prompt-safe runtime signals."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from .models import Observation


@dataclass
class ObservationStore:
    """In-memory store of observations, keyed by observation name."""

    _items: dict[str, Observation] = field(default_factory=dict)

    def put(self, observation: Observation) -> Observation:
        self._items[observation.key] = observation
        return observation

    def get(self, key: str) -> Observation:
        return self._items[key]

    def all(self) -> list[Observation]:
        return list(self._items.values())

    def describe_for_prompt(
        self,
        *,
        phase: Literal["planning", "step"] | None = None,
        source_step_id: str | None = None,
        exclude_source_step_id: str | None = None,
    ) -> list[dict[str, object]]:
        return [
            observation.describe_for_prompt()
            for observation in self.all()
            if (phase is None or observation.phase == phase)
            and (source_step_id is None or observation.source_step_id == source_step_id)
            and (
                exclude_source_step_id is None
                or observation.source_step_id != exclude_source_step_id
            )
        ]

    def create(
        self,
        *,
        key: str,
        tool_name: str,
        content: str,
        artifact_key: str | None = None,
        source_step_id: str | None = None,
        phase: Literal["planning", "step"] = "step",
        metadata: dict[str, Any] | None = None,
    ) -> Observation:
        observation = Observation(
            key=key,
            tool_name=tool_name,
            content=content,
            artifact_key=artifact_key,
            source_step_id=source_step_id,
            phase=phase,
            metadata=metadata or {},
        )
        self._items[key] = observation
        return observation
