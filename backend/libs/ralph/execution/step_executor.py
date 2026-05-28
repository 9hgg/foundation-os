"""Execution-time helpers for turning plan steps into structured results."""

from __future__ import annotations

import json
import re
import sys
import traceback
from pprint import pformat
from typing import Any

from pydantic import BaseModel, Field, field_validator

from libs.ml.llm import LLMClient, instructor_query
from libs.ml.llm.structured import StructuredCompletionError

from ..evidence import render_evidences, render_evidences_list
from ..evidence.models import EvidenceReceipt
from ..prompt_rendering import (
    format_messages,
    format_tool_detail,
    format_tools,
    render_artifact_definitions,
    render_observations,
)
from ..state.artifacts import (
    DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS,
    render_prompt_safe_value,
    split_artifact_path,
    summarize_artifact_paths,
)
from ..state.plan_models import PlanStep, StepResult
from ..state.run_context import AssistantRunContext
from ..tools.registry import ToolRegistry
from ..tracing import TRACE


class ToolCallDecision(BaseModel):
    """Model-selected tool call for a single execution turn within a step."""

    use_tool: bool = True
    tool_name: str | None = None
    tool_args: dict[str, Any] = Field(default_factory=dict)
    artifact_key: str | None = Field(
        default=None,
        description=(
            "Optional save-as key for artifact-producing tools only. "
            "Do not use this for path-based tools; put full artifact paths inside tool_args.path."
        ),
    )
    reasoning: str | None = None

    @field_validator("tool_args", mode="before")
    @classmethod
    def _coerce_null_tool_args(cls, value: Any) -> dict[str, Any]:
        """Treat null tool_args as an empty argument object on stop turns."""

        if value is None:
            return {}
        return value


class StepSummaryDecision(BaseModel):
    """Structured summary returned after a step's real tool execution sequence."""

    success: bool
    summary: str
    error: str | None = None
    next_action: str | None = None
    suggested_tools: list[str] = Field(
        default_factory=list,
        description="Tool names from the available list that could help if the step needs more work.",
    )


class StepExecutor:
    """LLM-backed executor for individual plan steps."""

    def __init__(
        self,
        client: LLMClient,
        *,
        model: str | None = None,
        max_tool_calls_per_step: int = 10,
    ) -> None:
        self.client = client
        self.model = model
        self.max_tool_calls_per_step = max_tool_calls_per_step

    def execute(
        self,
        ctx: AssistantRunContext,
        step: PlanStep,
        tools: ToolRegistry,
    ) -> StepResult:
        """Choose tools iteratively, execute them, and summarize the real outcome."""

        artifact_keys: list[str] = []
        call_trace: list[dict[str, object]] = []
        tool_error: str | None = None
        completed_without_more_tools = False
        prompt_tools = self._build_prompt_tools(step, tools)
        callable_tools = prompt_tools
        callable_tool_names = [
            registered_tool.name for registered_tool in callable_tools.as_list()
        ]
        initial_evidence_keys = {evidence.key for evidence in ctx.evidences.all()}
        initial_observation_keys = {
            observation.key for observation in ctx.observations.all()
        }
        step_requires_evidence = self._step_requires_evidence(ctx, step)
        ctx.current_step_id = step.id

        def finish_step(
            summary: StepSummaryDecision,
            *,
            completed_without_more_tools: bool,
        ) -> StepResult:
            observation_keys = self._new_observation_keys(ctx, initial_observation_keys, step.id)
            result = StepResult(
                step_id=step.id,
                success=summary.success,
                summary=summary.summary,
                artifact_keys=artifact_keys,
                evidence_keys=self._new_evidence_keys(ctx, initial_evidence_keys),
                observation_keys=observation_keys,
                error=summary.error,
            )
            TRACE.pretty_block(
                "STEP EXECUTION RESULT",
                {
                    "step_id": step.id,
                    "success": result.success,
                    "artifact_keys": result.artifact_keys,
                    "evidence_keys": result.evidence_keys,
                    "observation_keys": observation_keys,
                    "completed_without_more_tools": completed_without_more_tools,
                    "summary": result.summary,
                    "error": result.error,
                },
                style="green" if result.success else "yellow",
            )
            return result

        try:
            with TRACE.section(f"STEP EXECUTOR {step.id}", style="magenta"):
                tool_turn = 1
                follow_up_instruction: str | None = None
                while tool_turn <= self.max_tool_calls_per_step:
                    try:
                        tool_decision = self._decide_next_tool_call(
                            ctx,
                            step,
                            prompt_tools,
                            tools,
                            step_requires_evidence=step_requires_evidence,
                            callable_tool_names=callable_tool_names,
                            call_trace=call_trace,
                            tool_turn=tool_turn,
                            follow_up_instruction=follow_up_instruction,
                        )
                    except StructuredCompletionError:
                        tool_error = f"Could not parse the model's tool decision after all retries (tool_turn={tool_turn})."
                        call_trace.append(
                            {"tool_turn": tool_turn, "status": "error", "error": tool_error}
                        )
                        TRACE.pretty_block(
                            "TOOL DECISION PARSE FAILURE",
                            {"error": tool_error},
                            style="red",
                        )
                        if tool_turn >= self.max_tool_calls_per_step:
                            break
                        follow_up_instruction = (
                            "The previous tool-decision turn could not be parsed as valid structured output. "
                            "Try again with a valid ToolCallDecision JSON object."
                        )
                        tool_turn += 1
                        continue
                    follow_up_instruction = None
                    decision_trace = {
                        "tool_turn": tool_turn,
                        "decision": tool_decision.model_dump(),
                    }

                    if not tool_decision.use_tool:
                        if step_requires_evidence and not ctx.evidences.all():
                            evidence_error = (
                                "No explicit evidence is available yet. Before stopping, create at least one "
                                "evidence that directly supports the objective."
                            )
                            call_trace.append(
                                {
                                    **decision_trace,
                                    "status": "error",
                                    "error": evidence_error,
                                }
                            )
                            TRACE.pretty_block(
                                "EVIDENCE REQUIRED",
                                {"step_id": step.id, "error": evidence_error},
                                style="yellow",
                            )
                            follow_up_instruction = (
                                "This step still requires explicit evidence before it can stop. "
                                "Choose another tool call and create at least one grounded evidence with "
                                "`create_evidence` that directly supports the step result. "
                                "If the evidence would be too large, first use `get_artifact_structure`, filtering, counting, "
                                "or a narrower property read to identify a more precise path or subset."
                            )
                            tool_turn += 1
                            continue
                        completed_without_more_tools = True
                        call_trace.append({**decision_trace, "status": "done"})
                        summary = self._summarize_step_result(
                            ctx,
                            step,
                            prompt_tools,
                            tools,
                            tool_error=tool_error,
                        )
                        if summary.success or tool_turn >= self.max_tool_calls_per_step:
                            return finish_step(
                                summary,
                                completed_without_more_tools=completed_without_more_tools,
                            )
                        follow_up_instruction = self._build_step_judge_follow_up(summary)
                        call_trace.append(
                            {
                                **decision_trace,
                                "status": "judge_requested_more_work",
                                "judge": summary.model_dump(),
                            }
                        )
                        TRACE.pretty_block(
                            "STEP JUDGE REQUESTED MORE WORK",
                            {
                                "step_id": step.id,
                                "summary": summary.summary,
                                "error": summary.error,
                                "next_action": summary.next_action,
                            },
                            style="yellow",
                        )
                        completed_without_more_tools = False
                        tool_turn += 1
                        continue

                    if tool_decision.tool_name is None:
                        tool_error = (
                            "The model requested tool usage without specifying a tool name."
                        )
                        call_trace.append(
                            {**decision_trace, "status": "error", "error": tool_error}
                        )
                        break

                    available_tool_names = callable_tool_names
                    if tool_decision.tool_name not in available_tool_names:
                        tool_error = (
                            f"Unknown tool requested: {tool_decision.tool_name!r}. "
                            f"Available tools: {', '.join(available_tool_names)}"
                        )
                        call_trace.append(
                            {**decision_trace, "status": "error", "error": tool_error}
                        )
                        TRACE.pretty_block(
                            f"TOOL CALL ERROR {tool_turn}",
                            {
                                "error": tool_error,
                                "requested_tool": tool_decision.tool_name,
                                "available_tools": available_tool_names,
                            },
                            style="red",
                        )
                        follow_up_instruction = (
                            "The previous tool call requested an unavailable tool. "
                            f"You must choose one of the tools for this step only: {', '.join(available_tool_names)}."
                        )
                        tool_turn += 1
                        continue

                    tool_signature: str | None = None
                    try:
                        tool = callable_tools.get(tool_decision.tool_name)
                        tool_signature = self._tool_call_signature(
                            tool.name,
                            tool_decision.tool_args,
                        )
                        previous_call = ctx.tool_call_signatures.get(step.id, {}).get(tool_signature)
                        if previous_call is not None:
                            tool_error = self._build_repeated_tool_call_error(
                                tool_name=tool.name,
                                tool_args=tool_decision.tool_args,
                                previous_call=previous_call,
                            )
                            call_trace.append(
                                {**decision_trace, "status": "error", "error": tool_error}
                            )
                            TRACE.pretty_block(
                                f"TOOL CALL ERROR {tool_turn}",
                                {
                                    "error": tool_error,
                                    "previous_call": previous_call,
                                },
                                style="red",
                            )
                            follow_up_instruction = (
                                f"The previous tool call was rejected because it repeats an earlier tool call.\n\n"
                                f"Error: {tool_error}\n\n"
                                "Do not call the same tool with the same arguments again during this run. "
                                "Reuse the existing artifact, evidence, or observation from the previous call, "
                                "or choose a different tool call with different arguments that gathers missing information."
                            )
                            tool_turn += 1
                            continue

                        ctx.tool_call_signatures.setdefault(step.id, {})[tool_signature] = {
                            "tool_name": tool.name,
                            "tool_args": tool_decision.tool_args,
                            "step_id": step.id,
                            "tool_turn": tool_turn,
                            "status": "started",
                        }
                        resolved_args = self._resolve_runtime_refs(
                            ctx, tool_decision.tool_args
                        )
                        TRACE.kv(
                            f"TOOL CALL {tool_turn}",
                            [
                                ("name", tool.name),
                                ("raw_args", tool_decision.tool_args),
                                (
                                    "resolved_args_preview",
                                    self._compact_preview(resolved_args),
                                ),
                            ],
                            style="cyan",
                        )
                        tool_output = tool.fn(**resolved_args)
                        artifact_key = None
                        if tool.persist_artifact:
                            artifact_key = (
                                tool_decision.artifact_key
                                or f"{step.id}_{tool.name}_{tool_turn}_output"
                            )
                            ctx.artifacts.save(
                                artifact_key,
                                tool_output,
                                source_step_id=step.id,
                                provenance="tool_call",
                                metadata={
                                    "tool_name": tool.name,
                                    "tool_args": tool_decision.tool_args,
                                    "tool_turn": tool_turn,
                                    "step_id": step.id,
                                    "output_schema": prompt_tools.describe_tool(
                                        tool.name, include_schema=True
                                    ).output_schema,
                                },
                            )
                            if artifact_key not in artifact_keys:
                                artifact_keys.append(artifact_key)

                        direct_observation = self._store_direct_tool_observation(
                            ctx,
                            step,
                            tool_turn,
                            tool,
                            tool_output,
                            raw_tool_args=tool_decision.tool_args,
                            artifact_key=artifact_key,
                        )
                        artifact_observation = self._store_artifact_observation(
                            ctx,
                            step,
                            tool_turn,
                            tool,
                            tool_output,
                            artifact_key=artifact_key,
                        )
                        observation_keys = [
                            observation.key
                            for observation in (direct_observation, artifact_observation)
                            if observation is not None
                        ]
                        reusable_artifact_key = self._infer_tool_output_artifact_key(
                            tool_name=tool.name,
                            tool_output=tool_output,
                            persisted_artifact_key=artifact_key,
                        )

                        trace_entry: dict[str, object] = {
                            **decision_trace,
                            "status": "success",
                        }
                        if reusable_artifact_key is not None:
                            trace_entry["artifact_key"] = reusable_artifact_key
                        if observation_keys:
                            trace_entry["observation_keys"] = observation_keys
                        call_trace.append(trace_entry)
                        ctx.tool_call_signatures.setdefault(step.id, {})[tool_signature] = {
                            "tool_name": tool.name,
                            "tool_args": tool_decision.tool_args,
                            "step_id": step.id,
                            "tool_turn": tool_turn,
                            "status": "success",
                            "artifact_key": reusable_artifact_key,
                            "evidence_key": tool_output.key
                            if isinstance(tool_output, EvidenceReceipt)
                            else None,
                            "observation_keys": observation_keys,
                        }
                        tool_error = None
                        trace_result: dict[str, object] = {"name": tool.name}
                        if reusable_artifact_key is not None:
                            trace_result["artifact_key"] = reusable_artifact_key
                        if isinstance(tool_output, EvidenceReceipt):
                            trace_result["evidence_key"] = tool_output.key
                        if observation_keys:
                            trace_result["observation_keys"] = observation_keys
                        trace_result["output_preview"] = self._compact_preview(tool_output)
                        TRACE.pretty_block(f"TOOL CALL RESULT {tool_turn}", trace_result, style="green")
                    except Exception as exc:
                        # DO NOT REMOVE THIS EXCEPTION LOGGING. Tool execution can fail for many reasons, and without this traceback logging, it is extremely difficult to debug issues in tool implementations or unexpected model arguments.

                        print(traceback.format_exc(), file=sys.stderr)

                        tool_error = (
                            f"Tool execution failed for {tool_decision.tool_name!r}: {exc}"
                        )
                        if tool_signature is not None:
                            ctx.tool_call_signatures.setdefault(step.id, {})[tool_signature] = {
                                "tool_name": tool_decision.tool_name,
                                "tool_args": tool_decision.tool_args,
                                "step_id": step.id,
                                "tool_turn": tool_turn,
                                "status": "failed",
                                "error": str(exc),
                            }
                        call_trace.append(
                            {**decision_trace, "status": "error", "error": tool_error}
                        )
                        TRACE.pretty_block(
                            f"TOOL CALL ERROR {tool_turn}",
                            {"error": tool_error},
                            style="red",
                        )
                        prev_call = json.dumps(
                            {
                                "tool_name": tool_decision.tool_name,
                                "tool_args": tool_decision.tool_args,
                            },
                            ensure_ascii=False,
                            default=str,
                        )
                        try:
                            tool_detail = format_tool_detail(
                                prompt_tools.describe_tool(
                                    tool_decision.tool_name, include_schema=True
                                )
                            )
                        except Exception:
                            tool_detail = f"(could not retrieve schema for {tool_decision.tool_name!r})"
                        follow_up_instruction = (
                            f"The previous tool call failed.\n\n"
                            f"You called: {prev_call}\n"
                            f"Error: {exc}\n\n"
                            f"Tool details for reference:\n{tool_detail}\n\n"
                            "Correct the issue and try another tool call. "
                            "If the error says the evidence was too large, use `get_artifact_structure` to identify a more precise path or subset before trying `create_evidence` again."
                        )
                        if "Invalid list index" in str(exc):
                            follow_up_instruction += (
                                "\n\nIf you need an item from a list by a field value, do not guess an index and do not use `[?]`. "
                                "Use `create_evidence` with `path` pointing at the list and `conditions` to select the item. "
                                "Example: {\"path\": \"<artifact>.what_we_have\", "
                                "\"conditions\": [{\"path\": \"name\", \"op\": \"eq\", \"value\": \"onions\"}], "
                                "\"evidence_name\": \"Current onions\", \"evidence_description\": \"The pantry entry for onions.\"}"
                            )
                        tool_turn += 1
                        continue
                    tool_turn += 1
                else:
                    tool_error = (
                        f"Step reached max_tool_calls_per_step={self.max_tool_calls_per_step} "
                        "before the model signaled completion."
                    )
                    call_trace.append(
                        {
                            "tool_turn": self.max_tool_calls_per_step,
                            "status": "error",
                            "error": tool_error,
                        }
                    )
                    TRACE.pretty_block(
                        "TOOL CALL LIMIT REACHED", {"error": tool_error}, style="yellow"
                    )

                summary = self._summarize_step_result(
                    ctx,
                    step,
                    prompt_tools,
                    tools,
                    tool_error=tool_error,
                )
                return finish_step(
                    summary,
                    completed_without_more_tools=completed_without_more_tools,
                )
        finally:
            ctx.current_step_id = None

    def _decide_next_tool_call(
        self,
        ctx: AssistantRunContext,
        step: PlanStep,
        prompt_tools: ToolRegistry,
        all_tools: ToolRegistry,
        *,
        step_requires_evidence: bool,
        callable_tool_names: list[str],
        call_trace: list[dict[str, object]],
        tool_turn: int,
        follow_up_instruction: str | None = None,
    ) -> ToolCallDecision:
        """Ask the model for the next tool call in the step-level execution loop."""

        prompt = self._build_step_prompt(
            ctx,
            step,
            prompt_tools,
            all_tools,
            step_requires_evidence=step_requires_evidence,
            call_trace=call_trace,
            tool_turn=tool_turn,
            follow_up_instruction=follow_up_instruction,
        )
        decision = instructor_query(self.client, prompt, ToolCallDecision, model=self.model)
        TRACE.pretty_block(f"TOOL DECISION {tool_turn}", decision.model_dump(), style="cyan")
        return decision

    def _build_step_prompt(
        self,
        ctx: AssistantRunContext,
        step: PlanStep,
        prompt_tools: ToolRegistry,
        all_tools: ToolRegistry,
        *,
        step_requires_evidence: bool,
        call_trace: list[dict[str, object]],
        tool_turn: int,
        follow_up_instruction: str | None,
    ) -> str:
        """Compose the full step-execution prompt."""

        # --- plan context ---
        plan = ctx.plan
        step_ids_done = {r.step_id for r in ctx.step_results}
        step_index = 1
        total_steps = 1
        plan_lines: list[str] = []
        if plan is not None:
            total_steps = len(plan.steps)
            for i, plan_step in enumerate(plan.steps, 1):
                if plan_step.id == step.id:
                    step_index = i
                    marker = "▶ CURRENT"
                elif plan_step.id in step_ids_done:
                    marker = "✓ DONE"
                else:
                    marker = "○ PENDING"
                plan_lines.append(f"  {i}. [{marker}] {plan_step.id}: {plan_step.instruction}")

        # --- evidence split ---
        this_step_evidences = [e for e in ctx.evidences.all() if e.source_step_id == step.id]
        prior_evidences = [e for e in ctx.evidences.all() if e.source_step_id != step.id]

        # --- evidence gate ---
        if this_step_evidences:
            evidence_gate = (
                "Evidence already created in this step — you may stop once the step objective is met.\n"
                "The downstream judge will verify whether the evidence supports the expected outcome."
            )
        elif step_requires_evidence:
            evidence_gate = (
                "NO evidence yet — this step must create at least one evidence before stopping.\n"
                "The downstream judge can only read explicit evidences, not artifacts or observations.\n"
                "Setting use_tool=false without evidence will be rejected.\n\n"
                "Call create_evidence to ground a fact from an artifact. Examples using your current artifacts:\n"
                + self._build_create_evidence_examples(ctx, step)
            )
        else:
            evidence_gate = (
                "No evidence yet — acceptable if this step only prepares data for a later evidence step.\n"
                "You may stop once this step's own objective is met."
            )

        # --- tool split ---
        prompt_tool_names = {t.name for t in prompt_tools.as_list()}
        other_tools = all_tools.subset(
            [t.name for t in all_tools.as_list() if t.name not in prompt_tool_names]
        )

        # --- failures from trace ---
        failures = [e for e in call_trace if e.get("status") == "error"]

        # --- already-used tools hint ---
        used_tool_names = [
            str(e.get("decision", {}).get("tool_name", ""))
            for e in call_trace
            if e.get("status") == "success" and e.get("decision", {}).get("tool_name")
        ]
        repetition_hint = ""
        if used_tool_names:
            repetition_hint = (
                f"\nTools already called successfully this step: {', '.join(dict.fromkeys(used_tool_names))}.\n"
                "If you already have what you need from a tool, do not call it again with the same args — "
                "chain its artifact to another tool instead."
            )

        sections: list[str] = [
            (
                "You are the execution engine for one step of an assistant plan.\n"
                "Your role is to manipulate artifacts using tools — you are the GLUE between raw data and the final answer.\n"
                "You do not analyse artifact contents directly; you call tools that operate on them."
            ),
            (
                f"== PLAN ==\n"
                f"Objective: {plan.objective if plan else '<unknown>'}\n\n"
                + "\n".join(plan_lines)
            ),
            (
                f"== YOUR CURRENT MISSION ==\n"
                f"Step {step_index}/{total_steps}: {step.id}\n"
                f"Instruction: {step.instruction}\n"
                f"Expected output: {step.expected_output or '(not specified)'}\n\n"
                f"Tool turn: {tool_turn} / {self.max_tool_calls_per_step}  "
                f"— reaching the limit without stopping marks this step as FAILED."
            ),
            "== USER REQUEST ==\n" + format_messages(ctx.messages),
            (
                "== ARTIFACTS ==\n"
                "Artifacts are large durable Python objects stored by key. You cannot read their full contents.\n"
                "Pass one to a tool with: {\"artifact_ref\": \"<key>\"} — the runtime resolves it before calling the tool.\n\n"
                + render_artifact_definitions(ctx.artifacts)
            ),
            (
                "== OBSERVATIONS ==\n"
                "Observations are small inline outputs you can read directly here.\n\n"
                "Previous-step observations:\n"
                + render_observations(ctx.observations.describe_for_prompt(phase="step", exclude_source_step_id=step.id))
                + "\n\nCurrent-step observations (produced by your tool calls so far):\n"
                + render_observations(ctx.observations.describe_for_prompt(phase="step", source_step_id=step.id))
            ),
            (
                "== TOOLS ==\n\n"
                "Recommended tools for this step (full details):\n"
                + format_tools(prompt_tools, include_schema=True)
                + "\n\nOther available tools (short descriptions only):\n"
                + format_tools(other_tools, include_schema=False, use_short_description=True)
                + "\n\nPath syntax rules:\n"
                "• Tool `path` arguments are full artifact paths, e.g. `incident_digest[0].impact` or `pantry.what_we_have`.\n"
                "• [list_len=N] in structure observations is a SIZE HINT only — remove it or use [0], [1] etc. in actual paths.\n"
                "• Pass artifact data as {\"artifact_ref\": \"<key>\"}, not inline. Works recursively in nested args."
                + repetition_hint
            ),
            (
                "== EVIDENCE — EXIT GATE ==\n"
                "Evidence = a small grounded excerpt extracted from an artifact. "
                "The downstream judge reads ONLY evidences — not artifacts, not observations.\n\n"
                f"Status: {evidence_gate}\n\n"
                "Evidence you produced in this step so far:\n"
                + (render_evidences_list(this_step_evidences) if this_step_evidences else "<none yet>")
                + "\n\nEvidence produced by previous steps:\n"
                + (render_evidences_list(prior_evidences) if prior_evidences else "<none>")
            ),
            (
                "== DECISION RULES ==\n"
                "• Call tools to manipulate artifacts — never try to reason over their full content directly.\n"
                "• Stay inside the current mission. Do not perform work assigned to pending steps.\n"
                "• For a data-acquisition step, once the requested source tool has produced the needed artifact, set use_tool=false so the next step can continue.\n"
                "• Never repeat an exact tool call in the same run. If the same tool with the same arguments already ran, reuse its artifact/evidence/observation instead.\n"
                "• Use {\"artifact_ref\": \"<key>\"} to pass artifact values to tools.\n"
                "• To select list items by a field such as name/status/country, prefer `create_evidence` with `path` plus `conditions`; do not guess list indexes.\n"
                "• If evidence is too large, narrow it with get_artifact_structure, filtering, or property reads first.\n"
                "• Return a ToolCallDecision. Set use_tool=false only once the exit gate above is satisfied."
            ),
        ]

        if failures:
            failure_lines = [
                f"  • turn {e.get('tool_turn')}: {e.get('error', '(unknown error)')}"
                for e in failures
            ]
            sections.append("== PREVIOUS FAILURES IN THIS STEP ==\n" + "\n".join(failure_lines))

        if follow_up_instruction:
            sections.append("== FOLLOW-UP INSTRUCTION ==\n" + follow_up_instruction)

        return "\n\n".join(sections)

    def _summarize_step_result(
        self,
        ctx: AssistantRunContext,
        step: PlanStep,
        prompt_tools: ToolRegistry,
        all_tools: ToolRegistry,
        *,
        tool_error: str | None,
    ) -> StepSummaryDecision:
        """Summarize a step after executing its real tool call sequence."""

        prompt = "\n\n".join(
            [
                "Judge whether this assistant plan step succeeded.",
                f"Global objective: {ctx.plan.objective if ctx.plan is not None else '<unknown>'}",
                "Full plan:",
                ctx.plan.model_dump_json() if ctx.plan is not None else "<unknown>",
                f"Step being judged: {step.model_dump_json()}",
                "User request:",
                format_messages(ctx.messages),
                (
                    "Judging rules:\n"
                    "• Judge from explicit evidences plus bounded previous-step and current-step observations.\n"
                    "• Do NOT infer hidden artifact contents from tool success or artifact existence alone.\n"
                    "• Do NOT mark success just because a tool ran — the evidence must contain the concrete fact required by the expected output.\n"
                    "• For delta questions such as buy/restock/missing/how many more, require grounding for both the target value and the current value, or a directly evidenced computed delta.\n"
                    "• Do NOT accept unevidenced assumptions such as 'no constraints are provided' when relevant artifacts or data tools exist.\n"
                    "• A failed turn does NOT automatically mean a failed step."
                ),
                "Available artifacts (definitions only — no content):",
                render_artifact_definitions(ctx.artifacts),
                "Explicit evidences (this is what you judge from):",
                render_evidences(ctx.evidences),
                "Previous-step observations:",
                render_observations(
                    ctx.observations.describe_for_prompt(phase="step", exclude_source_step_id=step.id)
                ),
                "Current-step observations:",
                render_observations(
                    ctx.observations.describe_for_prompt(phase="step", source_step_id=step.id)
                ),
                "All available tools (use suggested_tools to name ones that could help if the step needs more work):",
                format_tools(all_tools, include_schema=False, use_short_description=True),
                (
                    f"Execution issue: {json.dumps(tool_error, ensure_ascii=False)}"
                    if tool_error is not None
                    else "Execution issue: <none>"
                ),
                (
                    "Return a StepSummaryDecision:\n"
                    "• success: true only if the step's objective is met with sufficient grounding in evidence.\n"
                    "• summary: concise statement of what was achieved or why it failed.\n"
                    "• error: blocker explanation when success=false.\n"
                    "• next_action: when success=false, one concrete corrective action for the next tool turn.\n"
                    "• suggested_tools: when success=false, list tool names from the available tools above "
                    "that could help gather the missing information (e.g. ['get_artifact_structure', 'filter_items', 'create_evidence'])."
                ),
            ]
        )

        return instructor_query(
            self.client,
            prompt,
            StepSummaryDecision,
            model=self.model,
        )

    def _build_create_evidence_examples(
        self,
        ctx: AssistantRunContext,
        step: PlanStep,
    ) -> str:
        """Generate concrete create_evidence JSON examples from the artifacts in context."""

        artifacts = ctx.artifacts.all()
        if not artifacts:
            return (
                '- {"use_tool": true, "tool_name": "create_evidence", '
                '"tool_args": {"path": "<artifact_or_property_path>", "evidence_name": "...", "evidence_description": "..."}}'
            )

        # Prefer step-produced artifacts, then pre-seeded, then the rest
        def sort_key(a: object) -> int:
            src = getattr(a, "source_step_id", None)
            prov = getattr(a, "provenance", "")
            if src == step.id:
                return 0
            if prov == "preseeded":
                return 1
            return 2

        candidates = sorted(artifacts, key=sort_key)[:3]
        lines: list[str] = []
        for artifact in candidates:
            key = artifact.key
            try:
                value = artifact.load()
            except Exception:
                value = None

            if isinstance(value, list):
                condition_path = "<field>"
                condition_value = "<val>"
                if value and isinstance(value[0], dict):
                    if "name" in value[0]:
                        condition_path = "name"
                        condition_value = "<item name>"
                    else:
                        condition_path = str(next(iter(value[0]), "<field>"))
                lines.append(
                    f'- Filter evidence (list artifact): {{"use_tool": true, "tool_name": "create_evidence", '
                    f'"tool_args": {{"path": "{key}", '
                    f'"conditions": [{{"path": "{condition_path}", "op": "eq", "value": "{condition_value}"}}], '
                    f'"logic": "and", "evidence_name": "...", "evidence_description": "..."}}}}'
                )
            elif isinstance(value, dict):
                nested_list_field = None
                for field_name, field_value in value.items():
                    if (
                        isinstance(field_value, list)
                        and field_value
                        and isinstance(field_value[0], dict)
                    ):
                        nested_list_field = field_name
                        break
                if nested_list_field is not None:
                    lines.append(
                        f'- Nested list evidence (dict artifact): {{"use_tool": true, "tool_name": "create_evidence", '
                        f'"tool_args": {{"path": "{key}.{nested_list_field}", '
                        f'"conditions": [{{"path": "name", "op": "eq", "value": "<item name>"}}], '
                        f'"logic": "and", "evidence_name": "...", "evidence_description": "..."}}}}'
                    )
                else:
                    field = next(iter(value), "<field>")
                    lines.append(
                        f'- Property evidence (dict artifact): {{"use_tool": true, "tool_name": "create_evidence", '
                        f'"tool_args": {{"path": "{key}.{field}", '
                        f'"evidence_name": "...", "evidence_description": "..."}}}}'
                    )
            else:
                lines.append(
                    f'- Scalar evidence: {{"use_tool": true, "tool_name": "create_evidence", '
                    f'"tool_args": {{"path": "{key}", '
                    f'"evidence_name": "...", "evidence_description": "..."}}}}'
                )
        return "\n".join(lines)

    def _build_step_judge_follow_up(self, summary: StepSummaryDecision) -> str:
        """Turn a failed step judgement into an actionable next-turn instruction."""

        guidance = summary.next_action or summary.error or summary.summary
        suggested = (
            f"\nJudge suggested tools to try: {', '.join(summary.suggested_tools)}"
            if summary.suggested_tools
            else ""
        )
        return (
            "The step judge reviewed the available grounding and decided this step is not complete yet.\n\n"
            f"Judge summary: {summary.summary}\n"
            f"Judge error: {summary.error or '<none>'}\n"
            f"Requested next action: {guidance}"
            f"{suggested}\n\n"
            "Use another tool turn to gather or create the missing grounded evidence. "
            "Do not repeat an exact previous tool call; change the arguments or reuse the existing result."
        )

    def _tool_call_signature(self, tool_name: str, tool_args: dict[str, Any]) -> str:
        """Return a stable run-wide identity for one tool call."""

        return f"{tool_name}:{self._canonicalize_tool_args(tool_args)}"

    def _canonicalize_tool_args(self, tool_args: dict[str, Any]) -> str:
        """Render tool args deterministically for duplicate-call detection."""

        return json.dumps(
            tool_args,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=repr,
        )

    def _build_repeated_tool_call_error(
        self,
        *,
        tool_name: str,
        tool_args: dict[str, Any],
        previous_call: dict[str, object],
    ) -> str:
        """Build the user/model-facing error for a repeated tool call."""

        previous_location = (
            f"step {previous_call.get('step_id', '<unknown>')} "
            f"turn {previous_call.get('tool_turn', '<unknown>')}"
        )
        args_preview = self._compact_preview(tool_args)
        status = previous_call.get("status")
        if status == "success":
            reusable_parts: list[str] = []
            artifact_key = previous_call.get("artifact_key")
            evidence_key = previous_call.get("evidence_key")
            observation_keys = previous_call.get("observation_keys")
            if artifact_key:
                reusable_parts.append(f"artifact {artifact_key!r}")
            if evidence_key:
                reusable_parts.append(f"evidence {evidence_key!r}")
            if observation_keys:
                reusable_parts.append(f"observations {observation_keys!r}")
            reusable = (
                f" Reuse the existing {' / '.join(reusable_parts)} instead of calling the tool again."
                if reusable_parts
                else " Reuse the existing result instead of calling the tool again."
            )
            return (
                f"Repeated tool call is not allowed: {tool_name} with args {args_preview} "
                f"already succeeded in {previous_location}.{reusable}"
            )
        if status == "failed":
            return (
                f"Repeated tool call is not allowed: {tool_name} with args {args_preview} "
                f"already failed in {previous_location}. Change the arguments or choose a different tool; "
                "do not retry the exact same failed call."
            )
        return (
            f"Repeated tool call is not allowed: {tool_name} with args {args_preview} "
            f"was already attempted in {previous_location}."
        )

    def _infer_tool_output_artifact_key(
        self,
        *,
        tool_name: str,
        tool_output: object,
        persisted_artifact_key: str | None,
    ) -> str | None:
        """Return the reusable artifact key associated with a successful tool call."""

        if persisted_artifact_key is not None:
            return persisted_artifact_key
        if tool_name == "create_constant_value":
            key = getattr(tool_output, "key", None)
            return key if isinstance(key, str) else None
        if tool_name == "save_artifact" and isinstance(tool_output, dict):
            key = tool_output.get("key")
            return key if isinstance(key, str) else None
        return None

    def _resolve_runtime_refs(self, ctx: AssistantRunContext, value: Any) -> Any:
        """Resolve artifact references embedded in model-produced arguments."""

        if isinstance(value, dict):
            if set(value.keys()) == {"artifact_ref"} and isinstance(
                value["artifact_ref"], str
            ):
                return ctx.artifacts.get(value["artifact_ref"])
            return {
                key: self._resolve_runtime_refs(ctx, item)
                for key, item in value.items()
            }
        if isinstance(value, list):
            return [self._resolve_runtime_refs(ctx, item) for item in value]
        return value

    def _build_prompt_tools(self, step: PlanStep, tools: ToolRegistry) -> ToolRegistry:
        """Return prompt-visible tools for one step.

        Step ``tool_names`` remain guidance for planning and prompting, but execution is
        intentionally allowed to use the complete registry to recover from imperfect plans.
        """

        return tools

    def _step_requires_evidence(
        self,
        ctx: AssistantRunContext,
        step: PlanStep,
    ) -> bool:
        """Return whether the current step must create evidence before stopping."""

        if self._is_obviously_conversational_turn(ctx):
            return False

        normalized_tool_names = {tool_name.strip() for tool_name in step.tool_names}
        if "create_evidence" in normalized_tool_names:
            return True

        step_text = " ".join(
            part.lower()
            for part in (step.instruction, step.expected_output or "")
            if part
        )
        if "evidence" in step_text:
            return True

        if ctx.plan is None:
            return False

        try:
            step_index = next(
                index
                for index, plan_step in enumerate(ctx.plan.steps)
                if plan_step.id == step.id
            )
        except StopIteration:
            return True

        is_last_step = step_index == len(ctx.plan.steps) - 1
        return is_last_step

    def _is_obviously_conversational_turn(self, ctx: AssistantRunContext) -> bool:
        """Return True for short social turns that should not require evidence.

        This bypass is intentionally narrow: it applies only to greeting/ack/thanks/
        politeness-like turns and avoids data-retrieval style requests.
        """

        latest_user_message = ""
        for message in reversed(ctx.messages):
            if message.get("role") == "user":
                latest_user_message = str(message.get("content", "")).strip().lower()
                break

        if not latest_user_message:
            return False

        compact_message = re.sub(r"[\s\.,;:!?()\[\]{}\"'`-]+", " ", latest_user_message).strip()
        if not compact_message:
            return False

        tokens = compact_message.split()
        if len(tokens) > 8:
            return False

        conversational_patterns = {
            "hi",
            "hello",
            "hey",
            "yo",
            "bonjour",
            "salut",
            "coucou",
            "bonsoir",
            "merci",
            "thanks",
            "thank you",
            "ok",
            "okay",
            "d accord",
            "please",
            "stp",
            "svp",
            "continue",
            "vas y",
        }

        if compact_message in conversational_patterns:
            return True

        if compact_message.startswith("merci ") or compact_message.startswith("thanks "):
            return True

        return False

    def _new_evidence_keys(
        self,
        ctx: AssistantRunContext,
        initial_evidence_keys: set[str],
    ) -> list[str]:
        """Return evidence keys created during the current step."""

        return [
            evidence.key
            for evidence in ctx.evidences.all()
            if evidence.key not in initial_evidence_keys
        ]

    def _new_observation_keys(
        self,
        ctx: AssistantRunContext,
        initial_observation_keys: set[str],
        step_id: str,
    ) -> list[str]:
        """Return observation keys created during the current step."""

        return [
            observation.key
            for observation in ctx.observations.all()
            if observation.key not in initial_observation_keys
            and observation.phase == "step"
            and observation.source_step_id == step_id
        ]

    def _store_direct_tool_observation(
        self,
        ctx: AssistantRunContext,
        step: PlanStep,
        tool_turn: int,
        tool: object,
        tool_output: object,
        *,
        raw_tool_args: dict[str, Any],
        artifact_key: str | None,
    ):
        """Return one bounded observation that can help the next tool-decision turn."""

        observation_mode = getattr(tool, "observation_mode", "none")
        if observation_mode == "none":
            return None
        renderer = getattr(tool, "observation_renderer", None)
        content = (
            renderer(tool_output)
            if callable(renderer)
            else render_prompt_safe_value(tool_output)
        )
        if (
            observation_mode == "carry_inline_if_small"
            and len(content) > DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS
        ):
            return None
        if len(content) > DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS:
            content = f"{content[:DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS]}..."
        return ctx.observations.create(
            key=f"{step.id}_{getattr(tool, 'name', 'tool')}_{tool_turn}_observation",
            tool_name=getattr(tool, "name", "unknown_tool"),
            content=content,
            artifact_key=self._infer_observation_artifact_key(
                tool_name=getattr(tool, "name", "unknown_tool"),
                raw_tool_args=raw_tool_args,
                artifact_key=artifact_key,
            ),
            source_step_id=step.id,
            phase="step",
            metadata={"tool_turn": tool_turn},
        )

    def _store_artifact_observation(
        self,
        ctx: AssistantRunContext,
        step: PlanStep,
        tool_turn: int,
        tool: object,
        tool_output: object,
        *,
        artifact_key: str | None,
    ):
        """Create one observation derived from a newly persisted artifact when configured."""

        if artifact_key is None:
            return None

        artifact_observation_mode = getattr(tool, "artifact_observation_mode", "structure")
        if artifact_observation_mode == "none":
            return None

        if artifact_observation_mode == "custom":
            builder = getattr(tool, "artifact_observation_builder", None)
            if not callable(builder):
                return None
            content = builder(artifact_key, tool_output)
            if not content:
                return None
        else:
            if not isinstance(tool_output, (dict, list)):
                return None
            content = "\n".join(
                summarize_artifact_paths(
                    tool_output,
                    root=artifact_key,
                    max_paths=100,
                )
            )
            if not content:
                return None

        if len(content) > DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS:
            content = f"{content[:DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS]}..."

        return ctx.observations.create(
            key=f"{step.id}_{getattr(tool, 'name', 'tool')}_{tool_turn}_artifact_observation",
            tool_name="artifact_structure",
            content=content,
            artifact_key=artifact_key,
            source_step_id=step.id,
            phase="step",
            metadata={
                "tool_turn": tool_turn,
                "source_tool_name": getattr(tool, "name", "unknown_tool"),
            },
        )

    def _infer_observation_artifact_key(
        self,
        *,
        tool_name: str,
        raw_tool_args: dict[str, Any],
        artifact_key: str | None,
    ) -> str | None:
        """Infer which artifact an observation is about."""

        if artifact_key is not None:
            return artifact_key
        if isinstance(raw_tool_args.get("artifact_key"), str):
            return raw_tool_args["artifact_key"]
        if tool_name in {"read_artifact_property", "get_artifact_structure", "create_evidence"}:
            path = raw_tool_args.get("path")
            if isinstance(path, str) and path.strip():
                try:
                    inferred_key, _ = split_artifact_path(path)
                except Exception:
                    return None
                return inferred_key
        if tool_name == "create_comparison_evidence":
            path = raw_tool_args.get("left_path")
            if isinstance(path, str) and path.strip():
                try:
                    inferred_key, _ = split_artifact_path(path)
                except Exception:
                    return None
                return inferred_key
        return None

    def _compact_preview(self, value: Any, *, preview_chars: int = 500) -> str:
        """Return a bounded printable preview for prompt inclusion."""

        rendered = pformat(value, compact=False, width=100)
        if len(rendered) <= preview_chars:
            return rendered
        return f"{rendered[:preview_chars]}...<truncated>"
