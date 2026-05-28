import json
from typing import Any

from libs.logger.customLogger import print_color

from ..models import (
    ClassificationPrediction,
    RegressionPrediction,
    TrainableClassifier,
    TrainableMultiLabelClassifier,
    TrainableRegressor,
)


def _to_text(value: Any) -> str:
    """Coerce any value to a string suitable for text-based feature extractors."""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


class SklearnClassifier(TrainableClassifier):
    """Trainable classifier backed by a scikit-learn estimator with optional feature extractor."""

    def __init__(self, estimator: Any, feature_extractor: Any | None = None):
        self.estimator = estimator
        self.feature_extractor = feature_extractor

    def _transform(self, inputs: list[Any], *, fit: bool = False) -> Any:
        if self.feature_extractor is None:
            return inputs
        normalized = [_to_text(x) for x in inputs]
        if fit and hasattr(self.feature_extractor, "fit_transform"):
            return self.feature_extractor.fit_transform(normalized)
        if fit and hasattr(self.feature_extractor, "fit"):
            self.feature_extractor.fit(normalized)
        return self.feature_extractor.transform(normalized)

    def fit(self, inputs: list[Any], targets: list[str]) -> None:
        features = self._transform(inputs, fit=True)
        self.estimator.fit(features, targets)

    def classify(self, inputs: list[Any]) -> list[ClassificationPrediction]:
        features = self._transform(inputs)
        labels = list(self.estimator.predict(features))
        proba = (
            list(self.estimator.predict_proba(features))
            if hasattr(self.estimator, "predict_proba")
            else None
        )
        predictions: list[ClassificationPrediction] = []
        for i, label in enumerate(labels):
            score = float(max(proba[i])) if proba else None
            predictions.append(ClassificationPrediction(label=str(label), score=score))
        return predictions


class SklearnRegressor(TrainableRegressor):
    """Trainable regressor backed by a scikit-learn estimator with optional feature extractor."""

    def __init__(self, estimator: Any, feature_extractor: Any | None = None):
        self.estimator = estimator
        self.feature_extractor = feature_extractor

    def _transform(self, inputs: list[Any], *, fit: bool = False) -> Any:
        if self.feature_extractor is None:
            return inputs
        if fit and hasattr(self.feature_extractor, "fit_transform"):
            return self.feature_extractor.fit_transform(inputs)
        if fit and hasattr(self.feature_extractor, "fit"):
            self.feature_extractor.fit(inputs)
        return self.feature_extractor.transform(inputs)

    def fit(self, inputs: list[Any], targets: list[float]) -> None:
        features = self._transform(inputs, fit=True)
        self.estimator.fit(features, targets)

    def regress(self, inputs: list[Any]) -> list[RegressionPrediction]:
        features = self._transform(inputs)
        values = list(self.estimator.predict(features))
        return [RegressionPrediction(value=float(v)) for v in values]


class SVMClassifier(SklearnClassifier):
    """Support vector machine classifier backed by scikit-learn."""

    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.svm import SVC  # lazy optional dependency

        super().__init__(SVC(probability=True, **kwargs), feature_extractor)


class GradientBoostingClassifier(SklearnClassifier):
    """Gradient boosting classifier backed by scikit-learn."""

    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import GradientBoostingClassifier as _GBC  # lazy optional dependency

        super().__init__(_GBC(**kwargs), feature_extractor)


class RandomForestClassifier(SklearnClassifier):
    """Random forest classifier backed by scikit-learn."""

    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import RandomForestClassifier as _RFC  # lazy optional dependency

        super().__init__(_RFC(**kwargs), feature_extractor)


class LogisticRegressionClassifier(SklearnClassifier):
    """Logistic regression classifier backed by scikit-learn."""

    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.linear_model import LogisticRegression  # lazy optional dependency

        super().__init__(LogisticRegression(**kwargs), feature_extractor)


class AdaBoostClassifier(SklearnClassifier):
    """AdaBoost classifier backed by scikit-learn."""

    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import AdaBoostClassifier as _ABC  # lazy optional dependency

        super().__init__(_ABC(**kwargs), feature_extractor)


class MLPClassifier(SklearnClassifier):
    """Multi-layer perceptron classifier backed by scikit-learn."""

    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.neural_network import MLPClassifier as _MLP  # lazy optional dependency

        super().__init__(_MLP(**kwargs), feature_extractor)


class SklearnMultiLabelClassifier(TrainableMultiLabelClassifier):
    """Trainable multi-label classifier backed by a scikit-learn estimator.

    Uses MultiLabelBinarizer to encode targets and MultiOutputClassifier to
    wrap the underlying estimator, so any sklearn classifier can be used.
    """

    def __init__(self, estimator: Any, feature_extractor: Any | None = None):
        self.estimator = estimator
        self.feature_extractor = feature_extractor
        self._fitted_estimator: Any = None
        self._classes: list[str] = []

    def _transform(self, inputs: list[Any], *, fit: bool = False) -> Any:
        if self.feature_extractor is None:
            return inputs
        normalized = [_to_text(x) for x in inputs]
        if fit and hasattr(self.feature_extractor, "fit_transform"):
            return self.feature_extractor.fit_transform(normalized)
        if fit and hasattr(self.feature_extractor, "fit"):
            self.feature_extractor.fit(normalized)
        return self.feature_extractor.transform(normalized)

    def fit(self, inputs: list[Any], targets: list[list[str]]) -> None:
        from sklearn.multioutput import MultiOutputClassifier  # lazy optional dependency
        from sklearn.preprocessing import MultiLabelBinarizer  # lazy optional dependency

        binarizer = MultiLabelBinarizer()
        y = binarizer.fit_transform(targets)
        self._classes = list(binarizer.classes_)
        features = self._transform(inputs, fit=True)
        self._fitted_estimator = MultiOutputClassifier(self.estimator)
        self._fitted_estimator.fit(features, y)

    def classify_multi_label(self, inputs: list[Any]) -> list[list[str]]:
        if self._fitted_estimator is None:
            raise RuntimeError("Model has not been fitted yet.")
        features = self._transform(inputs)
        y_pred = self._fitted_estimator.predict(features)
        return [[self._classes[i] for i, v in enumerate(row) if v] for row in y_pred]


class RandomForestMultiLabelClassifier(SklearnMultiLabelClassifier):
    """Random forest multi-label classifier."""

    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import RandomForestClassifier as _RFC  # lazy optional dependency

        super().__init__(_RFC(**kwargs), feature_extractor)


class SVMMultiLabelClassifier(SklearnMultiLabelClassifier):
    """SVM multi-label classifier (one binary SVM per label via MultiOutputClassifier)."""

    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.svm import SVC  # lazy optional dependency

        super().__init__(SVC(probability=True, **kwargs), feature_extractor)


class LogisticRegressionMultiLabelClassifier(SklearnMultiLabelClassifier):
    """Logistic regression multi-label classifier (one per label via MultiOutputClassifier)."""

    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.linear_model import LogisticRegression  # lazy optional dependency

        super().__init__(LogisticRegression(**kwargs), feature_extractor)


class MLPMultiLabelClassifier(SklearnMultiLabelClassifier):
    """MLP multi-label classifier (one per label via MultiOutputClassifier)."""

    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.neural_network import MLPClassifier as _MLP  # lazy optional dependency

        super().__init__(_MLP(**kwargs), feature_extractor)


class LinearRegressor(SklearnRegressor):
    """Linear regression backed by scikit-learn."""

    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.linear_model import LinearRegression  # lazy optional dependency

        super().__init__(LinearRegression(**kwargs), feature_extractor)


class PolynomialRegressor(SklearnRegressor):
    """Polynomial regression pipeline backed by scikit-learn.

    Accepts 1-D scalar inputs (floats or single-element lists) and reshapes them
    to 2-D before passing through PolynomialFeatures.
    """

    def __init__(self, *, degree: int = 2, **kwargs: Any):
        from sklearn.linear_model import LinearRegression  # lazy optional dependency
        from sklearn.pipeline import make_pipeline  # lazy optional dependency
        from sklearn.preprocessing import PolynomialFeatures  # lazy optional dependency

        estimator = make_pipeline(
            PolynomialFeatures(degree=degree, include_bias=False),
            LinearRegression(**kwargs),
        )
        super().__init__(estimator, feature_extractor=None)

    def _to_2d(self, inputs: list[Any]) -> list[list[float]]:
        result: list[list[float]] = []
        for item in inputs:
            if isinstance(item, (int, float)):
                result.append([float(item)])
            else:
                result.append([float(v) for v in item])
        return result

    def fit(self, inputs: list[Any], targets: list[float]) -> None:
        self.estimator.fit(self._to_2d(inputs), targets)

    def regress(self, inputs: list[Any]) -> list[RegressionPrediction]:
        values = list(self.estimator.predict(self._to_2d(inputs)))
        return [RegressionPrediction(value=float(v)) for v in values]


# ---------------------------------------------------------------------------
# Smart classifiers — same interface as their plain counterparts, but they
# internally run stratified k-fold cross-validation + grid search to pick
# hyperparameters, then refit on all data.  The cv_results_ attribute is
# populated after fit() and can be read by the training pipeline for logging.
# Only sklearn-backed algorithms use these — keyword/LLM methods are untouched.
# ---------------------------------------------------------------------------

class SmartSklearnClassifier(TrainableClassifier):
    """Single-label classifier with automatic grid-search CV.

    Uses a sklearn Pipeline (vectorizer → estimator) when a feature_extractor
    is provided so that GridSearchCV clones the full pipeline per fold —
    no train/val leakage from the vectorizer.

    After fit(), cv_results_ contains:
        best_params, cv_score, cv_score_std, n_folds, n_samples, scoring
    When the dataset is too small for CV it falls back to a direct fit and
    cv_results_ is None.
    """

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

    def _effective_splits(self, targets: list[str]) -> int:
        label_counts: dict[str, int] = {}
        for t in targets:
            label_counts[t] = label_counts.get(t, 0) + 1
        min_class = min(label_counts.values(), default=0)
        return min(self.n_splits, max(2, min_class))

    def _build_pipeline_and_grid(self) -> tuple[Any, dict[str, list[Any]]]:
        from sklearn.pipeline import Pipeline
        pipeline = Pipeline([("vect", self.feature_extractor), ("clf", self.estimator)])
        prefixed = {f"clf__{k}": v for k, v in self.param_grid.items()}
        return pipeline, prefixed

    def fit(self, inputs: list[Any], targets: list[str]) -> None:
        from sklearn.model_selection import GridSearchCV, StratifiedKFold

        n = len(inputs)
        k = self._effective_splits(targets)

        if n < 2 * k or k < 2:
            print_color("yellow", f"[smart_train] {n} samples — too few for {k}-fold CV, fitting directly")
            self._fit_simple(inputs, targets)
            return

        cv = StratifiedKFold(n_splits=k, shuffle=True, random_state=42)
        if self.feature_extractor is not None:
            model, grid = self._build_pipeline_and_grid()
            raw = [_to_text(x) for x in inputs]
            search = GridSearchCV(model, grid, cv=cv, scoring=self.scoring, refit=True)
            search.fit(raw, targets)
        else:
            search = GridSearchCV(self.estimator, self.param_grid, cv=cv, scoring=self.scoring, refit=True)
            search.fit(inputs, targets)

        self._fitted = search.best_estimator_
        best_idx = int(search.best_index_)
        self.cv_results_ = {
            "best_params": search.best_params_,
            "cv_score": round(float(search.best_score_), 4),
            "cv_score_std": round(float(search.cv_results_["std_test_score"][best_idx]), 4),
            "n_folds": k,
            "n_samples": n,
            "scoring": self.scoring,
        }
        print_color(
            "cyan",
            f"[smart_train] best={search.best_params_} "
            f"{self.scoring}={search.best_score_:.3f}±{self.cv_results_['cv_score_std']:.3f} "
            f"({k} folds, {n} samples)",
        )

    def _fit_simple(self, inputs: list[Any], targets: list[str]) -> None:
        if self.feature_extractor is not None:
            from sklearn.pipeline import Pipeline
            pipeline = Pipeline([("vect", self.feature_extractor), ("clf", self.estimator)])
            pipeline.fit([_to_text(x) for x in inputs], targets)
            self._fitted = pipeline
        else:
            self.estimator.fit(inputs, targets)
            self._fitted = self.estimator

    def classify(self, inputs: list[Any]) -> list[ClassificationPrediction]:
        if self._fitted is None:
            raise RuntimeError("Model has not been fitted yet.")
        raw = [_to_text(x) for x in inputs] if self.feature_extractor is not None else inputs
        labels = list(self._fitted.predict(raw))
        proba = list(self._fitted.predict_proba(raw)) if hasattr(self._fitted, "predict_proba") else None
        return [
            ClassificationPrediction(label=str(label), score=float(max(proba[i])) if proba else None)
            for i, label in enumerate(labels)
        ]


class SmartSklearnMultiLabelClassifier(TrainableMultiLabelClassifier):
    """Multi-label classifier that reports honest k-fold CV metrics before fitting on all data.

    Grid search is intentionally skipped for multi-label (stratified splits with
    MultiOutputClassifier are complex); instead we run cross_val_score with KFold
    to get an unbiased F1 estimate, then fit the final model on all samples.

    After fit(), cv_results_ contains:
        cv_score, cv_score_std, n_folds, n_samples, scoring
    """

    def __init__(self, estimator: Any, feature_extractor: Any | None = None, n_splits: int = 5) -> None:
        self.estimator = estimator
        self.feature_extractor = feature_extractor
        self.n_splits = n_splits
        self._fitted: Any = None
        self._classes: list[str] = []
        self.cv_results_: dict[str, Any] | None = None

    def fit(self, inputs: list[Any], targets: list[list[str]]) -> None:
        import math

        import numpy as np
        from sklearn.metrics import f1_score, make_scorer
        from sklearn.model_selection import KFold, cross_val_score
        from sklearn.multioutput import MultiOutputClassifier
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import MultiLabelBinarizer

        binarizer = MultiLabelBinarizer()
        y = binarizer.fit_transform(targets)
        self._classes = list(binarizer.classes_)

        n = len(inputs)
        k = min(self.n_splits, max(2, n // 2))

        # make_scorer expects score_func(y_true, y_pred, **kwargs), not (estimator, X, y_true)
        def _f1_samples(y_true: Any, y_pred: Any) -> float:
            return float(f1_score(y_true, y_pred, average="samples", zero_division=0))

        if n >= 2 * k and k >= 2:
            kf = KFold(n_splits=k, shuffle=True, random_state=42)
            mo = MultiOutputClassifier(self.estimator)
            scorer = make_scorer(_f1_samples)
            try:
                if self.feature_extractor is not None:
                    pipeline = Pipeline([("vect", self.feature_extractor), ("clf", mo)])
                    scores = cross_val_score(pipeline, [_to_text(x) for x in inputs], y, cv=kf, scoring=scorer)
                else:
                    scores = cross_val_score(mo, inputs, y, cv=kf, scoring=scorer)
                mean_score = float(np.mean(scores))
                std_score = float(np.std(scores))
                # Scoring failures produce NaN — PostgreSQL JSONB rejects bare NaN tokens
                if math.isnan(mean_score) or math.isnan(std_score):
                    print_color("yellow", "[smart_train] multi-label CV produced NaN scores — skipping cv_results")
                else:
                    self.cv_results_ = {
                        "cv_score": round(mean_score, 4),
                        "cv_score_std": round(std_score, 4),
                        "n_folds": k,
                        "n_samples": n,
                        "scoring": "f1_samples",
                    }
                    print_color("cyan", f"[smart_train] multi-label f1_samples={mean_score:.3f}±{std_score:.3f} ({k} folds)")
            except Exception as exc:
                print_color("yellow", f"[smart_train] multi-label CV failed ({exc}), skipping")

        mo_final = MultiOutputClassifier(self.estimator)
        if self.feature_extractor is not None:
            pipeline = Pipeline([("vect", self.feature_extractor), ("clf", mo_final)])
            pipeline.fit([_to_text(x) for x in inputs], y)
            self._fitted = pipeline
        else:
            mo_final.fit(inputs, y)
            self._fitted = mo_final

    def classify_multi_label(self, inputs: list[Any]) -> list[list[str]]:
        if self._fitted is None:
            raise RuntimeError("Model has not been fitted yet.")
        raw = [_to_text(x) for x in inputs] if self.feature_extractor is not None else inputs
        y_pred = self._fitted.predict(raw)
        return [[self._classes[i] for i, v in enumerate(row) if v] for row in y_pred]


# Concrete smart single-label classifiers

class SmartSVMClassifier(SmartSklearnClassifier):
    """SVM with automatic C / kernel grid search via stratified CV."""

    _GRID: dict[str, list[Any]] = {"C": [0.1, 1, 10], "kernel": ["linear", "rbf"]}

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.svm import SVC
        super().__init__(SVC(probability=True), self._GRID, feature_extractor)


class SmartLogisticRegressionClassifier(SmartSklearnClassifier):
    """Logistic regression with automatic C grid search via stratified CV."""

    _GRID: dict[str, list[Any]] = {"C": [0.1, 1, 10]}

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.linear_model import LogisticRegression
        super().__init__(LogisticRegression(max_iter=1000), self._GRID, feature_extractor)


class SmartRandomForestClassifier(SmartSklearnClassifier):
    """Random forest with automatic n_estimators / max_depth grid search via stratified CV."""

    _GRID: dict[str, list[Any]] = {"n_estimators": [50, 100], "max_depth": [None, 10, 20]}

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.ensemble import RandomForestClassifier
        super().__init__(RandomForestClassifier(), self._GRID, feature_extractor)


class SmartGradientBoostingClassifier(SmartSklearnClassifier):
    """Gradient boosting with automatic n_estimators / learning_rate grid search via stratified CV."""

    _GRID: dict[str, list[Any]] = {"n_estimators": [50, 100], "learning_rate": [0.05, 0.1], "max_depth": [3, 5]}

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.ensemble import GradientBoostingClassifier
        super().__init__(GradientBoostingClassifier(), self._GRID, feature_extractor)


class SmartMLPClassifier(SmartSklearnClassifier):
    """MLP with automatic hidden_layer_sizes / alpha grid search via stratified CV."""

    _GRID: dict[str, list[Any]] = {"hidden_layer_sizes": [(64,), (128,), (64, 32)], "alpha": [0.0001, 0.001]}

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.neural_network import MLPClassifier
        super().__init__(MLPClassifier(max_iter=500), self._GRID, feature_extractor)


# Concrete smart multi-label classifiers

class SmartAdaBoostClassifier(SmartSklearnClassifier):
    """AdaBoost classifier with automatic n_estimators / learning_rate grid search via stratified CV."""

    _GRID: dict[str, list[Any]] = {"n_estimators": [50, 100], "learning_rate": [0.5, 1.0]}

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.ensemble import AdaBoostClassifier
        super().__init__(AdaBoostClassifier(), self._GRID, feature_extractor)


class SmartRandomForestMultiLabelClassifier(SmartSklearnMultiLabelClassifier):
    """Random forest multi-label classifier with honest k-fold CV metrics."""

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.ensemble import RandomForestClassifier
        super().__init__(RandomForestClassifier(), feature_extractor)


class SmartSVMMultiLabelClassifier(SmartSklearnMultiLabelClassifier):
    """SVM multi-label classifier with honest k-fold CV metrics."""

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.svm import SVC
        super().__init__(SVC(probability=True), feature_extractor)


class SmartLogisticRegressionMultiLabelClassifier(SmartSklearnMultiLabelClassifier):
    """Logistic regression multi-label classifier with honest k-fold CV metrics."""

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.linear_model import LogisticRegression
        super().__init__(LogisticRegression(max_iter=1000), feature_extractor)


class SmartMLPMultiLabelClassifier(SmartSklearnMultiLabelClassifier):
    """MLP multi-label classifier with honest k-fold CV metrics."""

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.neural_network import MLPClassifier
        super().__init__(MLPClassifier(max_iter=500), feature_extractor)
