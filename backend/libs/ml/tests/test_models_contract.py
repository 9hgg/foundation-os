import pytest
from pydantic import ValidationError

from libs.ml.models import (
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


class _EchoTrainableClassifier(TrainableClassifier[TextInput]):
    def _fit(self, inputs: list[TextInput], targets: list[Label]) -> None:
        return None

    def _classify(self, inputs: list[TextInput]) -> list[ClassificationPrediction]:
        return [ClassificationPrediction(label_id="positive", score=0.98) for _ in inputs]


class _EchoTrainableMultiLabelClassifier(TrainableMultiLabelClassifier[TextInput]):
    def _fit(self, inputs: list[TextInput], targets: list[list[Label]]) -> None:
        return None

    def _classify(self, inputs: list[TextInput]) -> list[ClassificationPrediction]:
        return [ClassificationPrediction(label_id="fallback") for _ in inputs]

    def _classify_multi_label(
        self,
        inputs: list[TextInput],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]:
        return [
            [ClassificationPrediction(label_id="a", score=0.7), ClassificationPrediction(label_id="b")]
            for _ in inputs
        ]


class _EchoTrainableRegressor(TrainableRegressor[FeatureVectorInput]):
    def _fit(self, inputs: list[FeatureVectorInput], targets: list[float]) -> None:
        return None

    def _regress(self, inputs: list[FeatureVectorInput]) -> list[RegressionPrediction]:
        return [RegressionPrediction(value=12.5) for _ in inputs]


def test_classifier_public_method_validates_predictions() -> None:
    classifier = _EchoTrainableClassifier()
    classifier.fit(
        inputs=[TextInput(text_value="a"), TextInput(text_value="b")],
        targets=[Label(id="positive", name="positive"), Label(id="negative", name="negative")],
    )

    predictions = classifier.classify([TextInput(text_value="c")])

    assert predictions == [ClassificationPrediction(label_id="positive", score=0.98)]


def test_multilabel_classifier_public_methods_validate_predictions() -> None:
    classifier = _EchoTrainableMultiLabelClassifier()
    classifier.fit(
        inputs=[TextInput(text_value="a")],
        targets=[[Label(id="a", name="a"), Label(id="b", name="b")]],
    )

    predictions = classifier.classify_multi_label([TextInput(text_value="x")])
    single_predictions = classifier.classify([TextInput(text_value="x")])

    assert predictions == [[ClassificationPrediction(label_id="a", score=0.7), ClassificationPrediction(label_id="b")]]
    assert single_predictions == [ClassificationPrediction(label_id="a", score=0.7)]


def test_regressor_public_method_validates_predictions() -> None:
    regressor = _EchoTrainableRegressor()
    regressor.fit(inputs=[FeatureVectorInput(vector_value=[1.0])], targets=[1.0])

    predictions = regressor.regress([FeatureVectorInput(vector_value=[2.0])])

    assert predictions == [RegressionPrediction(value=12.5)]


def test_public_methods_reject_non_algorithm_input_values() -> None:
    classifier = _EchoTrainableClassifier()

    with pytest.raises(ValidationError):
        classifier.classify(["not-structured"])  # type: ignore[list-item]


def test_json_input_serialize_can_ignore_unserializable_values() -> None:
    payload = {"ok": 1, "bad": object()}

    serialized = JsonInput.serialize(payload, ignore_unserializable=True)

    assert serialized == {"ok": 1, "bad": None}
