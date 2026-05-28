"""Planning orchestration for Ralph assistant runs."""

from __future__ import annotations

from pydantic import BaseModel, Field

from libs.ml.llm import LLMClient
from libs.ml.llm.structured import StructuredCompletionError

from ..prompt_rendering import format_tool_detail
from ..state.artifacts import DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS
from ..state.plan_models import Plan
from ..state.run_context import AssistantRunContext
from ..tools.registry import Tool, ToolDescription, ToolRegistry
from ..tracing import TRACE
from .objective_generator import generate_plan
from .prompt_builder import PromptBuilder


class ToolInspectionRequest(BaseModel):
    """Pre-planning step: tools the model wants full details for before writing the plan."""

    tool_names: list[str] = Field(
        default_factory=list,
        description=(
            "Names of tools you want complete descriptions and schemas for. "
            "Return an empty list if the short descriptions are sufficient."
        ),
    )


class Planner:
    """Builds a planning prompt and asks the model for a structured plan."""

    def __init__(
        self,
        client: LLMClient,
        *,
        model: str | None = None,
    ) -> None:
        self.client = client
        self.model = model
        self.prompt_builder = PromptBuilder()

    def plan(self, ctx: AssistantRunContext, tools: ToolRegistry) -> Plan:
        """Generate a plan for the current run context and available tools."""

        TRACE.kv("PLANNER", [("messages", len(ctx.messages)), ("tools", len(tools.as_list()))], style="magenta")
        helper_tools = self._build_planning_helper_tools(tools)

        # Step 0: ask the model which tools it wants details for before planning.
        self._run_tool_inspection_step(ctx, tools, helper_tools)

        # Step 1: generate the plan directly with tool details already in context.
        prompt = self.prompt_builder.build_planning_prompt(ctx, tools)
        plan = generate_plan(self.client, prompt, model=self.model, schema=Plan)
        plan = self._repair_plan_tool_names(plan, tools)
        TRACE.kv("PLANNER RESULT", [("objective", plan.objective)], style="green")
        return plan

    def _repair_plan_tool_names(self, plan: Plan, tools: ToolRegistry) -> Plan:
        """Repair obvious plan/tool mismatches to reduce execution-time dead ends."""

        available_tool_names = {tool.name for tool in tools.as_list()}

        for step in plan.steps:
            step_text = " ".join(
                part.lower()
                for part in (step.id, step.instruction, step.expected_output or "")
                if part
            )

            # Keep only existing tools and preserve order.
            seen: set[str] = set()
            cleaned_tool_names: list[str] = []
            for tool_name in step.tool_names:
                if tool_name in available_tool_names and tool_name not in seen:
                    cleaned_tool_names.append(tool_name)
                    seen.add(tool_name)

            # If plan forgot an obvious acquisition tool, add it.
            for token, tool_name in (
                ("team", "list_teams"),
                ("teams", "list_teams"),
                ("file", "list_files"),
                ("files", "list_files"),
                ("dataset", "list_datasets"),
                ("datasets", "list_datasets"),
                ("article", "list_articles"),
                ("articles", "list_articles"),
                ("folder", "list_folders"),
                ("folders", "list_folders"),
                ("rf", "list_rfs"),
                ("rfs", "list_rfs"),
                ("perimeter", "list_perimeters"),
                ("perimeters", "list_perimeters"),
            ):
                if token in step_text and tool_name in available_tool_names and tool_name not in seen:
                    cleaned_tool_names.append(tool_name)
                    seen.add(tool_name)

            # Extraction/list-conversion steps often need list helpers.
            if any(token in step_text for token in ("extract", "names", "list of", "each")):
                for helper_tool_name in ("read_artifact_property", "distinct_values"):
                    if helper_tool_name in available_tool_names and helper_tool_name not in seen:
                        cleaned_tool_names.append(helper_tool_name)
                        seen.add(helper_tool_name)

            step.tool_names = cleaned_tool_names

        return plan

    def _run_tool_inspection_step(
        self,
        ctx: AssistantRunContext,
        tools: ToolRegistry,
        planning_helper_tools: ToolRegistry,
    ) -> None:
        """Ask the model which tools it wants full details for, then fetch them."""

        prompt = self.prompt_builder.build_tool_inspection_prompt(ctx, tools)
        try:
            request = generate_plan(self.client, prompt, model=self.model, schema=ToolInspectionRequest)
        except StructuredCompletionError as exc:
            TRACE.line(f"tool inspection step failed, skipping. reason={exc}", style="yellow")
            return

        known_names = {tool.name for tool in tools.as_list()}
        valid_names = [name for name in request.tool_names if name in known_names]
        TRACE.kv("TOOL INSPECTION", [("requested", len(request.tool_names)), ("valid", len(valid_names))], style="cyan")

        if not valid_names:
            return

        helper_tool = planning_helper_tools.get("get_tool_details")
        tool_result = helper_tool.fn(tool_names=valid_names, with_full_description=True, with_full_schema=True)
        observation = self._make_planning_observation(ctx, helper_tool, tool_result)
        TRACE.pretty_block("PLANNER TOOL INSPECTION RESULT", tool_result, style="green")
        if observation is not None:
            ctx.observations.put(observation)

    def _build_planning_helper_tools(self, tools: ToolRegistry) -> ToolRegistry:
        """Return helper tools used during planning (currently only get_tool_details)."""

        registry = ToolRegistry()

        def get_tool_details(
            tool_names: list[str],
            with_full_description: bool = True,
            with_full_schema: bool = True,
        ) -> list[ToolDescription]:
            return [
                tools.describe_tool(
                    tool_name,
                    include_schema=with_full_schema,
                    use_short_description=not with_full_description,
                )
                for tool_name in tool_names
            ]

        registry.register(
            Tool(
                "get_tool_details",
                "Fetch full description and schemas for one or more execution tools. This helper creates an inline observation for planning and does not create a runtime artifact.",
                get_tool_details,
                short_description="Fetch deeper details for one or more execution tools.",
                persist_artifact=False,
                observation_mode="always_inline",
                observation_renderer=lambda result: "\n\n".join(
                    format_tool_detail(tool_detail) for tool_detail in result
                ),
            )
        )
        return registry

    def _make_planning_observation(
        self,
        ctx: AssistantRunContext,
        tool: Tool,
        tool_result: object,
    ):
        """Return one bounded helper-tool observation for the planning prompt."""

        if tool.observation_mode == "none":
            return None
        renderer = tool.observation_renderer
        content = renderer(tool_result) if renderer is not None else str(tool_result)
        if tool.observation_mode == "carry_inline_if_small" and len(content) > DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS:
            return None
        if len(content) > DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS:
            content = f"{content[:DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS]}..."
        return ctx.observations.create(
            key=f"planning_{tool.name}_{len(ctx.observations.all()) + 1}",
            tool_name=tool.name,
            content=content,
            artifact_key=None,
            source_step_id=None,
            phase="planning",
            metadata={"source": "planning_helper"},
        )
