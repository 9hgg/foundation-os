"""Helpers for rendering human-readable prompt sections."""

from __future__ import annotations

import json
from typing import Any

from .schema_rendering import compact_json_schema
from .state.artifacts import ArtifactStore
from .tools.registry import ToolDescription, ToolRegistry


def format_messages(messages: list[dict[str, str]]) -> str:
    """Render chat messages as compact role-prefixed lines."""

    if not messages:
        return "<none>"

    rendered: list[str] = []
    for message in messages:
        role = (message.get("role") or "unknown").strip()
        content = (message.get("content") or "").strip()
        rendered.append(f"{role}: {content or '<empty>'}")
    return "\n".join(rendered)


def format_tools(
    tools: ToolRegistry,
    *,
    include_schema: bool,
    use_short_description: bool = False,
) -> str:
    """Render the visible tool list in a compact human-readable format."""

    rendered: list[str] = []
    for tool in tools.describe(
        include_schema=include_schema,
        use_short_description=use_short_description,
    ):
        name = tool.name
        description = tool.description.strip() or "No description."
        rendered.append(f"- {name}: {description}")
        if include_schema and tool.input_schema is not None:
            rendered.append(f"  input_schema: {compact_json_schema(tool.input_schema)}")
        if include_schema and tool.output_schema is not None:
            rendered.append(f"  output_schema: {compact_json_schema(tool.output_schema)}")
    return "\n".join(rendered) if rendered else "<none>"


def format_tool_detail(tool_detail: ToolDescription | dict[str, object]) -> str:
    """Render one detailed tool payload in a compact human-readable format."""

    if isinstance(tool_detail, dict):
        tool_detail = ToolDescription.model_validate(tool_detail)

    name = tool_detail.name
    description = tool_detail.description.strip() or "No description."
    rendered = [f"- {name}: {description}"]
    if tool_detail.input_schema is not None:
        rendered.append(f"  input_schema: {compact_json_schema(tool_detail.input_schema)}")
    if tool_detail.output_schema is not None:
        rendered.append(f"  output_schema: {compact_json_schema(tool_detail.output_schema)}")
    return "\n".join(rendered)


def render_artifact_definitions(artifacts: ArtifactStore) -> str:
    """Render artifact provenance without leaking accidental content previews."""

    lines: list[str] = []
    for artifact in artifacts.all():
        tool_name = artifact.metadata.get("tool_name")
        tool_args = artifact.metadata.get("tool_args")
        description = artifact.metadata.get("description")
        value_type = artifact.describe_for_prompt().get("value_type")
        size_hint = artifact.describe_for_prompt().get("size_hint")
        output_schema = artifact.metadata.get("output_schema")
        if isinstance(tool_name, str) and tool_name.strip():
            args_text = _format_tool_args(tool_args)
            summary = f"{artifact.key}: produced by tool {tool_name}({args_text})"
        else:
            summary = f"{artifact.key}: preseeded artifact"
        details: list[str] = []
        if isinstance(description, str) and description.strip():
            details.append(description.strip())
        if isinstance(value_type, str):
            details.append(f"type={value_type}")
        if isinstance(size_hint, int):
            details.append(f"size_hint={size_hint}")
        if output_schema is not None:
            details.append(f"output_schema={compact_json_schema(output_schema)}")
        if details:
            summary = f"{summary} | {' | '.join(details)}"
        lines.append(summary)
    return "\n".join(lines) if lines else "<none>"


def render_observations(observations: list[dict[str, object]]) -> str:
    """Render bounded tool observations carried across prompt turns."""

    lines: list[str] = []
    for observation in observations:
        tool_name = str(observation.get("tool_name") or "unknown_tool")
        artifact_key = observation.get("artifact_key")
        observation_key = observation.get("key")
        header_parts = [f"- {tool_name}"]
        if isinstance(observation_key, str) and observation_key.strip():
            header_parts.append(f"[{observation_key}]")
        if artifact_key:
            header_parts.append(f"-> {artifact_key}")
        lines.append(" ".join(header_parts))
        content = str(observation.get("content") or "").strip()
        if content:
            lines.append(_indent_block(content, prefix="  "))
    return "\n".join(lines) if lines else "<none>"


def _indent_block(text: str, *, prefix: str) -> str:
    """Indent each line of a text block with a fixed prefix."""

    return "\n".join(f"{prefix}{line}" for line in text.splitlines())


def _format_tool_args(tool_args: Any) -> str:
    if isinstance(tool_args, dict):
        return ", ".join(f"{key}={json.dumps(value, ensure_ascii=False)}" for key, value in tool_args.items())
    return json.dumps(tool_args, ensure_ascii=False, default=str)
