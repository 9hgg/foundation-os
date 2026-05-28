"""Tests for LLM-based classifiers — zero-shot and few-shot, using mocks."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from libs.ml.llm.client import LLMMessage, LLMResponse, LLMTokenUsage
from libs.ml.methods.llm import (
    LLMZeroShotJsonClassifier,
    LLMZeroShotJsonMultiLabelClassifier,
    LLMZeroShotTextClassifier,
    LLMZeroShotTextMultiLabelClassifier,
)
from libs.ml.methods.llm_few_shot import (
    LLMFewShotJsonClassifier,
    LLMFewShotTextClassifier,
    LLMFewShotTextMultiLabelClassifier,
)
from libs.ml.models import JsonInput, Label, TextInput

import json

# ─── Fake LLM client ─────────────────────────────────────────────────────────

class _FakeLLMClient:
    """Returns a fixed text for every complete() call."""

    model = "fake"

    def __init__(self, text: str = "some prompt text") -> None:
        self.text = text

    def complete(self, messages, *, model=None, temperature=0.0) -> LLMResponse:
        payload_text = self.text
        if not payload_text.strip().startswith("{"):
            payload_text = json.dumps({"promptText": payload_text, "classProfiles": []})
        return LLMResponse(text=payload_text, model=self.model,
                           usage=LLMTokenUsage(prompt_tokens=1, completion_tokens=1, total_tokens=2))


# ─── Shared test data ─────────────────────────────────────────────────────────

_LABELS_STR = ["cat", "dog"]
_LABELS_OBJ = [Label(id="cat", name="cat"), Label(id="dog", name="dog")]

_TEXT_INPUTS = [TextInput(text_value="meow"), TextInput(text_value="woof")]
_JSON_INPUTS = [
    JsonInput(json_value=json.dumps({"sound": "meow"})),
    JsonInput(json_value=json.dumps({"sound": "woof"})),
]


def _mock_rank(rank: int):
    """Return a structured_completion mock that selects the given rank."""
    m = MagicMock()
    m.model_dump.return_value = {"selected_rank": rank, "reasoning": None}
    return m


def _mock_null_rank():
    m = MagicMock()
    m.model_dump.return_value = {"selected_rank": None, "reasoning": None}
    return m


def _mock_ranks(ranks: list[int]):
    m = MagicMock()
    m.model_dump.return_value = {"selected_ranks": ranks, "reasoning": None}
    return m


# ─── LLMZeroShotTextClassifier ────────────────────────────────────────────────

def test_zero_shot_text_single_label() -> None:
    clf = LLMZeroShotTextClassifier(
        client=_FakeLLMClient(), labels=_LABELS_STR, prompt="Classify."
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_rank(1)):
        preds = clf.classify(_TEXT_INPUTS)
    assert len(preds) == 2
    for p in preds:
        assert p.label_id is not None


def test_zero_shot_text_single_label_retries_after_invalid_rank() -> None:
    clf = LLMZeroShotTextClassifier(
        client=_FakeLLMClient(), labels=_LABELS_STR, prompt="Classify."
    )
    with patch(
        "libs.ml.methods.llm.structured_completion",
        side_effect=[_mock_rank(0), _mock_rank(1)],
    ):
        preds = clf.classify(_TEXT_INPUTS[:1])
    assert len(preds) == 1
    assert preds[0].label_id is not None


def test_zero_shot_text_uses_label_id_mode() -> None:
    clf = LLMZeroShotTextClassifier(
        client=_FakeLLMClient(),
        labels=_LABELS_STR,
        prompt="Classify.",
        selection_mode="label_id",
    )
    mock_resp = MagicMock()
    mock_resp.model_dump.return_value = {"selected_label_id": "cat", "reasoning": None}
    with patch("libs.ml.methods.llm.structured_completion", return_value=mock_resp):
        preds = clf.classify(_TEXT_INPUTS[:1])
    assert preds[0].label_id == "cat"


def test_zero_shot_text_multi_class() -> None:
    clf = LLMZeroShotTextClassifier(
        client=_FakeLLMClient(), labels=_LABELS_STR, prompt="Classify.", multi_class=True
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_ranks([1, 2])):
        preds = clf.classify(_TEXT_INPUTS[:1])
    assert len(preds) == 1


def test_zero_shot_text_invalid_rank_raises() -> None:
    clf = LLMZeroShotTextClassifier(
        client=_FakeLLMClient(), labels=_LABELS_STR, prompt="Classify."
    )
    bad_mock = MagicMock()
    bad_mock.model_dump.return_value = {"selected_rank": 99, "reasoning": None}
    with patch("libs.ml.methods.llm.structured_completion", return_value=bad_mock):
        from libs.ml.errors import InvalidLabelSelectionError
        with pytest.raises(InvalidLabelSelectionError):
            clf.classify(_TEXT_INPUTS[:1])


def test_zero_shot_text_null_rank_is_ignored() -> None:
    clf = LLMZeroShotTextClassifier(
        client=_FakeLLMClient(), labels=_LABELS_STR, prompt="Classify."
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_null_rank()):
        preds = clf.classify(_TEXT_INPUTS[:1])
    assert preds[0].label_id is None


# ─── LLMZeroShotJsonClassifier ────────────────────────────────────────────────

def test_zero_shot_json_single_label() -> None:
    clf = LLMZeroShotJsonClassifier(
        client=_FakeLLMClient(), labels=_LABELS_STR, prompt="Classify JSON."
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_rank(1)):
        preds = clf.classify(_JSON_INPUTS)
    assert len(preds) == 2
    for p in preds:
        assert p.label_id is not None


# ─── LLMZeroShotTextMultiLabelClassifier ─────────────────────────────────────

def test_zero_shot_text_multilabel() -> None:
    clf = LLMZeroShotTextMultiLabelClassifier(
        client=_FakeLLMClient(), labels=_LABELS_STR, prompt="Multi-classify."
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_ranks([1])):
        preds = clf.classify_multi_label(_TEXT_INPUTS)
    assert len(preds) == 2
    for sample_preds in preds:
        assert isinstance(sample_preds, list)


def test_zero_shot_text_multilabel_retries_after_invalid_ranks() -> None:
    clf = LLMZeroShotTextMultiLabelClassifier(
        client=_FakeLLMClient(), labels=_LABELS_STR, prompt="Multi-classify."
    )
    with patch(
        "libs.ml.methods.llm.structured_completion",
        side_effect=[_mock_ranks([0, 1]), _mock_ranks([1, 2])],
    ):
        preds = clf.classify_multi_label(_TEXT_INPUTS[:1])
    assert len(preds) == 1
    assert isinstance(preds[0], list)


def test_zero_shot_text_multilabel_threshold_zero() -> None:
    clf = LLMZeroShotTextMultiLabelClassifier(
        client=_FakeLLMClient(), labels=_LABELS_STR, prompt="Multi-classify."
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_ranks([1, 2])):
        preds = clf.classify_multi_label(_TEXT_INPUTS[:1])
    assert len(preds) == 1


# ─── LLMZeroShotJsonMultiLabelClassifier ─────────────────────────────────────

def test_zero_shot_json_multilabel() -> None:
    clf = LLMZeroShotJsonMultiLabelClassifier(
        client=_FakeLLMClient(), labels=_LABELS_STR, prompt="Multi-classify JSON."
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_ranks([1])):
        preds = clf.classify_multi_label(_JSON_INPUTS)
    assert len(preds) == 2


# ─── LLMFewShotTextClassifier ────────────────────────────────────────────────

_TRAIN_TEXT = [TextInput(text_value=f"meow {i}") for i in range(5)] + \
              [TextInput(text_value=f"woof {i}") for i in range(5)]
_TRAIN_LABELS = [Label(id="cat", name="cat")] * 5 + [Label(id="dog", name="dog")] * 5


def test_few_shot_text_fit_classify() -> None:
    clf = LLMFewShotTextClassifier(
        client=_FakeLLMClient("Classify cats vs dogs."),
        labels=_LABELS_OBJ,
        n_refinement_rounds=0,
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_rank(1)):
        clf.fit(_TRAIN_TEXT, _TRAIN_LABELS)
        preds = clf.classify(_TEXT_INPUTS)
    assert len(preds) == 2
    assert all(pred.label_id == "cat" for pred in preds)
    assert clf.prompt_ is not None
    assert len(clf.prompt_history_) >= 1


def test_few_shot_text_prompt_is_stored() -> None:
    clf = LLMFewShotTextClassifier(
        client=_FakeLLMClient("My classification prompt"),
        labels=_LABELS_OBJ,
        n_refinement_rounds=0,
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_rank(1)):
        clf.fit(_TRAIN_TEXT, _TRAIN_LABELS)
    assert clf.prompt_ == "My classification prompt"


def test_few_shot_text_classify_before_fit_raises() -> None:
    clf = LLMFewShotTextClassifier(
        client=_FakeLLMClient(), labels=_LABELS_OBJ, n_refinement_rounds=0
    )
    with pytest.raises(RuntimeError):
        clf.classify(_TEXT_INPUTS)


def test_few_shot_text_with_refinement() -> None:
    clf = LLMFewShotTextClassifier(
        client=_FakeLLMClient("Refined prompt"),
        labels=_LABELS_OBJ,
        n_refinement_rounds=1,
        n_held_out_per_class=1,
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_rank(1)):
        clf.fit(_TRAIN_TEXT, _TRAIN_LABELS)
        preds = clf.classify(_TEXT_INPUTS)
    assert len(preds) == 2


# ─── LLMFewShotJsonClassifier ────────────────────────────────────────────────

_TRAIN_JSON = [JsonInput(json_value=json.dumps({"sound": f"meow {i}"})) for i in range(5)] + \
              [JsonInput(json_value=json.dumps({"sound": f"woof {i}"})) for i in range(5)]


def test_few_shot_json_fit_classify() -> None:
    clf = LLMFewShotJsonClassifier(
        client=_FakeLLMClient("Classify JSON sounds."),
        labels=_LABELS_OBJ,
        n_refinement_rounds=0,
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_rank(1)):
        clf.fit(_TRAIN_JSON, _TRAIN_LABELS)
        preds = clf.classify(_JSON_INPUTS)
    assert len(preds) == 2


def test_few_shot_json_fit_infers_labels_from_training_data() -> None:
    clf = LLMFewShotJsonClassifier(
        client=_FakeLLMClient("Classify JSON sounds."),
        labels=[],
        n_refinement_rounds=1,
        n_held_out_per_class=1,
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_rank(1)):
        clf.fit(_TRAIN_JSON, _TRAIN_LABELS)
        preds = clf.classify(_JSON_INPUTS)
    assert len(preds) == 2


# ─── LLMFewShotTextMultiLabelClassifier ──────────────────────────────────────

_TRAIN_ML_LABELS = [[Label(id="cat", name="cat")]] * 5 + [[Label(id="dog", name="dog")]] * 5


def test_few_shot_text_multilabel_fit_classify() -> None:
    clf = LLMFewShotTextMultiLabelClassifier(
        client=_FakeLLMClient("Multi-label prompt"),
        labels=_LABELS_OBJ,
        n_refinement_rounds=0,
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_ranks([1])):
        clf.fit(_TRAIN_TEXT, _TRAIN_ML_LABELS)
        preds = clf.classify_multi_label(_TEXT_INPUTS)
    assert len(preds) == 2
    assert all(sample_preds and sample_preds[0].label_id == "cat" for sample_preds in preds)
    assert clf.prompt_ == "Multi-label prompt"


def test_few_shot_text_multilabel_classify_before_fit_raises() -> None:
    clf = LLMFewShotTextMultiLabelClassifier(
        client=_FakeLLMClient(), labels=_LABELS_OBJ, n_refinement_rounds=0
    )
    with pytest.raises(RuntimeError):
        clf.classify_multi_label(_TEXT_INPUTS)


def test_few_shot_text_multilabel_fit_infers_labels_from_training_data() -> None:
    clf = LLMFewShotTextMultiLabelClassifier(
        client=_FakeLLMClient("Multi-label prompt"),
        labels=[],
        n_refinement_rounds=1,
        n_held_out_per_class=1,
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_ranks([1])):
        clf.fit(_TRAIN_TEXT, _TRAIN_ML_LABELS)
        preds = clf.classify_multi_label(_TEXT_INPUTS)
    assert len(preds) == 2


def test_few_shot_text_induction_prompt_uses_aliases_for_uuid_labels() -> None:
    uuid_label_1 = "9634d992-807e-465e-8cef-d2a538f08671"
    uuid_label_2 = "061c3b85-6f22-4294-b181-797fa068ae6d"
    train_inputs = [
        TextInput(text_value="example about class one"),
        TextInput(text_value="example about class two"),
    ]
    train_targets = [
        Label(id=uuid_label_1, name=uuid_label_1),
        Label(id=uuid_label_2, name=uuid_label_2),
    ]
    client = _FakeLLMClient("Prompt")
    clf = LLMFewShotTextClassifier(client=client, labels=[], n_refinement_rounds=0)

    with (
        patch.object(client, "complete", wraps=client.complete) as complete_spy,
        patch("libs.ml.methods.llm.structured_completion", return_value=_mock_rank(1)),
    ):
        clf.fit(train_inputs, train_targets)

    induction_prompt = complete_spy.call_args_list[0].args[0][0].content
    assert "- C1" in induction_prompt
    assert "- C2" in induction_prompt
    assert uuid_label_1 not in induction_prompt
    assert uuid_label_2 not in induction_prompt


def test_few_shot_text_multilabel_induction_prompt_uses_aliases_for_uuid_labels() -> None:
    uuid_label_1 = "9634d992-807e-465e-8cef-d2a538f08671"
    uuid_label_2 = "061c3b85-6f22-4294-b181-797fa068ae6d"
    train_inputs = [
        TextInput(text_value="example about class one"),
        TextInput(text_value="example about class two"),
    ]
    train_targets = [
        [Label(id=uuid_label_1, name=uuid_label_1)],
        [Label(id=uuid_label_2, name=uuid_label_2)],
    ]
    client = _FakeLLMClient("Prompt")
    clf = LLMFewShotTextMultiLabelClassifier(
        client=client,
        labels=[],
        n_refinement_rounds=0,
    )

    with (
        patch.object(client, "complete", wraps=client.complete) as complete_spy,
        patch("libs.ml.methods.llm.structured_completion", return_value=_mock_ranks([1])),
    ):
        clf.fit(train_inputs, train_targets)

    induction_prompt = complete_spy.call_args_list[0].args[0][0].content
    assert "- C1" in induction_prompt
    assert "- C2" in induction_prompt
    assert uuid_label_1 not in induction_prompt
    assert uuid_label_2 not in induction_prompt


def test_few_shot_internal_labels_hydrate_description_from_generated_prompt() -> None:
    generated_prompt = json.dumps(
        {
            "promptText": "Prompt with class profiles",
            "classProfiles": [
                {
                    "alias": "C1",
                    "description": "incidents focused on leaks and no-flow failures",
                },
                {
                    "alias": "C2",
                    "description": "incidents focused on electrical and control issues",
                },
            ],
        }
    )
    clf = LLMFewShotTextClassifier(
        client=_FakeLLMClient(generated_prompt),
        labels=_LABELS_OBJ,
        n_refinement_rounds=0,
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_rank(1)):
        clf.fit(_TRAIN_TEXT, _TRAIN_LABELS)

    internal_by_id = {label.id: label for label in clf._internal_labels}
    assert internal_by_id["C1"].description == "incidents focused on leaks and no-flow failures"
    assert internal_by_id["C2"].description == "incidents focused on electrical and control issues"


def test_few_shot_internal_labels_hydrate_title_when_explicit() -> None:
    generated_prompt = json.dumps(
        {
            "promptText": "Prompt with explicit titles",
            "classProfiles": [
                {
                    "alias": "C1",
                    "title": "Leak incidents",
                    "description": "focuses on leaks and no-flow failures",
                },
                {
                    "alias": "C2",
                    "title": "Electrical incidents",
                    "description": "focuses on control and wiring issues",
                },
            ],
        }
    )
    clf = LLMFewShotTextClassifier(
        client=_FakeLLMClient(generated_prompt),
        labels=_LABELS_OBJ,
        n_refinement_rounds=0,
    )
    with patch("libs.ml.methods.llm.structured_completion", return_value=_mock_rank(1)):
        clf.fit(_TRAIN_TEXT, _TRAIN_LABELS)

    internal_by_id = {label.id: label for label in clf._internal_labels}
    assert internal_by_id["C1"].name == "Leak incidents"
    assert internal_by_id["C1"].description == "focuses on leaks and no-flow failures"
    assert internal_by_id["C2"].name == "Electrical incidents"
    assert internal_by_id["C2"].description == "focuses on control and wiring issues"


# ─── Empty labels error ───────────────────────────────────────────────────────

def test_zero_shot_empty_labels_raises() -> None:
    from libs.ml.errors import EmptyLabelsError
    with pytest.raises(EmptyLabelsError):
        LLMZeroShotTextClassifier(client=_FakeLLMClient(), labels=[], prompt="test")


def test_zero_shot_rank_prompt_uses_aliases_with_semantic_labels() -> None:
    clf = LLMZeroShotTextClassifier(
        client=_FakeLLMClient(),
        labels=[
            Label(id="cat-id", name="cat", description="Feline content"),
            Label(id="dog-id", name="dog", description="Canine content"),
        ],
        prompt="Classify.",
        selection_mode="rank",
    )
    prompt = clf._build_prompt(TextInput(text_value="woof"))
    assert "alias C1" in prompt
    assert "alias C2" in prompt
    assert "cat" in prompt
    assert "dog" in prompt
    assert "Feline content" in prompt
    assert "Canine content" in prompt
    assert "cat-id" not in prompt
    assert "dog-id" not in prompt


def test_zero_shot_rank_system_prompt_rewrites_label_ids_to_aliases() -> None:
    label_id_1 = "550e8400-e29b-41d4-a716-446655440000"
    label_id_2 = "11111111-2222-3333-4444-555555555555"
    clf = LLMZeroShotTextClassifier(
        client=_FakeLLMClient(),
        labels=[
            Label(id=label_id_1, name=label_id_1),
            Label(id=label_id_2, name=label_id_2),
        ],
        prompt=f"Classes: {label_id_1}, {label_id_2}",
        selection_mode="rank",
    )

    system_prompt = clf._build_system_prompt()
    assert "C1" in system_prompt
    assert "C2" in system_prompt
    assert label_id_1 not in system_prompt
    assert label_id_2 not in system_prompt


def test_zero_shot_label_id_system_prompt_keeps_label_ids() -> None:
    label_id = "550e8400-e29b-41d4-a716-446655440000"
    clf = LLMZeroShotTextClassifier(
        client=_FakeLLMClient(),
        labels=[Label(id=label_id, name=label_id)],
        prompt=f"Class: {label_id}",
        selection_mode="label_id",
    )

    system_prompt = clf._build_system_prompt()
    assert label_id in system_prompt
