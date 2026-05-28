"""Demo: trainable text classification with sklearn classifiers.

Trains several classifiers on a small sentiment dataset and compares accuracy.

Run with:
    uv run python -m libs.ml.demos.demo_text_fit_classify
"""

from libs.ml import (
    AdaBoostTextClassifier,
    ClassificationPrediction,
    GradientBoostingTextClassifier,
    Label,
    LogisticRegressionTextClassifier,
    MLPTextClassifier,
    RandomClassifier,
    RandomForestTextClassifier,
    SVMTextClassifier,
    TextInput,
)
from libs.ml.models import Classifier, TrainableClassifier

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
except ImportError as exc:
    raise SystemExit(  # noqa: TRY003
        "scikit-learn is required: uv add scikit-learn"
    ) from exc

TRAIN_SAMPLES = [
    "I love this product, it works great",
    "Absolutely terrible, total waste of money",
    "Best purchase I have ever made",
    "Would not recommend to anyone",
    "Exceeded all my expectations",
    "Complete disappointment from start to finish",
    "Fantastic quality and fast delivery",
    "Broken on arrival, very frustrating",
    "Highly recommend, works perfectly",
    "Awful customer service, never again",
]
TRAIN_LABELS = ["pos", "neg", "pos", "neg", "pos", "neg", "pos", "neg", "pos", "neg"]

TEST_SAMPLES = [
    "Really happy with this, great value",
    "Stopped working after one day, terrible",
    "Solid product, does exactly what it says",
    "Poor quality, fell apart immediately",
]
TEST_LABELS = ["pos", "neg", "pos", "neg"]


def evaluate(classifier: TrainableClassifier, name: str) -> dict[str, object]:
    train_inputs = [TextInput(text_value=sample) for sample in TRAIN_SAMPLES]
    test_inputs = [TextInput(text_value=sample) for sample in TEST_SAMPLES]
    train_label_objs = [Label(id=lid, name=lid) for lid in TRAIN_LABELS]
    classifier.fit(train_inputs, train_label_objs)
    predictions: list[ClassificationPrediction] = classifier.classify(test_inputs)
    correct = sum(p.label_id == t for p, t in zip(predictions, TEST_LABELS, strict=True))
    return {
        "classifier": name,
        "accuracy": correct / len(TEST_LABELS),
        "predictions": [p.label_id for p in predictions],
    }


def evaluate_zero_shot(classifier: Classifier, name: str) -> dict[str, object]:
    test_inputs = [TextInput(text_value=sample) for sample in TEST_SAMPLES]
    predictions: list[ClassificationPrediction] = classifier.classify(test_inputs)
    correct = sum(p.label_id == t for p, t in zip(predictions, TEST_LABELS, strict=True))
    return {
        "classifier": name,
        "accuracy": correct / len(TEST_LABELS),
        "predictions": [p.label_id for p in predictions],
    }


def run_demo() -> list[dict[str, object]]:
    trainable: list[tuple[str, TrainableClassifier]] = [
        ("SVM", SVMTextClassifier(feature_extractor=TfidfVectorizer())),
        ("LogisticRegression", LogisticRegressionTextClassifier(feature_extractor=TfidfVectorizer())),
        ("RandomForest", RandomForestTextClassifier(feature_extractor=TfidfVectorizer())),
        ("GradientBoosting", GradientBoostingTextClassifier(feature_extractor=TfidfVectorizer())),
        ("MLP", MLPTextClassifier(feature_extractor=TfidfVectorizer())),
        ("AdaBoost", AdaBoostTextClassifier(feature_extractor=TfidfVectorizer())),
    ]
    results = [evaluate(clf, name) for name, clf in trainable]
    results.append(evaluate_zero_shot(RandomClassifier(labels=["pos", "neg"]), "Random"))
    return results


if __name__ == "__main__":
    results = run_demo()
    for row in results:
        print(
            f"{row['classifier']:>20}: accuracy={row['accuracy']:.0%}  predictions={row['predictions']}"
        )
