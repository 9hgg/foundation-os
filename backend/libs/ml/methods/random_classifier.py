import random

from ..errors import EmptyLabelsError
from ..models import AlgorithmInput, ClassificationPrediction, Classifier, TextInput


class TextRandomClassifier(Classifier[TextInput]):
    """Classifier that picks a label at random from a fixed set. For illustration purposes only."""

    def __init__(self, labels: list[str], *, seed: int | None = None):
        if not labels:
            raise EmptyLabelsError
        self.labels = labels
        self._rng = random.Random(seed)  # noqa: S311

    def _classify(self, inputs: list[AlgorithmInput]) -> list[ClassificationPrediction]:
        return [
            ClassificationPrediction(label_id=self._rng.choice(self.labels))
            for _ in inputs
        ]
