from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel

from libs.ml.llm import LLMClient
from libs.ralph.context.auto_context import AutoContextBuilder
from libs.ralph.context.preprocessors import (
    ContextPreprocessor,
    PreprocessorResult,
)
from libs.ralph.demos.customers_demos.customers_demos_client import (
    OllamaLLMClient,
    OpenAILLMClient,
)
from libs.ralph.demos.customers_demos.customers_demos_data import (
    CUSTOMERS,
    INCIDENTS,
    INVOICES,
    POLICIES,
    TICKETS,
)
from libs.ralph.demos.customers_demos.customers_demos_models import DemoRunReport
from libs.ralph.demos.customers_demos.customers_demos_tools import enlist_demo_tools
from libs.ralph.execution.runner import AssistantRunner
from libs.ralph.state.artifacts import Artifact


def _dump_models(items: list[BaseModel]) -> list[dict[str, Any]]:
    """Convert a list of Pydantic models into JSON-serializable dictionaries."""

    return [item.model_dump() for item in items]


def _build_demo_initial_artifacts() -> list[Artifact]:
    """Return pre-seeded fake artifacts that simulate large backend objects."""

    return [
        Artifact(
            key="customers_catalog",
            provenance="preseeded",
            loader=lambda: _dump_models(CUSTOMERS),
        ),
        Artifact(
            key="billing_invoices",
            provenance="preseeded",
            loader=lambda: _dump_models(INVOICES),
        ),
        Artifact(
            key="support_ticket_queue",
            provenance="preseeded",
            loader=lambda: _dump_models(TICKETS),
        ),
        Artifact(
            key="policy_notes",
            provenance="preseeded",
            loader=lambda: _dump_models(POLICIES),
        ),
        Artifact(
            key="incident_digest",
            provenance="preseeded",
            loader=lambda: _dump_models(INCIDENTS),
        ),
    ]


class DemoDomainPreprocessor(ContextPreprocessor):
    """Attach relevant artifacts based on simple keywords in the user messages."""

    name = "demo_domain_preprocessor"

    def applies(self, messages: list[dict[str, str]]) -> bool:
        return bool(messages)

    def run(self, messages: list[dict[str, str]]) -> PreprocessorResult:
        text = " ".join(message.get("content", "").lower() for message in messages)
        artifacts: list[Artifact] = []

        for artifact in _build_demo_initial_artifacts():
            if (
                artifact.key == "customers_catalog"
                or (
                    artifact.key == "billing_invoices"
                    and any(
                        keyword in text
                        for keyword in ("invoice", "billing", "refund", "payment")
                    )
                )
                or (
                    artifact.key == "support_ticket_queue"
                    and any(
                        keyword in text
                        for keyword in (
                            "ticket",
                            "support",
                            "incident",
                            "urgent",
                            "vip",
                        )
                    )
                )
                or (
                    artifact.key == "policy_notes"
                    and any(
                        keyword in text
                        for keyword in ("policy", "refund", "vip", "escalat")
                    )
                )
                or (
                    artifact.key == "incident_digest"
                    and any(
                        keyword in text
                        for keyword in ("incident", "outage", "risk", "root cause")
                    )
                )
            ):
                artifacts.append(artifact)

        return PreprocessorResult(
            artifacts=artifacts,
            hints={
                "message_count": len(messages),
                "detected_topics": sorted(
                    {
                        topic
                        for topic in ("billing", "support", "policy", "incidents")
                        if topic[:-1] in text or topic in text
                    }
                ),
            },
        )


def run_harness_over_query(
    query: str,
    *,
    client: LLMClient,
    model: str = "gemma4:e2b",
    max_plan_attempts: int = 2,
    max_turns_per_step: int = 8,
) -> DemoRunReport:
    """Run one query through the Ralph planner, executor, and final judge."""

    messages = [{"role": "user", "content": query}]
    provider_name = "openai" if isinstance(client, OpenAILLMClient) else "ollama"
    context_builder = AutoContextBuilder(
        preprocessors=[DemoDomainPreprocessor()],
        frontend_routes=["/customers/:id", "/support/tickets", "/billing/invoices"],
        system_metadata={"environment": "demo", "llm_provider": provider_name},
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
    tools = enlist_demo_tools(ctx)
    return DemoRunReport(
        query=query,
        artifact_descriptions=ctx.artifacts.describe_for_prompt(),
        observation_descriptions=ctx.observations.describe_for_prompt(),
        tool_descriptions=tools.describe(),
        evidences=ctx.evidences.describe_for_prompt(),
        plan=ctx.plan,
        step_results=ctx.step_results,
        answer=answer,
    )


def print_report(report: DemoRunReport) -> None:
    """Render a compact, readable transcript for one demo query."""

    print("=" * 88)
    print(f"Query: {report.query}")
    print()
    print("Artifacts made available to the harness:")
    print(
        json.dumps(
            report.artifact_descriptions, indent=2, ensure_ascii=False, default=str
        )
    )
    print()
    print("Observations made available inline during the run:")
    print(
        json.dumps(
            report.observation_descriptions, indent=2, ensure_ascii=False, default=str
        )
    )
    print()
    print("Tools made available to the harness:")
    print(
        json.dumps(
            [tool.model_dump() for tool in report.tool_descriptions],
            indent=2,
            ensure_ascii=False,
        )
    )
    print()
    print("Evidences made available to the judges:")
    print(json.dumps(report.evidences, indent=2, ensure_ascii=False, default=str))
    print()
    print("Generated plan:")
    print(report.plan.model_dump_json(indent=2))
    print()
    print("Step execution decisions:")
    for index, result in enumerate(report.step_results, start=1):
        print(f"{index}. {result.summary}")
        print(result.model_dump_json(indent=2))
    print()
    print("Final answer:")
    print(report.answer.model_dump_json(indent=2))
    print()


def main() -> None:
    """Run several representative queries against the demo harness."""

    client = OllamaLLMClient(model="gemma4:e2b")
    model = "gemma4:e2b"
    # client = OpenAILLMClient(model="gpt-5.4-nano")
    # model = "gpt-5.4-nano"
    queries = [
        # "Which VIP customers currently have urgent support risk, and what should the support lead do first?",
        # "Summarize overdue invoices and refund-related policy constraints for Acme Robotics.",
        # "What product incident looks most risky for customer renewals this week?",
        "What were the impacts of the last incidents?"
    ]

    for index, query in enumerate(queries, start=1):
        print(f"\n{'#' * 32} DEMO QUERY {index}/{len(queries)} {'#' * 32}\n")
        report = run_harness_over_query(
            query,
            client=client,
            model=model,
            max_plan_attempts=2,
            max_turns_per_step=8,
        )
        print_report(report)
        return


if __name__ == "__main__":
    main()
