"""Reusable declarative list operations for Ralph tools and evidences."""

from __future__ import annotations

from typing import Any, Literal

from libs.ralph.state.artifacts import read_nested_property

from .models import FilterCondition


def apply_filter_conditions(
    items: list[Any],
    conditions: list[FilterCondition],
    *,
    logic: Literal["and", "or"] = "and",
) -> list[Any]:
    """Filter list items using declarative conditions."""

    coerced_conditions = [
        FilterCondition.model_validate(c) if isinstance(c, dict) else c
        for c in conditions
    ]

    def matches_condition(item: Any, condition: FilterCondition) -> bool:
        try:
            actual = read_nested_property(item, condition.path)
            exists = True
        except Exception:
            actual = None
            exists = False

        if condition.op == "exists":
            expected = True if condition.value is None else bool(condition.value)
            return exists is expected
        if not exists:
            return False
        if condition.op == "eq":
            return actual == condition.value
        if condition.op == "ne":
            return actual != condition.value
        if condition.op == "lt":
            return actual < condition.value
        if condition.op == "lte":
            return actual <= condition.value
        if condition.op == "gt":
            return actual > condition.value
        if condition.op == "gte":
            return actual >= condition.value
        if condition.op == "contains":
            if isinstance(actual, str):
                return str(condition.value) in actual
            if isinstance(actual, (list, tuple, set)):
                return condition.value in actual
            if isinstance(actual, dict):
                return condition.value in actual.values() or condition.value in actual
            return False
        if condition.op == "in":
            if not isinstance(condition.value, (list, tuple, set)):
                return False
            return actual in condition.value
        if condition.op == "not_in":
            if not isinstance(condition.value, (list, tuple, set)):
                return False
            return actual not in condition.value
        return False

    filtered: list[Any] = []
    for item in items:
        results = [matches_condition(item, condition) for condition in coerced_conditions]
        if not results:
            filtered.append(item)
            continue
        if logic == "and" and all(results):
            filtered.append(item)
        if logic == "or" and any(results):
            filtered.append(item)
    return filtered
