"""Evaluation orchestration — runs inference, compares with targets, computes metrics.

The evaluation functions are the bridge between:
  Dataset  →  Algorithm  →  Predictions  →  Metrics  →  EvaluationResult

All metric computation happens through libs.ml.metrics (not third-party libraries).
The caller controls which metrics are computed via metric_names.

Supported evaluation flows:
  evaluate_classifier(...)            — single-label classification
  evaluate_multilabel_classifier(...) — multi-label classification
  evaluate_regressor(...)             — scalar regression
"""

from typing import Any

from libs.utils.types import BaseModelWithConfig

from ..datasets import Dataset
from ..metrics import (
    accuracy,
    confusion_matrix,
    f1_score,
    macro_f1,
    macro_precision,
    macro_recall,
    mae,
    mse,
    multilabel_exact_match,
    multilabel_f1,
    multilabel_hamming_loss,
    multilabel_precision,
    multilabel_recall,
    precision,
    r2_score,
    recall,
    rmse,
)
from ..models import ClassificationPrediction, FeatureVectorInput, Prediction, RegressionPrediction, TextInput
from ..targets import ClassificationTarget, MultiLabelClassificationTarget, RegressionTarget


class EvaluationResult(BaseModelWithConfig):
    """Structured result of an evaluation run."""

    metrics: dict[str, float]
    predictions: list[Prediction] | None = None
    metadata: dict[str, Any] | None = None


_DEFAULT_CLASSIFICATION_METRICS = ["accuracy", "precision", "recall", "f1"]
_DEFAULT_MULTILABEL_METRICS = ["exact_match", "hamming_loss", "precision", "recall", "f1"]
_DEFAULT_REGRESSION_METRICS = ["mae", "mse", "rmse", "r2"]

_CLASSIFICATION_METRIC_FNS = {
    "accuracy": accuracy,
    "precision": precision,
    "recall": recall,
    "f1": f1_score,
    "macro_precision": macro_precision,
    "macro_recall": macro_recall,
    "macro_f1": macro_f1,
}

_MULTILABEL_METRIC_FNS = {
    "exact_match": multilabel_exact_match,
    "hamming_loss": multilabel_hamming_loss,
    "precision": multilabel_precision,
    "recall": multilabel_recall,
    "f1": multilabel_f1,
}

_REGRESSION_METRIC_FNS = {
    "mae": mae,
    "mse": mse,
    "rmse": rmse,
    "r2": r2_score,
}


def evaluate_classifier(
    classifier: Any,
    dataset: Dataset,
    *,
    metric_names: list[str] | None = None,
    include_predictions: bool = False,
    include_confusion_matrix: bool = False,
) -> EvaluationResult:
    """Evaluate a single-label classifier against a labeled dataset.

    Args:
        classifier: Any Classifier[TextInput] or compatible.
        dataset:    Dataset[*, ClassificationTarget] with labeled samples.
        metric_names: Subset of ['accuracy','precision','recall','f1'].
                      Defaults to all four.
        include_predictions: Attach raw predictions to the result.
        include_confusion_matrix: Include confusion matrix in metadata.
    """
    labeled = dataset.labeled_samples()
    if not labeled:
        return EvaluationResult(metrics={})

    inputs = [s.input for s in labeled]
    targets: list[ClassificationTarget] = [s.target for s in labeled]  # type: ignore[assignment]

    predictions: list[ClassificationPrediction] = classifier.classify(inputs)

    paired_labels = [
        (target.label_id, prediction.label_id)
        for target, prediction in zip(targets, predictions, strict=True)
        if prediction.label_id is not None
    ]
    if not paired_labels:
        return EvaluationResult(metrics={}, predictions=predictions if include_predictions else None)

    y_true = [label_id for label_id, _ in paired_labels]
    y_pred = [label_id for _, label_id in paired_labels]

    names = metric_names or _DEFAULT_CLASSIFICATION_METRICS
    metrics: dict[str, float] = {}
    for name in names:
        fn = _CLASSIFICATION_METRIC_FNS.get(name)
        if fn:
            metrics[name] = fn(y_true, y_pred)

    metadata: dict[str, Any] | None = None
    if include_confusion_matrix:
        metadata = {"confusion_matrix": confusion_matrix(y_true, y_pred)}

    return EvaluationResult(
        metrics=metrics,
        predictions=predictions if include_predictions else None,
        metadata=metadata,
    )


def evaluate_multilabel_classifier(
    classifier: Any,
    dataset: Dataset,
    *,
    metric_names: list[str] | None = None,
    include_predictions: bool = False,
) -> EvaluationResult:
    """Evaluate a multi-label classifier against a labeled dataset.

    Args:
        classifier: Any Classifier with classify_multi_label support.
        dataset:    Dataset[*, MultiLabelClassificationTarget].
        metric_names: Subset of ['exact_match','hamming_loss','precision','recall','f1'].
    """
    labeled = dataset.labeled_samples()
    if not labeled:
        return EvaluationResult(metrics={})

    inputs = [s.input for s in labeled]
    targets: list[MultiLabelClassificationTarget] = [s.target for s in labeled]  # type: ignore[assignment]

    preds_per_sample: list[list[ClassificationPrediction]] = classifier.classify_multi_label(inputs)

    y_pred = [frozenset(p.label_id for p in preds) for preds in preds_per_sample]
    y_true = [frozenset(t.label_ids) for t in targets]
    y_pred_sets = [set(s) for s in y_pred]
    y_true_sets = [set(s) for s in y_true]

    names = metric_names or _DEFAULT_MULTILABEL_METRICS
    metrics: dict[str, float] = {}
    for name in names:
        fn = _MULTILABEL_METRIC_FNS.get(name)
        if fn:
            metrics[name] = fn(y_true_sets, y_pred_sets)

    flat_predictions = [p for preds in preds_per_sample for p in preds] if include_predictions else None
    return EvaluationResult(
        metrics=metrics,
        predictions=flat_predictions,
    )


def evaluate_regressor(
    regressor: Any,
    dataset: Dataset,
    *,
    metric_names: list[str] | None = None,
    include_predictions: bool = False,
) -> EvaluationResult:
    """Evaluate a regressor against a labeled dataset.

    Args:
        regressor:  Any Regressor compatible with dataset inputs.
        dataset:    Dataset[*, RegressionTarget].
        metric_names: Subset of ['mae','mse','rmse','r2'].
    """
    labeled = dataset.labeled_samples()
    if not labeled:
        return EvaluationResult(metrics={})

    inputs = [s.input for s in labeled]
    targets: list[RegressionTarget] = [s.target for s in labeled]  # type: ignore[assignment]

    predictions: list[RegressionPrediction] = regressor.regress(inputs)

    y_pred = [p.value for p in predictions]
    y_true = [t.value for t in targets]

    names = metric_names or _DEFAULT_REGRESSION_METRICS
    metrics: dict[str, float] = {}
    for name in names:
        fn = _REGRESSION_METRIC_FNS.get(name)
        if fn:
            metrics[name] = fn(y_true, y_pred)

    return EvaluationResult(
        metrics=metrics,
        predictions=predictions if include_predictions else None,
    )


__all__ = [
    "EvaluationResult",
    "evaluate_classifier",
    "evaluate_multilabel_classifier",
    "evaluate_regressor",
]
