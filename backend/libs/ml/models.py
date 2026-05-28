import contextlib
import inspect
from abc import ABC, abstractmethod
from typing import Any, ClassVar, Generic, TypeVar, get_args, get_origin

from PIL.Image import Image as PillowImage
from pydantic import (
    Field,
    Json,
    TypeAdapter,
)
from pydantic import (
    ValidationError as PydanticValidationError,
)

from libs.ml.registry import TaskFormalism
from libs.utils.types import BaseModelWithConfig

_JSON_SERIALIZE_ERROR = "Unable to serialize object."


class AlgorithmInputError(TypeError):
    def __init__(self, expected: type, got: type) -> None:
        super().__init__(f"Expected {expected.__name__}, got {got.__name__}.")


class AlgorithmOutputError(TypeError):
    def __init__(self, expected: type, got: type) -> None:
        super().__init__(f"Expected {expected.__name__}, got {got.__name__}.")


class UnresolvedAlgorithmTypeError(TypeError):
    def __init__(self, cls: type, kind: str) -> None:
        super().__init__(
            f"Could not resolve {kind} type for {cls.__name__}. "
            f"Parameterise the generic Algorithm with a concrete Algorithm{kind.capitalize()} subclass."
        )


class AlgorithmInput(BaseModelWithConfig):
    """Base structured input shared by all algorithm input types."""

    metadata: dict[str, Any] | None = None
    _input_type_as_str: str


class TextInput(AlgorithmInput):
    """Structured text input."""

    text_value: str
    _input_type_as_str: str = "text"


class FeatureVectorInput(AlgorithmInput):
    """Structured numeric feature-vector input."""

    vector_value: list[float]
    _input_type_as_str: str = "fv"


class JsonInput(AlgorithmInput):
    """Structured JSON-like input."""

    json_value: Json[dict[str, Any]]
    _input_type_as_str: str = "json"

    @classmethod
    def serialize(cls, payload: dict[str, Any], *, ignore_unserializable: bool = False) -> dict[str, Any]:
        """Return a JSON-safe copy of payload.

        When ignore_unserializable=True, values that cannot be serialised to
        JSON are replaced with None instead of raising.
        """
        import json as _json

        result: dict[str, Any] = {}
        for k, v in payload.items():
            try:
                _json.dumps(v)
                result[k] = v
            except (TypeError, ValueError):
                if ignore_unserializable:
                    result[k] = None
                else:
                    raise
        return result


class ImageInput(AlgorithmInput):
    """Structured image input (typically a Pillow image object)."""

    image_value: PillowImage
    _input_type_as_str: str = "image"


class NoInput(AlgorithmInput):
    """Placeholder input type for algorithms that don't require any input."""

    _input_type_as_str: str = "none"


class AlgorithmOutput(BaseModelWithConfig):
    """Base structured output shared by all algorithm output types."""

    metadata: dict[str, Any] | None = None
    _output_type_as_str: str


class Prediction(AlgorithmOutput):
    """Base structured output shared by all algorithm prediction types."""


class Label(BaseModelWithConfig):
    """A structured label used in classification tasks."""

    id: str
    name: str
    description: str | None = None


class ClassificationPrediction(Prediction):
    """Prediction describing a chosen label and optional confidence score."""

    label_id: str | None = Field(
        default=None,
        description="The ID of the predicted label. None if no label could be predicted.",
    )
    score: float | None = None
    _output_type_as_str: str = "label"


class RegressionPrediction(Prediction):
    """Prediction describing a numeric regression output and optional quality score."""

    value: float
    score: float | None = None
    _output_type_as_str: str = "float"


class MultiLabelClassificationPrediction(AlgorithmOutput):
    """Output type for multi-label classifiers — one list of predictions per sample."""

    _output_type_as_str: str = "labels"


class NoOutput(AlgorithmOutput):
    """Placeholder output type for algorithms that don't produce any output."""

    _output_type_as_str: str = "none"


TAlgorithmInput = TypeVar("TAlgorithmInput", bound=AlgorithmInput)
TAlgorithmOutput = TypeVar("TAlgorithmOutput", bound=AlgorithmOutput)


class Algorithm(ABC, Generic[TAlgorithmInput, TAlgorithmOutput]):
    """Base class for all ML algorithms. Subclass to implement a specific task family."""

    trainable: bool = False

    # Concrete input/output types — auto-resolved by __init_subclass__ when a class
    # parameterises the generic. Subclasses that don't explicitly parameterise inherit
    # from their parent (e.g. SVMClassifier inherits ClassificationPrediction from Classifier).
    _input_type: ClassVar[type[AlgorithmInput]]
    _output_type: ClassVar[type[AlgorithmOutput]]
    _input_type_as_str: ClassVar[str]
    _output_type_as_str: ClassVar[str]

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        _define_input_type(cls)
        _define_output_type(cls)

    def _validate_inputs(self, inputs: list[TAlgorithmInput]) -> None:
        if not self._input_type or not self._input_type_as_str:
            raise TypeError(
                f"{self.__class__.__name__} is missing _input_type or _input_type_as_str class variables."
            )
        adapter = TypeAdapter(self._input_type)
        for v in inputs:
            adapter.validate_python(v, strict=True)

    def _validate_outputs(self, outputs: list[TAlgorithmOutput]) -> None:
        if not self._output_type or not self._output_type_as_str:
            raise TypeError(
                f"{self.__class__.__name__} is missing _output_type or _output_type_as_str class variables."
            )
        adapter = TypeAdapter(self._output_type)
        for v in outputs:
            try:
                adapter.validate_python(v, strict=True)
            except PydanticValidationError as e:
                raise TypeError(
                    f"Invalid output for {self.__class__.__name__}: {e}"
                ) from e

    def get_input_type(self) -> type[AlgorithmInput]:
        """Get the expected input type for this algorithm."""
        return self._input_type

    def get_output_type(self) -> type[AlgorithmOutput]:
        """Get the expected output type for this algorithm."""
        return self._output_type

    @classmethod
    def get_formalism(cls) -> TaskFormalism:
        """Derive the task formalism from the resolved input/output type ClassVars."""
        formalism_str = f"{cls._input_type_as_str}->{cls._output_type_as_str}"
        try:
            return TaskFormalism(formalism_str)
        except ValueError:
            raise ValueError(  # noqa: TRY003
                f"Unsupported formalism: {formalism_str}"
            ) from None


def _read_type_str(model_cls: type, attr: str) -> str:
    """Read a string private attribute from a Pydantic model class.

    ``_name: str = "value"`` in a Pydantic model becomes a ModelPrivateAttr.
    The actual default is stored in ``__private_attributes__[name].default``.
    Raises AttributeError if the attribute has no concrete default (abstract).
    """
    from pydantic_core import PydanticUndefinedType

    private = getattr(model_cls, "__private_attributes__", {})
    if attr in private:
        value = private[attr].default
        if isinstance(value, PydanticUndefinedType):
            raise AttributeError(
                f"{model_cls.__name__}.{attr} is abstract (no default)."
            )
        return value
    raw = getattr(model_cls, attr)
    return raw if isinstance(raw, str) else str(raw)


def _find_type_in_generic_args(
    cls: type, arg_index: int, bound: type, type_str_attr: str
) -> tuple[type, str | None] | None:
    """Scan __orig_bases__ for a concrete type at `arg_index` that is a subclass of `bound`.

    Returns ``(resolved_type, type_as_str)`` where:
    - ``resolved_type`` is the type to assign (``list[inner]`` if the arg was ``list[inner]``).
    - ``type_as_str`` is the string identifier (e.g. ``"text"``, ``"label"``), or ``None`` if abstract.
    Returns ``None`` if nothing is found in the direct generic args of this class.
    """
    for base in getattr(cls, "__orig_bases__", []):
        args = get_args(base)
        if arg_index >= len(args):
            continue
        arg = args[arg_index]
        if isinstance(arg, type) and issubclass(arg, bound):
            type_as_str = None
            with contextlib.suppress(AttributeError):
                type_as_str = _read_type_str(arg, type_str_attr)
            return arg, type_as_str
        if get_origin(arg) is list:
            inner = get_args(arg)
            if inner and isinstance(inner[0], type) and issubclass(inner[0], bound):
                type_as_str = None
                with contextlib.suppress(AttributeError):
                    type_as_str = _read_type_str(inner[0], type_str_attr) + "s"
                return list[inner[0]], type_as_str
    return None


def _define_input_type(cls: type[Algorithm]) -> None:
    # Always resolve — parallel to _define_output_type so concrete subclasses
    # can inherit an input type set on an abstract parent.
    found = _find_type_in_generic_args(cls, 0, AlgorithmInput, "_input_type_as_str")
    if found:
        typ, type_as_str = found
        cls._input_type = typ
        if type_as_str is not None:
            cls._input_type_as_str = type_as_str

    # Print and validate only for concrete classes.
    if inspect.isabstract(cls):
        return

    input_type = cls._input_type
    if input_type is None:
        raise UnresolvedAlgorithmTypeError(cls, "input")
    input_type_as_str = cls._input_type_as_str
    if not input_type_as_str:
        raise UnresolvedAlgorithmTypeError(cls, "input (missing type string)")
    # name = input_type.__name__ if isinstance(input_type, type) else repr(input_type)
    # print(
    #     f"Defined input type for {cls.__name__}: {name} ({getattr(cls, '_input_type_as_str', '?')!r})"
    # )


def _define_output_type(cls: type[Algorithm]) -> None:
    # Always resolve — abstract classes like Classifier must set _output_type
    # so their concrete subclasses can inherit it.
    found = _find_type_in_generic_args(cls, 1, AlgorithmOutput, "_output_type_as_str")
    if found:
        typ, type_as_str = found
        cls._output_type = typ
        if type_as_str is not None:
            cls._output_type_as_str = type_as_str

    # Print and validate only for concrete classes.
    if inspect.isabstract(cls):
        return

    output_type = cls._output_type
    if output_type is None:
        raise UnresolvedAlgorithmTypeError(cls, "output")
    output_type_as_str = cls._output_type_as_str
    if not output_type_as_str:
        raise UnresolvedAlgorithmTypeError(cls, "output (missing type string)")
    # name = output_type.__name__ if isinstance(output_type, type) else repr(output_type)
    # print(
    #     f"Defined output type for {cls.__name__}: {name} ({getattr(cls, '_output_type_as_str', '?')!r})\n"
    # )


class Classifier(Algorithm[TAlgorithmInput, ClassificationPrediction]):
    """Base class for algorithms that predict a label from an input."""

    def classify(self, inputs: list[TAlgorithmInput]) -> list[ClassificationPrediction]:
        self._validate_inputs(inputs)
        outputs = self._classify(inputs)
        self._validate_outputs(outputs)
        return outputs

    @abstractmethod
    def _classify(
        self, inputs: list[TAlgorithmInput]
    ) -> list[ClassificationPrediction]: ...

    def classify_multi_label(
        self, inputs: list[TAlgorithmInput]
    ) -> list[list[ClassificationPrediction]]:
        """Default: wraps each single prediction in a list for multi-label dispatch."""
        return [[p] for p in self.classify(inputs)]


class Regressor(Algorithm[TAlgorithmInput, RegressionPrediction]):
    """Base class for algorithms that predict a numeric value from an input."""

    def regress(self, inputs: list[TAlgorithmInput]) -> list[RegressionPrediction]:
        self._validate_inputs(inputs)
        outputs = self._regress(inputs)
        self._validate_outputs(outputs)
        return outputs

    @abstractmethod
    def _regress(self, inputs: list[TAlgorithmInput]) -> list[RegressionPrediction]: ...


class MultiLabelClassifier(
    Algorithm[TAlgorithmInput, MultiLabelClassificationPrediction]
):
    """Base class for algorithms that predict multiple labels from an input."""

    def _validate_outputs(self, outputs: list[list[ClassificationPrediction]]) -> None:  # type: ignore[override]
        adapter = TypeAdapter(ClassificationPrediction)
        for per_sample in outputs:
            for pred in per_sample:
                adapter.validate_python(pred, strict=True)

    def classify_multi_label(
        self,
        inputs: list[TAlgorithmInput],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]:
        self._validate_inputs(inputs)
        outputs = self._classify_multi_label(inputs, threshold=threshold)
        self._validate_outputs(outputs)
        return outputs

    @abstractmethod
    def _classify_multi_label(
        self,
        inputs: list[TAlgorithmInput],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]: ...

    def classify(self, inputs: list[TAlgorithmInput]) -> list[ClassificationPrediction]:
        """Default single-label classification: picks the top label from multi-label output."""
        multi_preds = self.classify_multi_label(inputs)
        return [
            preds[0] if preds else ClassificationPrediction(label_id=None)
            for preds in multi_preds
        ]


class TrainableClassifier(Classifier[TAlgorithmInput]):
    """Classifier that can be fitted on labeled examples before running inference."""

    trainable = True

    def fit(self, inputs: list[TAlgorithmInput], targets: list[Label]) -> None:
        self._validate_inputs(inputs)
        self._fit(inputs, targets)

    @abstractmethod
    def _fit(self, inputs: list[TAlgorithmInput], targets: list[Label]) -> None: ...


class TrainableMultiLabelClassifier(
    Algorithm[TAlgorithmInput, MultiLabelClassificationPrediction]
):
    """Classifier that can be fitted on multi-label examples (each sample may have several labels)."""

    trainable = True

    def _validate_outputs(self, outputs: list[list[ClassificationPrediction]]) -> None:  # type: ignore[override]
        adapter = TypeAdapter(ClassificationPrediction)
        for per_sample in outputs:
            for pred in per_sample:
                adapter.validate_python(pred, strict=True)

    def fit(self, inputs: list[TAlgorithmInput], targets: list[list[Label]]) -> None:
        self._validate_inputs(inputs)
        self._fit(inputs, targets)

    @abstractmethod
    def _fit(
        self, inputs: list[TAlgorithmInput], targets: list[list[Label]]
    ) -> None: ...

    def classify_multi_label(
        self,
        inputs: list[TAlgorithmInput],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]:
        self._validate_inputs(inputs)
        outputs = self._classify_multi_label(inputs, threshold=threshold)
        self._validate_outputs(outputs)
        return outputs

    @abstractmethod
    def _classify_multi_label(
        self,
        inputs: list[TAlgorithmInput],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]: ...

    def _classify(
        self, inputs: list[TAlgorithmInput]
    ) -> list[ClassificationPrediction]:
        """Default single-label classification: picks the top label from multi-label output."""
        multi_preds = self.classify_multi_label(inputs)
        return [
            preds[0] if preds else ClassificationPrediction(label_id=None)
            for preds in multi_preds
        ]

    def classify(self, inputs: list[TAlgorithmInput]) -> list[ClassificationPrediction]:
        return [
            preds[0] if preds else ClassificationPrediction(label_id=None)
            for preds in self.classify_multi_label(inputs)
        ]


class TrainableRegressor(Regressor[TAlgorithmInput]):
    """Regressor that can be fitted on numeric examples before running inference."""

    trainable = True

    def fit(self, inputs: list[TAlgorithmInput], targets: list[float]) -> None:
        self._validate_inputs(inputs)
        self._fit(inputs, targets)

    @abstractmethod
    def _fit(self, inputs: list[TAlgorithmInput], targets: list[float]) -> None: ...
