"""Run Ralph demos through AssistantRunner with a real LLM client."""

import os

from libs.ralph.context.auto_context import AutoContextBuilder
from libs.ralph.demos.customers_demos.customers_demos_client import (
    OllamaLLMClient,
    OpenAILLMClient,
)
from libs.ralph.execution.runner import AssistantRunner
from libs.ralph.tests.script_harness import (
    SCENARIOS,
    build_base_artifacts,
    build_limited_tools,
)
from libs.ralph.tracing import TRACE


def _build_client():
    provider = os.getenv("RALPH_LLM_PROVIDER", "ollama").strip().lower()
    if provider == "openai":
        model = os.getenv("RALPH_LLM_MODEL", "gpt-5.4-nano").strip() or "gpt-5.4-nano"
        api_key_env = os.getenv("RALPH_OPENAI_API_KEY_ENV", "OPENAI_API_KEY_EXTRACT_TEST").strip()
        return OpenAILLMClient(model=model, api_key_env=api_key_env), model, provider

    model = os.getenv("RALPH_LLM_MODEL", "gemma4:e2b").strip() or "gemma4:e2b"
    base_url = os.getenv("RALPH_OLLAMA_BASE_URL", "http://localhost:11434/api/chat").strip()
    return OllamaLLMClient(model=model, base_url=base_url), model, "ollama"


def _build_llm_allowed_tools(allowed_tools: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(dict.fromkeys((*allowed_tools, "create_constant_value", "create_evidence")))


def _assert_expected_answer(scenario_name: str, answer_text: str, expected_substrings: tuple[str, ...]) -> None:
    missing_substrings = [
        expected_substring
        for expected_substring in expected_substrings
        if expected_substring not in answer_text
    ]
    assert not missing_substrings, (
        f"Scenario {scenario_name!r} answer did not contain expected snippets: {missing_substrings!r}"
    )


def main() -> None:
    TRACE.enabled = False
    client, model, provider = _build_client()

    print(f"Using provider={provider} model={model}")
    for index, scenario in enumerate(SCENARIOS, start=1):
        print(f"[{index:02d}/{len(SCENARIOS):02d}] {scenario.name}")
        print(f"  primary_tool: {scenario.primary_tool}")
        print(f"  request: {scenario.user_request}")
        llm_allowed_tools = _build_llm_allowed_tools(scenario.allowed_tools)
        print(f"  allowed_tools: {', '.join(llm_allowed_tools)}")

        runner = AssistantRunner(
            client,
            context_builder=AutoContextBuilder(
                system_metadata={
                    "environment": "ralph_llm_based_tests",
                    "scenario_name": scenario.name,
                }
            ),
            tool_builder=lambda ctx, allowed_tools=llm_allowed_tools: build_limited_tools(ctx, allowed_tools),
            model=model,
            max_plan_attempts=1,
            max_turns_per_step=6,
        )
        ctx, answer = runner.run_with_context(
            [{"role": "user", "content": scenario.user_request}],
            base_artifacts=build_base_artifacts(),
        )

        assert answer.success, (
            f"Scenario {scenario.name!r} failed with missing_information={answer.missing_information!r}"
        )
        _assert_expected_answer(scenario.name, answer.answer, scenario.expected_answer_substrings)
        print(f"  plan_steps: {len(ctx.plan.steps) if ctx.plan is not None else 0}")
        print(f"  step_results: {len(ctx.step_results)}")
        print(f"  answer_success: {answer.success}")
        print(f"  answer: {answer.answer}")
        print("  status: PASS\n")

    print(f"All {len(SCENARIOS)} llm_based Ralph demos passed.")


if __name__ == "__main__":
    main()
