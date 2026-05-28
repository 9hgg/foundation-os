"""LLM-based few-shot classifiers.

These classifiers synthesize and iteratively refine a classification prompt
from labeled examples, then delegate inference to a zero-shot LLM classifier.

Hierarchy:

  _LLMFewShotBase                         shared init, meta-prompt builders, LLM helpers
  ├── LLMFewShotClassifier[T]             generic single-label base; abstract _sample_to_str, _make_zero_shot_classifier
  │   ├── LLMFewShotTextClassifier        TextInput  → text->label
  │   └── LLMFewShotJsonClassifier        JsonInput  → json->label
  └── LLMFewShotTextMultiLabelClassifier  TextInput  → text->labels
"""

import json
import logging
import random
from abc import abstractmethod
from collections import defaultdict
from collections.abc import Mapping, Sequence
from typing import Any, TypeVar

from pydantic import Field

from libs.ml.llm.client import LLMClient, LLMMessage
from libs.ml.llm.structured import StructuredCompletionError, structured_completion
from libs.ml.tracing import TRACE
from libs.utils.types import BaseModelWithConfig

from ..models import (
    AlgorithmInput,
    ClassificationPrediction,
    JsonInput,
    Label,
    TextInput,
    TrainableClassifier,
    TrainableMultiLabelClassifier,
)
from .llm import (
    LLMZeroShotClassifier,
    LLMZeroShotJsonClassifier,
    LLMZeroShotTextClassifier,
    LLMZeroShotTextMultiLabelClassifier,
)

T = TypeVar("T", bound=AlgorithmInput)

logger = logging.getLogger(__name__)


class FewShotClassProfile(BaseModelWithConfig):
    alias: str
    title: str | None = None
    description: str


class FewShotMetaPromptOutput(BaseModelWithConfig):
    prompt_text: str
    class_profiles: list[FewShotClassProfile] = Field(default_factory=list)

_FALLBACK_PROMPT = (
    "Classify the sample into the most appropriate category based on its content."
)


# ── Shared base ────────────────────────────────────────────────────────────────


class _LLMFewShotBase:
    """Shared initializer and utilities for LLM few-shot classifiers."""

    def __init__(
        self,
        *,
        client: LLMClient,
        labels: Sequence[Any],
        n_samples_per_class: int = 3,
        n_refinement_rounds: int = 2,
        n_held_out_per_class: int = 2,
        temperature: float = 0.2,
        initial_prompt: str = "",
    ) -> None:
        self.client = client
        self.labels = list(labels)
        self.n_samples_per_class = n_samples_per_class
        self.n_refinement_rounds = n_refinement_rounds
        self.n_held_out_per_class = n_held_out_per_class
        self.temperature = temperature
        self.initial_prompt = initial_prompt

        self.prompt_: str | None = None
        self.prompt_history_: list[str] = []
        self._classifier: Any | None = None
        self._internal_labels: list[Label] = []
        self._canonical_labels_by_internal_alias: dict[str, Label] = {}
        super().__init__()

    def _call_llm_for_meta_prompt(self, user_message: str) -> FewShotMetaPromptOutput | None:
        messages = [LLMMessage(role="user", content=user_message)]
        try:
            logger.debug("[few-shot] meta-prompt request (%d chars)", len(user_message))
            TRACE.text_block(
                "FEW-SHOT META REQUEST",
                user_message,
                style="blue",
            )
            response = structured_completion(
                self.client,
                messages,
                FewShotMetaPromptOutput,
                temperature=self.temperature,
            )
            response_payload = response.model_dump_json(indent=2, by_alias=True)
            logger.debug("[few-shot] meta-prompt response (%d chars)", len(response_payload))
            TRACE.text_block(
                "FEW-SHOT META RESPONSE",
                response_payload,
                style="blue",
            )
            return response
        except StructuredCompletionError:
            logger.warning("[few-shot] LLM call failed for meta-prompt", exc_info=True)
            return None

    def _clean_prompt(self, text: str) -> str:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            inner = []
            for line in lines[1:]:
                if line.strip() == "```":
                    break
                inner.append(line)
            cleaned = "\n".join(inner).strip()
        if not cleaned:
            fallback = self.initial_prompt or _FALLBACK_PROMPT
            logger.warning(
                "[few-shot] LLM returned empty prompt, falling back to: %r",
                fallback[:80],
            )
            return fallback
        return cleaned

    def _deduplicate_labels(self, targets: list[Label]) -> list[Label]:
        seen: set[str] = set()
        result: list[Label] = []
        for label in targets:
            if label.id not in seen:
                seen.add(label.id)
                result.append(label)
        return result

    def _build_label_aliases(self, label_objs: Sequence[Label]) -> dict[str, str]:
        return {label.id: f"C{index}" for index, label in enumerate(label_objs, start=1)}

    def _build_internal_labels(
        self,
        label_objs: Sequence[Label],
        *,
        label_aliases_by_id: Mapping[str, str],
    ) -> list[Label]:
        return [
            Label(
                id=label_aliases_by_id[label.id],
                name=label_aliases_by_id[label.id],
                description=label.description,
            )
            for label in label_objs
        ]

    def _build_canonical_labels_by_internal_alias(
        self,
        label_objs: Sequence[Label],
        *,
        label_aliases_by_id: Mapping[str, str],
    ) -> dict[str, Label]:
        return {
            label_aliases_by_id[label.id]: label
            for label in label_objs
        }

    def _resolve_canonical_label_id(self, token: str) -> str:
        canonical_label = self._canonical_labels_by_internal_alias.get(token)
        if canonical_label is None:
            return token
        return canonical_label.id

    def _canonicalize_prediction(
        self,
        prediction: ClassificationPrediction,
    ) -> ClassificationPrediction:
        canonical_label_id = (
            self._resolve_canonical_label_id(prediction.label_id)
            if prediction.label_id
            else prediction.label_id
        )

        metadata = prediction.metadata
        if metadata is None:
            return ClassificationPrediction(
                label_id=canonical_label_id,
                metadata=None,
            )

        canonical_metadata = dict(metadata)
        selected_label_ids = canonical_metadata.get("selected_label_ids")
        if isinstance(selected_label_ids, list):
            canonical_metadata["selected_label_ids"] = [
                self._resolve_canonical_label_id(str(token))
                for token in selected_label_ids
            ]

        selected_labels = canonical_metadata.get("selected_labels")
        if isinstance(selected_labels, list):
            canonical_metadata["selected_labels"] = [
                self._resolve_canonical_label_id(str(token))
                for token in selected_labels
            ]

        return ClassificationPrediction(
            label_id=canonical_label_id,
            metadata=canonical_metadata,
        )

    def _canonicalize_predictions(
        self,
        predictions: Sequence[ClassificationPrediction],
    ) -> list[ClassificationPrediction]:
        return [self._canonicalize_prediction(prediction) for prediction in predictions]

    def _canonicalize_multi_predictions(
        self,
        predictions: Sequence[Sequence[ClassificationPrediction]],
    ) -> list[list[ClassificationPrediction]]:
        return [self._canonicalize_predictions(group) for group in predictions]

    def _resolve_label_alias(
        self,
        token: str,
        *,
        label_aliases_by_id: Mapping[str, str],
        label_aliases_by_name: Mapping[str, str],
    ) -> str:
        return label_aliases_by_id.get(token) or label_aliases_by_name.get(token) or token

    def _update_internal_labels_from_profiles(self, class_profiles: Sequence[FewShotClassProfile]) -> None:
        if not self._internal_labels:
            return
        profile_map = {
            profile.alias: profile
            for profile in class_profiles
        }
        if not profile_map:
            return

        updated_labels: list[Label] = []
        for label in self._internal_labels:
            alias = label.id
            profile = profile_map.get(alias)
            updated_labels.append(
                Label(
                    id=label.id,
                    name=(profile.title if profile and profile.title else label.name),
                    description=(profile.description if profile and profile.description else label.description),
                )
            )
        self._internal_labels = updated_labels

    def _select_examples(
        self,
        by_label: dict[str, list[tuple[Any, Any]]],
        n: int,
        exclude: list[tuple[Any, Any]] | None = None,
    ) -> list[tuple[Any, Any]]:
        exclude_set: set[int] = {id(inp) for inp, _ in exclude} if exclude else set()
        result: list[tuple[Any, Any]] = []
        for pairs in by_label.values():
            candidates = [
                (inp, lbl) for inp, lbl in pairs if id(inp) not in exclude_set
            ]
            if not candidates:
                candidates = pairs
            chosen = (
                candidates[:n] if len(candidates) <= n else random.sample(candidates, n)
            )
            result.extend(chosen)
        return result

    def _build_refinement_meta_prompt(
        self,
        current_prompt: str,
        mistakes: list[dict[str, str]],
    ) -> str:
        lines: list[str] = [
            "You are improving a classification prompt. The current prompt:",
            "",
            "---",
            current_prompt,
            "---",
            "",
            "The classifier made the following mistakes on these samples:",
            "",
        ]
        for mistake in mistakes:
            lines.append(f"Sample: {mistake['sample']}")
            lines.append(f"Correct: {mistake['correct']}")
            lines.append(f"Predicted: {mistake['predicted']}")
            lines.append("")
        lines += [
            "Analyze why the prompt failed for these cases. Then write an improved version that:",
            "1. Fixes these specific failure cases",
            "2. Remains accurate on the examples it got right",
            "3. Is clearer about distinguishing characteristics",
            "",
            "Return structured data with prompt_text and class_profiles.",
        ]
        return "\n".join(lines)


# ── Single-label base ──────────────────────────────────────────────────────────


class LLMFewShotClassifier(_LLMFewShotBase, TrainableClassifier[T]):
    """LLM-based few-shot classifier that synthesizes its own classification prompt.

    On fit(), the classifier:
    1. Induces an initial prompt from labeled examples via a meta-LLM call.
    2. Iteratively refines the prompt by running the current classifier on held-out
       examples and feeding misclassifications back to the LLM.

    Concrete subclasses implement _sample_to_str and _make_zero_shot_classifier.
    """

    trainable = True

    # ── Abstract interface ────────────────────────────────────────────────────

    @abstractmethod
    def _sample_to_str(self, sample: T) -> str:
        raise NotImplementedError

    @abstractmethod
    def _make_zero_shot_classifier(self, prompt: str) -> LLMZeroShotClassifier:
        raise NotImplementedError

    # ── Training ──────────────────────────────────────────────────────────────

    def _fit(self, inputs: list[T], targets: list[Label]) -> None:
        label_objs = self._deduplicate_labels(targets)
        # Use labels present in the training split; configured labels without
        # examples are intentionally ignored for this training run.
        self.labels = label_objs
        label_aliases_by_id = self._build_label_aliases(label_objs)
        label_aliases_by_name = {
            label.name: label_aliases_by_id[label.id]
            for label in label_objs
        }
        self._internal_labels = self._build_internal_labels(
            label_objs,
            label_aliases_by_id=label_aliases_by_id,
        )
        self._canonical_labels_by_internal_alias = self._build_canonical_labels_by_internal_alias(
            label_objs,
            label_aliases_by_id=label_aliases_by_id,
        )

        by_label: dict[str, list[tuple[T, Label]]] = defaultdict(list)
        for inp, label in zip(inputs, targets):
            by_label[label.id].append((inp, label))

        # Phase 1: Induction
        logger.info(
            "[few-shot] phase 1 — induction (%d classes, %d samples per class)",
            len(label_objs),
            self.n_samples_per_class,
        )
        induction_examples = self._select_examples(by_label, self.n_samples_per_class)
        induction_prompt = self._build_induction_meta_prompt(
            label_objs,
            induction_examples,
            label_aliases_by_id=label_aliases_by_id,
        )
        induction_result = self._call_llm_for_meta_prompt(induction_prompt)
        current_prompt = self._clean_prompt(
            induction_result.prompt_text if induction_result else ""
        )
        if induction_result:
            self._update_internal_labels_from_profiles(induction_result.class_profiles)
        logger.info(
            "[few-shot] induction produced prompt (%d chars)", len(current_prompt)
        )
        self.prompt_history_.append(current_prompt)

        # Phase 2: Refinement
        for round_idx in range(1, self.n_refinement_rounds + 1):
            logger.info(
                "[few-shot] phase 2 — refinement round %d/%d",
                round_idx,
                self.n_refinement_rounds,
            )
            held_out = self._select_examples(
                by_label, self.n_held_out_per_class, exclude=induction_examples
            )
            if not held_out:
                logger.info(
                    "[few-shot] no held-out examples available, stopping refinement"
                )
                break

            held_out_inputs = [inp for inp, _ in held_out]
            held_out_labels = [label for _, label in held_out]

            classifier = self._make_zero_shot_classifier(current_prompt)
            try:
                predictions = self._canonicalize_predictions(
                    classifier._classify(held_out_inputs)
                )
            except Exception:
                logger.warning(
                    "[few-shot] classification failed during refinement round %d, skipping",
                    round_idx,
                    exc_info=True,
                )
                break

            mistakes = self._collect_mistakes(
                held_out_inputs,
                held_out_labels,
                predictions,
                label_aliases_by_id=label_aliases_by_id,
                label_aliases_by_name=label_aliases_by_name,
            )
            if not mistakes:
                logger.info(
                    "[few-shot] no mistakes in round %d — stopping early", round_idx
                )
                break

            logger.info(
                "[few-shot] round %d — %d mistake(s), refining prompt",
                round_idx,
                len(mistakes),
            )
            refinement_meta_prompt = self._build_refinement_meta_prompt(
                current_prompt, mistakes
            )
            refined_result = self._call_llm_for_meta_prompt(refinement_meta_prompt)
            refined = self._clean_prompt(
                refined_result.prompt_text if refined_result else ""
            )
            if refined:
                current_prompt = refined
                if refined_result:
                    self._update_internal_labels_from_profiles(refined_result.class_profiles)
            self.prompt_history_.append(current_prompt)

        # Phase 3: Store
        self.prompt_ = current_prompt
        self._classifier: LLMZeroShotClassifier = self._make_zero_shot_classifier(
            current_prompt
        )
        logger.info(
            "[few-shot] fit complete — final prompt (%d chars)", len(current_prompt)
        )

    def _classify(self, inputs: list[T]) -> list[ClassificationPrediction]:
        if self._classifier is None:
            raise RuntimeError("Call fit() before classify().")
        return self._canonicalize_predictions(self._classifier._classify(inputs))

    # ── Meta-prompt builders ──────────────────────────────────────────────────

    def _build_induction_meta_prompt(
        self,
        label_objs: list[Label],
        examples: list[tuple[T, Label]],
        *,
        label_aliases_by_id: Mapping[str, str],
    ) -> str:
        lines: list[str] = [
            "You are a prompt engineering expert. Your task: write a classification prompt "
            "that an AI classifier will use to assign new samples to the correct category.",
            "",
            "Classes:",
        ]
        for label in label_objs:
            alias = label_aliases_by_id[label.id]
            desc = f" — {label.description}" if label.description else ""
            lines.append(f"- {alias}{desc}")

        by_label: dict[str, list[tuple[T, Label]]] = defaultdict(list)
        for inp, label in examples:
            by_label[label.id].append((inp, label))

        lines.append("")
        lines.append("Labeled examples:")
        for label in label_objs:
            if label.id not in by_label:
                continue
            lines.append(f"=== {label_aliases_by_id[label.id]} ===")
            for inp, _ in by_label[label.id]:
                lines.append(self._sample_to_str(inp))
            lines.append("")

        lines += [
            "Instructions:",
            "- Write a concise system prompt for a zero-shot LLM classifier",
            "- It must clearly describe what distinguishes each class",
            "- It should handle edge cases visible in the examples",
            "- Write in the same language as the examples",
            "- Return structured data with prompt_text and class_profiles",
        ]
        if self.initial_prompt:
            lines.append(
                f"Start from this base prompt and improve it:\n{self.initial_prompt}"
            )
        return "\n".join(lines)

    def _collect_mistakes(
        self,
        inputs: list[T],
        targets: list[Label],
        predictions: list[ClassificationPrediction],
        *,
        label_aliases_by_id: Mapping[str, str],
        label_aliases_by_name: Mapping[str, str],
    ) -> list[dict[str, str]]:
        mistakes: list[dict[str, str]] = []
        for inp, target, pred in zip(inputs, targets, predictions):
            pred_id = pred.label_id or ""
            if pred_id != target.id and pred_id != target.name:
                predicted_label = self._resolve_label_alias(
                    pred_id,
                    label_aliases_by_id=label_aliases_by_id,
                    label_aliases_by_name=label_aliases_by_name,
                )
                mistakes.append(
                    {
                        "sample": self._sample_to_str(inp),
                        "correct": label_aliases_by_id.get(target.id, target.name),
                        "predicted": predicted_label,
                    }
                )
        return mistakes


# ── Single-label concrete classes ─────────────────────────────────────────────


class LLMFewShotTextClassifier(LLMFewShotClassifier[TextInput]):
    """LLM few-shot classifier for plain-text inputs (TextInput)."""

    def _sample_to_str(self, sample: TextInput) -> str:
        return sample.text_value

    def _make_zero_shot_classifier(self, prompt: str) -> LLMZeroShotTextClassifier:
        return LLMZeroShotTextClassifier(
            client=self.client,
            labels=self._internal_labels,
            prompt=prompt,
            temperature=self.temperature,
        )


class LLMFewShotJsonClassifier(LLMFewShotClassifier[JsonInput]):
    """LLM few-shot classifier for structured JSON inputs (JsonInput)."""

    def _sample_to_str(self, sample: JsonInput) -> str:
        return json.dumps(sample.json_value, ensure_ascii=False, indent=2)

    def _make_zero_shot_classifier(self, prompt: str) -> LLMZeroShotJsonClassifier:
        return LLMZeroShotJsonClassifier(
            client=self.client,
            labels=self._internal_labels,
            prompt=prompt,
            temperature=self.temperature,
        )


# ── Multi-label concrete class ─────────────────────────────────────────────────


class LLMFewShotTextMultiLabelClassifier(
    _LLMFewShotBase, TrainableMultiLabelClassifier[TextInput]
):
    """LLM few-shot multi-label classifier for plain-text inputs (TextInput → text->labels).

    Same 3-phase fit() as the single-label variant but targets are list[list[Label]].
    A sample may appear in multiple label groups and the induction prompt explicitly
    describes the multi-label nature of the task.
    """

    trainable = True

    # ── Training ──────────────────────────────────────────────────────────────

    def _fit(self, inputs: list[TextInput], targets: list[list[Label]]) -> None:
        all_labels = self._deduplicate_labels([lbl for lbls in targets for lbl in lbls])
        # Use labels present in the training split; configured labels without
        # examples are intentionally ignored for this training run.
        self.labels = all_labels
        label_aliases_by_id = self._build_label_aliases(all_labels)
        label_aliases_by_name = {
            label.name: label_aliases_by_id[label.id]
            for label in all_labels
        }
        self._internal_labels = self._build_internal_labels(
            all_labels,
            label_aliases_by_id=label_aliases_by_id,
        )
        self._canonical_labels_by_internal_alias = self._build_canonical_labels_by_internal_alias(
            all_labels,
            label_aliases_by_id=label_aliases_by_id,
        )

        # Each sample appears in every group corresponding to its labels
        by_label: dict[str, list[tuple[TextInput, list[Label]]]] = defaultdict(list)
        for inp, lbls in zip(inputs, targets):
            for label in lbls:
                by_label[label.id].append((inp, lbls))

        # Phase 1: Induction
        logger.info(
            "[few-shot/multi] phase 1 — induction (%d classes, %d samples per class)",
            len(all_labels),
            self.n_samples_per_class,
        )
        induction_examples = self._select_examples(by_label, self.n_samples_per_class)
        induction_prompt = self._build_induction_meta_prompt_multi(
            all_labels,
            induction_examples,
            label_aliases_by_id=label_aliases_by_id,
        )
        induction_result = self._call_llm_for_meta_prompt(induction_prompt)
        current_prompt = self._clean_prompt(
            induction_result.prompt_text if induction_result else ""
        )
        if induction_result:
            self._update_internal_labels_from_profiles(induction_result.class_profiles)
        logger.info(
            "[few-shot/multi] induction produced prompt (%d chars)", len(current_prompt)
        )
        self.prompt_history_.append(current_prompt)

        # Phase 2: Refinement
        for round_idx in range(1, self.n_refinement_rounds + 1):
            logger.info(
                "[few-shot/multi] phase 2 — refinement round %d/%d",
                round_idx,
                self.n_refinement_rounds,
            )
            held_out = self._select_examples(
                by_label, self.n_held_out_per_class, exclude=induction_examples
            )
            if not held_out:
                logger.info(
                    "[few-shot/multi] no held-out examples, stopping refinement"
                )
                break

            # Deduplicate: same sample may appear under multiple label groups
            seen_ids: set[int] = set()
            unique_held_out: list[tuple[TextInput, list[Label]]] = []
            for inp, lbls in held_out:
                if id(inp) not in seen_ids:
                    seen_ids.add(id(inp))
                    unique_held_out.append((inp, lbls))

            held_out_inputs = [inp for inp, _ in unique_held_out]
            held_out_labels = [lbls for _, lbls in unique_held_out]

            classifier = LLMZeroShotTextMultiLabelClassifier(
                client=self.client,
                labels=self._internal_labels,
                prompt=current_prompt,
                temperature=self.temperature,
            )
            try:
                predictions = self._canonicalize_multi_predictions(
                    classifier._classify_multi_label(held_out_inputs)
                )
            except Exception:
                logger.warning(
                    "[few-shot/multi] classification failed during refinement round %d, skipping",
                    round_idx,
                    exc_info=True,
                )
                break

            mistakes = self._collect_mistakes_multi(
                held_out_inputs,
                held_out_labels,
                predictions,
                label_aliases_by_id=label_aliases_by_id,
                label_aliases_by_name=label_aliases_by_name,
            )
            if not mistakes:
                logger.info(
                    "[few-shot/multi] no mistakes in round %d — stopping early",
                    round_idx,
                )
                break

            logger.info(
                "[few-shot/multi] round %d — %d mistake(s), refining prompt",
                round_idx,
                len(mistakes),
            )
            refinement_meta_prompt = self._build_refinement_meta_prompt(
                current_prompt, mistakes
            )
            refined_result = self._call_llm_for_meta_prompt(refinement_meta_prompt)
            refined = self._clean_prompt(
                refined_result.prompt_text if refined_result else ""
            )
            if refined:
                current_prompt = refined
                if refined_result:
                    self._update_internal_labels_from_profiles(refined_result.class_profiles)
            self.prompt_history_.append(current_prompt)

        # Phase 3: Store
        self.prompt_ = current_prompt
        self._classifier: LLMZeroShotTextMultiLabelClassifier = (
            LLMZeroShotTextMultiLabelClassifier(
                client=self.client,
                labels=self._internal_labels,
                prompt=current_prompt,
                temperature=self.temperature,
            )
        )
        logger.info(
            "[few-shot/multi] fit complete — final prompt (%d chars)",
            len(current_prompt),
        )

    def _classify_multi_label(
        self,
        inputs: list[TextInput],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]:
        if self._classifier is None:
            raise RuntimeError("Call fit() before classify().")
        return self._canonicalize_multi_predictions(
            self._classifier._classify_multi_label(inputs, threshold=threshold)
        )

    # ── Meta-prompt builders ──────────────────────────────────────────────────

    def _build_induction_meta_prompt_multi(
        self,
        label_objs: list[Label],
        examples: list[tuple[TextInput, list[Label]]],
        *,
        label_aliases_by_id: Mapping[str, str],
    ) -> str:
        lines: list[str] = [
            "You are a prompt engineering expert. Your task: write a classification prompt "
            "that an AI classifier will use to assign new samples to one or more categories (multi-label).",
            "",
            "Classes:",
        ]
        for label in label_objs:
            alias = label_aliases_by_id[label.id]
            desc = f" — {label.description}" if label.description else ""
            lines.append(f"- {alias}{desc}")

        # Deduplicate examples by sample identity
        seen_ids: set[int] = set()
        unique_examples: list[tuple[TextInput, list[Label]]] = []
        for inp, lbls in examples:
            if id(inp) not in seen_ids:
                seen_ids.add(id(inp))
                unique_examples.append((inp, lbls))

        lines.append("")
        lines.append("Labeled examples (a sample may belong to multiple classes):")
        for inp, lbls in unique_examples:
            label_names = ", ".join(label_aliases_by_id.get(lbl.id, lbl.id) for lbl in lbls)
            lines.append(f"[{label_names}] {inp.text_value}")

        lines += [
            "",
            "Instructions:",
            "- Write a concise system prompt for a zero-shot LLM multi-label classifier",
            "- A sample may belong to multiple classes simultaneously",
            "- The prompt must clearly describe what distinguishes each class",
            "- It should handle edge cases visible in the examples",
            "- Write in the same language as the examples",
            "- Return structured data with prompt_text and class_profiles",
        ]
        if self.initial_prompt:
            lines.append(
                f"Start from this base prompt and improve it:\n{self.initial_prompt}"
            )
        return "\n".join(lines)

    def _collect_mistakes_multi(
        self,
        inputs: list[TextInput],
        targets: list[list[Label]],
        predictions: list[list[ClassificationPrediction]],
        *,
        label_aliases_by_id: Mapping[str, str],
        label_aliases_by_name: Mapping[str, str],
    ) -> list[dict[str, str]]:
        mistakes: list[dict[str, str]] = []
        for inp, target_labels, pred_preds in zip(inputs, targets, predictions):
            correct_ids = {lbl.id for lbl in target_labels}
            predicted_ids = {pred.label_id for pred in pred_preds if pred.label_id}
            if correct_ids != predicted_ids:
                rendered_correct = [
                    label_aliases_by_id.get(label_id, label_id)
                    for label_id in sorted(correct_ids)
                ]
                rendered_predicted = [
                    self._resolve_label_alias(
                        label_id,
                        label_aliases_by_id=label_aliases_by_id,
                        label_aliases_by_name=label_aliases_by_name,
                    )
                    for label_id in sorted(predicted_ids)
                ]
                mistakes.append(
                    {
                        "sample": inp.text_value,
                        "correct": ", ".join(rendered_correct),
                        "predicted": (
                            ", ".join(rendered_predicted)
                            if rendered_predicted
                            else "(none)"
                        ),
                    }
                )
        return mistakes
