from typing import Any, ClassVar

from ...models import JsonInput
from ._base import (
    SklearnClassifier,
    SklearnMultiLabelClassifier,
    SmartSklearnClassifier,
    SmartSklearnMultiLabelClassifier,
    _json_values,
    _to_text,
)

# ─── JSON-input typed variants ────────────────────────────────────────────────


def _extractor_expects_json_dicts(extractor: Any | None) -> bool:
    return bool(getattr(extractor, "expects_json_dict", False))


class SklearnJsonClassifier(SklearnClassifier[JsonInput]):
    """Sklearn single-label classifier for JSON inputs serialized as text."""

    def _extract_features(self, inputs: list[JsonInput], *, fit: bool = False) -> Any:
        raw_values = _json_values(inputs)
        values = (
            raw_values
            if _extractor_expects_json_dicts(self.feature_extractor)
            else [_to_text(v) for v in raw_values]
        )
        if self.feature_extractor is None:
            return values
        if fit and hasattr(self.feature_extractor, "fit_transform"):
            return self.feature_extractor.fit_transform(values)
        if fit and hasattr(self.feature_extractor, "fit"):
            self.feature_extractor.fit(values)
        return self.feature_extractor.transform(values)


class SklearnJsonMultiLabelClassifier(SklearnMultiLabelClassifier[JsonInput]):
    """Sklearn multi-label classifier for JSON inputs serialized as text."""

    def _extract_features(self, inputs: list[JsonInput], *, fit: bool = False) -> Any:
        raw_values = _json_values(inputs)
        values = (
            raw_values
            if _extractor_expects_json_dicts(self.feature_extractor)
            else [_to_text(v) for v in raw_values]
        )
        if self.feature_extractor is None:
            return values
        if fit and hasattr(self.feature_extractor, "fit_transform"):
            return self.feature_extractor.fit_transform(values)
        if fit and hasattr(self.feature_extractor, "fit"):
            self.feature_extractor.fit(values)
        return self.feature_extractor.transform(values)


class SmartSklearnJsonClassifier(SmartSklearnClassifier[JsonInput]):
    """Smart single-label classifier for JSON inputs serialized as text."""

    def _inputs_to_raw(self, inputs: list[JsonInput]) -> list[Any]:
        raw_values = _json_values(inputs)
        if _extractor_expects_json_dicts(self.feature_extractor):
            return raw_values
        return [_to_text(v) for v in raw_values]


class SmartSklearnJsonMultiLabelClassifier(SmartSklearnMultiLabelClassifier[JsonInput]):
    """Smart multi-label classifier for JSON inputs serialized as text."""

    def _inputs_to_raw(self, inputs: list[JsonInput]) -> list[Any]:
        raw_values = _json_values(inputs)
        if _extractor_expects_json_dicts(self.feature_extractor):
            return raw_values
        return [_to_text(v) for v in raw_values]


# ─── Concrete single-label JSON classifiers ───────────────────────────────────


class SVMJsonClassifier(SklearnJsonClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.svm import SVC

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(SVC(probability=True, **kwargs), feature_extractor)


class LinearSVMJsonClassifier(SklearnJsonClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.svm import LinearSVC

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(LinearSVC(**kwargs), feature_extractor)


class SGDJsonClassifier(SklearnJsonClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.linear_model import SGDClassifier

        kwargs.setdefault("loss", "hinge")
        kwargs.setdefault("random_state", 42)
        kwargs.setdefault("class_weight", "balanced")
        super().__init__(SGDClassifier(**kwargs), feature_extractor)


class LogisticRegressionJsonClassifier(SklearnJsonClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.linear_model import LogisticRegression

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(LogisticRegression(**kwargs), feature_extractor)


class RandomForestJsonClassifier(SklearnJsonClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import RandomForestClassifier

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(RandomForestClassifier(**kwargs), feature_extractor)


class MLPJsonClassifier(SklearnJsonClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.neural_network import MLPClassifier

        super().__init__(MLPClassifier(**kwargs), feature_extractor)


class GradientBoostingJsonClassifier(SklearnJsonClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import GradientBoostingClassifier

        super().__init__(GradientBoostingClassifier(**kwargs), feature_extractor)


# ─── Concrete smart single-label JSON classifiers ─────────────────────────────


class SmartSVMJsonClassifier(SmartSklearnJsonClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "C": [0.1, 1, 10],
        "kernel": ["linear", "rbf"],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.svm import SVC

        super().__init__(SVC(probability=True, class_weight="balanced"), self._GRID, feature_extractor)


class SmartLogisticRegressionJsonClassifier(SmartSklearnJsonClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {"C": [0.1, 1, 10]}

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.linear_model import LogisticRegression

        super().__init__(LogisticRegression(max_iter=1000, class_weight="balanced"), self._GRID, feature_extractor)


class SmartRandomForestJsonClassifier(SmartSklearnJsonClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "n_estimators": [50, 100],
        "max_depth": [None, 10],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.ensemble import RandomForestClassifier

        super().__init__(RandomForestClassifier(class_weight="balanced"), self._GRID, feature_extractor)


class SmartMLPJsonClassifier(SmartSklearnJsonClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "hidden_layer_sizes": [(64,), (128,)],
        "alpha": [0.0001, 0.001],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.neural_network import MLPClassifier

        super().__init__(MLPClassifier(max_iter=500), self._GRID, feature_extractor)


# ─── Concrete multi-label JSON classifiers ────────────────────────────────────


class SVMMultiLabelJsonClassifier(SklearnJsonMultiLabelClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.svm import SVC

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(SVC(probability=True, **kwargs), feature_extractor)


class LogisticRegressionMultiLabelJsonClassifier(SklearnJsonMultiLabelClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.linear_model import LogisticRegression

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(LogisticRegression(**kwargs), feature_extractor)


class MLPMultiLabelJsonClassifier(SklearnJsonMultiLabelClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.neural_network import MLPClassifier

        super().__init__(MLPClassifier(**kwargs), feature_extractor)


class RandomForestMultiLabelJsonClassifier(SklearnJsonMultiLabelClassifier):
    def __init__(self, feature_extractor: Any | None = None, **kwargs: Any):
        from sklearn.ensemble import RandomForestClassifier

        kwargs.setdefault("class_weight", "balanced")
        super().__init__(RandomForestClassifier(**kwargs), feature_extractor)


# ─── Concrete smart multi-label JSON classifiers ──────────────────────────────


class SmartSVMMultiLabelJsonClassifier(SmartSklearnJsonMultiLabelClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "C": [0.1, 1, 10],
        "kernel": ["linear", "rbf"],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.svm import SVC

        super().__init__(SVC(probability=True, class_weight="balanced"), self._GRID, feature_extractor)


class SmartLogisticRegressionMultiLabelJsonClassifier(SmartSklearnJsonMultiLabelClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {"C": [0.1, 1, 10]}

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.linear_model import LogisticRegression

        super().__init__(LogisticRegression(max_iter=1000, class_weight="balanced"), self._GRID, feature_extractor)


class SmartRandomForestMultiLabelJsonClassifier(SmartSklearnJsonMultiLabelClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {"n_estimators": [50, 100]}

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.ensemble import RandomForestClassifier

        super().__init__(RandomForestClassifier(class_weight="balanced"), self._GRID, feature_extractor)


class SmartMLPMultiLabelJsonClassifier(SmartSklearnJsonMultiLabelClassifier):
    _GRID: ClassVar[dict[str, list[Any]]] = {
        "hidden_layer_sizes": [(64,), (128,)],
    }

    def __init__(self, feature_extractor: Any | None = None) -> None:
        from sklearn.neural_network import MLPClassifier

        super().__init__(MLPClassifier(max_iter=500), self._GRID, feature_extractor)
