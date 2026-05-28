"""Tests for execution-loop guardrails."""

from __future__ import annotations

from typing import Any, cast

from libs.ralph.execution.step_executor import StepExecutor


def _executor() -> StepExecutor:
    return StepExecutor(cast(Any, object()))


def test_tool_call_signature_is_stable_for_dict_key_order() -> None:
    executor = _executor()

    assert executor._tool_call_signature("read_artifact_property", {"b": 2, "a": 1}) == (
        executor._tool_call_signature("read_artifact_property", {"a": 1, "b": 2})
    )


def test_repeated_tool_call_error_mentions_reusable_artifact() -> None:
    executor = _executor()

    message = executor._build_repeated_tool_call_error(
        tool_name="magic_tool",
        tool_args={"question": "inventory"},
        previous_call={
            "step_id": "step_1",
            "tool_turn": 2,
            "status": "success",
            "artifact_key": "step_1_magic_tool_2_output",
            "observation_keys": ["obs_1"],
        },
    )

    assert "Repeated tool call is not allowed" in message
    assert "already succeeded in step step_1 turn 2" in message
    assert "step_1_magic_tool_2_output" in message
