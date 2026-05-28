"""Structured target types for supervised ML tasks.

Each target type maps to a task formalism:
  ClassificationTarget           → single_label_classification
  MultiLabelClassificationTarget → multi_label_classification
  RegressionTarget               → scalar_regression

Future target types (not yet implemented) may include:
  TextGenerationTarget, RankingTarget, SegmentationTarget, EmbeddingTarget, etc.
"""

from typing import Any

from libs.utils.types import BaseModelWithConfig


class ClassificationTarget(BaseModelWithConfig):
    """Target for single-label classification: one label per sample."""

    label_id: str
    metadata: dict[str, Any] | None = None


class MultiLabelClassificationTarget(BaseModelWithConfig):
    """Target for multi-label classification: zero or more labels per sample."""

    label_ids: list[str]
    metadata: dict[str, Any] | None = None


class RegressionTarget(BaseModelWithConfig):
    """Target for scalar regression: one numeric value per sample."""

    value: float
    metadata: dict[str, Any] | None = None
