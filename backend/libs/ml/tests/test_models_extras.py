"""Tests for uncovered paths in libs/ml/models.py."""

from __future__ import annotations

import pytest

from libs.ml.models import (
    ClassificationPrediction,
    FeatureVectorInput,
    JsonInput,
    Label,
    TextInput,
)


# ─── JsonInput.serialize ──────────────────────────────────────────────────────

def test_json_input_serialize_passthrough() -> None:
    payload = {"a": 1, "b": "hello", "c": [1, 2]}
    assert JsonInput.serialize(payload) == payload


def test_json_input_serialize_ignores_unserializable() -> None:
    payload = {"ok": 42, "bad": object()}
    result = JsonInput.serialize(payload, ignore_unserializable=True)
    assert result["ok"] == 42
    assert result["bad"] is None


def test_json_input_serialize_raises_by_default() -> None:
    with pytest.raises((TypeError, ValueError)):
        JsonInput.serialize({"bad": object()})


# ─── Input validation ─────────────────────────────────────────────────────────

def test_text_input_requires_text_value() -> None:
    t = TextInput(text_value="hello")
    assert t.text_value == "hello"


def test_feature_vector_input_stores_values() -> None:
    fv = FeatureVectorInput(vector_value=[1.0, 2.0, 3.0])
    assert fv.vector_value == [1.0, 2.0, 3.0]


def test_json_input_accepts_dict() -> None:
    import json
    ji = JsonInput(json_value=json.dumps({"x": 1}))
    assert ji.json_value == {"x": 1}


# ─── ClassificationPrediction ─────────────────────────────────────────────────

def test_classification_prediction_optional_score() -> None:
    p = ClassificationPrediction(label_id="A")
    assert p.score is None


def test_classification_prediction_with_score() -> None:
    p = ClassificationPrediction(label_id="A", score=0.95)
    assert p.score == pytest.approx(0.95)


def test_classification_prediction_with_metadata() -> None:
    p = ClassificationPrediction(label_id="A", metadata={"reasoning": "good"})
    assert p.metadata["reasoning"] == "good"


# ─── Label ────────────────────────────────────────────────────────────────────

def test_label_fields() -> None:
    lbl = Label(id="cat", name="Cat", description="A feline")
    assert lbl.id == "cat"
    assert lbl.name == "Cat"
    assert lbl.description == "A feline"


def test_label_optional_description() -> None:
    lbl = Label(id="x", name="X")
    assert lbl.description is None
