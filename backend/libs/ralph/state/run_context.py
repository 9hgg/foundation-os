"""Mutable runtime state shared across planning and execution."""

from __future__ import annotations

from dataclasses import dataclass, field

from ..context.auto_context import AssistantAutoContext
from ..evidence import EvidenceStore
from ..observations import ObservationStore
from .plan_models import Plan, StepResult


@dataclass
class AssistantRunContext:
    """All state accumulated while servicing a single assistant request."""

    messages: list[dict[str, str]]
    auto_context: AssistantAutoContext
    plan: Plan | None = None
    step_results: list[StepResult] = field(default_factory=list)
    replanning_failures: list[dict[str, object]] = field(default_factory=list)
    tool_call_signatures: dict[str, dict[str, dict[str, object]]] = field(default_factory=dict)
    plan_attempt: int = 1
    current_step_id: str | None = None
    evidences: EvidenceStore = field(default_factory=EvidenceStore)
    observations: ObservationStore = field(default_factory=ObservationStore)
    llm_token_usage: dict[str, object] | None = None

    @property
    def artifacts(self):
        """Expose the shared runtime artifact store."""

        return self.auto_context.artifacts
