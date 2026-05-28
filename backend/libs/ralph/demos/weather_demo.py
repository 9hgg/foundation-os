"""Demo: weather tool with a cookbook showing how to use it correctly.

Illustrates the cookbook field on Tool — the planner receives targeted hints
about how to call the tool without needing to infer them from the schema alone.
"""

from __future__ import annotations

import json
from typing import Any

from libs.ml.llm import LLMClient
from libs.ralph.context.auto_context import AutoContextBuilder
from libs.ralph.demos.customers_demos.customers_demos_client import OllamaLLMClient
from libs.ralph.execution.runner import AssistantRunner
from libs.ralph.state.run_context import AssistantRunContext
from libs.ralph.tools.local_tools import build_harness_tools
from libs.ralph.tools.registry import Tool, ToolRegistry

WEATHER_DB: dict[str, dict[str, Any]] = {
    "paris": {"temperature_c": 18, "condition": "cloudy", "wind_kmh": 20, "humidity_pct": 72},
    "london": {"temperature_c": 14, "condition": "rainy", "wind_kmh": 35, "humidity_pct": 88},
    "madrid": {"temperature_c": 27, "condition": "sunny", "wind_kmh": 10, "humidity_pct": 40},
    "berlin": {"temperature_c": 10, "condition": "overcast", "wind_kmh": 15, "humidity_pct": 65},
    "rome": {"temperature_c": 23, "condition": "sunny", "wind_kmh": 8, "humidity_pct": 50},
}


def get_weather(city: str) -> dict[str, Any]:
    """Return current weather data for a city (case-insensitive)."""
    key = city.strip().lower()
    data = WEATHER_DB.get(key)
    if data is None:
        available = list(WEATHER_DB.keys())
        return {"error": f"City '{city}' not found.", "available_cities": available}
    return {"city": key, **data}


def enlist_demo_tools(ctx: AssistantRunContext) -> ToolRegistry:
    registry = build_harness_tools(ctx)
    registry.register(
        Tool(
            name="get_weather",
            description=(
                "Return current weather for a single city. "
                "Pass the city name in lowercase English. "
                "Returns temperature_c, condition, wind_kmh, and humidity_pct. "
                "If the city is unknown, an error key lists available cities."
            ),
            short_description="Return current weather data for a city.",
            fn=get_weather,
            cookbook=(
                "Call once per city — it returns data for exactly one city at a time.\n"
                "To compare two cities, call it twice and create comparison evidence.\n"
                "To find the hottest city, call it for each candidate then use max_item on temperature_c.\n"
                "Example: get_weather(city='paris') → {temperature_c: 18, condition: 'cloudy', ...}"
            ),
        )
    )
    return registry


def run_demo(
    query: str,
    *,
    client: LLMClient,
    model: str = "gemma4:e2b",
    max_plan_attempts: int = 2,
    max_turns_per_step: int = 10,
) -> dict[str, Any]:
    messages = [{"role": "user", "content": query}]
    context_builder = AutoContextBuilder(
        system_metadata={"environment": "weather_demo"},
    )
    runner = AssistantRunner(
        client,
        context_builder=context_builder,
        tool_builder=enlist_demo_tools,
        model=model,
        max_plan_attempts=max_plan_attempts,
        max_turns_per_step=max_turns_per_step,
    )
    ctx, answer = runner.run_with_context(messages)
    return {
        "query": query,
        "artifacts": ctx.artifacts.describe_for_prompt(),
        "evidences": ctx.evidences.describe_for_prompt(),
        "plan": ctx.plan.model_dump() if ctx.plan is not None else None,
        "step_results": [result.model_dump() for result in ctx.step_results],
        "answer": answer.model_dump(),
    }


def main() -> None:
    client = OllamaLLMClient(model="gemma4:e2b")
    report = run_demo(
        "Which city is warmer today, Paris or Madrid?",
        client=client,
        model="gemma4:e2b",
    )
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
