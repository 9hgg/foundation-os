"""Pure metric functions — no third-party dependencies.

All functions are deterministic, explicitly handle edge cases (zero division,
empty inputs, missing labels), and operate on plain Python types so they can
be tested without any ML framework.

Classification (single-label)
------------------------------
  accuracy, precision, recall, f1_score, macro_precision, macro_recall,
  macro_f1, per_class_f1, confusion_matrix

Multi-label classification
--------------------------
  multilabel_exact_match, multilabel_hamming_loss,
  multilabel_precision, multilabel_recall, multilabel_f1

Regression
----------
  mae, mse, rmse, r2_score

The module is structured so future metric families (ranking, segmentation,
generation, retrieval, embedding similarity) fit naturally alongside these.
"""

from __future__ import annotations

import math
from collections import Counter
from typing import Literal

AveragingMode = Literal["macro", "micro", "weighted"]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _check_lengths(y_true: list, y_pred: list) -> None:
    if len(y_true) != len(y_pred):
        raise ValueError(f"y_true and y_pred must have equal length ({len(y_true)} vs {len(y_pred)})")


def _all_labels(y_true: list[str], y_pred: list[str]) -> list[str]:
    return sorted(set(y_true) | set(y_pred))


def _resolve_labels(
    y_true: list[str], y_pred: list[str], labels: list[str] | None = None
) -> list[str]:
    return list(labels) if labels is not None else _all_labels(y_true, y_pred)


def _per_class_counts(
    y_true: list[str], y_pred: list[str], labels: list[str]
) -> tuple[Counter, Counter, Counter]:
    tp: Counter = Counter()
    fp: Counter = Counter()
    fn: Counter = Counter()
    for t, p in zip(y_true, y_pred):
        if t == p:
            tp[t] += 1
        else:
            fp[p] += 1
            fn[t] += 1
    return tp, fp, fn


# ─── Single-label classification ──────────────────────────────────────────────

def accuracy(y_true: list[str], y_pred: list[str]) -> float:
    """Fraction of exactly correct predictions."""
    _check_lengths(y_true, y_pred)
    if not y_true:
        return 0.0
    return sum(t == p for t, p in zip(y_true, y_pred)) / len(y_true)


def precision(
    y_true: list[str],
    y_pred: list[str],
    *,
    average: AveragingMode = "macro",
    labels: list[str] | None = None,
    zero_division: float = 0.0,
) -> float:
    """Precision averaged across classes."""
    _check_lengths(y_true, y_pred)
    if not y_true:
        return 0.0
    labels = _resolve_labels(y_true, y_pred, labels)
    if not labels:
        return 0.0
    tp, fp, _ = _per_class_counts(y_true, y_pred, labels)

    if average == "micro":
        total_tp = sum(tp[l] for l in labels)
        total_fp = sum(fp[l] for l in labels)
        denom = total_tp + total_fp
        return total_tp / denom if denom else zero_division

    counts = Counter(y_true)
    per_class = []
    for label in labels:
        denom = tp[label] + fp[label]
        per_class.append((tp[label] / denom if denom else zero_division, counts[label]))

    if average == "weighted":
        total_w = sum(w for _, w in per_class)
        return sum(p * w for p, w in per_class) / total_w if total_w else zero_division
    return sum(p for p, _ in per_class) / len(per_class)  # macro


def recall(
    y_true: list[str],
    y_pred: list[str],
    *,
    average: AveragingMode = "macro",
    labels: list[str] | None = None,
    zero_division: float = 0.0,
) -> float:
    """Recall averaged across classes."""
    _check_lengths(y_true, y_pred)
    if not y_true:
        return 0.0
    labels = _resolve_labels(y_true, y_pred, labels)
    if not labels:
        return 0.0
    tp, _, fn = _per_class_counts(y_true, y_pred, labels)

    if average == "micro":
        total_tp = sum(tp[l] for l in labels)
        total_fn = sum(fn[l] for l in labels)
        denom = total_tp + total_fn
        return total_tp / denom if denom else zero_division

    counts = Counter(y_true)
    per_class = []
    for label in labels:
        denom = tp[label] + fn[label]
        per_class.append((tp[label] / denom if denom else zero_division, counts[label]))

    if average == "weighted":
        total_w = sum(w for _, w in per_class)
        return sum(r * w for r, w in per_class) / total_w if total_w else zero_division
    return sum(r for r, _ in per_class) / len(per_class)  # macro


def f1_score(
    y_true: list[str],
    y_pred: list[str],
    *,
    average: AveragingMode = "macro",
    labels: list[str] | None = None,
    zero_division: float = 0.0,
) -> float:
    """F1 score averaged across classes."""
    _check_lengths(y_true, y_pred)
    if not y_true:
        return 0.0
    labels = _resolve_labels(y_true, y_pred, labels)
    if not labels:
        return 0.0
    tp, fp, fn = _per_class_counts(y_true, y_pred, labels)

    if average == "micro":
        total_tp = sum(tp[l] for l in labels)
        total_fp = sum(fp[l] for l in labels)
        total_fn = sum(fn[l] for l in labels)
        denom = 2 * total_tp + total_fp + total_fn
        return 2 * total_tp / denom if denom else zero_division

    counts = Counter(y_true)
    per_class = []
    for label in labels:
        p = tp[label] / (tp[label] + fp[label]) if (tp[label] + fp[label]) else zero_division
        r = tp[label] / (tp[label] + fn[label]) if (tp[label] + fn[label]) else zero_division
        f1 = 2 * p * r / (p + r) if (p + r) else zero_division
        per_class.append((f1, counts[label]))

    if average == "weighted":
        total_w = sum(w for _, w in per_class)
        return sum(f * w for f, w in per_class) / total_w if total_w else zero_division
    return sum(f for f, _ in per_class) / len(per_class)  # macro


def macro_precision(
    y_true: list[str],
    y_pred: list[str],
    *,
    labels: list[str] | None = None,
    zero_division: float = 0.0,
) -> float:
    """Precision averaged equally across labels."""
    return precision(
        y_true,
        y_pred,
        average="macro",
        labels=labels,
        zero_division=zero_division,
    )


def macro_recall(
    y_true: list[str],
    y_pred: list[str],
    *,
    labels: list[str] | None = None,
    zero_division: float = 0.0,
) -> float:
    """Recall averaged equally across labels."""
    return recall(
        y_true,
        y_pred,
        average="macro",
        labels=labels,
        zero_division=zero_division,
    )


def macro_f1(
    y_true: list[str],
    y_pred: list[str],
    *,
    labels: list[str] | None = None,
    zero_division: float = 0.0,
) -> float:
    """F1 averaged equally across labels."""
    return f1_score(
        y_true,
        y_pred,
        average="macro",
        labels=labels,
        zero_division=zero_division,
    )


def per_class_f1(
    y_true: list[str],
    y_pred: list[str],
    *,
    labels: list[str] | None = None,
    zero_division: float = 0.0,
) -> dict[str, float]:
    """F1 score for each label."""
    _check_lengths(y_true, y_pred)
    if not y_true:
        return {}
    resolved_labels = _resolve_labels(y_true, y_pred, labels)
    tp, fp, fn = _per_class_counts(y_true, y_pred, resolved_labels)
    scores: dict[str, float] = {}
    for label in resolved_labels:
        p = tp[label] / (tp[label] + fp[label]) if (tp[label] + fp[label]) else zero_division
        r = tp[label] / (tp[label] + fn[label]) if (tp[label] + fn[label]) else zero_division
        scores[label] = 2 * p * r / (p + r) if (p + r) else zero_division
    return scores


def confusion_matrix(
    y_true: list[str], y_pred: list[str]
) -> dict[str, dict[str, int]]:
    """Confusion matrix as {true_label: {pred_label: count}}.

    Rows are ground-truth labels, columns are predicted labels.
    """
    _check_lengths(y_true, y_pred)
    labels = _all_labels(y_true, y_pred)
    matrix: dict[str, dict[str, int]] = {t: dict.fromkeys(labels, 0) for t in labels}
    for t, p in zip(y_true, y_pred):
        matrix[t][p] += 1
    return matrix


# ─── Multi-label classification ───────────────────────────────────────────────

def multilabel_exact_match(
    y_true: list[set[str]], y_pred: list[set[str]]
) -> float:
    """Fraction of samples where predicted set exactly equals true set."""
    _check_lengths(y_true, y_pred)
    if not y_true:
        return 0.0
    return sum(t == p for t, p in zip(y_true, y_pred)) / len(y_true)


def multilabel_hamming_loss(
    y_true: list[set[str]], y_pred: list[set[str]]
) -> float:
    """Average fraction of incorrectly predicted labels per sample (lower is better)."""
    _check_lengths(y_true, y_pred)
    if not y_true:
        return 0.0
    all_labels = {l for s in y_true + y_pred for l in s}
    if not all_labels:
        return 0.0
    total = 0
    for t, p in zip(y_true, y_pred):
        total += len(t.symmetric_difference(p))
    return total / (len(y_true) * len(all_labels))


def multilabel_precision(
    y_true: list[set[str]], y_pred: list[set[str]], *, zero_division: float = 0.0
) -> float:
    """Macro-averaged per-label precision for multi-label classification."""
    _check_lengths(y_true, y_pred)
    labels = sorted({l for s in y_true + y_pred for l in s})
    if not labels:
        return 0.0
    per_label = []
    for label in labels:
        tp = sum(1 for t, p in zip(y_true, y_pred) if label in t and label in p)
        fp = sum(1 for t, p in zip(y_true, y_pred) if label not in t and label in p)
        denom = tp + fp
        per_label.append(tp / denom if denom else zero_division)
    return sum(per_label) / len(per_label)


def multilabel_recall(
    y_true: list[set[str]], y_pred: list[set[str]], *, zero_division: float = 0.0
) -> float:
    """Macro-averaged per-label recall for multi-label classification."""
    _check_lengths(y_true, y_pred)
    labels = sorted({l for s in y_true + y_pred for l in s})
    if not labels:
        return 0.0
    per_label = []
    for label in labels:
        tp = sum(1 for t, p in zip(y_true, y_pred) if label in t and label in p)
        fn = sum(1 for t, p in zip(y_true, y_pred) if label in t and label not in p)
        denom = tp + fn
        per_label.append(tp / denom if denom else zero_division)
    return sum(per_label) / len(per_label)


def multilabel_f1(
    y_true: list[set[str]], y_pred: list[set[str]], *, zero_division: float = 0.0
) -> float:
    """Macro-averaged per-label F1 for multi-label classification."""
    p = multilabel_precision(y_true, y_pred, zero_division=zero_division)
    r = multilabel_recall(y_true, y_pred, zero_division=zero_division)
    denom = p + r
    return 2 * p * r / denom if denom else zero_division


# ─── Regression ───────────────────────────────────────────────────────────────

def mae(y_true: list[float], y_pred: list[float]) -> float:
    """Mean absolute error."""
    _check_lengths(y_true, y_pred)
    if not y_true:
        return 0.0
    return sum(abs(t - p) for t, p in zip(y_true, y_pred)) / len(y_true)


def mse(y_true: list[float], y_pred: list[float]) -> float:
    """Mean squared error."""
    _check_lengths(y_true, y_pred)
    if not y_true:
        return 0.0
    return sum((t - p) ** 2 for t, p in zip(y_true, y_pred)) / len(y_true)


def rmse(y_true: list[float], y_pred: list[float]) -> float:
    """Root mean squared error."""
    return math.sqrt(mse(y_true, y_pred))


def r2_score(y_true: list[float], y_pred: list[float]) -> float:
    """Coefficient of determination R². Returns 1.0 for perfect predictions."""
    _check_lengths(y_true, y_pred)
    if not y_true:
        return 0.0
    mean_true = sum(y_true) / len(y_true)
    ss_tot = sum((t - mean_true) ** 2 for t in y_true)
    ss_res = sum((t - p) ** 2 for t, p in zip(y_true, y_pred))
    return 1.0 - ss_res / ss_tot if ss_tot else 0.0


__all__ = [  # noqa: RUF022
    # Single-label classification
    "accuracy", "precision", "recall", "f1_score", "macro_precision",
    "macro_recall", "macro_f1", "per_class_f1", "confusion_matrix",
    # Multi-label classification
    "multilabel_exact_match", "multilabel_hamming_loss",
    "multilabel_precision", "multilabel_recall", "multilabel_f1",
    # Regression
    "mae", "mse", "rmse", "r2_score",
    # Types
    "AveragingMode",
]
