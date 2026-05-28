from __future__ import annotations

import json
import random
from typing import Any

from pydantic import BaseModel

from libs.ml.llm import LLMClient
from libs.ralph.context.auto_context import AutoContextBuilder
from libs.ralph.demos.customers_demos.customers_demos_client import OpenAILLMClient
from libs.ralph.execution.runner import AssistantRunner
from libs.ralph.state.artifacts import Artifact
from libs.ralph.tools.local_tools import build_harness_tools


class FakeAddress(BaseModel):
    street: str
    city: str
    postal_code: str
    country: str


class FakePerson(BaseModel):
    person_id: str
    first_name: str
    last_name: str
    age: int
    address: FakeAddress


FIRST_NAMES = [
    "Alice", "Bob", "Chloe", "David", "Emma", "Farid", "Grace", "Hugo",
    "Ines", "Jules", "Karim", "Lea", "Maya", "Noah", "Olivia", "Paul",
    "Quentin", "Rania", "Sofia", "Theo",
]
LAST_NAMES = [
    "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit",
    "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel",
    "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier",
]
COUNTRY_TO_CITIES = {
    "France": ["Paris", "Lyon", "Marseille", "Lille", "Nantes", "Toulouse"],
    "Germany": ["Berlin", "Munich", "Hamburg", "Cologne"],
    "Spain": ["Madrid", "Barcelona", "Valencia", "Seville"],
    "Italy": ["Rome", "Milan", "Naples", "Turin"],
    "Belgium": ["Brussels", "Antwerp", "Ghent", "Liege"],
}


def _build_people_dataset(count: int = 10_000) -> list[dict[str, Any]]:
    """Generate a deterministic directory of fake people with nested addresses."""

    rng = random.Random(7)
    countries = list(COUNTRY_TO_CITIES.keys())
    weighted_countries = (
        ["France"] * 4
        + ["Germany"] * 2
        + ["Spain"] * 2
        + ["Italy"] * 1
        + ["Belgium"] * 1
    )
    people: list[dict[str, Any]] = []
    for index in range(count):
        country = rng.choice(weighted_countries or countries)
        city = rng.choice(COUNTRY_TO_CITIES[country])
        postal_prefix = {
            "France": "75",
            "Germany": "10",
            "Spain": "28",
            "Italy": "00",
            "Belgium": "10",
        }[country]
        person = FakePerson(
            person_id=f"person_{index + 1}",
            first_name=rng.choice(FIRST_NAMES),
            last_name=rng.choice(LAST_NAMES),
            age=rng.randint(18, 87),
            address=FakeAddress(
                street=f"{rng.randint(1, 220)} {rng.choice(LAST_NAMES)} Street",
                city=city,
                postal_code=f"{postal_prefix}{rng.randint(100, 999)}",
                country=country,
            ),
        )
        people.append(person.model_dump())
    return people


def _log_dataset_overview(people: list[dict[str, Any]]) -> None:
    """Print a quick summary of the generated dataset."""

    country_counts: dict[str, int] = {}
    total_age = 0
    min_age = people[0]["age"]
    max_age = people[0]["age"]
    for person in people:
        country = person["address"]["country"]
        country_counts[country] = country_counts.get(country, 0) + 1
        total_age += person["age"]
        min_age = min(min_age, person["age"])
        max_age = max(max_age, person["age"])

    total = len(people)
    print(f"\n=== people_directory dataset ({total:,} records) ===")
    print(f"  age range : {min_age}–{max_age}  |  avg: {total_age / total:.1f}")
    print("  country breakdown:")
    for country, count in sorted(country_counts.items(), key=lambda x: -x[1]):
        print(f"    {country:<12} {count:>6,}  ({count / total * 100:.1f}%)")
    print("  sample records:")
    for person in people[:2]:
        addr = person["address"]
        print(
            f"    {person['person_id']}  {person['first_name']} {person['last_name']}"
            f"  age={person['age']}  {addr['city']}, {addr['country']}"
        )
    print()


def _build_demo_artifacts() -> list[Artifact]:
    people = _build_people_dataset()
    _log_dataset_overview(people)
    return [
        Artifact(
            key="people_directory",
            provenance="preseeded",
            value=people,
            metadata={
                "description": (
                    "A directory of 10,000 fake people. Each item contains identity fields and a nested "
                    "`address` object with `street`, `city`, `postal_code`, and `country`."
                ),
            },
        )
    ]


def run_demo(
    query: str,
    *,
    client: LLMClient,
    model: str = "gemma4:e2b",
    max_plan_attempts: int = 2,
    max_turns_per_step: int = 8,
) -> dict[str, Any]:
    messages = [{"role": "user", "content": query}]
    context_builder = AutoContextBuilder(
        system_metadata={"environment": "fake_people_demo"},
    )
    runner = AssistantRunner(
        client,
        context_builder=context_builder,
        tool_builder=build_harness_tools,
        model=model,
        max_plan_attempts=max_plan_attempts,
        max_turns_per_step=max_turns_per_step,
    )
    ctx, answer = runner.run_with_context(messages, base_artifacts=_build_demo_artifacts())
    tools = build_harness_tools(ctx)
    return {
        "query": query,
        "artifacts": ctx.artifacts.describe_for_prompt(),
        "observations": ctx.observations.describe_for_prompt(),
        "evidences": ctx.evidences.describe_for_prompt(),
        "tools": [tool.model_dump() for tool in tools.describe(include_schema=True)],
        "plan": ctx.plan.model_dump() if ctx.plan is not None else None,
        "step_results": [result.model_dump() for result in ctx.step_results],
        "answer": answer.model_dump(),
    }


def main() -> None:
    # client = OllamaLLMClient(model="gemma4:e2b")
    # model="gemma4:e2b"


    client = OpenAILLMClient(model="gpt-5.4-nano")
    model = "gpt-5.4-nano"

    report = run_demo(
        "How many people live in France?",
        client=client,
        model=model,
        max_plan_attempts=2,
        max_turns_per_step=8,
    )
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
