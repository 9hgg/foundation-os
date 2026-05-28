"""Helpers for producing structured plans from assembled planning prompts."""

from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel

from libs.ml.llm import LLMClient, instructor_query

from ..state.plan_models import Plan
from ..tracing import TRACE

T = TypeVar("T", bound=BaseModel)


def generate_plan(
    client: LLMClient,
    prompt: str,
    *,
    schema: type[T] = Plan,
    model: str | None = None,
) -> T:
    """Generate a structured assistant planning payload from a prepared natural-language prompt."""

    TRACE.kv(
        "GENERATE PLAN",
        [("model", model), ("prompt_chars", len(prompt)), ("schema", schema.__name__)],
        style="magenta",
    )
    plan = instructor_query(
        client,
        prompt,
        schema,
        model=model,
    )
    if isinstance(plan, Plan):
        TRACE.kv("GENERATE PLAN RESULT", [("steps", len(plan.steps))], style="green")
    return plan
