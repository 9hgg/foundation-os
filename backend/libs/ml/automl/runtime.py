# ruff: noqa: TRY003

import copy
import statistics
from typing import Any

from libs.ml import evaluate_classifier, evaluate_multilabel_classifier, evaluate_regressor
from libs.ml.datasets import Dataset as MLDataset
from libs.ml.errors import MLError
from libs.ml.evaluation import EvaluationResult
from libs.ml.models import Classifier, Label, Regressor
from libs.ml.registry import MLRegistry, OutputKind, TaskFormalism


def train_best_matching_algorithm(
    *,
    registry: MLRegistry,
    formalism: TaskFormalism,
    labeled_dataset: MLDataset,
    evaluation_dataset: MLDataset,
    excluded_algorithm_keys: set[str] | None = None,
) -> dict[str, Any]:
    candidate_specs = [
        spec
        for spec in registry.list(formalism=formalism)
        if spec.trainable and spec.key not in (excluded_algorithm_keys or set())
    ]
    if not candidate_specs:
        raise MLError(f"No trainable algorithms available for formalism '{formalism}'.")

    best_candidate: dict[str, Any] | None = None
    for spec in candidate_specs:
        candidate_config, missing_required = _build_default_algorithm_config(spec)
        if missing_required:
            continue
        cv_results, cv_warning = _cross_validate_algorithm(
            registry=registry,
            algorithm_key=spec.key,
            config=candidate_config,
            formalism=formalism,
            dataset=labeled_dataset,
        )
        score = _extract_cv_selection_score(cv_results=cv_results)
        if score is None:
            continue
        if (
            best_candidate is None
            or _is_score_better(formalism=formalism, score=score, current_best=best_candidate["score"])
        ):
            best_candidate = {
                "score": score,
                "spec": spec,
                "config": candidate_config,
                "cv_results": cv_results,
                "cv_warning": cv_warning,
            }

    if best_candidate is None:
        raise MLError("Auto-ML could not evaluate any trainable algorithm for this target.")

    selected_spec = best_candidate["spec"]
    selected_config = best_candidate["config"]
    algorithm = registry.build(selected_spec.key, copy.deepcopy(selected_config))
    _fit_algorithm_for_dataset(
        algorithm=algorithm,
        formalism=formalism,
        dataset=labeled_dataset,
    )
    evaluation = _evaluate_algorithm_for_dataset(
        algorithm=algorithm,
        formalism=formalism,
        dataset=evaluation_dataset,
    )

    return {
        "selected_algorithm_key": selected_spec.key,
        "selected_algorithm_name": selected_spec.name,
        "selected_algorithm_config": selected_config,
        "algorithm": algorithm,
        "evaluation": evaluation,
        "cv_results": best_candidate["cv_results"],
        "cv_warning": best_candidate["cv_warning"],
        "trained_sample_count": len(labeled_dataset.samples),
    }


def _build_default_algorithm_config(spec: Any) -> tuple[dict[str, Any], list[str]]:
    config: dict[str, Any] = {}
    missing_required: list[str] = []
    for parameter in spec.parameters:
        if parameter.default is not None:
            config[parameter.name] = parameter.default
        elif parameter.required:
            missing_required.append(parameter.label)
    return config, missing_required


def _selection_metric_name(formalism: TaskFormalism) -> str:
    if formalism.output_kind == OutputKind.VALUE:
        return "rmse"
    return "f1"


def _is_score_better(*, formalism: TaskFormalism, score: float, current_best: float) -> bool:
    if formalism.output_kind == OutputKind.VALUE:
        return score < current_best
    return score > current_best


def _extract_cv_selection_score(*, cv_results: dict[str, Any] | None) -> float | None:
    if not isinstance(cv_results, dict):
        return None
    score = cv_results.get("cv_score")
    if isinstance(score, (int, float)):
        return float(score)
    return None


def _cross_validate_algorithm(
    *,
    registry: MLRegistry,
    algorithm_key: str,
    config: dict[str, Any],
    formalism: TaskFormalism,
    dataset: MLDataset,
) -> tuple[dict[str, Any] | None, str | None]:
    if len(dataset.samples) < 2:
        return None, "Cross-validation skipped: not enough labeled samples."

    n_splits = min(5, len(dataset.samples))
    folds = dataset.k_fold_splits(n_splits=n_splits, random_state=42, stratify=True)
    fold_scores: list[float] = []
    metric_name = _selection_metric_name(formalism)

    for train_dataset, test_dataset in folds:
        algorithm = registry.build(algorithm_key, copy.deepcopy(config))
        _fit_algorithm_for_dataset(
            algorithm=algorithm,
            formalism=formalism,
            dataset=train_dataset,
        )
        evaluation = _evaluate_algorithm_for_dataset(
            algorithm=algorithm,
            formalism=formalism,
            dataset=test_dataset,
        )
        metric_value = evaluation.metrics.get(metric_name)
        if isinstance(metric_value, (int, float)):
            fold_scores.append(float(metric_value))

    if not fold_scores:
        return None, "Cross-validation failed: no fold produced a numeric score."

    cv_score = float(statistics.mean(fold_scores))
    cv_score_std = float(statistics.pstdev(fold_scores)) if len(fold_scores) > 1 else 0.0
    return (
        {
            "cv_score": cv_score,
            "cv_score_std": cv_score_std,
            "n_folds": len(fold_scores),
            "n_samples": len(dataset.samples),
            "scoring": metric_name,
        },
        None,
    )


def _fit_algorithm_for_dataset(
    *,
    algorithm: Classifier | Regressor,
    formalism: TaskFormalism,
    dataset: MLDataset,
) -> None:
    labeled = dataset.labeled_samples()
    inputs = [sample.input for sample in labeled]
    if formalism.output_kind == OutputKind.LABELS:
        raw_ids_list = [sample.target.label_ids for sample in labeled]  # type: ignore[union-attr]
        label_targets = [[Label(id=label_id, name=label_id) for label_id in label_ids] for label_ids in raw_ids_list]
        algorithm.fit(inputs, label_targets)
        return
    if formalism.output_kind == OutputKind.VALUE:
        targets_list = [sample.target.value for sample in labeled]  # type: ignore[union-attr]
        algorithm.fit(inputs, targets_list)
        return

    raw_ids = [sample.target.label_id for sample in labeled]  # type: ignore[union-attr]
    label_targets = [Label(id=label_id, name=label_id) for label_id in raw_ids]
    algorithm.fit(inputs, label_targets)


def _evaluate_algorithm_for_dataset(
    *,
    algorithm: Classifier | Regressor,
    formalism: TaskFormalism,
    dataset: MLDataset,
) -> EvaluationResult:
    if formalism.output_kind == OutputKind.LABELS:
        return evaluate_multilabel_classifier(algorithm, dataset)
    if formalism.output_kind == OutputKind.VALUE:
        return evaluate_regressor(algorithm, dataset)
    return evaluate_classifier(algorithm, dataset, include_confusion_matrix=True)


__all__ = ["train_best_matching_algorithm"]
