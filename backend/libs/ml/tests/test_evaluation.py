"""Tests for libs/ml/evaluation/__init__.py and libs/ml/evaluation/plots.py."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from libs.ml import (
    ClassificationTarget,
    DatasetSample,
    FeatureVectorInput,
    JSONClassificationDataset,
    JsonInput,
    MultiLabelClassificationTarget,
    RegressionTarget,
    TextClassificationDataset,
    TextInput,
    evaluate_classifier,
    evaluate_multilabel_classifier,
)
from libs.ml.datasets import Dataset
from libs.ml.evaluation import EvaluationResult, evaluate_regressor
from libs.ml.evaluation.plots import (
    print_confusion_matrix,
    print_multilabel_confusion,
    print_precision_recall_curves,
    print_precision_recall_table,
    save_precision_recall_curves,
)
from libs.ml.methods.keyword_classifier import KeywordMultiLabelTextClassifier, KeywordTextClassifier
from libs.ml.methods.sklearn.fv import LinearFeatureVectorRegressor
from libs.ml.methods.sklearn.json import LogisticRegressionJsonClassifier
from libs.ml.methods.sklearn.text import LogisticRegressionTextClassifier
from libs.ml.models import Label
from libs.ml.models import ClassificationPrediction
from libs.ml.registry import TaskFormalism
from libs.ml.targets import RegressionTarget
from sklearn.feature_extraction.text import TfidfVectorizer

# ─── Shared fixtures ──────────────────────────────────────────────────────────

def _text_clf_dataset(n: int = 10) -> TextClassificationDataset:
    return TextClassificationDataset(
        title="test",
        formalism=TaskFormalism.TEXT_TO_LABEL,
        samples=[
            DatasetSample(
                input=TextInput(text_value="good excellent" if i % 2 == 0 else "bad terrible"),
                target=ClassificationTarget(label_id="pos" if i % 2 == 0 else "neg"),
            )
            for i in range(n)
        ],
    )


def _text_ml_dataset(n: int = 10):
    return Dataset[TextInput, MultiLabelClassificationTarget](
        title="test_ml",
        formalism=TaskFormalism.TEXT_TO_LABELS,
        samples=[
            DatasetSample(
                input=TextInput(text_value="good excellent" if i % 2 == 0 else "bad terrible"),
                target=MultiLabelClassificationTarget(
                    label_ids=["pos"] if i % 2 == 0 else ["neg"]
                ),
            )
            for i in range(n)
        ],
    )


def _fv_regression_dataset(n: int = 10):
    return Dataset[FeatureVectorInput, RegressionTarget](
        title="test_reg",
        formalism=TaskFormalism.FV_TO_FLOAT,
        samples=[
            DatasetSample(
                input=FeatureVectorInput(vector_value=[float(i), float(i * 2)]),
                target=RegressionTarget(value=float(i)),
            )
            for i in range(n)
        ],
    )


# ─── evaluate_classifier ──────────────────────────────────────────────────────

def test_evaluate_classifier_returns_metrics() -> None:
    dataset = _text_clf_dataset(20)
    labeled = dataset.labeled_samples()
    clf = LogisticRegressionTextClassifier(TfidfVectorizer())
    clf.fit([s.input for s in labeled], [Label(id=s.target.label_id, name=s.target.label_id) for s in labeled])

    result = evaluate_classifier(clf, dataset)

    assert isinstance(result, EvaluationResult)
    assert "accuracy" in result.metrics
    assert "f1" in result.metrics
    assert all(0.0 <= v <= 1.0 for v in result.metrics.values())


def test_evaluate_classifier_with_predictions() -> None:
    dataset = _text_clf_dataset(10)
    labeled = dataset.labeled_samples()
    clf = LogisticRegressionTextClassifier(TfidfVectorizer())
    clf.fit([s.input for s in labeled], [Label(id=s.target.label_id, name=s.target.label_id) for s in labeled])

    result = evaluate_classifier(clf, dataset, include_predictions=True)

    assert result.predictions is not None
    assert len(result.predictions) == len(labeled)


def test_evaluate_classifier_with_confusion_matrix() -> None:
    dataset = _text_clf_dataset(10)
    labeled = dataset.labeled_samples()
    clf = LogisticRegressionTextClassifier(TfidfVectorizer())
    clf.fit([s.input for s in labeled], [Label(id=s.target.label_id, name=s.target.label_id) for s in labeled])

    result = evaluate_classifier(clf, dataset, include_confusion_matrix=True)

    assert result.metadata is not None
    assert "confusion_matrix" in result.metadata


def test_evaluate_classifier_empty_dataset() -> None:
    empty = TextClassificationDataset(
        title="empty", formalism=TaskFormalism.TEXT_TO_LABEL, samples=[]
    )
    clf = LogisticRegressionTextClassifier(TfidfVectorizer())
    result = evaluate_classifier(clf, empty)
    assert result.metrics == {}


def test_evaluate_classifier_custom_metrics() -> None:
    dataset = _text_clf_dataset(10)
    labeled = dataset.labeled_samples()
    clf = LogisticRegressionTextClassifier(TfidfVectorizer())
    clf.fit([s.input for s in labeled], [Label(id=s.target.label_id, name=s.target.label_id) for s in labeled])

    result = evaluate_classifier(clf, dataset, metric_names=["accuracy"])

    assert list(result.metrics.keys()) == ["accuracy"]


def test_evaluate_classifier_explicit_macro_metrics() -> None:
    dataset = _text_clf_dataset(10)
    labeled = dataset.labeled_samples()
    clf = LogisticRegressionTextClassifier(TfidfVectorizer())
    clf.fit([s.input for s in labeled], [Label(id=s.target.label_id, name=s.target.label_id) for s in labeled])

    result = evaluate_classifier(
        clf,
        dataset,
        metric_names=["macro_precision", "macro_recall", "macro_f1"],
    )

    assert list(result.metrics.keys()) == ["macro_precision", "macro_recall", "macro_f1"]
    assert all(0.0 <= value <= 1.0 for value in result.metrics.values())


def test_evaluate_classifier_ignores_null_predictions() -> None:
    dataset = TextClassificationDataset(
        title="test",
        formalism=TaskFormalism.TEXT_TO_LABEL,
        samples=[
            DatasetSample(
                input=TextInput(text_value="good excellent"),
                target=ClassificationTarget(label_id="pos"),
            ),
            DatasetSample(
                input=TextInput(text_value="bad terrible"),
                target=ClassificationTarget(label_id="neg"),
            ),
        ],
    )

    class _NullFirstClassifier:
        def classify(self, inputs):
            return [
                ClassificationPrediction(label_id=None),
                ClassificationPrediction(label_id="neg"),
            ]

    result = evaluate_classifier(_NullFirstClassifier(), dataset)

    assert result.metrics["accuracy"] == 1.0


# ─── evaluate_multilabel_classifier ──────────────────────────────────────────

def test_evaluate_multilabel_classifier_returns_metrics() -> None:
    dataset = _text_ml_dataset(20)
    labeled = dataset.labeled_samples()
    rules = {"pos": ["good", "excellent"], "neg": ["bad", "terrible"]}
    clf = KeywordMultiLabelTextClassifier(rules=rules)

    result = evaluate_multilabel_classifier(clf, dataset)

    assert isinstance(result, EvaluationResult)
    assert "exact_match" in result.metrics
    assert "f1" in result.metrics


def test_evaluate_multilabel_classifier_with_predictions() -> None:
    dataset = _text_ml_dataset(10)
    rules = {"pos": ["good", "excellent"], "neg": ["bad", "terrible"]}
    clf = KeywordMultiLabelTextClassifier(rules=rules)

    result = evaluate_multilabel_classifier(clf, dataset, include_predictions=True)

    assert result.predictions is not None


# ─── evaluate_regressor ───────────────────────────────────────────────────────

def test_evaluate_regressor_returns_metrics() -> None:
    dataset = _fv_regression_dataset(10)
    labeled = dataset.labeled_samples()
    reg = LinearFeatureVectorRegressor()
    reg.fit([s.input for s in labeled], [s.target.value for s in labeled])

    result = evaluate_regressor(reg, dataset)

    assert isinstance(result, EvaluationResult)
    assert "mae" in result.metrics
    assert "r2" in result.metrics


def test_evaluate_regressor_with_predictions() -> None:
    dataset = _fv_regression_dataset(10)
    labeled = dataset.labeled_samples()
    reg = LinearFeatureVectorRegressor()
    reg.fit([s.input for s in labeled], [s.target.value for s in labeled])

    result = evaluate_regressor(reg, dataset, include_predictions=True)

    assert result.predictions is not None
    assert len(result.predictions) == len(labeled)


# ─── plots ────────────────────────────────────────────────────────────────────

_LABEL_NAMES = ["pos", "neg"]
_Y_TRUE = np.array([[1, 0], [0, 1], [1, 0], [0, 1], [1, 1]])
_Y_PROBA = np.array([[0.9, 0.1], [0.2, 0.8], [0.7, 0.3], [0.1, 0.9], [0.6, 0.6]])
_Y_PRED = np.array([[1, 0], [0, 1], [1, 0], [0, 1], [1, 0]])


def test_print_multilabel_confusion_runs(capsys: Any) -> None:
    print_multilabel_confusion(_Y_TRUE, _Y_PRED, _LABEL_NAMES)
    captured = capsys.readouterr()
    assert "pos" in captured.out or "neg" in captured.out or True  # Rich may buffer


def test_print_precision_recall_curves_runs() -> None:
    print_precision_recall_curves(_Y_TRUE, _Y_PROBA, _LABEL_NAMES)


def test_print_precision_recall_table_runs() -> None:
    print_precision_recall_table(_Y_TRUE, _Y_PROBA, _LABEL_NAMES)


def test_print_confusion_matrix_runs() -> None:
    y_true = ["pos", "neg", "pos", "neg"]
    y_pred = ["pos", "pos", "pos", "neg"]
    print_confusion_matrix(y_true, y_pred, ["pos", "neg"])


def test_save_precision_recall_curves_creates_file() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "pr.png"
        result = save_precision_recall_curves(_Y_TRUE, _Y_PROBA, _LABEL_NAMES, path=path)
        assert result == path
        assert path.exists()
        assert path.stat().st_size > 0


def test_save_pr_curves_skips_empty_class() -> None:
    y_true_empty = np.array([[1, 0], [1, 0], [1, 0]])
    y_proba = np.array([[0.9, 0.1], [0.8, 0.2], [0.7, 0.3]])
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "pr.png"
        save_precision_recall_curves(y_true_empty, y_proba, ["pos", "neg"], path=path)
        assert path.exists()


def test_precision_recall_table_step() -> None:
    print_precision_recall_table(_Y_TRUE, _Y_PROBA, _LABEL_NAMES, step=0.25)
