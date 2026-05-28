from importlib import import_module
from typing import Any

from ...models import FeatureVectorInput, RegressionPrediction, TrainableRegressor


class OpenTurnsRegressorNotFittedError(RuntimeError):
    """Raised when inference is attempted before calling fit."""

    def __init__(self) -> None:
        super().__init__("OpenTurnsRegressor must be fitted before calling regress")


class OpenTurnsRegressor(TrainableRegressor[FeatureVectorInput]):
    """Trainable regressor backed by OpenTURNS linear model with optional feature extractor."""

    def __init__(self, feature_extractor: Any | None = None):
        self._ot = import_module("openturns")
        self.feature_extractor = feature_extractor
        self._meta_model: Any | None = None

    def _transform(self, inputs: list[FeatureVectorInput], *, fit: bool = False) -> Any:
        values = [input_value.vector_value for input_value in inputs]
        if self.feature_extractor is None:
            return values
        if fit and hasattr(self.feature_extractor, "fit_transform"):
            return self.feature_extractor.fit_transform(values)
        if fit and hasattr(self.feature_extractor, "fit"):
            self.feature_extractor.fit(values)
        return self.feature_extractor.transform(values)

    def _to_sample(self, inputs: list[Any]) -> Any:
        rows: list[list[float]] = []
        for item in inputs:
            if isinstance(item, (int, float)):
                rows.append([float(item)])
            else:
                rows.append([float(value) for value in item])
        return self._ot.Sample(rows)

    def _to_target_sample(self, targets: list[float]) -> Any:
        return self._ot.Sample([[float(value)] for value in targets])

    def _fit(self, inputs: list[FeatureVectorInput], targets: list[float]) -> None:
        features = self._transform(inputs, fit=True)
        input_sample = self._to_sample(features)
        output_sample = self._to_target_sample(targets)

        basis = self._ot.ConstantBasisFactory(input_sample.getDimension()).build()
        algorithm = self._ot.LinearModelAlgorithm(input_sample, output_sample, basis)
        algorithm.run()

        self._meta_model = algorithm.getResult().getMetaModel()

    def _regress(self, inputs: list[FeatureVectorInput]) -> list[RegressionPrediction]:
        if self._meta_model is None:
            raise OpenTurnsRegressorNotFittedError()

        features = self._transform(inputs)
        input_sample = self._to_sample(features)
        values = self._meta_model(input_sample)

        return [RegressionPrediction(value=float(row[0])) for row in values]
