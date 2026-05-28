"""Demo: rule-based keyword classification.

Run with:
    uv run python -m libs.ml.demos.demo_keyword_classification
"""

from libs.ml import ClassificationPrediction, KeywordTextClassifier, TextInput


def run_demo() -> list[dict[str, object]]:
    classifier = KeywordTextClassifier(
        rules={
            "positive": ["good", "great", "excellent", "love", "wonderful"],
            "negative": ["bad", "terrible", "awful", "hate", "horrible"],
            "neutral": ["okay", "fine", "average", "mediocre"],
        },
        default_label="unknown",
    )

    samples = [
        "This product is absolutely wonderful and I love it!",
        "Terrible experience, the service was awful.",
        "It's okay, nothing special, pretty average.",
        "Great quality and excellent support.",
        "I hate this, it's horrible and bad.",
        "No strong feelings either way.",
    ]

    text_inputs = [TextInput(text_value=sample) for sample in samples]
    predictions: list[ClassificationPrediction] = classifier.classify(text_inputs)

    results = []
    for sample, prediction in zip(samples, predictions, strict=True):
        results.append({
            "sample": sample,
            "label": prediction.label_id,
            "score": round(prediction.score, 2) if prediction.score is not None else None,
            "matched": prediction.metadata["matched_keywords"] if prediction.metadata else [],
        })
    return results


if __name__ == "__main__":
    for row in run_demo():
        print(f"[{row['label']:>8}] (score={row['score']}) {row['sample'][:50]!r}")
        if row["matched"]:
            print(f"           matched: {row['matched']}")
