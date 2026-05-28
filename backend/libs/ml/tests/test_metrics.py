"""Tests for libs/ml/metrics/__init__.py — pure metric functions."""

from __future__ import annotations

import math

import pytest

from libs.ml.metrics import (
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
    per_class_f1,
    precision,
    r2_score,
    recall,
    rmse,
)

# ─── Fixtures ─────────────────────────────────────────────────────────────────

Y_TRUE = ["A", "A", "B", "B", "A"]
Y_PRED = ["A", "B", "B", "A", "A"]  # 3 correct, 2 wrong

ML_TRUE = [{"A"}, {"B"}, {"A", "B"}, {"A"}]
ML_PRED = [{"A"}, {"A"}, {"A", "B"}, {"A", "B"}]

REG_TRUE = [1.0, 2.0, 3.0, 4.0]
REG_PRED = [1.1, 1.9, 3.2, 3.8]

# ─── Single-label classification ──────────────────────────────────────────────

def test_accuracy_basic() -> None:
    assert accuracy(Y_TRUE, Y_PRED) == pytest.approx(3 / 5)


def test_accuracy_perfect() -> None:
    assert accuracy(["A", "B"], ["A", "B"]) == 1.0


def test_accuracy_empty() -> None:
    assert accuracy([], []) == 0.0


def test_accuracy_length_mismatch_raises() -> None:
    with pytest.raises(ValueError):
        accuracy(["A"], ["A", "B"])


@pytest.mark.parametrize("avg", ["macro", "micro", "weighted"])
def test_precision_runs(avg: str) -> None:
    result = precision(Y_TRUE, Y_PRED, average=avg)
    assert 0.0 <= result <= 1.0


def test_precision_perfect() -> None:
    y = ["A", "B", "A", "B"]
    assert precision(y, y) == pytest.approx(1.0)


def test_precision_empty() -> None:
    assert precision([], []) == 0.0


@pytest.mark.parametrize("avg", ["macro", "micro", "weighted"])
def test_recall_runs(avg: str) -> None:
    result = recall(Y_TRUE, Y_PRED, average=avg)
    assert 0.0 <= result <= 1.0


def test_recall_perfect() -> None:
    y = ["A", "B"]
    assert recall(y, y) == pytest.approx(1.0)


@pytest.mark.parametrize("avg", ["macro", "micro", "weighted"])
def test_f1_runs(avg: str) -> None:
    result = f1_score(Y_TRUE, Y_PRED, average=avg)
    assert 0.0 <= result <= 1.0


def test_f1_perfect() -> None:
    y = ["A", "B", "A"]
    assert f1_score(y, y) == pytest.approx(1.0)


def test_f1_empty() -> None:
    assert f1_score([], []) == 0.0


def test_explicit_macro_aliases_match_macro_average() -> None:
    assert macro_precision(Y_TRUE, Y_PRED) == pytest.approx(
        precision(Y_TRUE, Y_PRED, average="macro")
    )
    assert macro_recall(Y_TRUE, Y_PRED) == pytest.approx(
        recall(Y_TRUE, Y_PRED, average="macro")
    )
    assert macro_f1(Y_TRUE, Y_PRED) == pytest.approx(
        f1_score(Y_TRUE, Y_PRED, average="macro")
    )


def test_macro_metrics_can_use_explicit_label_set() -> None:
    y_true = ["A", "A"]
    y_pred = ["A", "B"]
    assert macro_f1(y_true, y_pred, labels=["A"]) == pytest.approx(2 / 3)


def test_per_class_f1() -> None:
    scores = per_class_f1(Y_TRUE, Y_PRED, labels=["A", "B"])
    assert set(scores) == {"A", "B"}
    assert scores["A"] == pytest.approx(2 * (2 / 3) * (2 / 3) / ((2 / 3) + (2 / 3)))
    assert scores["B"] == pytest.approx(0.5)


def test_confusion_matrix_shape() -> None:
    cm = confusion_matrix(Y_TRUE, Y_PRED)
    # Returns nested dict: {true_label: {pred_label: count}}
    assert set(cm.keys()) == {"A", "B"}
    for row in cm.values():
        assert isinstance(row, dict)


def test_confusion_matrix_counts() -> None:
    y_true = ["A", "A", "B"]
    y_pred = ["A", "B", "B"]
    cm = confusion_matrix(y_true, y_pred)
    assert cm["A"]["A"] == 1   # TP for A
    assert cm["A"]["B"] == 1   # A predicted as B
    assert cm["B"]["B"] == 1   # TP for B


# ─── Multi-label classification ───────────────────────────────────────────────

def test_multilabel_exact_match() -> None:
    assert multilabel_exact_match(ML_TRUE, ML_PRED) == pytest.approx(2 / 4)


def test_multilabel_exact_match_perfect() -> None:
    labels = [{"A"}, {"B", "C"}]
    assert multilabel_exact_match(labels, labels) == 1.0


def test_multilabel_hamming_loss_zero() -> None:
    labels = [{"A"}, {"B"}]
    assert multilabel_hamming_loss(labels, labels) == 0.0


def test_multilabel_hamming_loss_positive() -> None:
    assert multilabel_hamming_loss(ML_TRUE, ML_PRED) >= 0.0


def test_multilabel_precision() -> None:
    result = multilabel_precision(ML_TRUE, ML_PRED)
    assert 0.0 <= result <= 1.0


def test_multilabel_recall() -> None:
    result = multilabel_recall(ML_TRUE, ML_PRED)
    assert 0.0 <= result <= 1.0


def test_multilabel_f1() -> None:
    result = multilabel_f1(ML_TRUE, ML_PRED)
    assert 0.0 <= result <= 1.0


def test_multilabel_f1_perfect() -> None:
    labels = [{"A"}, {"B"}]
    assert multilabel_f1(labels, labels) == pytest.approx(1.0)


# ─── Regression ───────────────────────────────────────────────────────────────

def test_mae_positive() -> None:
    result = mae(REG_TRUE, REG_PRED)
    assert result > 0.0
    assert result < 1.0


def test_mae_perfect() -> None:
    assert mae([1.0, 2.0], [1.0, 2.0]) == pytest.approx(0.0)


def test_mse_positive() -> None:
    result = mse(REG_TRUE, REG_PRED)
    assert result >= 0.0


def test_rmse_equals_sqrt_mse() -> None:
    assert rmse(REG_TRUE, REG_PRED) == pytest.approx(math.sqrt(mse(REG_TRUE, REG_PRED)))


def test_r2_perfect() -> None:
    assert r2_score([1.0, 2.0, 3.0], [1.0, 2.0, 3.0]) == pytest.approx(1.0)


def test_r2_reasonable() -> None:
    result = r2_score(REG_TRUE, REG_PRED)
    assert result <= 1.0
