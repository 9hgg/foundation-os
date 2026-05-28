"""Tests for libs/ml/registry.py."""

from __future__ import annotations

import pytest

from libs.ml.registry import MLRegistry, MethodSpec, ParameterSpec, TaskFormalism


def _make_spec(key: str, formalism: TaskFormalism, trainable: bool = False) -> MethodSpec:
    return MethodSpec(
        key=key,
        name=key,
        formalisms=[formalism],
        trainable=trainable,
        zero_shot=not trainable,
    )


def test_register_and_list() -> None:
    r = MLRegistry()
    spec = _make_spec("clf_a", TaskFormalism.TEXT_TO_LABEL)
    r.register(spec, factory=lambda c: None)

    results = r.list()
    assert len(results) == 1
    assert results[0].key == "clf_a"


def test_list_filters_by_formalism() -> None:
    r = MLRegistry()
    r.register(_make_spec("text_clf", TaskFormalism.TEXT_TO_LABEL), factory=lambda c: None)
    r.register(_make_spec("json_clf", TaskFormalism.JSON_TO_LABEL), factory=lambda c: None)

    text_results = r.list(formalism=TaskFormalism.TEXT_TO_LABEL)
    assert len(text_results) == 1
    assert text_results[0].key == "text_clf"

    json_results = r.list(formalism=TaskFormalism.JSON_TO_LABEL)
    assert len(json_results) == 1
    assert json_results[0].key == "json_clf"


def test_list_returns_all_when_no_filter() -> None:
    r = MLRegistry()
    for k, f in [("a", TaskFormalism.TEXT_TO_LABEL), ("b", TaskFormalism.JSON_TO_LABEL), ("c", TaskFormalism.TEXT_TO_LABELS)]:
        r.register(_make_spec(k, f), factory=lambda c: None)

    assert len(r.list()) == 3


def test_get_spec_returns_spec() -> None:
    r = MLRegistry()
    spec = _make_spec("my_clf", TaskFormalism.TEXT_TO_LABEL)
    r.register(spec, factory=lambda c: None)

    found = r.get_spec("my_clf")
    assert found is not None
    assert found.key == "my_clf"


def test_get_spec_returns_none_for_unknown_key() -> None:
    r = MLRegistry()
    assert r.get_spec("nonexistent") is None


def test_build_instantiates_via_factory() -> None:
    sentinel = object()
    r = MLRegistry()
    r.register(_make_spec("clf", TaskFormalism.TEXT_TO_LABEL), factory=lambda c: sentinel)

    instance = r.build("clf", config={})
    assert instance is sentinel


def test_build_passes_config_to_factory() -> None:
    received: list = []
    r = MLRegistry()
    r.register(_make_spec("clf", TaskFormalism.TEXT_TO_LABEL), factory=lambda c: received.append(c) or None)

    r.build("clf", config={"foo": "bar"})
    assert received == [{"foo": "bar"}]


def test_build_raises_for_unknown_key() -> None:
    r = MLRegistry()
    with pytest.raises(KeyError):
        r.build("not_there", config={})


def test_task_formalism_values() -> None:
    assert TaskFormalism.TEXT_TO_LABEL == "text->label"
    assert TaskFormalism.TEXT_TO_LABELS == "text->labels"
    assert TaskFormalism.JSON_TO_LABEL == "json->label"
    assert TaskFormalism.JSON_TO_LABELS == "json->labels"
    assert TaskFormalism.FV_TO_LABEL == "fv->label"
    assert TaskFormalism.FV_TO_FLOAT == "fv->float"


def test_task_formalism_input_output_kind() -> None:
    from libs.ml.registry import InputKind, OutputKind
    assert TaskFormalism.TEXT_TO_LABEL.input_kind == InputKind.TEXT
    assert TaskFormalism.TEXT_TO_LABEL.output_kind == OutputKind.LABEL
    assert TaskFormalism.JSON_TO_LABELS.output_kind == OutputKind.LABELS
    assert TaskFormalism.FV_TO_FLOAT.output_kind == OutputKind.VALUE


def test_method_spec_rule_based_default_false() -> None:
    spec = _make_spec("kw", TaskFormalism.TEXT_TO_LABEL)
    assert spec.rule_based is False


def test_parameter_spec_fields() -> None:
    p = ParameterSpec(name="threshold", label="Threshold", type="number", default=0.5)
    assert p.name == "threshold"
    assert p.default == 0.5
