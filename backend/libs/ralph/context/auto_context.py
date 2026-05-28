"""Automatic context assembly for assistant runs."""

from __future__ import annotations

from dataclasses import dataclass, field

from ..state.artifacts import Artifact, ArtifactStore
from ..tracing import TRACE
from .preprocessors import ContextPreprocessor


@dataclass
class AssistantAutoContext:
    """Context discovered before planning begins."""

    artifacts: ArtifactStore = field(default_factory=ArtifactStore)
    frontend_routes: list[str] = field(default_factory=list)
    frontend_route_details: list[dict[str, object]] = field(default_factory=list)
    system_metadata: dict[str, object] = field(default_factory=dict)
    hints: dict[str, object] = field(default_factory=dict)
    custom_instructions: list[str] = field(default_factory=list)


class AutoContextBuilder:
    """Builds sparse runtime context from messages and deterministic preprocessors."""

    def __init__(
        self,
        *,
        preprocessors: list[ContextPreprocessor] | None = None,
        frontend_routes: list[str] | None = None,
        frontend_route_details: list[dict[str, object]] | None = None,
        system_metadata: dict[str, object] | None = None,
        custom_instructions: list[str] | None = None,
    ) -> None:
        self.preprocessors = preprocessors or []
        self.frontend_routes = frontend_routes or []
        self.frontend_route_details = frontend_route_details or []
        self.system_metadata = system_metadata or {}
        self.custom_instructions = custom_instructions or []

    def build(
        self,
        messages: list[dict[str, str]],
        *,
        base_artifacts: list[Artifact] | None = None,
    ) -> AssistantAutoContext:
        """Merge base artifacts, preprocessor outputs, and static metadata into context."""

        with TRACE.section("AUTO CONTEXT", style="magenta"):
            TRACE.kv(
                "Context Inputs",
                [
                    ("messages", len(messages)),
                    ("base_artifacts", len(base_artifacts or [])),
                    ("preprocessors", len(self.preprocessors)),
                ],
                style="magenta",
            )
            for message in messages:
                TRACE.pretty_block("Message", message, style="cyan")
            artifacts = ArtifactStore()
            for artifact in base_artifacts or []:
                artifacts.put(artifact)

            hints: dict[str, object] = {}
            for preprocessor in self.preprocessors:
                TRACE.line(f"checking preprocessor {preprocessor.name}", style="cyan")
                if not preprocessor.applies(messages):
                    continue
                with TRACE.section(f"PREPROCESSOR {preprocessor.name}", style="cyan"):
                    result = preprocessor.run(messages)
                    for artifact in result.artifacts:
                        artifacts.put(artifact)
                        TRACE.pretty_block(
                            "Seeded Artifact",
                            artifact.describe_for_prompt(include_preview=True),
                            style="cyan",
                        )
                    hints[preprocessor.name] = result.hints
                    TRACE.pretty_block("Hints", result.hints, style="green")

            TRACE.kv(
                "Context Ready",
                [
                    ("artifacts", len(artifacts.all())),
                    ("routes", len(self.frontend_routes)),
                    ("route_details", len(self.frontend_route_details)),
                    ("hints", len(hints)),
                ],
                style="green",
            )
            if self.frontend_routes:
                TRACE.pretty_block("Frontend Routes", self.frontend_routes, style="yellow")
            if self.frontend_route_details:
                TRACE.pretty_block("Frontend Route Details", self.frontend_route_details, style="yellow")
            return AssistantAutoContext(
                artifacts=artifacts,
                frontend_routes=self.frontend_routes,
                frontend_route_details=self.frontend_route_details,
                system_metadata=self.system_metadata,
                hints=hints,
                custom_instructions=self.custom_instructions,
            )
