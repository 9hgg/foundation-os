from typing import Any, ClassVar

from ...models import TextInput
from ._base import (
    SklearnClassifier,
    SklearnMultiLabelClassifier,
    SmartSklearnClassifier,
    SmartSklearnMultiLabelClassifier,
    _text_values,
    _to_text,
)

# ─── Text-input typed variants ────────────────────────────────────────────────


class SklearnTextClassifier(SklearnClassifier[TextInput]):
    """Sklearn single-label classifier for text inputs."""

    def _extract_features(self, inputs: list[TextInput], *, fit: bool = False) -> Any:
        values = _text_values(inputs)
        if self.feature_extractor is None:
            return values
        normalized = [_to_text(v) for v in values]
        if fit and hasattr(self.feature_extractor, "fit_transform"):
            return self.feature_extractor.fit_transform(normalized)
        if fit and hasattr(self.feature_extractor, "fit"):
            self.feature_extractor.fit(normalized)
        return self.feature_extractor.transform(normalized)


class SklearnTextMultiLabelClassifier(SklearnMultiLabelClassifier[TextInput]):
    """Sklearn multi-label classifier for text inputs."""

    def _extract_features(self, inputs: list[TextInput], *, fit: bool = False) -> Any:
        values = _text_values(inputs)
        if self.feature_extractor is None:
            return values
        normalized = [_to_text(v) for v in values]
        if fit and hasattr(self.feature_extractor, "fit_transform"):
            return self.feature_extractor.fit_transform(normalized)
        if fit and hasattr(self.feature_extractor, "fit"):
            self.feature_extractor.fit(normalized)
        return self.feature_extractor.transform(normalized)


class SmartSklearnTextClassifier(SmartSklearnClassifier[TextInput]):
    """Smart single-label classifier for text inputs."""

    def _inputs_to_raw(self, inputs: list[TextInput]) -> list[Any]:
        return [_to_text(v) for v in _text_values(inputs)]


class SmartSklearnTextMultiLabelClassifier(SmartSklearnMultiLabelClassifier[TextInput]):
    """Smart multi-label classifier for text inputs."""

    def _inputs_to_raw(self, inputs: list[TextInput]) -> list[Any]:
        return [_to_text(v) for v in _text_values(inputs)]


# ─── Concrete single-label classifiers ───────────────────────────────────────


class SVMTextClassifier(SklearnTextClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.svm import SVC

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(SVC(probability=True, **kwargs), feature_extractor)


class GradientBoostingTextClassifier(SklearnTextClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import GradientBoostingClassifier as _GBC

        super().__init__(_GBC(**kwargs), feature_extractor)


class RandomForestTextClassifier(SklearnTextClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import RandomForestClassifier as _RFC

        super().__init__(_RFC(**kwargs), feature_extractor)


class LogisticRegressionTextClassifier(SklearnTextClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.linear_model import LogisticRegression

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(LogisticRegression(**kwargs), feature_extractor)


class AdaBoostTextClassifier(SklearnTextClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import AdaBoostClassifier as _ABC

        super().__init__(_ABC(**kwargs), feature_extractor)


class MLPTextClassifier(SklearnTextClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.neural_network import MLPClassifier as _MLP

        super().__init__(_MLP(**kwargs), feature_extractor)


# ─── Concrete multi-label classifiers ────────────────────────────────────────


class SVMMultiLabelTextClassifier(SklearnTextMultiLabelClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.svm import SVC

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(SVC(probability=True, **kwargs), feature_extractor)


class RandomForestMultiLabelTextClassifier(SklearnTextMultiLabelClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import RandomForestClassifier as _RFC

        super().__init__(_RFC(**kwargs), feature_extractor)


class LogisticRegressionMultiLabelTextClassifier(SklearnTextMultiLabelClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.linear_model import LogisticRegression

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(LogisticRegression(**kwargs), feature_extractor)


class MLPMultiLabelTextClassifier(SklearnTextMultiLabelClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.neural_network import MLPClassifier as _MLP

        super().__init__(_MLP(**kwargs), feature_extractor)


# ─── Concrete smart single-label classifiers ─────────────────────────────────


class SmartSVMTextClassifier(SmartSklearnTextClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "C": [0.1, 1, 10],
        "kernel": ["linear", "rbf"],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.svm import SVC

        super().__init__(SVC(probability=True, class_weight="balanced"), self._GRID, feature_extractor)


class SmartLogisticRegressionTextClassifier(SmartSklearnTextClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {"C": [0.1, 1, 10]}

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.linear_model import LogisticRegression

        super().__init__(
            LogisticRegression(max_iter=1000), self._GRID, feature_extractor
        )


class SmartRandomForestTextClassifier(SmartSklearnTextClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "n_estimators": [50, 100],
        "max_depth": [None, 10, 20],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.ensemble import RandomForestClassifier

        super().__init__(RandomForestClassifier(class_weight="balanced"), self._GRID, feature_extractor)


class SmartGradientBoostingTextClassifier(SmartSklearnTextClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "n_estimators": [50, 100],
        "learning_rate": [0.05, 0.1],
        "max_depth": [3, 5],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.ensemble import GradientBoostingClassifier

        super().__init__(GradientBoostingClassifier(), self._GRID, feature_extractor)


class SmartMLPTextClassifier(SmartSklearnTextClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "hidden_layer_sizes": [(64,), (128,), (64, 32)],
        "alpha": [0.0001, 0.001],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.neural_network import MLPClassifier

        super().__init__(MLPClassifier(max_iter=500), self._GRID, feature_extractor)


class SmartAdaBoostTextClassifier(SmartSklearnTextClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "n_estimators": [50, 100],
        "learning_rate": [0.5, 1.0],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.ensemble import AdaBoostClassifier

        super().__init__(AdaBoostClassifier(), self._GRID, feature_extractor)


# ─── Concrete smart multi-label classifiers ───────────────────────────────────


class SmartGradientBoostingMultiLabelTextClassifier(
    SmartSklearnTextMultiLabelClassifier
):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "n_estimators": [50, 100],
        "learning_rate": [0.05, 0.1],
        "max_depth": [3, 5],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.ensemble import GradientBoostingClassifier

        super().__init__(GradientBoostingClassifier(), self._GRID, feature_extractor)


class SmartMLPMultiLabelTextClassifier(SmartSklearnTextMultiLabelClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "hidden_layer_sizes": [(64,), (128,), (64, 32)],
        "alpha": [0.0001, 0.001],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.neural_network import MLPClassifier

        super().__init__(MLPClassifier(max_iter=500), self._GRID, feature_extractor)


class SmartLogisticRegressionMultiLabelTextClassifier(
    SmartSklearnTextMultiLabelClassifier
):
    _GRID: ClassVar[dict[str, list[Any]]] = {"C": [0.1, 1, 10]}

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.linear_model import LogisticRegression

        super().__init__(
            LogisticRegression(max_iter=1000), self._GRID, feature_extractor
        )


class SmartSVMMultiLabelTextClassifier(SmartSklearnTextMultiLabelClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "C": [0.1, 1, 10],
        "kernel": ["linear", "rbf"],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.svm import SVC

        super().__init__(SVC(probability=True, class_weight="balanced"), self._GRID, feature_extractor)


class SmartRandomForestMultiLabelTextClassifier(SmartSklearnTextMultiLabelClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "n_estimators": [50, 100],
        "max_depth": [None, 10, 20],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.ensemble import RandomForestClassifier

        super().__init__(RandomForestClassifier(class_weight="balanced"), self._GRID, feature_extractor)
