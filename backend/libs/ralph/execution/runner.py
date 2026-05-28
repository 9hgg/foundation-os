"""Coordinator for Ralph's plan, execute, and answer lifecycle."""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import asdict
from typing import Literal

from pydantic import BaseModel, Field

from libs.ml.llm import LLMClient, get_llm_token_usage_summary, instructor_query, reset_llm_token_usage_summary
from libs.ml.llm.structured import StructuredCompletionError

from ..context.auto_context import AutoContextBuilder
from ..planning.planner import Planner
from ..prompt_rendering import format_messages
from ..state.artifacts import Artifact
from ..state.plan_models import ObjectiveAnswer, Plan, StepResult
from ..state.run_context import AssistantRunContext
from ..tools.local_tools import build_harness_tools
from ..tools.registry import ToolRegistry
from ..tracing import TRACE
from .judges import ObjectiveJudge
from .step_executor import StepExecutor


class AssistantRunner:
    """Runs the full assistant workflow for a conversation."""

    def __init__(
        self,
        client: LLMClient,
        *,
        context_builder: AutoContextBuilder | None = None,
        tool_builder: Callable[[AssistantRunContext], ToolRegistry] | None = None,
        model: str | None = None,
        max_plan_attempts: int = 2,
        max_tool_calls_per_step: int | None = None,
        max_turns_per_step: int | None = None,
    ) -> None:
        self.client = client
        self.context_builder = context_builder or AutoContextBuilder()
        self.tool_builder = tool_builder or build_harness_tools
        self.planner = Planner(client, model=model)
        turn_limit = max_turns_per_step if max_turns_per_step is not None else max_tool_calls_per_step
        self.step_executor = StepExecutor(
            client,
            model=model,
            max_tool_calls_per_step=max(1, turn_limit or 10),
        )
        self.objective_judge = ObjectiveJudge(client, model=model)
        self.max_plan_attempts = max(1, max_plan_attempts)

    def run(
        self,
        messages: list[dict[str, str]],
        *,
        base_artifacts: list[Artifact] | None = None,
    ) -> ObjectiveAnswer:
        """Build context, produce a plan, execute steps, and answer the objective."""

        _, answer = self.run_with_context(messages, base_artifacts=base_artifacts)
        return answer

    def run_with_context(
        self,
        messages: list[dict[str, str]],
        *,
        base_artifacts: list[Artifact] | None = None,
    ) -> tuple[AssistantRunContext, ObjectiveAnswer]:
        """Run the workflow and return the accumulated context for debugging reports."""

        with TRACE.section("RALPH RUN", style="magenta"):
            reset_llm_token_usage_summary()
            TRACE.kv(
                "Run Inputs",
                [("messages", len(messages)), ("base_artifacts", len(base_artifacts or []))],
                style="magenta",
            )
            auto_context = self.context_builder.build(messages, base_artifacts=base_artifacts)
            ctx = AssistantRunContext(messages=messages, auto_context=auto_context)

            tools = self.tool_builder(ctx)
            TRACE.kv("Tools", [("count", len(tools.as_list()))], style="cyan")

            if self._should_force_plan(ctx, tools):
                pre_planning_decision = PrePlanningDecision(decision="plan")
            else:
                pre_planning_decision = self._decide_pre_planning_action(ctx, tools)

            if pre_planning_decision is not None and pre_planning_decision.decision != "plan":
                answer_text = ""
                missing_information: list[str] = []
                if pre_planning_decision.decision == "ask_clarification":
                    answer_text = (pre_planning_decision.clarification_question or "Could you clarify what you want me to do?").strip()
                    missing_information = [
                        "The latest user turn did not include a clear actionable request."
                    ]
                else:
                    answer_text = (pre_planning_decision.direct_answer or "Hello! How can I help you today?").strip()

                answer = ObjectiveAnswer(
                    answer=answer_text,
                    success=True,
                    missing_information=missing_information,
                )
                llm_token_usage = asdict(get_llm_token_usage_summary())
                ctx.llm_token_usage = llm_token_usage
                TRACE.kv(
                    "Pre-Planning Exit",
                    [
                        ("decision", pre_planning_decision.decision),
                        ("success", answer.success),
                        ("answer", answer.answer),
                    ],
                    style="green",
                )
                TRACE.pretty_block("LLM TOKEN USAGE", llm_token_usage, style="magenta")
                return ctx, answer

            answer: ObjectiveAnswer | None = None
            for plan_attempt in range(1, self.max_plan_attempts + 1):
                ctx.plan_attempt = plan_attempt
                ctx.step_results = []
                ctx.plan = self.planner.plan(ctx, tools)
                self._log_plan(ctx.plan)

                failed_step_result = self._execute_plan_steps(ctx, tools)
                if failed_step_result is not None:
                    if plan_attempt >= self.max_plan_attempts:
                        answer = self._build_failed_step_answer(failed_step_result)
                        break

                    failure_entry = self._build_failure_entry(
                        ctx,
                        failed_step_result=failed_step_result,
                        answer=None,
                    )
                    ctx.replanning_failures.append(failure_entry)
                    TRACE.pretty_block("REPLANNING", failure_entry, style="yellow")
                    continue

                answer = self.objective_judge.answer_objective(ctx)

                if answer.success:
                    break

                if plan_attempt >= self.max_plan_attempts:
                    break

                failure_entry = self._build_failure_entry(
                    ctx,
                    failed_step_result=failed_step_result,
                    answer=answer,
                )
                ctx.replanning_failures.append(failure_entry)
                TRACE.pretty_block("REPLANNING", failure_entry, style="yellow")

            assert answer is not None
            llm_token_usage = asdict(get_llm_token_usage_summary())
            ctx.llm_token_usage = llm_token_usage
            TRACE.pretty_block("LLM TOKEN USAGE", llm_token_usage, style="magenta")
            TRACE.kv(
                "Run Result",
                [
                    ("success", answer.success),
                    ("answer", answer.answer),
                    ("missing_information", answer.missing_information),
                ],
                style="green" if answer.success else "yellow",
            )
            return ctx, answer

    def _decide_pre_planning_action(
        self,
        ctx: AssistantRunContext,
        tools: ToolRegistry,
    ) -> PrePlanningDecision | None:
        """Decide whether to plan, answer directly, or ask for clarification.

        This short-circuits obvious conversational turns (greetings, thanks,
        acknowledgements) to avoid unnecessary planning/execution loops.
        """

        prompt = "\n\n".join(
            [
                "Decide the next action before running any planning or tool execution.",
                "Conversation messages:",
                format_messages(ctx.messages),
                "Available tools (short descriptions):",
                "\n".join(f"- {tool.name}: {tool.short_description or tool.description}" for tool in tools.as_list()),
                (
                    "Decision policy:\n"
                    "- Choose 'plan' when the latest user turn contains a clear actionable request that may require reasoning, data retrieval, or tool use.\n"
                    "- Choose 'direct_answer' when the latest turn is conversational only (e.g., greeting, thanks, acknowledgement, politeness) and can be answered immediately.\n"
                    "- Choose 'ask_clarification' when the latest turn is ambiguous or underspecified and a short follow-up question is needed.\n"
                    "- The conversation may include previous requests and answers; focus on whether the latest user turn currently asks for something actionable.\n"
                    "- If a relevant tool exists for the latest request (e.g., list_teams for teams, list_files for files), choose 'plan' and do not refuse access."
                ),
                (
                    "Response rules:\n"
                    "- For 'direct_answer', provide a short natural response in the user's language in direct_answer.\n"
                    "- For 'ask_clarification', provide one concise clarification question in clarification_question in the user's language.\n"
                    "- For 'plan', leave direct_answer and clarification_question empty."
                ),
            ]
        )

        try:
            decision = instructor_query(
                self.client,
                prompt,
                PrePlanningDecision,
                model=self.planner.model,
            )
            TRACE.kv(
                "PRE-PLANNING GATE",
                [
                    ("decision", decision.decision),
                    ("has_direct_answer", bool(decision.direct_answer)),
                    ("has_clarification", bool(decision.clarification_question)),
                ],
                style="cyan",
            )
            return decision
        except StructuredCompletionError as exc:
            TRACE.line(
                f"pre-planning gate failed to parse response, falling back to normal planning. reason={exc}",
                style="yellow",
            )
            return None

    def _should_force_plan(self, ctx: AssistantRunContext, tools: ToolRegistry) -> bool:
        """Return True when the latest user turn is an explicit actionable resource request."""

        latest_user_message = ""
        for message in reversed(ctx.messages):
            if message.get("role") == "user":
                latest_user_message = str(message.get("content", "")).strip().lower()
                break

        if not latest_user_message:
            return False

        normalized = re.sub(r"\s+", " ", latest_user_message)
        available_tool_names = {tool.name for tool in tools.as_list()}
        explicit_resource_intents = (
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
        )
        action_tokens = ("list", "show", "get", "find", "use")

        return any(
            resource_token in normalized
            and any(action_token in normalized for action_token in action_tokens)
            and required_tool in available_tool_names
            for resource_token, required_tool in explicit_resource_intents
        )

    def _execute_plan_steps(self, ctx: AssistantRunContext, tools: ToolRegistry) -> StepResult | None:
        """Execute the current plan until completion or the first failed step."""

        if ctx.plan is None:
            return None

        total_steps = len(ctx.plan.steps)
        failed_step_result: StepResult | None = None
        for index, step in enumerate(ctx.plan.steps, start=1):
            with TRACE.section(f"STEP {index}/{total_steps}", style="white"):
                TRACE.kv(
                    "Step",
                    [
                        ("id", step.id),
                        ("instruction", step.instruction),
                        ("expected_output", step.expected_output),
                    ],
                    style="white",
                )
                result = self.step_executor.execute(ctx, step, tools)
                ctx.step_results.append(result)
                ctx.artifacts.save(
                    f"step_{step.id}_result",
                    result.model_dump(),
                    source_step_id=step.id,
                    provenance="step_result",
                )
                TRACE.kv(
                    "Step Result",
                    [
                        ("success", result.success),
                        ("artifact_keys", result.artifact_keys),
                        ("summary", result.summary),
                        ("error", result.error),
                    ],
                    style="green" if result.success else "yellow",
                )
                if not result.success:
                    failed_step_result = result
                    TRACE.kv(
                        "Execution Halted",
                        [
                            ("failed_step", step.id),
                            ("reason", "Stopping remaining plan execution because a prerequisite step failed."),
                        ],
                        style="yellow",
                    )
                    break

        return failed_step_result

    def _build_failure_entry(
        self,
        ctx: AssistantRunContext,
        *,
        failed_step_result: StepResult | None,
        answer: ObjectiveAnswer | None,
    ) -> dict[str, object]:
        """Build compact retry context for the next planning attempt."""

        return {
            "plan_attempt": ctx.plan_attempt,
            "objective": ctx.plan.objective if ctx.plan is not None else None,
            "failed_step_id": getattr(failed_step_result, "step_id", None),
            "failed_step_error": getattr(failed_step_result, "error", None),
            "failed_step_summary": getattr(failed_step_result, "summary", None),
            "judge_success": answer.success if answer is not None else None,
            "judge_answer": answer.answer if answer is not None else None,
            "judge_missing_information": answer.missing_information if answer is not None else None,
            "step_results": [result.model_dump() for result in ctx.step_results],
        }

    def _build_failed_step_answer(self, failed_step_result: StepResult) -> ObjectiveAnswer:
        """Return a fallback final answer when the plan ended on a failed step."""

        missing_information: list[str] = []
        if failed_step_result.error:
            missing_information.append(failed_step_result.error)
        else:
            missing_information.append(
                "A required plan step failed before the objective could be fully completed."
            )
        return ObjectiveAnswer(
            answer=failed_step_result.summary,
            success=False,
            missing_information=missing_information,
        )

    def _log_plan(self, plan: Plan) -> None:
        """Print a compact human-readable plan summary before execution starts."""

        lines = [f"objective={plan.objective}"]
        for index, step in enumerate(plan.steps, start=1):
            lines.append(f"{index}. {step.id}")
            lines.append(f"   instruction={step.instruction}")
            if step.expected_output:
                lines.append(f"   expected={step.expected_output}")
            if step.tool_names:
                lines.append(f"   tools={', '.join(step.tool_names)}")
        TRACE.summary("PLAN", lines, style="white")


class PrePlanningDecision(BaseModel):
    """Structured decision for pre-planning short-circuiting."""

    decision: Literal["plan", "direct_answer", "ask_clarification"] = Field(
        description="Whether to proceed with planning, answer directly, or ask for clarification."
    )
    direct_answer: str = Field(
        default="",
        description="Filled only when decision is 'direct_answer'.",
    )
    clarification_question: str = Field(
        default="",
        description="Filled only when decision is 'ask_clarification'.",
    )
