"""Tests for libs/ml/constants.py — registry creation and method registration."""

from __future__ import annotations

import pytest

from libs.ml.constants import create_default_ml_registry
from libs.ml.registry import TaskFormalism


@pytest.fixture(scope="module")
def registry():
    return create_default_ml_registry()


@pytest.fixture(scope="module")
def registry_with_llm():
    return create_default_ml_registry(include_llm=True)


# ─── Registry is populated ────────────────────────────────────────────────────

def test_registry_not_empty(registry) -> None:
    assert len(registry.list()) > 0


def test_registry_covers_all_formalisms(registry) -> None:
    registered = {f for spec in registry.list() for f in spec.formalisms}
    assert TaskFormalism.TEXT_TO_LABEL in registered
    assert TaskFormalism.TEXT_TO_LABELS in registered
    assert TaskFormalism.JSON_TO_LABEL in registered
    assert TaskFormalism.JSON_TO_LABELS in registered
    assert TaskFormalism.FV_TO_LABEL in registered
    assert TaskFormalism.FV_TO_FLOAT in registered


# ─── Per-formalism counts ─────────────────────────────────────────────────────

@pytest.mark.parametrize("formalism", [
    f for f in TaskFormalism if f != TaskFormalism.IMAGE_TO_LABEL
])
def test_formalism_has_at_least_one_method(registry, formalism) -> None:
    methods = registry.list(formalism=formalism)
    assert len(methods) >= 1, f"No methods registered for {formalism}"


# ─── Keys are unique ──────────────────────────────────────────────────────────

def test_all_keys_unique(registry) -> None:
    keys = [s.key for s in registry.list()]
    assert len(keys) == len(set(keys))


# ─── Trainable / zero-shot flags ─────────────────────────────────────────────

def test_trainable_methods_exist(registry) -> None:
    assert any(s.trainable for s in registry.list())


def test_rule_based_methods_exist(registry) -> None:
    assert any(s.rule_based for s in registry.list())


# ─── Factory builds without crash ────────────────────────────────────────────

def test_keyword_classifier_builds(registry) -> None:
    spec = next(s for s in registry.list() if s.rule_based and TaskFormalism.TEXT_TO_LABEL in s.formalisms)
    instance = registry.build(spec.key, config={"rules": {"A": ["good"], "B": ["bad"]}})
    assert instance is not None


def test_logistic_regression_json_builds(registry) -> None:
    instance = registry.build("logistic_regression_json_classifier", config={})
    assert instance is not None


def test_linear_regressor_builds(registry) -> None:
    instance = registry.build("linear_regressor", config={})
    assert instance is not None


# ─── LLM methods (include_llm=True) ──────────────────────────────────────────

def test_llm_methods_absent_by_default(registry) -> None:
    assert not any("llm" in s.key for s in registry.list())


def test_llm_methods_present_when_included(registry_with_llm) -> None:
    assert any("llm" in s.key for s in registry_with_llm.list())


def test_semantic_centroid_method_present_when_llm_included(registry_with_llm) -> None:
    assert any(s.key == "semantic_centroid_json_classifier" for s in registry_with_llm.list())


def test_llm_zero_shot_text_builds(registry_with_llm) -> None:
    instance = registry_with_llm.build(
        "llm_text_classifier",
        config={
            "provider": "openai",
            "model": "gpt-5.4-nano",
            "api_key": "test-key",
            "labels": ["A", "B"],
            "prompt": "Classify.",
        },
    )
    assert instance is not None


def test_semantic_centroid_builds(registry_with_llm) -> None:
    instance = registry_with_llm.build(
        "semantic_centroid_json_classifier",
        config={
            "provider": "openai",
            "api_key": "test-key",
            "embedding_model": "nomic-embed-text",
            "labels": [],
        },
    )
    assert instance is not None


# ─── Sentence transformer variant ────────────────────────────────────────────

def test_sentence_transformer_registry_has_more_methods(registry) -> None:
    r = create_default_ml_registry(include_sentence_transformers=True)
    assert len(r.list()) > len(registry.list())
