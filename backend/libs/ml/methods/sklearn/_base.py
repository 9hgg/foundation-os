import json
import math
from abc import abstractmethod
from typing import Any, TypeVar

from libs.logger.customLogger import print_color

from ...models import (
    AlgorithmInput,
    ClassificationPrediction,
    FeatureVectorInput,
    JsonInput,
    Label,
    RegressionPrediction,
    TextInput,
    TrainableClassifier,
    TrainableMultiLabelClassifier,
    TrainableRegressor,
)

T = TypeVar("T", bound=AlgorithmInput)
_MODEL_NOT_FITTED_ERROR = "Model has not been fitted yet."


def _unwrap_multi_output(fitted: Any) -> Any:
    """Return the MultiOutputClassifier from a fitted model, unwrapping a Pipeline if needed."""
    if hasattr(fitted, "steps"):
        return fitted.steps[-1][1]
    return fitted


def _to_text(value: Any) -> str:
    """Coerce any value to a string suitable for text-based feature extractors."""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


def _text_values(inputs: list[TextInput]) -> list[str]:
    return [i.text_value for i in inputs]


def _json_values(inputs: list[JsonInput]) -> list[Any]:
    return [i.json_value for i in inputs]


def _vector_values(inputs: list[FeatureVectorInput]) -> list[list[float]]:
    return [i.vector_value for i in inputs]


def _sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1.0 / (1.0 + z)
    z = math.exp(value)
    return z / (1.0 + z)


def _softmax(row: Any) -> list[float]:
    values = [float(v) for v in row]
    if not values:
        return []
    max_value = max(values)
    exps = [math.exp(v - max_value) for v in values]
    total = sum(exps)
    return [v / total for v in exps]


def _decision_scores(estimator: Any, features: Any) -> list[list[float]] | None:
    """Return probability-like class scores for estimators exposing decision_function."""
    if not hasattr(estimator, "decision_function") or not hasattr(estimator, "classes_"):
        return None

    decisions = estimator.decision_function(features)
    classes = list(estimator.classes_)
    if len(classes) == 2 and getattr(decisions, "ndim", 1) == 1:
        return [[1.0 - _sigmoid(float(v)), _sigmoid(float(v))] for v in decisions]

    return [_softmax(row) for row in decisions]


# ─── Generic sklearn bases ────────────────────────────────────────────────────


class SklearnClassifier(TrainableClassifier[T]):
    """Generic sklearn single-label classifier. Subclass and specialize _extract_features."""

    def __init__(self, estimator: Any, feature_extractor: Any | None = None):
        self.estimator = estimator
        self.feature_extractor = feature_extractor

    @abstractmethod
    def _extract_features(self, inputs: list[T], *, fit: bool = False) -> Any: ...

    def _fit(self, inputs: list[T], targets: list[Label]) -> None:
        self.estimator.fit(
            self._extract_features(inputs, fit=True), [t.id for t in targets]
        )

    def _classify(self, inputs: list[T]) -> list[ClassificationPrediction]:
        features = self._extract_features(inputs)
        labels = list(self.estimator.predict(features))
        proba = (
            list(self.estimator.predict_proba(features))
            if hasattr(self.estimator, "predict_proba")
            else None
        )
        if proba is None:
            proba = _decision_scores(self.estimator, features)
        classes = (
            [str(c) for c in self.estimator.classes_]
            if proba and hasattr(self.estimator, "classes_")
            else None
        )
        return [
            ClassificationPrediction(
                label_id=str(label),
                score=float(max(proba[i])) if proba else None,
                metadata={"class_scores": dict(zip(classes, [float(v) for v in proba[i]]))}
                if proba and classes
                else None,
            )
            for i, label in enumerate(labels)
        ]


class SklearnMultiLabelClassifier(TrainableMultiLabelClassifier[T]):
    """Generic sklearn multi-label classifier. Subclass and specialize _extract_features."""

    def __init__(self, estimator: Any, feature_extractor: Any | None = None):
        self.estimator = estimator
        self.feature_extractor = feature_extractor
        self._fitted_estimator: Any = None
        self._classes: list[str] = []

    @abstractmethod
    def _extract_features(self, inputs: list[T], *, fit: bool = False) -> Any: ...

    def _fit(self, inputs: list[T], targets: list[list[Label]]) -> None:
        from sklearn.multioutput import MultiOutputClassifier
        from sklearn.preprocessing import MultiLabelBinarizer

        binarizer = MultiLabelBinarizer()
        y = binarizer.fit_transform([[label.id for label in row] for row in targets])
        self._classes = list(binarizer.classes_)
        self._fitted_estimator = MultiOutputClassifier(self.estimator)
        self._fitted_estimator.fit(self._extract_features(inputs, fit=True), y)

    def _classify_multi_label(
        self,
        inputs: list[T],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]:
        if self._fitted_estimator is None:
            raise RuntimeError(_MODEL_NOT_FITTED_ERROR)
        features = self._extract_features(inputs)
        mo_clf = _unwrap_multi_output(self._fitted_estimator)
        per_label_proba = [
            est.predict_proba(features)[:, 1]
            if hasattr(est, "predict_proba")
            else None
            for est in mo_clf.estimators_
        ]
        n_samples = len(inputs)
        return [
            [
                ClassificationPrediction(
                    label_id=self._classes[i],
                    score=float(per_label_proba[i][sample_idx])
                    if per_label_proba[i] is not None
                    else None,
                )
                for i in range(len(self._classes))
                if (
                    per_label_proba[i] is not None
                    and float(per_label_proba[i][sample_idx]) >= threshold
                ) or (
                    per_label_proba[i] is None
                    and threshold <= 0.5  # fallback: include when threshold is relaxed
                )
            ]
            for sample_idx in range(n_samples)
        ]


class SklearnRegressor(TrainableRegressor[T]):
    """Generic sklearn regressor. Subclass and specialize _extract_features."""

    def __init__(self, estimator: Any, feature_extractor: Any | None = None):
        self.estimator = estimator
        self.feature_extractor = feature_extractor

    @abstractmethod
    def _extract_features(self, inputs: list[T], *, fit: bool = False) -> Any: ...

    def _fit(self, inputs: list[T], targets: list[float]) -> None:
        self.estimator.fit(self._extract_features(inputs, fit=True), targets)

    def _regress(self, inputs: list[T]) -> list[RegressionPrediction]:
        return [
            RegressionPrediction(value=float(v))
            for v in self.estimator.predict(self._extract_features(inputs))
        ]


class SmartSklearnClassifier(TrainableClassifier[T]):
    """Generic smart single-label classifier with CV grid search. Subclass and specialize _inputs_to_raw."""

    def __init__(
        self,
        estimator: Any,
        param_grid: dict[str, list[Any]],
        feature_extractor: Any | None = None,
        n_splits: int = 5,
        scoring: str = "f1_weighted",
    ) -> None:
        self.estimator = estimator
        self.param_grid = param_grid
        self.feature_extractor = feature_extractor
        self.n_splits = n_splits
        self.scoring = scoring
        self._fitted: Any = None
        self.cv_results_: dict[str, Any] | None = None

    @abstractmethod
    def _inputs_to_raw(self, inputs: list[T]) -> list[Any]:
        """Convert structured inputs to raw values for sklearn processing."""
        ...

    def _effective_splits(self, targets: list[str]) -> int:
        label_counts: dict[str, int] = {}
        for t in targets:
            label_counts[t] = label_counts.get(t, 0) + 1
        return min(self.n_splits, max(2, min(label_counts.values(), default=0)))

    def _fit(self, inputs: list[T], targets: list[Label]) -> None:
        from sklearn.model_selection import GridSearchCV, StratifiedKFold

        target_ids = [t.id for t in targets]
        raw = self._inputs_to_raw(inputs)
        n = len(raw)
        k = self._effective_splits(target_ids)

        if n < 2 * k or k < 2:
            print_color(
                "yellow",
                f"[smart_train] {n} samples — too few for {k}-fold CV, fitting directly",
            )
            self._fit_simple(raw, target_ids)
            return

        cv = StratifiedKFold(n_splits=k, shuffle=True, random_state=42)
        if self.feature_extractor is not None:
            from sklearn.pipeline import Pipeline

            model = Pipeline(
                [("vect", self.feature_extractor), ("clf", self.estimator)]
            )
            grid = {f"clf__{k}": v for k, v in self.param_grid.items()}
            search = GridSearchCV(model, grid, cv=cv, scoring=self.scoring, refit=True)
        else:
            search = GridSearchCV(
                self.estimator, self.param_grid, cv=cv, scoring=self.scoring, refit=True
            )
        search.fit(raw, target_ids)

        self._fitted = search.best_estimator_
        best_idx = int(search.best_index_)
        self.cv_results_ = {
            "best_params": search.best_params_,
            "cv_score": round(float(search.best_score_), 4),
            "cv_score_std": round(
                float(search.cv_results_["std_test_score"][best_idx]), 4
            ),
            "n_folds": k,
            "n_samples": n,
            "scoring": self.scoring,
        }
        # print_color(
        #     "cyan",
        #     f"[smart_train] best={search.best_params_} {self.scoring}={search.best_score_:.3f}±{self.cv_results_['cv_score_std']:.3f} ({k} folds, {n} samples)",
        # )

    def _fit_simple(
        self, raw: list[Any], targets: list[str]
    ) -> None:  # targets are already extracted IDs
        if self.feature_extractor is not None:
            from sklearn.pipeline import Pipeline

            pipeline = Pipeline(
                [("vect", self.feature_extractor), ("clf", self.estimator)]
            )
            pipeline.fit(raw, targets)
            self._fitted = pipeline
        else:
            self.estimator.fit(raw, targets)
            self._fitted = self.estimator

    def _classify(self, inputs: list[T]) -> list[ClassificationPrediction]:
        if self._fitted is None:
            raise RuntimeError(_MODEL_NOT_FITTED_ERROR)
        raw = self._inputs_to_raw(inputs)
        labels = list(self._fitted.predict(raw))
        proba = (
            list(self._fitted.predict_proba(raw))
            if hasattr(self._fitted, "predict_proba")
            else None
        )
        return [
            ClassificationPrediction(
                label_id=str(label), score=float(max(proba[i])) if proba else None
            )
            for i, label in enumerate(labels)
        ]


class SmartSklearnMultiLabelClassifier(TrainableMultiLabelClassifier[T]):
    """Generic smart multi-label classifier with k-fold CV. Subclass and specialize _inputs_to_raw."""

    def __init__(
        self,
        estimator: Any,
        param_grid: dict[str, list[Any]] | None = None,
        feature_extractor: Any | None = None,
        n_splits: int = 5,
    ) -> None:
        self.estimator = estimator
        self.param_grid = param_grid or {}
        self.feature_extractor = feature_extractor
        self.n_splits = n_splits
        self._fitted: Any = None
        self._classes: list[str] = []
        self.cv_results_: dict[str, Any] | None = None
        self.cv_warning_: str | None = None

    @abstractmethod
    def _inputs_to_raw(self, inputs: list[T]) -> list[Any]: ...

    def _fit(self, inputs: list[T], targets: list[list[Label]]) -> None:
        from sklearn.multioutput import MultiOutputClassifier
        from sklearn.preprocessing import MultiLabelBinarizer

        binarizer = MultiLabelBinarizer()
        y = binarizer.fit_transform([[label.id for label in row] for row in targets])
        self._classes = list(binarizer.classes_)
        raw = self._inputs_to_raw(inputs)
        n = len(raw)
        k = min(self.n_splits, max(2, n // 2))

        if n >= 2 * k and k >= 2:
            if self.param_grid:
                if self._fit_with_grid_search(raw, y, k):
                    return
            else:
                self._fit_with_cv_diagnostics(raw, y, k)

        mo_final = MultiOutputClassifier(self.estimator)
        self._fit_estimator(mo_final, raw, y)

    def _build_pipeline_or_estimator(self, estimator: Any, *, pipeline_prefix: str = "clf") -> Any:
        from sklearn.pipeline import Pipeline

        if self.feature_extractor is not None:
            return Pipeline([("vect", self.feature_extractor), (pipeline_prefix, estimator)])
        return estimator

    def _fit_estimator(self, estimator: Any, raw: list[Any], y: Any) -> None:
        model = self._build_pipeline_or_estimator(estimator)
        model.fit(raw, y)
        self._fitted = model

    def _fit_with_grid_search(self, raw: list[Any], y: Any, k: int) -> bool:
        from sklearn.metrics import f1_score, make_scorer
        from sklearn.model_selection import GridSearchCV
        from sklearn.multioutput import MultiOutputClassifier

        def _f1_macro(y_true: Any, y_pred: Any) -> float:
            return float(f1_score(y_true, y_pred, average="macro", zero_division=0))

        mo = MultiOutputClassifier(self.estimator)
        prefix = "clf__estimator__" if self.feature_extractor is not None else "estimator__"
        grid = {f"{prefix}{p}": v for p, v in self.param_grid.items()}
        model = self._build_pipeline_or_estimator(mo)
        try:
            search = GridSearchCV(model, grid, cv=k, scoring=make_scorer(_f1_macro), refit=True)
            search.fit(raw, y)
            best_idx = int(search.best_index_)
            self.cv_results_ = {
                "best_params": search.best_params_,
                "cv_score": round(float(search.best_score_), 4),
                "cv_score_std": round(float(search.cv_results_["std_test_score"][best_idx]), 4),
                "n_folds": k, "n_samples": len(raw), "scoring": "f1_macro",
            }
            # print_color("cyan", f"[smart_train] multi-label best={search.best_params_} f1_macro={search.best_score_:.3f} ({k} folds)")
        except Exception as exc:
            self.cv_warning_ = f"Grid search failed: {exc}"
            print_color("yellow", f"[smart_train] multi-label grid search failed ({exc}), fitting directly")
            return False
        else:
            self._fitted = search.best_estimator_
            return True

    def _fit_with_cv_diagnostics(self, raw: list[Any], y: Any, k: int) -> None:
        import math

        import numpy as np
        from sklearn.metrics import f1_score, make_scorer
        from sklearn.model_selection import KFold, cross_val_score
        from sklearn.multioutput import MultiOutputClassifier

        def _f1_macro(y_true: Any, y_pred: Any) -> float:
            return float(f1_score(y_true, y_pred, average="macro", zero_division=0))

        mo = MultiOutputClassifier(self.estimator)
        model = self._build_pipeline_or_estimator(mo)
        kf = KFold(n_splits=k, shuffle=True, random_state=42)
        try:
            scores = cross_val_score(model, raw, y, cv=kf, scoring=make_scorer(_f1_macro), error_score=0.0)
            mean_score, std_score = float(np.mean(scores)), float(np.std(scores))
            if not (math.isnan(mean_score) or math.isnan(std_score)):
                self.cv_results_ = {"cv_score": round(mean_score, 4), "cv_score_std": round(std_score, 4), "n_folds": k, "n_samples": len(raw), "scoring": "f1_macro"}
                print_color("cyan", f"[smart_train] multi-label f1_macro={mean_score:.3f}±{std_score:.3f} ({k} folds)")
        except Exception as exc:
            self.cv_warning_ = f"Cross-validation failed: {exc}"

    def _classify_multi_label(
        self,
        inputs: list[T],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]:
        if self._fitted is None:
            raise RuntimeError(_MODEL_NOT_FITTED_ERROR)
        raw = self._inputs_to_raw(inputs)
        mo_clf = _unwrap_multi_output(self._fitted)
        # If fitted is a Pipeline, apply preprocessing steps before the estimator
        if hasattr(self._fitted, "steps") and len(self._fitted.steps) > 1:
            features: Any = raw
            for _, step in self._fitted.steps[:-1]:
                features = step.transform(features)
        else:
            features = raw
        per_label_proba = [
            est.predict_proba(features)[:, 1]
            if hasattr(est, "predict_proba")
            else None
            for est in mo_clf.estimators_
        ]
        n_samples = len(inputs)
        return [
            [
                ClassificationPrediction(
                    label_id=self._classes[i],
                    score=float(per_label_proba[i][sample_idx])
                    if per_label_proba[i] is not None
                    else None,
                )
                for i in range(len(self._classes))
                if (
                    per_label_proba[i] is not None
                    and float(per_label_proba[i][sample_idx]) >= threshold
                ) or (
                    per_label_proba[i] is None and threshold <= 0.5
                )
            ]
            for sample_idx in range(n_samples)
        ]
