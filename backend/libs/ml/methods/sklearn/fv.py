from abc import abstractmethod
from typing import Any, ClassVar

from ...models import FeatureVectorInput
from ._base import (
    SklearnClassifier,
    SklearnRegressor,
    SmartSklearnClassifier,
    _vector_values,
)

# ─── Feature-vector typed variants ───────────────────────────────────────────


class SklearnFeatureVectorClassifier(SklearnClassifier[FeatureVectorInput]):
    """Sklearn single-label classifier for numeric feature-vector inputs."""

    @abstractmethod
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)

    def _extract_features(
        self, inputs: list[FeatureVectorInput], *, fit: bool = False
    ) -> Any:
        values = _vector_values(inputs)
        if self.feature_extractor is None:
            return values
        if fit and hasattr(self.feature_extractor, "fit_transform"):
            return self.feature_extractor.fit_transform(values)
        if fit and hasattr(self.feature_extractor, "fit"):
            self.feature_extractor.fit(values)
        return self.feature_extractor.transform(values)


class SklearnFeatureVectorRegressor(SklearnRegressor[FeatureVectorInput]):
    """Sklearn regressor for numeric feature-vector inputs."""

    @abstractmethod
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)

    def _extract_features(
        self, inputs: list[FeatureVectorInput], *, fit: bool = False
    ) -> Any:
        values = _vector_values(inputs)
        if self.feature_extractor is None:
            return values
        if fit and hasattr(self.feature_extractor, "fit_transform"):
            return self.feature_extractor.fit_transform(values)
        if fit and hasattr(self.feature_extractor, "fit"):
            self.feature_extractor.fit(values)
        return self.feature_extractor.transform(values)


# ─── Concrete single-label FV classifiers ────────────────────────────────────


class SVMFeatureVectorClassifier(SklearnFeatureVectorClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.svm import SVC

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(SVC(probability=True, **kwargs), feature_extractor)


class LogisticRegressionFeatureVectorClassifier(SklearnFeatureVectorClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.linear_model import LogisticRegression

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(LogisticRegression(**kwargs), feature_extractor)


class RandomForestFeatureVectorClassifier(SklearnFeatureVectorClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import RandomForestClassifier

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(RandomForestClassifier(**kwargs), feature_extractor)


class MLPFeatureVectorClassifier(SklearnFeatureVectorClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.neural_network import MLPClassifier

        super().__init__(MLPClassifier(**kwargs), feature_extractor)


# ─── Concrete smart single-label FV classifiers ───────────────────────────────


class SmartSVMFeatureVectorClassifier(SmartSklearnClassifier[FeatureVectorInput]):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "C": [0.1, 1, 10],
        "kernel": ["linear", "rbf"],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.svm import SVC

        super().__init__(SVC(probability=True, class_weight="balanced"), self._GRID, feature_extractor)

    def _inputs_to_raw(self, inputs: list[FeatureVectorInput]) -> list[Any]:
        return _vector_values(inputs)


class SmartLogisticRegressionFeatureVectorClassifier(SmartSklearnClassifier[FeatureVectorInput]):
    _GRID: ClassVar[dict[str, list[Any]]] = {"C": [0.1, 1, 10]}

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.linear_model import LogisticRegression

        super().__init__(LogisticRegression(max_iter=1000, class_weight="balanced"), self._GRID, feature_extractor)

    def _inputs_to_raw(self, inputs: list[FeatureVectorInput]) -> list[Any]:
        return _vector_values(inputs)


class SmartRandomForestFeatureVectorClassifier(SmartSklearnClassifier[FeatureVectorInput]):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "n_estimators": [50, 100],
        "max_depth": [None, 10],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.ensemble import RandomForestClassifier

        super().__init__(RandomForestClassifier(class_weight="balanced"), self._GRID, feature_extractor)

    def _inputs_to_raw(self, inputs: list[FeatureVectorInput]) -> list[Any]:
        return _vector_values(inputs)


class SmartMLPFeatureVectorClassifier(SmartSklearnClassifier[FeatureVectorInput]):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "hidden_layer_sizes": [(64,), (128,)],
        "alpha": [0.0001, 0.001],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.neural_network import MLPClassifier

        super().__init__(MLPClassifier(max_iter=500), self._GRID, feature_extractor)

    def _inputs_to_raw(self, inputs: list[FeatureVectorInput]) -> list[Any]:
        return _vector_values(inputs)


# ─── Concrete FV regressors ───────────────────────────────────────────────────


class LinearFeatureVectorRegressor(SklearnFeatureVectorRegressor):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.linear_model import LinearRegression

        super().__init__(LinearRegression(**kwargs), feature_extractor)


class PolynomialFeatureVectorRegressor(SklearnFeatureVectorRegressor):
    """Polynomial regression — accepts 1-D scalar inputs."""

    def __init__(self, *, degree: int = 2, **kwargs: Any):
        from sklearn.linear_model import LinearRegression
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import PolynomialFeatures

        super().__init__(
            make_pipeline(
                PolynomialFeatures(degree=degree, include_bias=False),
                LinearRegression(**kwargs),
            ),
            feature_extractor=None,
        )

    def _extract_features(
        self, inputs: list[FeatureVectorInput], *, fit: bool = False
    ) -> Any:
        return _vector_values(inputs)


class RidgeFeatureVectorRegressor(SklearnFeatureVectorRegressor):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.linear_model import Ridge

        super().__init__(Ridge(**kwargs), feature_extractor)


class LassoFeatureVectorRegressor(SklearnFeatureVectorRegressor):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.linear_model import Lasso

        super().__init__(Lasso(**kwargs), feature_extractor)


class RandomForestFeatureVectorRegressor(SklearnFeatureVectorRegressor):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import RandomForestRegressor

        super().__init__(RandomForestRegressor(**kwargs), feature_extractor)


class GradientBoostingFeatureVectorRegressor(SklearnFeatureVectorRegressor):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import GradientBoostingRegressor

        super().__init__(GradientBoostingRegressor(**kwargs), feature_extractor)


class SVRFeatureVectorRegressor(SklearnFeatureVectorRegressor):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.svm import SVR

        super().__init__(SVR(**kwargs), feature_extractor)
