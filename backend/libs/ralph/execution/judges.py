"""Final-answer synthesis for completed assistant runs."""

from __future__ import annotations

from libs.ml.llm import LLMClient, instructor_query
from libs.ml.llm.structured import StructuredCompletionError

from ..errors import MissingPlanError
from ..evidence import render_evidences
from ..prompt_rendering import format_messages, render_artifact_definitions
from ..state.plan_models import ObjectiveAnswer
from ..state.run_context import AssistantRunContext
from ..tracing import TRACE


class ObjectiveJudge:
    """Summarizes execution state into a user-facing objective answer."""

    def __init__(self, client: LLMClient, *, model: str | None = None) -> None:
        self.client = client
        self.model = model

    def answer_objective(self, ctx: AssistantRunContext) -> ObjectiveAnswer:
        """Generate the final answer once planning and execution are complete."""

        if ctx.plan is None:
            raise MissingPlanError()

        TRACE.kv(
            "OBJECTIVE JUDGE",
            [("steps", len(ctx.step_results)), ("artifacts", len(ctx.artifacts.all()))],
            style="magenta",
        )
        prompt = "\n\n".join(
            [
                "Using the conversation, artifact definitions, and explicit evidences, answer the main objective.",
                f"Objective: {ctx.plan.objective}",
                "Conversation messages:",
                format_messages(ctx.messages),
                (
                    "Artifacts are Python objects available at runtime. "
                    "Use the details below to understand where they come from, and judge only from explicit evidences."
                ),
                "Details of available artifacts:",
                render_artifact_definitions(ctx.artifacts),
                "Explicit evidences:",
                render_evidences(ctx.evidences),
                (
                    "Judge only from the evidences shown above. "
                    "Do not infer hidden artifact contents from tool success or artifact existence alone. "
                    "For delta questions such as how many to buy, restock, add, remove, or how many are missing, "
                    "success requires evidence for both the target/desired value and the current/available value, "
                    "or explicit evidence of the computed delta. Do not treat the target quantity alone as the answer. "
                    "If the evidences are insufficient, set success=false and explain what is missing. "
                    "Exception: for purely conversational turns (greetings, thanks, acknowledgements, short politeness requests like 'hi', 'merci', 'please') "
                    "you may set success=true and answer naturally even with no evidence."
                ),
            ]
        )

        try:
            answer = instructor_query(
                self.client,
                prompt,
                ObjectiveAnswer,
                model=self.model,
            )
        except StructuredCompletionError as exc:
            TRACE.line(f"objective judge failed to parse response, returning degraded answer. reason={exc}", style="red")
            answer = ObjectiveAnswer(
                answer="Could not generate a structured answer after all retries.",
                success=False,
                missing_information=["The model failed to produce a valid structured response for the objective answer."],
            )
        TRACE.kv("OBJECTIVE JUDGED", [("success", answer.success)], style="green" if answer.success else "yellow")
        return answer
