import pytest

from libs.ml.datasets import Dataset, DatasetSample, TextClassificationDataset
from libs.ml.models import FeatureVectorInput, TextInput
from libs.ml.registry import TaskFormalism
from libs.ml.targets import ClassificationTarget, RegressionTarget


def _classification_dataset() -> TextClassificationDataset:
    return TextClassificationDataset(
        formalism=TaskFormalism.TEXT_TO_LABEL,
        samples=[
            DatasetSample(
                input=TextInput(text_value=f"sample-{index}"),
                target=ClassificationTarget(label_id="a" if index < 6 else "b"),
            )
            for index in range(12)
        ],
    )


def test_split_is_deterministic_but_not_tail_based() -> None:
    dataset = _classification_dataset()

    first_train, first_test = dataset.split(4)
    second_train, second_test = dataset.split(4)

    assert [sample.input.text_value for sample in first_test.samples] == [
        sample.input.text_value for sample in second_test.samples
    ]
    assert [sample.input.text_value for sample in first_test.samples] != [
        f"sample-{index}" for index in range(8, 12)
    ]
    assert len(first_train.samples) == 8


def test_split_stratifies_single_label_classification_when_possible() -> None:
    dataset = _classification_dataset()

    train, test = dataset.split(4)

    assert sorted(sample.target.label_id for sample in train.samples) == [
        "a",
        "a",
        "a",
        "a",
        "b",
        "b",
        "b",
        "b",
    ]
    assert sorted(sample.target.label_id for sample in test.samples) == [
        "a",
        "a",
        "b",
        "b",
    ]


# ─── Additional coverage ──────────────────────────────────────────────────────

def _reg_dataset(n: int = 10) -> Dataset:
    return Dataset(
        formalism=TaskFormalism.FV_TO_FLOAT,
        samples=[
            DatasetSample(
                input=FeatureVectorInput(vector_value=[float(i)]),
                target=RegressionTarget(value=float(i)),
            )
            for i in range(n)
        ],
    )


def test_len() -> None:
    assert len(_classification_dataset()) == 12


def test_inputs_returns_all() -> None:
    ds = _classification_dataset()
    assert len(ds.inputs()) == 12
    assert all(isinstance(inp, TextInput) for inp in ds.inputs())


def test_targets_returns_all() -> None:
    ds = _classification_dataset()
    assert len(ds.targets()) == 12


def test_labeled_samples_filters_none_targets() -> None:
    ds = Dataset(
        formalism=TaskFormalism.TEXT_TO_LABEL,
        samples=[
            DatasetSample(input=TextInput(text_value="a"), target=ClassificationTarget(label_id="A")),
            DatasetSample(input=TextInput(text_value="b")),
        ],
    )
    assert len(ds.labeled_samples()) == 1


def test_split_raises_when_test_size_too_large() -> None:
    ds = _classification_dataset()
    with pytest.raises(ValueError):
        ds.split(test_size=12)


def test_split_without_stratify() -> None:
    ds = _classification_dataset()
    train, test = ds.split(4, stratify=False)
    assert len(train) + len(test) == 12


def test_split_regression_falls_back_to_random() -> None:
    ds = _reg_dataset(10)
    train, test = ds.split(3)
    assert len(train) + len(test) == 10


def test_split_preserves_formalism() -> None:
    ds = _classification_dataset()
    train, test = ds.split(4)
    assert train.formalism == TaskFormalism.TEXT_TO_LABEL
    assert test.formalism == TaskFormalism.TEXT_TO_LABEL


def test_split_no_overlap() -> None:
    ds = _classification_dataset()
    train, test = ds.split(4)
    train_texts = {s.input.text_value for s in train.samples}
    test_texts = {s.input.text_value for s in test.samples}
    assert train_texts.isdisjoint(test_texts)
