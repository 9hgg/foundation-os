"""Demo: zero-shot classification via LLM providers (Ollama, OpenAI-compatible, EDF IAG).

Ollama requires a running local instance (ollama serve).
OpenAI-compatible and EDF IAG sections are skipped when the required API key is absent.

Run with:
    uv run python -m libs.ml.demos.demo_zero_shot_classification

Environment variables (optional):
    OPENAI_API_KEY        — enables OpenAI section
    EDF_IAG_API_KEY       — enables EDF IAG section
    EDF_IAG_MODEL         — overrides default EDF IAG model
"""

import os

from libs.ml import EDFIAGZeroShotClassifier, JsonInput, OllamaZeroShotClassifier, OpenAICompatibleZeroShotClassifier

LABELS = {
    "technology": {
        "software": {},
        "hardware": {},
        "ai": {},
    },
    "sports": {
        "football": {},
        "tennis": {},
        "basketball": {},
    },
    "politics": {},
}

SAMPLES = [
    {"title": "New GPU breaks benchmark records", "body": "The latest graphics card offers 40% more performance."},
    {"title": "Championship final this Sunday", "body": "The two top teams will compete for the national title."},
    {"title": "Parliament debates budget cuts", "body": "Members voted on proposed spending reductions."},
    {"title": "Open-source LLM released", "body": "A new language model is now available under MIT license."},
]


def run_demo(
    *,
    model: str = "gemma4:e2b",
    base_url: str = "http://localhost:11434",
) -> list[dict[str, object]]:
    classifier = OllamaZeroShotClassifier(
        labels=LABELS,
        prompt="Classify the article into the most relevant topic and subtopic.",
        allows_nested=True,
        multi_class=False,
        model=model,
        base_url=base_url,
    )

    predictions = classifier.classify(
        [JsonInput(json_value=JsonInput.serialize(sample, ignore_unserializable=True)) for sample in SAMPLES]
    )

    return [
        {
            "title": sample["title"],
            "label": prediction.label_id,
            "reasoning": (prediction.metadata or {}).get("reasoning"),
        }
        for sample, prediction in zip(SAMPLES, predictions, strict=True)
    ]


def _print_results(rows: list[dict[str, object]], provider: str) -> None:
    print(f"\n── {provider} ──")
    for row in rows:
        reasoning = f"  → {row['reasoning']}" if row["reasoning"] else ""
        print(f"  [{row['label']}] {row['title']}{reasoning}")


def run_openai_demo(
    *,
    model: str = "gpt-5.4-nano",
    base_url: str = "https://api.openai.com/v1",
) -> list[dict[str, object]]:
    classifier = OpenAICompatibleZeroShotClassifier(
        labels=LABELS,
        prompt="Classify the article into the most relevant topic and subtopic.",
        allows_nested=True,
        model=model,
        base_url=base_url,
        api_key_env="OPENAI_API_KEY",
    )
    predictions = classifier.classify(
        [JsonInput(json_value=JsonInput.serialize(sample, ignore_unserializable=True)) for sample in SAMPLES]
    )
    return [
        {"title": s["title"], "label": p.label_id, "reasoning": (p.metadata or {}).get("reasoning")}
        for s, p in zip(SAMPLES, predictions, strict=True)
    ]


def run_iag_demo(
    *,
    model: str | None = None,
) -> list[dict[str, object]]:
    classifier = EDFIAGZeroShotClassifier(
        labels=LABELS,
        prompt="Classify the article into the most relevant topic and subtopic.",
        allows_nested=True,
        model=model or os.getenv("EDF_IAG_MODEL", "C2-Cloud-Gemini-2.5-Flash"),
    )
    predictions = classifier.classify(
        [JsonInput(json_value=JsonInput.serialize(sample, ignore_unserializable=True)) for sample in SAMPLES]
    )
    return [
        {"title": s["title"], "label": p.label_id, "reasoning": (p.metadata or {}).get("reasoning")}
        for s, p in zip(SAMPLES, predictions, strict=True)
    ]


if __name__ == "__main__":
    try:
        _print_results(run_demo(), "Ollama")
    except Exception as exc:
        print(f"\n── Ollama ── SKIPPED: {exc}")

    if os.getenv("OPENAI_API_KEY"):
        try:
            _print_results(run_openai_demo(), "OpenAI")
        except Exception as exc:
            print(f"\n── OpenAI ── ERROR: {exc}")
    else:
        print("\n── OpenAI ── SKIPPED (set OPENAI_API_KEY to enable)")

    if os.getenv("EDF_IAG_API_KEY"):
        try:
            _print_results(run_iag_demo(), "EDF IAG")
        except Exception as exc:
            print(f"\n── EDF IAG ── ERROR: {exc}")
    else:
        print("\n── EDF IAG ── SKIPPED (set EDF_IAG_API_KEY to enable)")
