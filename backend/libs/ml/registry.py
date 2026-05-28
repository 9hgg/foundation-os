from collections.abc import Callable
from enum import StrEnum
from typing import Any, Literal

from pydantic import Field

from libs.utils.types import BaseModelWithConfig

_UNKNOWN_METHOD_ERROR = "No ML method registered under this key."

# ─── Task formalism: full input→output contract ───────────────────────────────


class InputKind(StrEnum):
    """Describes the type of input a method accepts."""

    TEXT = "text"  # TextInput
    FEATURE_VECTOR = "fv"  # FeatureVectorInput
    JSON = "json"  # JsonInput
    IMAGE = "image"  # ImageInput (future)


class OutputKind(StrEnum):
    """Describes the type of output a method produces."""

    LABEL = "label"  # ClassificationTarget (single)
    LABELS = "labels"  # MultiLabelClassificationTarget
    VALUE = "value"  # RegressionTarget (scalar)
    # Future: TEXT, RANKING, EMBEDDING, SEGMENTATION, SEQUENCE, …


class TaskFormalism(StrEnum):
    """Full input→output contract for a supervised ML task.

    A dataset exposes a TaskFormalism; a method declares which it supports.
    Only methods whose task formalism matches the dataset's can be benchmarked
    or automatically selected.

    Current supported combinations:
      TEXT_TO_LABEL    TextInput  → ClassificationTarget
      TEXT_TO_LABELS   TextInput  → MultiLabelClassificationTarget
      FV_TO_LABEL      FeatureVectorInput → ClassificationTarget
      FV_TO_FLOAT      FeatureVectorInput → RegressionTarget
      JSON_TO_LABEL    JsonInput  → ClassificationTarget
      JSON_TO_LABELS   JsonInput  → MultiLabelClassificationTarget
    """

    TEXT_TO_LABEL = "text->label"
    TEXT_TO_LABELS = "text->labels"
    FV_TO_LABEL = "fv->label"
    FV_TO_FLOAT = "fv->float"
    JSON_TO_LABEL = "json->label"
    JSON_TO_LABELS = "json->labels"
    IMAGE_TO_LABEL = "image->label"  # future

    @property
    def input_kind(self) -> InputKind:
        return _TASK_FORMALISM_INPUT[self]

    @property
    def output_kind(self) -> OutputKind:
        return _TASK_FORMALISM_OUTPUT[self]


_TASK_FORMALISM_INPUT: dict[TaskFormalism, InputKind] = {
    TaskFormalism.TEXT_TO_LABEL: InputKind.TEXT,
    TaskFormalism.TEXT_TO_LABELS: InputKind.TEXT,
    TaskFormalism.FV_TO_LABEL: InputKind.FEATURE_VECTOR,
    TaskFormalism.FV_TO_FLOAT: InputKind.FEATURE_VECTOR,
    TaskFormalism.JSON_TO_LABEL: InputKind.JSON,
    TaskFormalism.JSON_TO_LABELS: InputKind.JSON,
    TaskFormalism.IMAGE_TO_LABEL: InputKind.IMAGE,
}

_TASK_FORMALISM_OUTPUT: dict[TaskFormalism, OutputKind] = {
    TaskFormalism.TEXT_TO_LABEL: OutputKind.LABEL,
    TaskFormalism.TEXT_TO_LABELS: OutputKind.LABELS,
    TaskFormalism.FV_TO_LABEL: OutputKind.LABEL,
    TaskFormalism.FV_TO_FLOAT: OutputKind.VALUE,
    TaskFormalism.JSON_TO_LABEL: OutputKind.LABEL,
    TaskFormalism.JSON_TO_LABELS: OutputKind.LABELS,
    TaskFormalism.IMAGE_TO_LABEL: OutputKind.LABEL,
}


# ─── Parameter and method specs ───────────────────────────────────────────────


class ParameterSpec(BaseModelWithConfig):
    """Describes one user-configurable parameter for a registered ML method."""

    name: str
    label: str
    type: Literal["string", "number", "boolean", "text", "json"]
    description: str | None = None
    required: bool = False
    default: Any = None


class MethodSpec(BaseModelWithConfig):
    """Metadata describing a registered ML method exposed to the API and frontend."""

    key: str
    name: str
    formalisms: list[TaskFormalism] = Field(default_factory=list)
    trainable: bool
    zero_shot: bool
    rule_based: bool = False
    parameters: list[ParameterSpec] = Field(default_factory=list)
    description: str | None = None
    default_model_alias: str | None = None


# ─── Registry ─────────────────────────────────────────────────────────────────


class MLRegistry:
    """Holds ML methods available in an application.

    Each method is registered with a spec (metadata) and a factory function that
    instantiates the method from a config dict.
    """

    def __init__(self) -> None:
        self._entries: dict[str, tuple[MethodSpec, Callable[[dict[str, Any]], Any]]] = (
            {}
        )

    def register(
        self,
        spec: MethodSpec,
        *,
        factory: Callable[[dict[str, Any]], Any],
    ) -> "MLRegistry":
        """Register a method. Returns self for chaining."""
        self._entries[spec.key] = (spec, factory)
        return self

    def list(
        self,
        *,
        formalism: str | TaskFormalism | None = None,
    ) -> list[MethodSpec]:
        """Return all registered method specs, optionally filtered by task formalism.

        If formalism is given, only methods whose formalism matches exactly are
        returned. Methods with formalism=None are excluded when filtering.
        """
        all_methods = [method_spec for method_spec, _ in self._entries.values()]
        if formalism is None:
            return all_methods
        target = str(formalism)
        return [
            method_spec for method_spec in all_methods
            if target in [str(f) for f in method_spec.formalisms]
        ]

    def get_spec(self, key: str) -> MethodSpec | None:
        """Return the spec for a registered method, or None if not found."""
        entry = self._entries.get(key)
        return entry[0] if entry else None

    def build(self, key: str, config: dict[str, Any]) -> Any:
        """Instantiate a method from its key and a config dict."""
        entry = self._entries.get(key)
        if entry is None:
            raise KeyError(_UNKNOWN_METHOD_ERROR)
        _, factory = entry
        return factory(config)
