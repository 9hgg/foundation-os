"""Typed models for Ralph local tool inputs and outputs."""

from __future__ import annotations

from typing import Any, Literal

from libs.utils.types import BaseModelWithConfig


class FilterCondition(BaseModelWithConfig):
    """One declarative condition applied to an item in a list."""

    path: str
    op: Literal["eq", "ne", "lt", "lte", "gt", "gte", "contains", "in", "not_in", "exists"]
    value: Any | None = None


class ArtifactPropertyRead(BaseModelWithConfig):
    """Structured result for a surgical artifact-property read."""

    path: str
    value: Any
    preview: str
    truncated: bool


class ConstantValueReceipt(BaseModelWithConfig):
    """Structured result for a constant value saved as an artifact."""

    key: str
    value: Any
    preview: str
    description: str | None = None
