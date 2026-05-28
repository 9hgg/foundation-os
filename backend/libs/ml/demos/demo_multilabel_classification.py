"""Demo: multi-label classification — trainable, smart, and default classify_multi_label.

Covers:
  - SklearnMultiLabelClassifier variants (RF, SVM, LR, MLP)
  - SmartRandomForestMultiLabelClassifier (with CV)
  - Default classify_multi_label on a plain Classifier (single-label wrapper)

Run with:
    uv run python -m libs.ml.demos.demo_multilabel_classification
"""

from libs.ml import (
    ClassificationPrediction,
    Label,
    LogisticRegressionMultiLabelTextClassifier,
    MLPMultiLabelTextClassifier,
    RandomForestMultiLabelTextClassifier,
    SVMMultiLabelTextClassifier,
    TextInput,
)
from libs.ml.methods.sklearn import SmartRandomForestMultiLabelTextClassifier
from libs.ml.models import Classifier, TrainableMultiLabelClassifier

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
except ImportError as exc:
    raise SystemExit("scikit-learn is required: uv add scikit-learn") from exc

TRAIN_SAMPLES = [
    "Engine overheating and oil leak detected",
    "Corrosion on mounting bolts",
    "Abnormal vibrations and strange noise",
    "Oil leak near the pump",
    "High temperature and vibration on bearings",
    "Rust and corrosion on metal surfaces",
    "Pump leaking, bearings vibrating",
    "Overheating bearings with oil traces",
]
TRAIN_LABELS = [
    ["heat", "leak"],
    ["corrosion"],
    ["vibration", "noise"],
    ["leak"],
    ["heat", "vibration"],
    ["corrosion"],
    ["leak", "vibration"],
    ["heat", "leak"],
]

TEST_SAMPLES = [
    "High temperature detected near oil pump",
    "Rust forming on structure",
    "Vibration and noise from motor",
    "Pump seal leaking oil",
]
TEST_LABELS = [
    {"heat", "leak"},
    {"corrosion"},
    {"vibration", "noise"},
    {"leak"},
]


def exact_match(preds: list[list[ClassificationPrediction]], targets: list[set[str]]) -> float:
    hits = sum(
        {p.label_id for p in pred_list} == target
        for pred_list, target in zip(preds, targets, strict=True)
    )
    return hits / len(targets)


def evaluate(classifier: TrainableMultiLabelClassifier, name: str) -> dict[str, object]:
    train_inputs = [TextInput(text_value=sample) for sample in TRAIN_SAMPLES]
    test_inputs = [TextInput(text_value=sample) for sample in TEST_SAMPLES]
    train_label_objs = [[Label(id=lid, name=lid) for lid in row] for row in TRAIN_LABELS]
    classifier.fit(train_inputs, train_label_objs)
    preds = classifier.classify_multi_label(test_inputs)
    return {
        "classifier": name,
        "exact_match": exact_match(preds, TEST_LABELS),
        "predictions": [{p.label_id for p in pred_list} for pred_list in preds],
    }


def evaluate_default_path(classifier: Classifier, name: str) -> dict[str, object]:
    """Exercise the default classify_multi_label from the Classifier base class."""
    test_inputs = [TextInput(text_value=sample) for sample in TEST_SAMPLES]
    preds = classifier.classify_multi_label(test_inputs)
    return {
        "classifier": name,
        "predictions": [{p.label_id for p in pred_list} for pred_list in preds],
        "note": "default single→multi wrap (one label per sample)",
    }


def run_demo() -> list[dict[str, object]]:
    vec = TfidfVectorizer

    results = []
    for name, clf in [
        ("RandomForest", RandomForestMultiLabelTextClassifier(feature_extractor=vec())),
        ("SVM", SVMMultiLabelTextClassifier(feature_extractor=vec())),
        ("LogisticRegression", LogisticRegressionMultiLabelTextClassifier(feature_extractor=vec())),
        ("MLP", MLPMultiLabelTextClassifier(feature_extractor=vec())),
        ("SmartRandomForest", SmartRandomForestMultiLabelTextClassifier(feature_extractor=vec())),
    ]:
        results.append(evaluate(clf, name))

    # Default classify_multi_label path: plain single-label classifier used on multi-label data
    from libs.ml import LogisticRegressionTextClassifier
    single_clf = LogisticRegressionTextClassifier(feature_extractor=vec())
    single_clf.fit(
        [TextInput(text_value=sample) for sample in TRAIN_SAMPLES],
        [labels[0] for labels in TRAIN_LABELS],
    )
    results.append(evaluate_default_path(single_clf, "LogisticRegression(single→multi)"))

    return results


if __name__ == "__main__":
    for row in run_demo():
        if "exact_match" in row:
            print(f"{row['classifier']:>25}: exact_match={row['exact_match']:.0%}  {row['predictions']}")
        else:
            print(f"{row['classifier']:>25}: {row['predictions']}  [{row['note']}]")
