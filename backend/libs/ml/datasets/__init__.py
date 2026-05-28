"""Strongly typed dataset abstractions for supervised ML tasks.

Core types:
  DatasetSample[InputT, TargetT]  — one (input, target) pair
  Dataset[InputT, TargetT]        — collection of samples

Named aliases for common task families avoid repeating generic parameters
at call sites and make intent explicit.
"""

import random
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

from libs.ml.models import AlgorithmInput, FeatureVectorInput, JsonInput, TextInput
from libs.ml.registry import TaskFormalism
from libs.ml.targets import (
    ClassificationTarget,
    MultiLabelClassificationTarget,
    RegressionTarget,
)

InputT = TypeVar("InputT", bound=AlgorithmInput)
TargetT = TypeVar("TargetT")
_TEST_SIZE_ERROR = "test_size must be less than dataset size."


class DatasetSample(BaseModel, Generic[InputT, TargetT]):
    """One supervised sample: an input paired with an optional ground-truth target."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    input: InputT
    target: TargetT | None = None
    metadata: dict[str, Any] | None = None


class Dataset(BaseModel, Generic[InputT, TargetT]):
    """An ordered collection of DatasetSample objects."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    title: str | None = None
    samples: list[DatasetSample[InputT, TargetT]]
    formalism: TaskFormalism
    metadata: dict[str, Any] | None = None

    def __len__(self) -> int:
        return len(self.samples)

    def inputs(self) -> list[InputT]:
        return [s.input for s in self.samples]

    def targets(self) -> list[TargetT | None]:
        return [s.target for s in self.samples]

    def labeled_samples(self) -> list[DatasetSample[InputT, TargetT]]:
        """Return only samples that have a ground-truth target."""
        return [s for s in self.samples if s.target is not None]

    def split(
        self,
        test_size: int,
        *,
        random_state: int = 42,
        stratify: bool = True,
    ) -> "tuple[Dataset[InputT, TargetT], Dataset[InputT, TargetT]]":
        """Split into a deterministic shuffled train/test holdout.

        Single-label classification datasets are stratified when possible so
        class balance is preserved across the holdout. Other target shapes fall
        back to a reproducible random shuffle.
        """
        if test_size >= len(self.samples):
            raise ValueError(_TEST_SIZE_ERROR)

        sample_indices = list(range(len(self.samples)))
        train_indices: list[int]
        test_indices: list[int]

        labels = self._stratification_labels() if stratify else None
        if labels is not None:
            from sklearn.model_selection import train_test_split

            try:
                train_indices, test_indices = train_test_split(
                    sample_indices,
                    test_size=test_size,
                    random_state=random_state,
                    shuffle=True,
                    stratify=labels,
                )
            except ValueError:
                train_indices, test_indices = self._random_split_indices(
                    sample_indices,
                    test_size=test_size,
                    random_state=random_state,
                )
        else:
            train_indices, test_indices = self._random_split_indices(
                sample_indices,
                test_size=test_size,
                random_state=random_state,
            )

        train = Dataset(
            samples=[self.samples[index] for index in train_indices],
            formalism=self.formalism,
            metadata=self.metadata,
        )
        test = Dataset(
            samples=[self.samples[index] for index in test_indices],
            formalism=self.formalism,
            metadata=self.metadata,
        )
        return train, test

    def k_fold_splits(
        self,
        n_splits: int = 5,
        *,
        random_state: int = 42,
        stratify: bool = True,
    ) -> "list[tuple[Dataset[InputT, TargetT], Dataset[InputT, TargetT]]]":
        """Return deterministic shuffled k-fold train/test splits.

        Single-label classification datasets are stratified when possible.
        Datasets that cannot be stratified fall back to regular shuffled KFold.
        """
        if n_splits < 2:
            raise ValueError("n_splits must be at least 2.")
        if n_splits > len(self.samples):
            raise ValueError("n_splits must be less than or equal to dataset size.")

        sample_indices = list(range(len(self.samples)))
        labels = self._stratification_labels() if stratify else None
        split_indices: list[tuple[list[int], list[int]]] | None = None

        if labels is not None:
            from collections import Counter

            from sklearn.model_selection import StratifiedKFold

            min_class_count = min(Counter(labels).values(), default=0)
            effective_splits = min(n_splits, min_class_count)
            if effective_splits >= 2:
                splitter = StratifiedKFold(
                    n_splits=effective_splits,
                    shuffle=True,
                    random_state=random_state,
                )
                split_indices = [
                    (list(train_indices), list(test_indices))
                    for train_indices, test_indices in splitter.split(sample_indices, labels)
                ]

        if split_indices is None:
            from sklearn.model_selection import KFold

            splitter = KFold(n_splits=n_splits, shuffle=True, random_state=random_state)
            split_indices = [
                (list(train_indices), list(test_indices))
                for train_indices, test_indices in splitter.split(sample_indices)
            ]

        return [
            (
                Dataset(
                    samples=[self.samples[index] for index in train_indices],
                    formalism=self.formalism,
                    metadata=self.metadata,
                ),
                Dataset(
                    samples=[self.samples[index] for index in test_indices],
                    formalism=self.formalism,
                    metadata=self.metadata,
                ),
            )
            for train_indices, test_indices in split_indices
        ]

    def _stratification_labels(self) -> list[str] | None:
        if not self.samples:
            return None
        targets = [sample.target for sample in self.samples]
        if not all(isinstance(target, ClassificationTarget) for target in targets):
            return None
        return [target.label_id for target in targets if target is not None]

    def _random_split_indices(
        self,
        indices: list[int],
        *,
        test_size: int,
        random_state: int,
    ) -> tuple[list[int], list[int]]:
        shuffled = list(indices)
        random.Random(random_state).shuffle(shuffled)  # noqa: S311
        return shuffled[test_size:], shuffled[:test_size]


# ─── Named aliases for common task families ───────────────────────────────────

TextClassificationDataset = Dataset[TextInput, ClassificationTarget]
TextMultiLabelClassificationDataset = Dataset[TextInput, MultiLabelClassificationTarget]
JSONClassificationDataset = Dataset[JsonInput, ClassificationTarget]
JSONMultiLabelClassificationDataset = Dataset[JsonInput, MultiLabelClassificationTarget]
FeatureVectorClassificationDataset = Dataset[FeatureVectorInput, ClassificationTarget]
RegressionDataset = Dataset[FeatureVectorInput, RegressionTarget]


__all__ = [
    "Dataset",
    "DatasetSample",
    "FeatureVectorClassificationDataset",
    "JSONClassificationDataset",
    "JSONMultiLabelClassificationDataset",
    "RegressionDataset",
    "TextClassificationDataset",
    "TextMultiLabelClassificationDataset",
]
