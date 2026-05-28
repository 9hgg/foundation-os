"""
Demonstrates the artifact_ref chaining mechanism without the full runner.

Key idea:
  The LLM never sees large artifact contents. It only knows artifact KEYS.
  When it wants to pass a large artifact to a tool, it writes:
      {"artifact_ref": "<key>"}
  The runtime resolves that to the actual Python object before calling the tool.
  The tool result is saved as a new artifact under a new key, which the LLM
  can reference in subsequent tool calls.

This demo hardcodes the sequence of "decisions" a model would make, then
executes them exactly as the real step executor does — showing the data
never flowing through the model layer.
"""

from __future__ import annotations

import random
from typing import Any

from libs.ralph.context.auto_context import AutoContextBuilder
from libs.ralph.state.artifacts import Artifact
from libs.ralph.state.run_context import AssistantRunContext
from libs.ralph.tools.local_tools import build_harness_tools
from libs.ralph.tools.models import FilterCondition

# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

DEPARTMENTS = ["Engineering", "Sales", "Marketing", "HR", "Finance"]
CITIES = ["Paris", "London", "Berlin", "Madrid", "Rome"]

def _build_employees(count: int = 5_000) -> list[dict[str, Any]]:
    rng = random.Random(42)
    return [
        {
            "id": i + 1,
            "name": f"Employee_{i + 1}",
            "department": rng.choice(DEPARTMENTS),
            "city": rng.choice(CITIES),
            "salary": rng.randint(30_000, 120_000),
            "active": rng.random() > 0.1,
        }
        for i in range(count)
    ]


# ---------------------------------------------------------------------------
# Runtime helpers (mirror what step_executor does internally)
# ---------------------------------------------------------------------------

def resolve_refs(ctx: AssistantRunContext, value: Any) -> Any:
    """Substitute every {"artifact_ref": key} with the actual artifact value."""
    if isinstance(value, dict):
        if set(value.keys()) == {"artifact_ref"} and isinstance(value["artifact_ref"], str):
            resolved = ctx.artifacts.get(value["artifact_ref"])
            print(f"    [runtime] resolved artifact_ref={value['artifact_ref']!r} "
                  f"→ {type(resolved).__name__}(len={len(resolved) if hasattr(resolved, '__len__') else '?'})")
            return resolved
        return {k: resolve_refs(ctx, v) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_refs(ctx, v) for v in value]
    return value


def call_tool(
    ctx: AssistantRunContext,
    tools: Any,
    *,
    tool_name: str,
    tool_args: dict[str, Any],
    save_as: str,
) -> str:
    """Resolve refs, call the tool fn, save the result, return the new artifact key."""
    print(f"\n  tool_call: {tool_name}")
    print(f"    model sees args (before resolution): {tool_args}")
    resolved = resolve_refs(ctx, tool_args)
    tool = tools.get(tool_name)
    result = tool.fn(**resolved)
    ctx.artifacts.save(save_as, result, provenance="tool_call",
                       metadata={"tool_name": tool_name, "tool_args": tool_args})
    size = len(result) if hasattr(result, "__len__") else result
    print(f"    result saved as artifact_key={save_as!r}  (value={size!r})")
    return save_as


def create_evidence_tool(
    ctx: AssistantRunContext,
    tools: Any,
    *,
    path: str,
    conditions: list[dict] | None = None,
    evidence_name: str,
    evidence_description: str,
) -> None:
    """Helper that calls create_evidence directly (no artifact_ref needed here)."""
    print("\n  tool_call: create_evidence")
    print(f"    path={path!r}")
    tool = tools.get("create_evidence")
    result = tool.fn(
        path=path,
        conditions=[FilterCondition(**c) for c in (conditions or [])],
        evidence_name=evidence_name,
        evidence_description=evidence_description,
    )
    print(f"    evidence created: key={result.key!r}")
    print(f"    display preview : {result.display[:120]}{'...' if len(result.display) > 120 else ''}")


# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------

def main() -> None:
    employees = _build_employees()
    print(f"Dataset: {len(employees):,} employee records  "
          f"(~{sum(len(str(e)) for e in employees) // 1024} KB if serialised)")

    # Seed the artifact store — the LLM only knows "employees" as a key
    ctx = AssistantRunContext(
        messages=[{"role": "user", "content": "How many active engineers are there, and what is their average salary?"}],
        auto_context=AutoContextBuilder().build([]),
    )
    ctx.artifacts.put(Artifact(
        key="employees",
        value=employees,
        provenance="preseeded",
        metadata={"description": f"Company employee directory ({len(employees):,} records)."},
    ))

    tools = build_harness_tools(ctx)

    print("\n" + "=" * 70)
    print("Step 1 — filter active engineers")
    print("=" * 70)
    # The model writes {"artifact_ref": "employees"} — never the actual list
    call_tool(
        ctx, tools,
        tool_name="filter_items",
        tool_args={
            "items": {"artifact_ref": "employees"},
            "conditions": [
                {"path": "department", "op": "eq", "value": "Engineering"},
                {"path": "active", "op": "eq", "value": True},
            ],
            "logic": "and",
        },
        save_as="active_engineers",
    )

    print("\n" + "=" * 70)
    print("Step 2 — count them")
    print("=" * 70)
    call_tool(
        ctx, tools,
        tool_name="count_items",
        tool_args={"items": {"artifact_ref": "active_engineers"}},
        save_as="engineer_count",
    )

    print("\n" + "=" * 70)
    print("Step 3 — average salary")
    print("=" * 70)
    call_tool(
        ctx, tools,
        tool_name="average_items",
        tool_args={
            "items": {"artifact_ref": "active_engineers"},
            "path": "salary",
        },
        save_as="avg_engineer_salary",
    )

    print("\n" + "=" * 70)
    print("Step 4 — create evidence for count")
    print("=" * 70)
    create_evidence_tool(
        ctx, tools,
        path="engineer_count",
        evidence_name="Active engineer count",
        evidence_description="Number of active employees in Engineering department.",
    )

    print("\n" + "=" * 70)
    print("Step 5 — create evidence for avg salary")
    print("=" * 70)
    create_evidence_tool(
        ctx, tools,
        path="avg_engineer_salary",
        evidence_name="Average engineer salary",
        evidence_description="Average salary of active Engineering employees.",
    )

    print("\n" + "=" * 70)
    print("Final artifact store (what the model can reference)")
    print("=" * 70)
    for artifact in ctx.artifacts.all():
        value = artifact.load()
        size = len(value) if hasattr(value, "__len__") else value
        print(f"  {artifact.key:<30} {type(value).__name__:<10} value={size!r}")

    print("\nFinal evidences (what the judge will read)")
    print("=" * 70)
    for ev in ctx.evidences.all():
        print(f"  [{ev.key}] {ev.name}: {ev.display()}")


if __name__ == "__main__":
    main()
