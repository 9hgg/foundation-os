"""Prompt construction utilities for planning within sparse assistant contexts."""

from __future__ import annotations

import json

from ..prompt_rendering import (
    format_messages,
    format_tools,
    render_artifact_definitions,
    render_observations,
)
from ..state.run_context import AssistantRunContext
from ..tools.registry import ToolRegistry
from ..tracing import TRACE

SPARSE_CONTEXT_INSTRUCTIONS = """
You are running inside a backend assistant runtime.
Large values are available as runtime artifacts, not inline prompt content.
Do not assume artifact contents are already visible. Use tools to inspect structure, narrow scope, and create evidence.
Prefer small, verifiable steps. Save durable data as artifacts and save grounded understanding as evidence.
"""


class PromptBuilder:
    """Formats planning inputs into a prompt the model can act on reliably."""

    def build_tool_inspection_prompt(
        self,
        ctx: AssistantRunContext,
        tools: ToolRegistry,
    ) -> str:
        """Build a minimal prompt asking which tools need full details before planning."""

        return "\n\n".join(
            [
                SPARSE_CONTEXT_INSTRUCTIONS.strip(),
                *self._render_custom_instructions(ctx),
                "Messages:",
                format_messages(ctx.messages),
                "Available execution tools (short descriptions only):",
                format_tools(tools, include_schema=False, use_short_description=True),
                (
                    "Artifacts are durable Python objects available at runtime. They may be large and opaque.\n"
                    "Observations are small helper-tool outputs shown inline in later prompt turns.\n"
                    "Evidence is grounded understanding extracted from artifacts and used by judges.\n"
                    "\n"
                    "Before planning, inspect only the tools whose full description or schemas you truly need."
                ),
                (
                    "Return the list of tool_names you want complete descriptions and input/output schemas for. "
                    "Return an empty list if the short descriptions are sufficient to produce the plan."
                ),
                        (
                            "Use only exact tool names from the list above. "
                            "Do not request or invent tools that are not listed."
                        ),
            ]
        )

    def build_planning_prompt(
        self,
        ctx: AssistantRunContext,
        tools: ToolRegistry,
    ) -> str:
        """Compose the planning prompt from messages, artifacts, routes, and tools."""

        TRACE.kv(
            "PLANNING PROMPT",
            [
                ("artifacts", len(ctx.auto_context.artifacts.all())),
                ("routes", len(ctx.auto_context.frontend_routes)),
                ("tools", len(tools.as_list())),
            ],
            style="cyan",
        )
        prompt = "\n\n".join(
            [
                SPARSE_CONTEXT_INSTRUCTIONS.strip(),
                *self._render_custom_instructions(ctx),
                f"Plan attempt: {ctx.plan_attempt}",
                "Messages:",
                format_messages(ctx.messages),
                (
                    "Artifacts are durable Python objects available at runtime. They may be large and opaque.\n"
                    "Observations are small helper-tool outputs that can appear inline during planning or execution.\n"
                    "Evidence is explicit, grounded understanding extracted from artifacts and used by judges.\n"
                    "\n"
                    "Planning cookbook:\n"
                    "1. Constant-capture step: if the user request contains concrete values "
                    "(quantities, names, thresholds, dates, target cities), use `create_constant_value` "
                    "to save them as durable artifacts for later filtering, comparison, or computation.\n"
                    "2. Data-acquisition step: call domain tools to fetch or compute the raw artifacts you need.\n"
                    "3. Structure/narrowing step: use `get_artifact_structure`, `read_artifact_property`, "
                    "filtering, counting, sorting, or slicing to isolate small relevant values instead of consuming whole artifacts. "
                    "For path-based tools, use full artifact paths like `artifact.items[0].quantity`.\n"
                    "4. Relationship/insight step: use tools like `create_comparison_evidence` for artifact-vs-artifact checks "
                    "and `compute` for arithmetic derived from observed or evidenced numbers.\n"
                    "5. Evidence step: use `create_evidence` or `create_comparison_evidence` so downstream judges can reason from grounded facts.\n"
                    "\n"
                    "Prefer multiple small evidence-bearing steps over one oversized step.\n"
                    "A good plan often looks like: capture prompt constants -> retrieve raw data -> "
                    "extract/evidence the needed values -> compare or compute -> create final grounded evidence.\n"
                    "If the user asks for a delta such as how many to buy, restock, add, remove, or how many are missing, "
                    "plan to gather BOTH the target/desired value and the current/available value before computing. "
                    "Do not assume the delta equals the target just because the user mentioned a quantity.\n"
                    "If a relevant preseeded artifact or domain tool exists, include a step to inspect or call it. "
                    "Do not write step instructions that depend on unevidenced assumptions like 'no constraints are provided'.\n"
                    "Every step that needs a tool should name that tool in `tool_names`; avoid empty `tool_names` unless the step truly only stops."
                ),
                *self._render_tool_cookbooks(tools),
                "Details of available artifacts:",
                render_artifact_definitions(ctx.auto_context.artifacts),
                "Hints:",
                json.dumps(ctx.auto_context.hints, ensure_ascii=False),
                *self._render_replanning_context(ctx),
                "Previous failed plan attempts:",
                json.dumps(ctx.replanning_failures, ensure_ascii=False, default=str),
                "Available execution tools and their names:",
                format_tools(tools, include_schema=False, use_short_description=True),
                    (
                        "Use only exact tool names from the list above. "
                        "If the needed domain tool is not available, do not invent it: "
                        "produce a minimal plan that acknowledges the limitation and stops safely."
                    ),
                "Recent bounded helper-tool observations:",
                render_observations(ctx.observations.describe_for_prompt(phase="planning")),
                (
                    "Produce a concise Plan.\n"
                    "Each step should have one clear purpose, the smallest useful tool set, and a realistic path to evidence.\n"
                    "If previous attempts failed, redesign the sequence instead of repeating the same mistake.\n"
                    "Return only the JSON Plan."
                ),
            ]
        )
        TRACE.kv("PLANNING PROMPT READY", [("chars", len(prompt))], style="cyan")
        return prompt

    def _render_replanning_context(self, ctx: AssistantRunContext) -> list[str]:
        """Return a replanning guidance section when this is not the first attempt."""

        if ctx.plan_attempt <= 1 or not ctx.replanning_failures:
            return []

        already_available: list[str] = []
        for failure in ctx.replanning_failures:
            for step_result in failure.get("step_results", []):
                if step_result.get("success"):
                    already_available.extend(step_result.get("artifact_keys", []))

        current_artifact_keys = {a.key for a in ctx.auto_context.artifacts.all()}
        reusable = [k for k in dict.fromkeys(already_available) if k in current_artifact_keys]

        lines = [
            f"== REPLANNING (attempt {ctx.plan_attempt}) ==",
            "The previous plan failed, but the artifact store already contains data gathered by steps that succeeded.",
            "Do NOT plan steps to re-acquire data that is already present in the artifact store — doing so wastes turns and may cause duplicate-call errors.",
            "Instead, build on what is already there: inspect it, narrow it, create evidence from it.",
        ]
        if reusable:
            lines.append(
                "Artifacts already available from the previous attempt (skip acquisition steps for these):\n"
                + "\n".join(f"  - {k}" for k in reusable)
            )
        else:
            lines.append(
                "Check the artifact definitions section above — anything already in the store can be used directly."
            )

        return ["\n".join(lines)]

    def _render_custom_instructions(self, ctx: AssistantRunContext) -> list[str]:
        instructions = ctx.auto_context.custom_instructions
        if not instructions:
            return []
        body = "\n".join(f"- {line}" for line in instructions)
        return [f"Additional instructions:\n{body}"]

    def _render_tool_cookbooks(self, tools: ToolRegistry) -> list[str]:
        """Return a cookbook section for each tool that defines one, or nothing."""
        entries = tools.cookbooks()
        if not entries:
            return []
        lines = ["Tool-specific cookbooks:"]
        for tool_name, cookbook in entries:
            lines.append(f"[{tool_name}]\n{cookbook.strip()}")
        return ["\n\n".join(lines)]
