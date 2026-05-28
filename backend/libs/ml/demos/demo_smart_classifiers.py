"""Demo: Smart classifiers with automatic hyperparameter tuning via cross-validation.

Smart classifiers run a grid search on a held-out CV split before fitting the final
model on all data. This demo shows the CV score and best params for each variant.

Warning: slower than plain classifiers due to grid search.

Run with:
    uv run python -m libs.ml.demos.demo_smart_classifiers
"""

from libs.ml.methods.sklearn import (
    SmartAdaBoostTextClassifier,
    SmartGradientBoostingTextClassifier,
    SmartLogisticRegressionTextClassifier,
    SmartMLPTextClassifier,
    SmartRandomForestTextClassifier,
    SmartSVMTextClassifier,
)
from libs.ml.models import Label, TextInput, TrainableClassifier

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
except ImportError as exc:
    raise SystemExit("scikit-learn is required: uv add scikit-learn") from exc

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
    "Five stars, outstanding quality",
    "Returned it immediately, garbage",
]
TRAIN_LABELS = ["pos", "neg", "pos", "neg", "pos", "neg", "pos", "neg", "pos", "neg", "pos", "neg"]

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
    predictions = classifier.classify(test_inputs)
    correct = sum(p.label_id == t for p, t in zip(predictions, TEST_LABELS, strict=True))
    cv_results = getattr(classifier, "cv_results_", None)
    return {
        "classifier": name,
        "accuracy": correct / len(TEST_LABELS),
        "predictions": [p.label_id for p in predictions],
        "cv_score": f"{cv_results['cv_score']:.3f} ±{cv_results['cv_score_std']:.3f}" if cv_results else "n/a",
        "best_params": cv_results.get("best_params") if cv_results else None,
    }


def run_demo() -> list[dict[str, object]]:
    vec = TfidfVectorizer
    classifiers: list[tuple[str, TrainableClassifier]] = [
        ("SmartSVM", SmartSVMTextClassifier(feature_extractor=vec())),
        ("SmartLogisticRegression", SmartLogisticRegressionTextClassifier(feature_extractor=vec())),
        ("SmartRandomForest", SmartRandomForestTextClassifier(feature_extractor=vec())),
        ("SmartGradientBoosting", SmartGradientBoostingTextClassifier(feature_extractor=vec())),
        ("SmartMLP", SmartMLPTextClassifier(feature_extractor=vec())),
        ("SmartAdaBoost", SmartAdaBoostTextClassifier(feature_extractor=vec())),
    ]
    return [evaluate(clf, name) for name, clf in classifiers]


if __name__ == "__main__":
    print("Running smart classifiers (includes CV grid search — may take a moment)...\n")
    for row in run_demo():
        params = f"  best_params={row['best_params']}" if row["best_params"] else ""
        print(
            f"{row['classifier']:>24}: accuracy={row['accuracy']:.0%}"
            f"  cv={row['cv_score']}{params}"
        )
