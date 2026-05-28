"""Shared helpers for runnable Ralph tool demo scripts."""

import json
from dataclasses import dataclass
from typing import Any, Callable

from libs.ralph.context.auto_context import AutoContextBuilder
from libs.ralph.state.artifacts import Artifact
from libs.ralph.state.run_context import AssistantRunContext
from libs.ralph.tools.local_tools import build_harness_tools
from libs.ralph.tools.registry import ToolRegistry
from libs.ralph.tracing import TRACE

RELEASE_TASKS = [
    {
        "id": "TASK-101",
        "title": "Patch onboarding bug",
        "status": "done",
        "priority": "high",
        "story_points": 3,
        "created_at": "2026-04-01T09:00:00Z",
        "due_at": "2026-04-04T18:00:00Z",
        "assignee": {"name": "Alice", "city": "Paris"},
        "labels": ["bug", "signup"],
    },
    {
        "id": "TASK-102",
        "title": "Prepare launch email",
        "status": "todo",
        "priority": "medium",
        "story_points": 5,
        "created_at": "2026-04-05T10:30:00Z",
        "due_at": "2026-04-10T18:00:00Z",
        "assignee": {"name": "Bob", "city": "London"},
        "labels": ["marketing"],
    },
    {
        "id": "TASK-103",
        "title": "Refresh help center",
        "status": "in_progress",
        "priority": "low",
        "story_points": 2,
        "created_at": "2026-04-10T08:15:00Z",
        "due_at": "2026-04-14T18:00:00Z",
        "assignee": {"name": "Alice", "city": "Paris"},
        "labels": ["docs"],
    },
    {
        "id": "TASK-104",
        "title": "Fix trial billing race",
        "status": "in_progress",
        "priority": "critical",
        "story_points": 8,
        "created_at": "2026-04-12T14:00:00Z",
        "due_at": "2026-04-15T18:00:00Z",
        "assignee": {"name": "Chloe", "city": "Berlin"},
        "labels": ["billing", "bug"],
    },
    {
        "id": "TASK-105",
        "title": "Record new demo video",
        "status": "todo",
        "priority": "medium",
        "story_points": 3,
        "created_at": "2026-04-14T11:45:00Z",
        "due_at": "2026-04-20T18:00:00Z",
        "assignee": {"name": "Diego", "city": "Madrid"},
        "labels": ["demo"],
    },
    {
        "id": "TASK-106",
        "title": "Backfill analytics tags",
        "status": "todo",
        "priority": "low",
        "story_points": 1,
        "created_at": "2026-04-16T07:20:00Z",
        "due_at": "2026-04-22T18:00:00Z",
        "assignee": {"name": "Alice", "city": "Paris"},
        "labels": ["analytics"],
    },
]

WORKSPACE = {
    "team": "Ralph Ops",
    "projects": [
        {
            "id": "release-2026-05",
            "name": "May release",
            "tasks": RELEASE_TASKS,
        },
        {
            "id": "ops-2026-05",
            "name": "Ops cleanup",
            "tasks": [
                {
                    "id": "OPS-201",
                    "title": "Archive stale experiments",
                    "status": "done",
                    "priority": "low",
                    "story_points": 2,
                    "created_at": "2026-03-29T09:00:00Z",
                    "due_at": "2026-04-02T18:00:00Z",
                    "assignee": {"name": "Nora", "city": "Paris"},
                    "labels": ["cleanup"],
                }
            ],
        },
    ],
}

PANTRY = {"onions": 4, "tomatoes": 7}
EXPECTED_TODO_TASK_IDS = ["TASK-102", "TASK-105", "TASK-106"]
EXPECTED_TOP_3_RECENT_TASK_IDS = ["TASK-106", "TASK-105", "TASK-104"]
EXPECTED_DISTINCT_CITIES = ["Paris", "London", "Berlin", "Madrid"]
EXPECTED_STORY_POINTS_SUM = 22.0
EXPECTED_STORY_POINTS_AVERAGE = EXPECTED_STORY_POINTS_SUM / len(RELEASE_TASKS)


@dataclass(frozen=True)
class ToolCallSpec:
    tool_name: str
    tool_args: dict[str, Any]
    save_as: str | None = None


@dataclass(frozen=True)
class Scenario:
    name: str
    primary_tool: str
    user_request: str
    allowed_tools: tuple[str, ...]
    tool_calls: tuple[ToolCallSpec, ...]
    verifier: Callable[[AssistantRunContext, list[Any]], None]
    expected_answer_substrings: tuple[str, ...] = ()


def build_demo_context() -> AssistantRunContext:
    TRACE.enabled = False
    ctx = AssistantRunContext(
        messages=[{"role": "user", "content": "Run the Ralph tool demo suite."}],
        auto_context=AutoContextBuilder().build([]),
    )
    ctx.artifacts.put(
        Artifact(
            key="workspace",
            value=WORKSPACE,
            provenance="preseeded",
            metadata={"description": "Nested demo workspace with projects and tasks."},
        )
    )
    ctx.artifacts.put(
        Artifact(
            key="release_tasks",
            value=RELEASE_TASKS,
            provenance="preseeded",
            metadata={"description": "Flat view of the May release tasks."},
        )
    )
    ctx.artifacts.put(
        Artifact(
            key="pantry",
            value=PANTRY,
            provenance="preseeded",
            metadata={"description": "Pantry stock used by comparison demos."},
        )
    )
    ctx.current_step_id = "script_demo"
    return ctx


def build_base_artifacts() -> list[Artifact]:
    return [
        Artifact(
            key="workspace",
            value=WORKSPACE,
            provenance="preseeded",
            metadata={"description": "Nested demo workspace with projects and tasks."},
        ),
        Artifact(
            key="release_tasks",
            value=RELEASE_TASKS,
            provenance="preseeded",
            metadata={"description": "Flat view of the May release tasks."},
        ),
        Artifact(
            key="pantry",
            value=PANTRY,
            provenance="preseeded",
            metadata={"description": "Pantry stock used by comparison demos."},
        ),
    ]


def build_limited_tools(ctx: AssistantRunContext, allowed_tools: tuple[str, ...]) -> ToolRegistry:
    return build_harness_tools(ctx).subset(list(allowed_tools))


def resolve_runtime_refs(ctx: AssistantRunContext, value: Any) -> Any:
    if isinstance(value, dict):
        if set(value.keys()) == {"artifact_ref"} and isinstance(value["artifact_ref"], str):
            return ctx.artifacts.get(value["artifact_ref"])
        return {key: resolve_runtime_refs(ctx, item) for key, item in value.items()}
    if isinstance(value, list):
        return [resolve_runtime_refs(ctx, item) for item in value]
    return value


def run_tool_call(ctx: AssistantRunContext, tools: ToolRegistry, call: ToolCallSpec) -> Any:
    resolved_args = resolve_runtime_refs(ctx, call.tool_args)
    result = tools.get(call.tool_name).fn(**resolved_args)
    if call.save_as is not None:
        ctx.artifacts.save(
            call.save_as,
            result,
            source_step_id=ctx.current_step_id,
            provenance="tool_call",
            metadata={"tool_name": call.tool_name},
        )
    return result


def run_json_tool_call(ctx: AssistantRunContext, tools: ToolRegistry, payload: str) -> Any:
    parsed_payload = json.loads(payload)
    return run_tool_call(
        ctx,
        tools,
        ToolCallSpec(
            tool_name=parsed_payload["tool_name"],
            tool_args=parsed_payload.get("tool_args", {}),
            save_as=parsed_payload.get("save_as"),
        ),
    )


def run_scenario(scenario: Scenario) -> tuple[AssistantRunContext, list[Any]]:
    ctx = build_demo_context()
    tools = build_limited_tools(ctx, scenario.allowed_tools)
    outputs = [run_tool_call(ctx, tools, call) for call in scenario.tool_calls]
    scenario.verifier(ctx, outputs)
    return ctx, outputs


def run_json_scenario(scenario: Scenario) -> tuple[AssistantRunContext, list[Any], list[str]]:
    ctx = build_demo_context()
    tools = build_limited_tools(ctx, scenario.allowed_tools)
    payloads = [
        json.dumps(
            {
                "tool_name": call.tool_name,
                "tool_args": call.tool_args,
                "save_as": call.save_as,
            }
        )
        for call in scenario.tool_calls
    ]
    outputs = [run_json_tool_call(ctx, tools, payload) for payload in payloads]
    scenario.verifier(ctx, outputs)
    return ctx, outputs, payloads


def _verify_read_artifact_property(_ctx: AssistantRunContext, outputs: list[Any]) -> None:
    assert outputs[-1].value == "Fix trial billing race"


def _verify_get_artifact_structure(_ctx: AssistantRunContext, outputs: list[Any]) -> None:
    structure = outputs[-1]
    assert "workspace.projects[0].tasks[list_len=6].assignee.city" in structure
    assert "workspace.projects[0].tasks[list_len=6].created_at" in structure


def _verify_create_evidence(_ctx: AssistantRunContext, outputs: list[Any]) -> None:
    evidence_receipt = outputs[-1]
    assert evidence_receipt.kind == "filter"
    assert "Backfill analytics tags" in evidence_receipt.display


def _verify_create_comparison_evidence(ctx: AssistantRunContext, outputs: list[Any]) -> None:
    assert ctx.artifacts.get("requested_onions") == 6
    comparison_evidence = ctx.evidences.get(outputs[-1].key)
    assert comparison_evidence.value["result"] is True


def _verify_filter_items(ctx: AssistantRunContext, outputs: list[Any]) -> None:
    filtered_items = outputs[-1]
    assert [item["id"] for item in filtered_items] == EXPECTED_TODO_TASK_IDS
    assert [item["id"] for item in ctx.artifacts.get("todo_tasks")] == EXPECTED_TODO_TASK_IDS


def _verify_count_items(ctx: AssistantRunContext, _outputs: list[Any]) -> None:
    assert ctx.artifacts.get("todo_task_count") == 3


def _verify_sort_items(ctx: AssistantRunContext, _outputs: list[Any]) -> None:
    assert [item["id"] for item in ctx.artifacts.get("tasks_sorted_by_created_at")[:3]] == EXPECTED_TOP_3_RECENT_TASK_IDS


def _verify_slice_items(ctx: AssistantRunContext, _outputs: list[Any]) -> None:
    assert [item["id"] for item in ctx.artifacts.get("top_three_recent_tasks")] == EXPECTED_TOP_3_RECENT_TASK_IDS


def _verify_distinct_values(_ctx: AssistantRunContext, outputs: list[Any]) -> None:
    assert outputs[-1] == EXPECTED_DISTINCT_CITIES


def _verify_get_first(_ctx: AssistantRunContext, outputs: list[Any]) -> None:
    assert outputs[-1]["id"] == "TASK-106"


def _verify_sum_items(_ctx: AssistantRunContext, outputs: list[Any]) -> None:
    assert outputs[-1] == EXPECTED_STORY_POINTS_SUM


def _verify_average_items(_ctx: AssistantRunContext, outputs: list[Any]) -> None:
    assert abs(outputs[-1] - EXPECTED_STORY_POINTS_AVERAGE) < 1e-9


def _verify_min_item(_ctx: AssistantRunContext, outputs: list[Any]) -> None:
    assert outputs[-1] == 1


def _verify_max_item(_ctx: AssistantRunContext, outputs: list[Any]) -> None:
    assert outputs[-1] == 8


def _verify_compute(_ctx: AssistantRunContext, outputs: list[Any]) -> None:
    assert outputs[-1] == 2.0


def _verify_round_value(_ctx: AssistantRunContext, outputs: list[Any]) -> None:
    assert outputs[-1] == 3.67


def _verify_create_constant_value(ctx: AssistantRunContext, _outputs: list[Any]) -> None:
    assert ctx.artifacts.get("recent_limit") == 3


def _verify_save_artifact(ctx: AssistantRunContext, _outputs: list[Any]) -> None:
    assert ctx.artifacts.get("priority_labels") == ["critical", "high"]


SCENARIOS = [
    Scenario(
        name="read_nested_property",
        primary_tool="read_artifact_property",
        user_request="Read the title of the fourth task in the nested release project object.",
        allowed_tools=("read_artifact_property",),
        tool_calls=(
            ToolCallSpec(
                tool_name="read_artifact_property",
                tool_args={"path": "workspace.projects[0].tasks[3].title"},
            ),
        ),
        verifier=_verify_read_artifact_property,
        expected_answer_substrings=("Fix trial billing race",),
    ),
    Scenario(
        name="describe_nested_task_structure",
        primary_tool="get_artifact_structure",
        user_request="Show the navigable structure for the nested release task list.",
        allowed_tools=("get_artifact_structure",),
        tool_calls=(
            ToolCallSpec(
                tool_name="get_artifact_structure",
                tool_args={"path": "workspace.projects[0].tasks"},
            ),
        ),
        verifier=_verify_get_artifact_structure,
        expected_answer_substrings=("workspace.projects[0].tasks[list_len=6].assignee.city", "created_at"),
    ),
    Scenario(
        name="filter_nested_list_evidence",
        primary_tool="create_evidence",
        user_request="Create evidence for Paris todo tasks inside the nested release task list.",
        allowed_tools=("create_evidence",),
        tool_calls=(
            ToolCallSpec(
                tool_name="create_evidence",
                tool_args={
                    "path": "workspace.projects[0].tasks",
                    "conditions": [
                        {"path": "status", "op": "eq", "value": "todo"},
                        {"path": "assignee.city", "op": "eq", "value": "Paris"},
                    ],
                    "logic": "and",
                    "evidence_name": "Paris todo tasks",
                    "evidence_description": "Release tasks that are still todo and assigned in Paris.",
                },
            ),
        ),
        verifier=_verify_create_evidence,
        expected_answer_substrings=("Backfill analytics tags",),
    ),
    Scenario(
        name="compare_inventory_to_requested_count",
        primary_tool="create_comparison_evidence",
        user_request="Show whether pantry onions are below the requested count.",
        allowed_tools=("create_constant_value", "create_comparison_evidence"),
        tool_calls=(
            ToolCallSpec(
                tool_name="create_constant_value",
                tool_args={
                    "key": "requested_onions",
                    "value": 6,
                    "description": "The recipe needs six onions.",
                },
            ),
            ToolCallSpec(
                tool_name="create_comparison_evidence",
                tool_args={
                    "left_path": "pantry.onions",
                    "op": "lt",
                    "right_path": "requested_onions",
                    "evidence_name": "Need more onions",
                    "evidence_description": "Current pantry stock is below the requested quantity.",
                },
            ),
        ),
        verifier=_verify_create_comparison_evidence,
        expected_answer_substrings=("4", "6"),
    ),
    Scenario(
        name="filter_todo_tasks",
        primary_tool="filter_items",
        user_request="Filter the release tasks down to todo items only.",
        allowed_tools=("filter_items",),
        tool_calls=(
            ToolCallSpec(
                tool_name="filter_items",
                tool_args={
                    "items": {"artifact_ref": "release_tasks"},
                    "conditions": [{"path": "status", "op": "eq", "value": "todo"}],
                },
                save_as="todo_tasks",
            ),
        ),
        verifier=_verify_filter_items,
        expected_answer_substrings=("TASK-102", "TASK-105", "TASK-106"),
    ),
    Scenario(
        name="count_todo_tasks",
        primary_tool="count_items",
        user_request="Count how many release tasks are still todo.",
        allowed_tools=("filter_items", "count_items"),
        tool_calls=(
            ToolCallSpec(
                tool_name="filter_items",
                tool_args={
                    "items": {"artifact_ref": "release_tasks"},
                    "conditions": [{"path": "status", "op": "eq", "value": "todo"}],
                },
                save_as="todo_tasks",
            ),
            ToolCallSpec(
                tool_name="count_items",
                tool_args={"items": {"artifact_ref": "todo_tasks"}},
                save_as="todo_task_count",
            ),
        ),
        verifier=_verify_count_items,
        expected_answer_substrings=("3",),
    ),
    Scenario(
        name="sort_tasks_by_created_at",
        primary_tool="sort_items",
        user_request="Sort release tasks by created_at descending to find the most recent work.",
        allowed_tools=("sort_items",),
        tool_calls=(
            ToolCallSpec(
                tool_name="sort_items",
                tool_args={
                    "items": {"artifact_ref": "release_tasks"},
                    "path": "created_at",
                    "reverse": True,
                },
                save_as="tasks_sorted_by_created_at",
            ),
        ),
        verifier=_verify_sort_items,
        expected_answer_substrings=("TASK-106", "TASK-105", "TASK-104"),
    ),
    Scenario(
        name="slice_top_three_recent_tasks",
        primary_tool="slice_items",
        user_request="Get the three most recent release tasks after sorting by date.",
        allowed_tools=("sort_items", "slice_items"),
        tool_calls=(
            ToolCallSpec(
                tool_name="sort_items",
                tool_args={
                    "items": {"artifact_ref": "release_tasks"},
                    "path": "created_at",
                    "reverse": True,
                },
                save_as="tasks_sorted_by_created_at",
            ),
            ToolCallSpec(
                tool_name="slice_items",
                tool_args={
                    "items": {"artifact_ref": "tasks_sorted_by_created_at"},
                    "start": 0,
                    "end": 3,
                },
                save_as="top_three_recent_tasks",
            ),
        ),
        verifier=_verify_slice_items,
        expected_answer_substrings=("TASK-106", "TASK-105", "TASK-104"),
    ),
    Scenario(
        name="list_distinct_assignee_cities",
        primary_tool="distinct_values",
        user_request="List each distinct assignee city present in the release tasks.",
        allowed_tools=("distinct_values",),
        tool_calls=(
            ToolCallSpec(
                tool_name="distinct_values",
                tool_args={
                    "items": {"artifact_ref": "release_tasks"},
                    "path": "assignee.city",
                },
            ),
        ),
        verifier=_verify_distinct_values,
        expected_answer_substrings=("Paris", "London", "Berlin", "Madrid"),
    ),
    Scenario(
        name="get_most_recent_task",
        primary_tool="get_first",
        user_request="Get the single most recent release task.",
        allowed_tools=("sort_items", "get_first"),
        tool_calls=(
            ToolCallSpec(
                tool_name="sort_items",
                tool_args={
                    "items": {"artifact_ref": "release_tasks"},
                    "path": "created_at",
                    "reverse": True,
                },
                save_as="tasks_sorted_by_created_at",
            ),
            ToolCallSpec(
                tool_name="get_first",
                tool_args={"items": {"artifact_ref": "tasks_sorted_by_created_at"}},
            ),
        ),
        verifier=_verify_get_first,
        expected_answer_substrings=("TASK-106",),
    ),
    Scenario(
        name="sum_story_points",
        primary_tool="sum_items",
        user_request="Sum the story points across the release task list.",
        allowed_tools=("sum_items",),
        tool_calls=(
            ToolCallSpec(
                tool_name="sum_items",
                tool_args={
                    "items": {"artifact_ref": "release_tasks"},
                    "path": "story_points",
                },
            ),
        ),
        verifier=_verify_sum_items,
        expected_answer_substrings=("22",),
    ),
    Scenario(
        name="average_story_points",
        primary_tool="average_items",
        user_request="Average the story points across the release task list.",
        allowed_tools=("average_items",),
        tool_calls=(
            ToolCallSpec(
                tool_name="average_items",
                tool_args={
                    "items": {"artifact_ref": "release_tasks"},
                    "path": "story_points",
                },
            ),
        ),
        verifier=_verify_average_items,
        expected_answer_substrings=("3.666",),
    ),
    Scenario(
        name="minimum_story_points",
        primary_tool="min_item",
        user_request="Find the minimum story point estimate in the release task list.",
        allowed_tools=("min_item",),
        tool_calls=(
            ToolCallSpec(
                tool_name="min_item",
                tool_args={
                    "items": {"artifact_ref": "release_tasks"},
                    "path": "story_points",
                },
            ),
        ),
        verifier=_verify_min_item,
        expected_answer_substrings=("1",),
    ),
    Scenario(
        name="maximum_story_points",
        primary_tool="max_item",
        user_request="Find the maximum story point estimate in the release task list.",
        allowed_tools=("max_item",),
        tool_calls=(
            ToolCallSpec(
                tool_name="max_item",
                tool_args={
                    "items": {"artifact_ref": "release_tasks"},
                    "path": "story_points",
                },
            ),
        ),
        verifier=_verify_max_item,
        expected_answer_substrings=("8",),
    ),
    Scenario(
        name="compute_missing_onions",
        primary_tool="compute",
        user_request="Compute how many onions are still missing from the pantry.",
        allowed_tools=("compute",),
        tool_calls=(
            ToolCallSpec(
                tool_name="compute",
                tool_args={"expression": "6 - 4"},
            ),
        ),
        verifier=_verify_compute,
        expected_answer_substrings=("2",),
    ),
    Scenario(
        name="round_average_story_points",
        primary_tool="round_value",
        user_request="Round the average story points to two decimals.",
        allowed_tools=("round_value",),
        tool_calls=(
            ToolCallSpec(
                tool_name="round_value",
                tool_args={"value": EXPECTED_STORY_POINTS_AVERAGE, "decimals": 2},
            ),
        ),
        verifier=_verify_round_value,
        expected_answer_substrings=("3.67",),
    ),
    Scenario(
        name="save_prompt_constant",
        primary_tool="create_constant_value",
        user_request="Persist the prompt-derived limit of three recent tasks.",
        allowed_tools=("create_constant_value",),
        tool_calls=(
            ToolCallSpec(
                tool_name="create_constant_value",
                tool_args={
                    "key": "recent_limit",
                    "value": 3,
                    "description": "The user asked for the three most recent tasks.",
                },
            ),
        ),
        verifier=_verify_create_constant_value,
        expected_answer_substrings=("recent_limit", "3"),
    ),
    Scenario(
        name="save_manual_artifact",
        primary_tool="save_artifact",
        user_request="Save a manually prepared shortlist as a reusable artifact.",
        allowed_tools=("save_artifact",),
        tool_calls=(
            ToolCallSpec(
                tool_name="save_artifact",
                tool_args={"key": "priority_labels", "value": ["critical", "high"]},
            ),
        ),
        verifier=_verify_save_artifact,
        expected_answer_substrings=("priority_labels", "critical", "high"),
    ),
]
