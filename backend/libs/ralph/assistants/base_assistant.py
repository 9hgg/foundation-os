"""Top-level assistant facade used by callers embedding the Ralph runtime."""

from __future__ import annotations

from dataclasses import dataclass

from libs.ml.llm import LLMClient

from ..context.auto_context import AutoContextBuilder
from ..execution.runner import AssistantRunner
from ..state.artifacts import Artifact
from ..state.plan_models import ObjectiveAnswer
from ..tracing import TRACE


@dataclass
class Assistant:
    """Thin convenience wrapper around :class:`AssistantRunner`."""

    client: LLMClient
    context_builder: AutoContextBuilder

    def run(
        self,
        messages: list[dict[str, str]],
        *,
        base_artifacts: list[Artifact] | None = None,
    ) -> ObjectiveAnswer:
        """Execute the end-to-end assistant loop for a conversation."""

        TRACE.kv(
            "ASSISTANT RUN",
            [("messages", len(messages)), ("base_artifacts", len(base_artifacts or []))],
            style="magenta",
        )
        return AssistantRunner(
            self.client,
            context_builder=self.context_builder,
        ).run(messages, base_artifacts=base_artifacts)
