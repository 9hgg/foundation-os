"""Evidence storage and creation helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from libs.ralph.state.artifacts import Artifact, read_nested_property
from libs.ralph.tools.list_ops import apply_filter_conditions
from libs.ralph.tools.models import FilterCondition

from .models import Evidence


@dataclass
class EvidenceStore:
    """In-memory store of evidences, keyed by evidence name."""

    _items: dict[str, Evidence] = field(default_factory=dict)

    def put(self, evidence: Evidence) -> Evidence:
        self._items[evidence.key] = evidence
        return evidence

    def get(self, key: str) -> Evidence:
        return self._items[key]

    def delete(self, key: str) -> None:
        self._items.pop(key, None)

    def all(self) -> list[Evidence]:
        return list(self._items.values())

    def describe_for_prompt(self) -> list[dict[str, object]]:
        return [evidence.describe_for_prompt() for evidence in self.all()]

    def keys_for_step(self, step_id: str) -> list[str]:
        return [evidence.key for evidence in self.all() if evidence.source_step_id == step_id]

    def create(
        self,
        *,
        key: str,
        artifact: Artifact,
        kind: Literal["property", "filter"],
        name: str | None = None,
        description: str | None = None,
        path: str | None = None,
        conditions: list[FilterCondition] | None = None,
        logic: Literal["and", "or"] = "and",
        source_step_id: str | None = None,
    ) -> Evidence:
        """Create and store one evidence from an artifact."""

        artifact_key = artifact.key
        artifact_value = artifact.load()

        if kind == "property":
            expression = f"Evidence({_format_artifact_ref(artifact_key, path)})"
            value = artifact_value if not path else read_nested_property(artifact_value, path)
        else:
            list_value = artifact_value if not path else read_nested_property(artifact_value, path)
            if not isinstance(list_value, list):
                raise ValueError("Filter evidence requires the selected artifact content to be a list.")
            expression = (
                f"Evidence(filter {_format_artifact_ref(artifact_key, path)} "
                f"where {conditions!r} logic={logic})"
            )
            value = apply_filter_conditions(list_value, conditions or [], logic=logic)

        evidence = Evidence(
            key=key,
            artifact_key=artifact_key,
            kind=kind,
            expression=expression,
            value=value,
            name=name,
            description=description,
            source_step_id=source_step_id,
        )
        self._items[key] = evidence
        return evidence

    def create_comparison(
        self,
        *,
        key: str,
        left_artifact: Artifact,
        op: Literal["eq", "ne", "lt", "lte", "gt", "gte", "contains", "in", "not_in"],
        right_artifact: Artifact,
        left_path: str | None = None,
        right_path: str | None = None,
        name: str | None = None,
        description: str | None = None,
        source_step_id: str | None = None,
    ) -> Evidence:
        """Create and store evidence comparing values from two artifacts."""

        left_value = _read_artifact_value(left_artifact, left_path)
        right_value = _read_artifact_value(right_artifact, right_path)
        result = _compare_values(left_value, op, right_value)
        left_ref = _format_artifact_ref(left_artifact.key, left_path)
        right_ref = _format_artifact_ref(right_artifact.key, right_path)
        expression = f"Evidence({left_ref} {op} {right_ref})"
        value = {
            "left": {
                "artifact_key": left_artifact.key,
                "path": left_path,
                "value": left_value,
            },
            "op": op,
            "right": {
                "artifact_key": right_artifact.key,
                "path": right_path,
                "value": right_value,
            },
            "result": result,
        }
        evidence = Evidence(
            key=key,
            artifact_key=left_artifact.key,
            kind="comparison",
            expression=expression,
            value=value,
            name=name,
            description=description,
            source_step_id=source_step_id,
            metadata={"right_artifact_key": right_artifact.key},
        )
        self._items[key] = evidence
        return evidence


def _read_artifact_value(artifact: Artifact, path: str | None) -> Any:
    artifact_value = artifact.load()
    return artifact_value if not path else read_nested_property(artifact_value, path)


def _format_artifact_ref(artifact_key: str, path: str | None) -> str:
    """Return a readable full artifact path for evidence expressions."""

    if not path:
        return artifact_key
    separator = "" if path.startswith("[") else "."
    return f"{artifact_key}{separator}{path}"


def _compare_values(
    left_value: Any,
    op: Literal["eq", "ne", "lt", "lte", "gt", "gte", "contains", "in", "not_in"],
    right_value: Any,
) -> bool:
    if op == "eq":
        return left_value == right_value
    if op == "ne":
        return left_value != right_value
    if op == "lt":
        return left_value < right_value
    if op == "lte":
        return left_value <= right_value
    if op == "gt":
        return left_value > right_value
    if op == "gte":
        return left_value >= right_value
    if op == "contains":
        return right_value in left_value
    if op == "in":
        return left_value in right_value
    if op == "not_in":
        return left_value not in right_value
    raise ValueError(f"Unsupported comparison op: {op}")
