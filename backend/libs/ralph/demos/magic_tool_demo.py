from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel

from libs.ml.llm import LLMClient, OllamaLLMClient
from libs.ralph.context.auto_context import AutoContextBuilder
from libs.ralph.execution.runner import AssistantRunner
from libs.ralph.state.artifacts import Artifact
from libs.ralph.state.run_context import AssistantRunContext
from libs.ralph.tools.local_tools import build_harness_tools
from libs.ralph.tools.registry import Tool, ToolRegistry


class GroceryItem(BaseModel):
    name: str
    quantity: int
    unit: str
    status: str
    note: str


GROCERIES = [
    GroceryItem(
        name="tomatoes",
        quantity=2,
        unit="pcs",
        status="low",
        note="Need more for taco night salsa.",
    ),
    GroceryItem(
        name="onions",
        quantity=4,
        unit="pcs",
        status="ok",
        note="Enough for the week.",
    ),
    GroceryItem(
        name="tortillas",
        quantity=1,
        unit="pack",
        status="low",
        note="Only one pack left for taco night.",
    ),
    GroceryItem(
        name="black beans",
        quantity=0,
        unit="can",
        status="out",
        note="Completely out.",
    ),
    GroceryItem(
        name="cilantro",
        quantity=1,
        unit="bunch",
        status="ok",
        note="Fresh enough for garnish.",
    ),
]


PARTY_NEEDS = [
    {"name": "tomatoes", "quantity": 4, "unit": "pcs"},
    {"name": "onions", "quantity": 1, "unit": "pcs"},
    {"name": "tortillas", "quantity": 2, "unit": "pack"},
    {"name": "black beans", "quantity": 2, "unit": "can"},
    {"name": "cilantro", "quantity": 1, "unit": "bunch"},
]


def magic_tool(question: str) -> dict[str, Any]:
    """Return raw grocery availability and party requirements without analysis."""

    return {
        "what_we_have": [
            {"name": item.name, "quantity": item.quantity, "unit": item.unit}
            for item in GROCERIES
        ],
        "party_needs": PARTY_NEEDS,
    }


def _build_demo_artifacts() -> list[Artifact]:
    return [
        Artifact(
            key="grocery_list",
            provenance="preseeded",
            value=[item.model_dump() for item in GROCERIES],
        )
    ]


def enlist_demo_tools(ctx: AssistantRunContext) -> ToolRegistry:
    registry = build_harness_tools(ctx)
    registry.register(
        Tool(
            name="magic_tool",
            description=(
                "Return the hidden grocery snapshot as raw lists: `what_we_have` and `party_needs`. "
                "This tool does not calculate restock amounts, priorities, or final answers; "
                "use evidence and computation tools to reason over the returned values."
            ),
            short_description="Return raw grocery availability and party need lists.",
            fn=magic_tool,
        )
    )
    return registry


def run_demo(
    query: str,
    *,
    client: LLMClient,
    model: str = "gemma4:e2b",
    max_plan_attempts: int = 2,
    max_turns_per_step: int = 8,
) -> dict[str, Any]:
    messages = [{"role": "user", "content": query}]
    context_builder = AutoContextBuilder(
        system_metadata={"environment": "magic_tool_demo"},
    )
    runner = AssistantRunner(
        client,
        context_builder=context_builder,
        tool_builder=enlist_demo_tools,
        model=model,
        max_plan_attempts=max_plan_attempts,
        max_turns_per_step=max_turns_per_step,
    )
    ctx, answer = runner.run_with_context(messages, base_artifacts=_build_demo_artifacts())
    tools = enlist_demo_tools(ctx)
    return {
        "query": query,
        "artifacts": ctx.artifacts.describe_for_prompt(),
        "observations": ctx.observations.describe_for_prompt(),
        "evidences": ctx.evidences.describe_for_prompt(),
        "tools": [tool.model_dump() for tool in tools.describe(include_schema=True)],
        "plan": ctx.plan.model_dump() if ctx.plan is not None else None,
        "step_results": [result.model_dump() for result in ctx.step_results],
        "answer": answer.model_dump(),
    }


def main() -> None:
    client = OllamaLLMClient(model="gemma4:e2b")
    report = run_demo(
        "I want 6 onions for my party, how many do I need to buy?",
        # "How many black beans do we need to restock for taco night?",
        # "Which groceries should we restock first for taco night, and why?",
        client=client,
        model="gemma4:e2b",
        max_plan_attempts=2,
        max_turns_per_step=8,
    )
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
