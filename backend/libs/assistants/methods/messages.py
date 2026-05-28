"""Message format conversion and persistence helpers for the assistant task."""

import json
from collections.abc import Mapping
from typing import Any

from libs.conversations.models import Conversation
from libs.logger.customLogger import print_color
from libs.messages.models import Message
from libs.ralph.evidence.models import Evidence
from libs.ralph.state.plan_models import Plan
from libs.ralph.state.plan_models import StepResult

from ..constants import _AI_RESPONSE_KIND, _THINKING_KIND


def _build_ralph_messages(messages: list[Message]) -> list[dict[str, str]]:
    """Convert non-thinking DB messages to ralph's ``list[dict[str, str]]`` format."""

    result: list[dict[str, str]] = []
    for msg in messages:
        if msg.kind == _THINKING_KIND:
            continue
        role = "assistant" if msg.kind == _AI_RESPONSE_KIND else "user"
        result.append({"role": role, "content": msg.content or ""})
    return result


def _persist_messages(
    conversation_db: Conversation,
    assistant_name: str,
    step_results: list[StepResult],
    reply: str,
    *,
    plan: Plan | None = None,
    tool_call_signatures: Mapping[str, Mapping[str, dict[str, Any]]] | None = None,
    evidences: list[Evidence] | None = None,
) -> str:
    """Persist thinking steps (if any) and the reply. Returns the reply message id."""

    if step_results:
        thinking_content = build_ralph_thinking_content(
            step_results,
            plan=plan,
            tool_call_signatures=tool_call_signatures,
            evidences=evidences,
        )
        Message.create(
            obj_dict={
                "conversation_id": str(conversation_db.id),
                "content": thinking_content,
                "kind": _THINKING_KIND,
                "title": f"{assistant_name} thinking",
            }
        )
        print_color(
            "cyan",
            f"[assistant] saved thinking message ({len(step_results)} steps)",
        )

    new_message = Message.create(
        obj_dict={
            "conversation_id": str(conversation_db.id),
            "content": reply,
            "kind": "assistant-response",
            "title": f"{assistant_name} reply",
        }
    )
    print_color("green", f"[assistant] saved reply as message {new_message.id}")
    return str(new_message.id)


def build_ralph_thinking_content(
    step_results: list[StepResult],
    *,
    plan: Plan | None = None,
    tool_call_signatures: Mapping[str, Mapping[str, dict[str, Any]]] | None = None,
    evidences: list[Evidence] | None = None,
) -> str:
    """Build markdown content for the assistant-thinking message from ralph step results."""

    return _build_ralph_thinking_content_detailed(
        step_results,
        plan=plan,
        tool_call_signatures=tool_call_signatures,
        evidences=evidences,
    )


def _build_ralph_thinking_content_detailed(
    step_results: list[StepResult],
    *,
    plan: Plan | None = None,
    tool_call_signatures: Mapping[str, Mapping[str, dict[str, Any]]] | None = None,
    evidences: list[Evidence] | None = None,
) -> str:
    evidence_by_key = {evidence.key: evidence for evidence in (evidences or [])}

    lines = ["**Assistant reasoning steps:**\n"]
    if plan is not None:
        lines.append(f"**Plan objective:** {plan.objective}")
        if plan.steps:
            lines.append("**Plan steps:**")
            for index, plan_step in enumerate(plan.steps, start=1):
                lines.append(f"{index}. {plan_step.id} - {plan_step.instruction}")
                if plan_step.expected_output:
                    lines.append(f"   Expected: {plan_step.expected_output}")
                if plan_step.tool_names:
                    lines.append(f"   Tools: {', '.join(plan_step.tool_names)}")
        lines.append("")

    for step in step_results:
        status_icon = "✅" if step.success else "⚠️"
        lines.append(f"- {status_icon} **{step.step_id}**: {step.summary}")
        if step.artifact_keys:
            lines.append(f"  📦 Data: {', '.join(step.artifact_keys)}")
        step_tool_calls = list((tool_call_signatures or {}).get(step.step_id, {}).values())
        if step_tool_calls:
            lines.append("  🔧 Tool calls:")
            step_tool_calls_sorted = sorted(
                step_tool_calls,
                key=lambda call: int(call.get("tool_turn") or 0),
            )
            for tool_call in step_tool_calls_sorted:
                tool_name = str(tool_call.get("tool_name") or "<unknown>")
                tool_status = str(tool_call.get("status") or "unknown")
                raw_args = tool_call.get("tool_args") or {}
                args_repr = json.dumps(raw_args, ensure_ascii=False, sort_keys=True)
                lines.append(f"    - turn {tool_call.get('tool_turn')}: {tool_name}({args_repr}) [{tool_status}]")
                artifact_key = tool_call.get("artifact_key")
                if artifact_key:
                    lines.append(f"      artifact: {artifact_key}")
                evidence_key = tool_call.get("evidence_key")
                if evidence_key:
                    lines.append(f"      evidence: {evidence_key}")
                observation_keys = tool_call.get("observation_keys") or []
                if observation_keys:
                    lines.append(f"      observations: {', '.join(str(key) for key in observation_keys)}")

        if step.evidence_keys:
            lines.append(f"  🔎 Evidence: {', '.join(step.evidence_keys)}")
            for evidence_key in step.evidence_keys:
                evidence = evidence_by_key.get(evidence_key)
                if evidence is None:
                    continue
                lines.append(f"    - {evidence.key}: {evidence.expression}")
                if evidence.description:
                    lines.append(f"      description: {evidence.description}")
                display = evidence.display().replace("\n", " ")
                if len(display) > 240:
                    display = f"{display[:240]}..."
                lines.append(f"      value: {display}")
        if step.observation_keys:
            lines.append(f"  🧭 Observations: {', '.join(step.observation_keys)}")
        if step.error:
            lines.append(f"  ❌ Error: {step.error}")
    return "\n".join(lines)
