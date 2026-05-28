"""LLM-based zero-shot classifiers.

All classifiers accept an LLMClient and delegate to structured_completion.
No provider-specific code lives here — instantiate the right LLMClient
(OllamaLLMClient, OpenAILLMClient, EDFIAGLLMClient…) and pass it in.

Hierarchy:

  LLMZeroShotClassifier[T]          generic base; abstract _to_sample_dict
  ├── LLMZeroShotTextClassifier      TextInput  → {"text": sample.text_value}
  └── LLMZeroShotJsonClassifier      JsonInput  → sample.json_value
"""

import json
import logging
import time
from abc import abstractmethod
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Annotated, Any, Literal, TypeVar

from pydantic import BaseModel, BeforeValidator, Field
from pydantic import create_model as create_pydantic_model

from libs.ml.llm.client import LLMClient, LLMMessage
from libs.ml.llm.structured import StructuredCompletionError, structured_completion

from ..errors import (
    EmptyLabelsError,
    InvalidLabelSelectionError,
    InvalidStructuredOutputError,
)
from ..models import (
    AlgorithmInput,
    ClassificationPrediction,
    Classifier,
    JsonInput,
    Label,
    MultiLabelClassifier,
    TextInput,
)

T = TypeVar("T", bound=AlgorithmInput)

logger = logging.getLogger(__name__)


def _coerce_rank(value: Any) -> Any:
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return value


RankValue = Annotated[int, BeforeValidator(_coerce_rank)]


@dataclass(slots=True)
class _LabelOption:
    rank: int
    label_id: str
    name: str
    path: tuple[str, ...]
    description: str | None = None

    @property
    def path_text(self) -> str:
        return " > ".join(self.path)


# ─── Generic base ─────────────────────────────────────────────────────────────

class LLMZeroShotClassifier(Classifier[T]):
    """LLM-based zero-shot classifier driven by an LLMClient.

    Subclasses only need to implement _to_sample_dict().
    The provider is injected via the client constructor argument.
    """

    def __init__(
        self,
        *,
        client: LLMClient,
        labels: str | Mapping[str, Any] | Sequence[Any],
        prompt: str,
        multi_class: bool = False,
        allows_nested: bool = False,
        selection_mode: Literal["rank", "label_id"] = "rank",
        temperature: float = 0.0,
    ):
        if selection_mode == "label_id" and allows_nested:
            raise ValueError("selection_mode='label_id' does not support nested labels.")
        self.client = client
        self.prompt = prompt.strip()
        self.multi_class = multi_class
        self.allows_nested = allows_nested
        self.selection_mode = selection_mode
        self.temperature = temperature
        self.label_options = self._normalize_labels(labels)
        self._label_index = {opt.rank: opt for opt in self.label_options}
        self._label_id_index = {opt.label_id: opt for opt in self.label_options}
        self._rank_alias = {opt.rank: f"C{opt.rank}" for opt in self.label_options}
        self._max_invalid_selection_retries = 1

    @abstractmethod
    def _to_sample_dict(self, sample: T) -> dict:
        raise NotImplementedError  # subclasses implement this

    def _classify(self, inputs: list[T]) -> list[ClassificationPrediction]:
        response_model = self._build_response_model()
        model_name = getattr(self.client, "model", "llm")
        n = len(inputs)
        logger.info("[llm] starting classification — model=%r  samples=%d", model_name, n)
        results: list[ClassificationPrediction] = []
        for idx, sample in enumerate(inputs, start=1):
            logger.debug("[llm] sample %d/%d — sending to model", idx, n)
            t0 = time.monotonic()
            messages: list[LLMMessage] = [
                LLMMessage(role="system", content=self._build_system_prompt()),
                LLMMessage(role="user", content=self._build_prompt(sample)),
            ]
            invalid_selection_attempts = 0
            while True:
                try:
                    result = structured_completion(
                        self.client, messages, response_model, temperature=self.temperature
                    )
                except StructuredCompletionError as exc:
                    raise InvalidStructuredOutputError(model=model_name) from exc

                try:
                    prediction = self._parse_response(result)
                    break
                except InvalidLabelSelectionError as exc:
                    if invalid_selection_attempts >= self._max_invalid_selection_retries:
                        raise
                    invalid_selection_attempts += 1
                    logger.warning(
                        "[llm] sample %d/%d — invalid label selection, retrying (%d/%d)",
                        idx,
                        n,
                        invalid_selection_attempts,
                        self._max_invalid_selection_retries,
                    )
                    messages.append(
                        LLMMessage(
                            role="assistant",
                            content=json.dumps(result.model_dump(), ensure_ascii=True),
                        )
                    )
                    messages.append(
                        LLMMessage(
                            role="user",
                            content=self._build_invalid_selection_retry_prompt(),
                        )
                    )
            elapsed = time.monotonic() - t0
            logger.info("[llm] sample %d/%d → %r  (%.1fs)", idx, n, prediction.label_id, elapsed)
            results.append(prediction)
        logger.info("[llm] done — %d/%d samples classified", len(results), n)
        return results

    def _build_invalid_selection_retry_prompt(self) -> str:
        if self.selection_mode == "label_id":
            valid_values = ", ".join(opt.label_id for opt in self.label_options)
            field_name = "selected_label_ids" if self.multi_class else "selected_label_id"
            return (
                "Your previous response selected an unknown label id. "
                "Retry now and use ONLY these label ids: "
                f"{valid_values}. "
                f"Populate field '{field_name}' with valid ids only."
            )

        valid_values = ", ".join(str(opt.rank) for opt in self.label_options)
        field_name = "selected_ranks" if self.multi_class else "selected_rank"
        return (
            "Your previous response selected an unknown rank. "
            "Retry now and use ONLY these 1-based ranks: "
            f"{valid_values}. "
            "Do not use 0. "
            f"Populate field '{field_name}' with valid ranks only."
        )

    def _build_system_prompt(self) -> str:
        prompt_text = self._build_rendered_prompt_text()
        mode = "multi-label" if self.multi_class else "single-label"
        nesting = "hierarchical labels allowed" if self.allows_nested else "flat labels only"
        selection_unit = "label id" if self.selection_mode == "label_id" else "label rank"
        select = (
            f"return every selected {selection_unit}"
            if self.multi_class
            else f"return exactly one {selection_unit}"
        )
        nested = (
            "If you choose nested labels, return each selected path from parent to child using ranks in order."
            if self.allows_nested
            else "Never return nested paths."
        )
        value_format = (
            "Return label ids as JSON strings."
            if self.selection_mode == "label_id"
            else "Return rank values as JSON numbers, never as strings."
        )
        allowed_values = (
            "Use only the listed label ids and do not invent new labels."
            if self.selection_mode == "label_id"
            else "Use only the listed label ranks and do not invent new labels."
        )
        return "\n".join([
            "You are a strict zero-shot classification engine.",
            prompt_text,
            f"Classification mode: {mode}.",
            f"Hierarchy mode: {nesting}.",
            f"When you select labels, {select}.",
            nested,
            value_format,
            allowed_values,
            "Return structured data that matches the response schema exactly.",
        ])

    def _build_rendered_prompt_text(self) -> str:
        if self.selection_mode != "rank":
            return self.prompt

        rendered = self.prompt
        # Replace longer identifiers first to avoid partial collisions.
        replacements = sorted(
            ((opt.label_id, self._rank_alias[opt.rank]) for opt in self.label_options),
            key=lambda pair: len(pair[0]),
            reverse=True,
        )
        for label_id, alias in replacements:
            rendered = rendered.replace(label_id, alias)
        return rendered

    def _build_prompt(self, sample: T) -> str:
        if self.selection_mode == "label_id":
            label_lines = [
                f"- label_id {opt.label_id}: {opt.path_text}"
                + (f" — {opt.description}" if opt.description else "")
                for opt in self.label_options
            ]
        else:
            label_lines = [
                f"- rank {opt.rank}: alias {self._rank_alias[opt.rank]} -> {opt.path_text}"
                + (f" — {opt.description}" if opt.description else "")
                for opt in self.label_options
            ]
        instructions = [
            (
                "Select every relevant label id."
                if self.multi_class
                else "Select the single best matching label id."
            )
            if self.selection_mode == "label_id"
            else (
                "Select every relevant label rank." if self.multi_class
                else "Select the single best matching label rank."
            )
        ]
        if self.allows_nested:
            instructions.append("For nested choices, rank paths must be ordered from parent to child.")
        sample_json = json.dumps(
            self._serialize(self._to_sample_dict(sample)), indent=2, ensure_ascii=True, sort_keys=True
        )
        return "\n".join(["Available active labels:", *label_lines, "", *instructions, "", "Serialized sample:", sample_json])

    def _build_response_model(self) -> type[BaseModel]:
        if self.selection_mode == "label_id":
            label_id_type = Literal.__getitem__(tuple(self._label_id_index.keys()))
            if self.multi_class:
                return create_pydantic_model(
                    "MultiLabelIdSelection",
                    selected_label_ids=(list[label_id_type], Field(description="All selected label ids.")),
                    reasoning=(str | None, None),
                )
            return create_pydantic_model(
                "SingleLabelIdSelection",
                selected_label_id=(
                    label_id_type | None,
                    Field(description="The single best matching label id, or null if no label applies."),
                ),
                reasoning=(str | None, None),
            )
        if self.allows_nested and self.multi_class:
            return create_pydantic_model(
                "NestedMultiLabelSelection",
                selected_rank_paths=(list[list[RankValue]], Field(description="Selected label paths as ranks from parent to child.")),
                reasoning=(str | None, None),
            )
        if self.allows_nested:
            return create_pydantic_model(
                "NestedSingleLabelSelection",
                selected_rank_path=(list[RankValue], Field(description="A single selected label path from parent to child.")),
                reasoning=(str | None, None),
            )
        if self.multi_class:
            return create_pydantic_model(
                "MultiLabelSelection",
                selected_ranks=(list[RankValue], Field(description="All selected label ranks.")),
                reasoning=(str | None, None),
            )
        return create_pydantic_model(
            "SingleLabelSelection",
            selected_rank=(
                RankValue | None,
                Field(description="The single best matching label rank, or null if no label applies."),
            ),
            reasoning=(str | None, None),
        )

    def _parse_response(self, response: BaseModel) -> ClassificationPrediction:
        data = response.model_dump()
        paths = self._extract_paths(data)
        metadata: dict[str, Any] = {
            "selected_ranks": [[opt.rank for opt in path] for path in paths],
            "selected_label_ids": [path[-1].label_id for path in paths],
            "selected_labels": [path[-1].path_text for path in paths],
        }
        if data.get("reasoning"):
            metadata["reasoning"] = data["reasoning"]
        if not paths:
            return ClassificationPrediction(label_id=None, metadata=metadata)
        label_id = (
            paths[0][-1].label_id
            if self.selection_mode == "label_id"
            else paths[0][-1].path_text
        )
        return ClassificationPrediction(label_id=label_id, metadata=metadata)

    def _extract_paths(self, data: dict[str, Any]) -> list[list[_LabelOption]]:
        if self.selection_mode == "label_id":
            if data.get("selected_label_id") is None:
                return []
            if self.multi_class:
                return [[self._resolve_label_id(label_id)] for label_id in data["selected_label_ids"]]
            return [[self._resolve_label_id(data["selected_label_id"])]]
        if self.allows_nested and self.multi_class:
            return [self._resolve_path(path) for path in data["selected_rank_paths"]]
        if self.allows_nested:
            return [self._resolve_path(data["selected_rank_path"])]
        if self.multi_class:
            return [[self._resolve_rank(r)] for r in data["selected_ranks"]]
        if data.get("selected_rank") is None:
            return []
        return [[self._resolve_rank(data["selected_rank"])]]

    def _resolve_path(self, ranks: Sequence[int]) -> list[_LabelOption]:
        return [self._resolve_rank(r) for r in ranks]

    def _resolve_rank(self, rank: int) -> _LabelOption:
        try:
            return self._label_index[rank]
        except KeyError as exc:
            raise InvalidLabelSelectionError from exc

    def _resolve_label_id(self, label_id: str) -> _LabelOption:
        try:
            return self._label_id_index[label_id]
        except KeyError as exc:
            raise InvalidLabelSelectionError from exc

    def _serialize(self, value: Any) -> Any:
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        if isinstance(value, Mapping):
            return {k: self._serialize(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [self._serialize(i) for i in value]
        try:
            return str(value)
        except Exception:
            return None

    def _normalize_labels(self, labels: str | Mapping[str, Any] | Sequence[Any]) -> list[_LabelOption]:
        options: list[_LabelOption] = []
        self._visit(labels, options, path=())
        if not options:
            raise EmptyLabelsError
        return [
            _LabelOption(
                rank=i,
                label_id=opt.label_id,
                name=opt.name,
                path=opt.path,
                description=opt.description,
            )
            for i, opt in enumerate(options, start=1)
        ]

    def _visit(self, labels: Any, options: list[_LabelOption], path: tuple[str, ...]) -> None:
        if isinstance(labels, Label):
            name = labels.name
            options.append(_LabelOption(rank=0, label_id=labels.id, name=name, path=(*path, name), description=labels.description))
            return
        if isinstance(labels, str):
            options.append(_LabelOption(rank=0, label_id=labels, name=labels, path=(*path, labels)))
            return
        if isinstance(labels, Mapping):
            for name, children in labels.items():
                current = (*path, str(name))
                has_children = children not in (None, "", [], {})
                if self.allows_nested or not has_children:
                    options.append(_LabelOption(rank=0, label_id=str(name), name=str(name), path=current))
                if has_children:
                    self._visit(children, options, current)
            return
        for item in labels:
            self._visit(item, options, path)

    def _error_chain(self, exc: Exception) -> list[Exception]:
        errors: list[Exception] = []
        current: Exception | None = exc
        while current is not None:
            errors.append(current)
            current = current.__cause__ if isinstance(current.__cause__, Exception) else None
        return errors


# ─── Typed input variants ─────────────────────────────────────────────────────

class LLMZeroShotTextClassifier(LLMZeroShotClassifier[TextInput]):
    """LLM zero-shot classifier for plain-text inputs (TextInput)."""

    def _to_sample_dict(self, sample: TextInput) -> dict:
        return {"text": sample.text_value}


class LLMZeroShotJsonClassifier(LLMZeroShotClassifier[JsonInput]):
    """LLM zero-shot classifier for structured JSON inputs (JsonInput)."""

    def _to_sample_dict(self, sample: JsonInput) -> dict:
        return dict(sample.json_value)


class LLMZeroShotTextMultiLabelClassifier(MultiLabelClassifier[TextInput]):
    """LLM zero-shot multi-label classifier for text inputs."""

    def __init__(
        self,
        *,
        client: LLMClient,
        labels: str | Mapping[str, Any] | Sequence[Any],
        prompt: str,
        allows_nested: bool = False,
        temperature: float = 0.0,
    ):
        self._inner = LLMZeroShotTextClassifier(
            client=client,
            labels=labels,
            prompt=prompt,
            multi_class=True,
            allows_nested=allows_nested,
            temperature=temperature,
        )

    def _classify_multi_label(
        self, inputs: list[TextInput],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]:
        single_preds = self._inner.classify(inputs)
        results = []
        for pred in single_preds:
            selected = (pred.metadata or {}).get("selected_labels", [])
            if selected:
                results.append([ClassificationPrediction(label_id=str(lbl)) for lbl in selected])
            else:
                results.append([pred] if pred.label_id else [])
        return results


class LLMZeroShotJsonMultiLabelClassifier(MultiLabelClassifier[JsonInput]):
    """LLM zero-shot multi-label classifier for JSON inputs.

    Delegates to LLMZeroShotJsonClassifier with multi_class=True and unpacks
    selected_labels from metadata into per-sample prediction lists.
    """

    def __init__(
        self,
        *,
        client: LLMClient,
        labels: str | Mapping[str, Any] | Sequence[Any],
        prompt: str,
        allows_nested: bool = False,
        temperature: float = 0.0,
    ):
        self._inner = LLMZeroShotJsonClassifier(
            client=client,
            labels=labels,
            prompt=prompt,
            multi_class=True,
            allows_nested=allows_nested,
            selection_mode="rank",
            temperature=temperature,
        )

    def _classify_multi_label(
        self, inputs: list[JsonInput],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]:
        single_preds = self._inner.classify(inputs)
        results = []
        for pred in single_preds:
            selected = (pred.metadata or {}).get("selected_labels", [])
            if selected:
                results.append([ClassificationPrediction(label_id=str(lbl)) for lbl in selected])
            else:
                results.append([pred] if pred.label_id else [])
        return results
