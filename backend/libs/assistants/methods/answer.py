"""Render assistant replies from full Ralph artifacts when possible."""

from __future__ import annotations

from typing import Any

from libs.mcp.client_runtime.answer import build_answer_from_tool_runs
from libs.mcp.client_runtime.routes import parse_route_summary
from libs.mcp.client_runtime.store import ToolResultStore
from libs.ralph.state.artifacts import ArtifactStore
from libs.ralph.state.plan_models import StepResult

from .routes import AngularMcpRouteDetails, build_route_index_from_mcp_route_details


def _artifact_tool_name(artifact_key: str, artifact_metadata: dict[str, Any]) -> str | None:
    """Return the tool name associated with an artifact if it is available."""

    tool_name = artifact_metadata.get("tool_name")
    if isinstance(tool_name, str) and tool_name.strip():
        return tool_name

    suffix = "_tool_"
    if suffix in artifact_key:
        prefix = artifact_key.split(suffix, 1)[0]
        parts = prefix.split("_")
        if parts:
            return parts[-1]
    return None


def build_assistant_artifact_html(
    *,
    query: str,
    step_results: list[StepResult],
    artifacts: ArtifactStore,
    frontend_routes: list[str],
    frontend_route_details: list[AngularMcpRouteDetails] | None = None,
) -> str | None:
    """Render a compact HTML answer from full step-produced artifacts when possible."""

    if frontend_route_details:
        route_index = build_route_index_from_mcp_route_details(frontend_route_details)
    else:
        route_index = parse_route_summary("\n".join(frontend_routes))
    tool_runs: list[dict[str, Any]] = []

    for step in step_results:
        for artifact_key in step.artifact_keys:
            artifact = artifacts.get_artifact(artifact_key)
            tool_name = _artifact_tool_name(artifact.key, artifact.metadata)
            if not tool_name:
                continue
            tool_runs.append(
                {
                    "tool_name": tool_name,
                    "args": {},
                    "status": "ok",
                    "result": artifact.load(),
                }
            )

    if not tool_runs:
        return None

    return build_answer_from_tool_runs(
        query=query,
        tool_runs=tool_runs,
        result_store=ToolResultStore(),
        route_index=route_index,
    )
