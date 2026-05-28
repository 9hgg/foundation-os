"""Tool registry primitives for assistant-visible capabilities."""

from __future__ import annotations

import inspect
from dataclasses import dataclass
from typing import Any, Callable, Literal, get_type_hints

from pydantic import TypeAdapter

from libs.utils.types import BaseModelWithConfig

ToolFn = Callable[..., Any]
ArtifactObservationBuilder = Callable[[str, Any], str | None]


class ToolDescription(BaseModelWithConfig):
    """Structured tool metadata exposed to the planner and executor prompts."""

    name: str
    description: str
    input_schema: dict[str, Any] | None = None
    output_schema: dict[str, Any] | None = None


@dataclass(frozen=True)
class Tool:
    """Callable capability exposed to the planning/execution loop."""

    name: str
    description: str
    fn: ToolFn
    short_description: str | None = None
    schema: dict[str, object] | None = None
    output_schema: dict[str, object] | None = None
    persist_artifact: bool = True
    observation_mode: Literal["none", "carry_inline_if_small", "always_inline"] = "none"
    observation_renderer: Callable[[Any], str] | None = None
    artifact_observation_mode: Literal["none", "structure", "custom"] = "structure"
    artifact_observation_builder: ArtifactObservationBuilder | None = None
    cookbook: str | None = None


class ToolRegistry:
    """Simple name-indexed collection of available tools."""

    def __init__(self, tools: list[Tool] | None = None) -> None:
        self._tools = {tool.name: tool for tool in tools or []}

    def register(self, tool: Tool) -> None:
        """Insert or replace a tool by name."""
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool:
        """Return a registered tool."""
        return self._tools[name]

    def list(self) -> list[Tool]:
        """Return all registered tools."""

        return list(self._tools.values())

    def cookbooks(self) -> list[tuple[str, str]]:
        """Return (tool_name, cookbook) pairs for every tool that defines a cookbook."""
        return [
            (tool.name, tool.cookbook)
            for tool in self._tools.values()
            if tool.cookbook
        ]

    def subset(self, tool_names: list[str]) -> ToolRegistry:
        """Return a registry containing only the requested tools, in request order."""

        return ToolRegistry([self._tools[name] for name in tool_names if name in self._tools])

    def describe(
        self,
        *,
        include_schema: bool = True,
        use_short_description: bool = False,
    ) -> list[ToolDescription]:
        """Return model-safe metadata for every registered tool."""
        descriptions: list[ToolDescription] = []
        for tool in self._tools.values():
            descriptions.append(
                self.describe_tool(
                    tool.name,
                    include_schema=include_schema,
                    use_short_description=use_short_description,
                )
            )
        return descriptions

    def describe_tool(
        self,
        tool_name: str,
        *,
        include_schema: bool = True,
        use_short_description: bool = False,
    ) -> ToolDescription:
        """Return model-safe metadata for one registered tool."""

        tool = self.get(tool_name)
        description = tool.short_description if use_short_description and tool.short_description else tool.description
        tool_description = ToolDescription(
            name=tool.name,
            description=description,
        )
        if include_schema:
            tool_description.input_schema = self._build_input_schema(tool)
            tool_description.output_schema = self._build_output_schema(tool)
        return tool_description

    def _build_input_schema(self, tool: Tool) -> dict[str, object]:
        """Describe a tool's callable signature in model-friendly JSON."""

        if tool.schema is not None:
            return tool.schema

        try:
            signature = inspect.signature(tool.fn)
            type_hints = get_type_hints(tool.fn)
        except Exception:
            return {"type": "object", "properties": {}, "required": []}

        properties: dict[str, object] = {}
        required: list[str] = []

        for parameter in signature.parameters.values():
            if parameter.kind in {inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD}:
                continue

            annotation = type_hints.get(parameter.name, parameter.annotation)
            property_schema = self._annotation_to_schema(annotation)
            if parameter.default is not inspect.Signature.empty:
                property_schema["default"] = parameter.default
            else:
                required.append(parameter.name)
            properties[parameter.name] = property_schema

        return {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False,
        }

    def _build_output_schema(self, tool: Tool) -> dict[str, object]:
        """Describe one tool's return shape in model-friendly JSON."""

        if tool.output_schema is not None:
            return tool.output_schema

        try:
            signature = inspect.signature(tool.fn)
            type_hints = get_type_hints(tool.fn)
        except Exception:
            return {"type": "any"}

        annotation = type_hints.get("return", signature.return_annotation)
        return self._annotation_to_schema(annotation)

    def _annotation_to_schema(self, annotation: Any) -> dict[str, Any]:
        """Map a Python annotation to a JSON schema object."""

        if annotation is inspect.Signature.empty:
            return {"type": "any", "python_type": "Any"}

        try:
            schema = TypeAdapter(annotation).json_schema()
        except Exception:
            schema = {"type": "object"}

        if "python_type" not in schema:
            schema["python_type"] = self._annotation_to_python_type_name(annotation)
        return schema

    def _annotation_to_python_type_name(self, annotation: Any) -> str:
        """Render a readable Python type name for prompts and debugging."""

        return getattr(annotation, "__name__", str(annotation))
