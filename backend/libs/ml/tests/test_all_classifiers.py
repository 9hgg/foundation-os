"""Contract tests for all concrete classifiers and regressors in the ML lib.

Each parametrized test exercises the full fit → classify/regress cycle.
Assertions are minimal and interface-focused, not accuracy-focused.

Slow tests (Smart classifiers with grid search CV) are marked with `slow`.
Run fast tests only: pytest -m "not slow"
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from sklearn.feature_extraction.text import TfidfVectorizer

from libs.ml.models import (
    ClassificationPrediction,
    FeatureVectorInput,
    JsonInput,
    Label,
    RegressionPrediction,
    TextInput,
)
from libs.ml.methods.keyword_classifier import (
    KeywordJsonClassifier,
    KeywordMultiLabelJsonClassifier,
    KeywordMultiLabelTextClassifier,
    KeywordTextClassifier,
)
from libs.ml.methods.linguistic_keyword_classifier import (
    LinguisticKeywordJsonClassifier,
    LinguisticKeywordMultiLabelJsonClassifier,
    LinguisticKeywordMultiLabelTextClassifier,
    LinguisticKeywordTextClassifier,
)
from libs.ml.methods.random_classifier import TextRandomClassifier
from libs.ml.methods.sklearn.fv import (
    GradientBoostingFeatureVectorRegressor,
    LassoFeatureVectorRegressor,
    LinearFeatureVectorRegressor,
    LogisticRegressionFeatureVectorClassifier,
    MLPFeatureVectorClassifier,
    PolynomialFeatureVectorRegressor,
    RandomForestFeatureVectorClassifier,
    RandomForestFeatureVectorRegressor,
    RidgeFeatureVectorRegressor,
    SVMFeatureVectorClassifier,
    SVRFeatureVectorRegressor,
    SmartLogisticRegressionFeatureVectorClassifier,
    SmartMLPFeatureVectorClassifier,
    SmartRandomForestFeatureVectorClassifier,
    SmartSVMFeatureVectorClassifier,
)
from libs.ml.methods.sklearn.json import (
    GradientBoostingJsonClassifier,
    LinearSVMJsonClassifier,
    LogisticRegressionJsonClassifier,
    LogisticRegressionMultiLabelJsonClassifier,
    MLPJsonClassifier,
    MLPMultiLabelJsonClassifier,
    RandomForestJsonClassifier,
    RandomForestMultiLabelJsonClassifier,
    SGDJsonClassifier,
    SVMJsonClassifier,
    SVMMultiLabelJsonClassifier,
    SmartLogisticRegressionJsonClassifier,
    SmartLogisticRegressionMultiLabelJsonClassifier,
    SmartMLPJsonClassifier,
    SmartMLPMultiLabelJsonClassifier,
    SmartRandomForestJsonClassifier,
    SmartRandomForestMultiLabelJsonClassifier,
    SmartSVMJsonClassifier,
    SmartSVMMultiLabelJsonClassifier,
)
from libs.ml.methods.sklearn.text import (
    AdaBoostTextClassifier,
    GradientBoostingTextClassifier,
    LogisticRegressionMultiLabelTextClassifier,
    LogisticRegressionTextClassifier,
    MLPMultiLabelTextClassifier,
    MLPTextClassifier,
    RandomForestMultiLabelTextClassifier,
    RandomForestTextClassifier,
    SVMMultiLabelTextClassifier,
    SVMTextClassifier,
    SmartAdaBoostTextClassifier,
    SmartGradientBoostingMultiLabelTextClassifier,
    SmartGradientBoostingTextClassifier,
    SmartLogisticRegressionMultiLabelTextClassifier,
    SmartLogisticRegressionTextClassifier,
    SmartMLPMultiLabelTextClassifier,
    SmartMLPTextClassifier,
    SmartRandomForestMultiLabelTextClassifier,
    SmartRandomForestTextClassifier,
    SmartSVMMultiLabelTextClassifier,
    SmartSVMTextClassifier,
)

# ─── Shared test data ─────────────────────────────────────────────────────────

_LABEL_A = Label(id="A", name="A")
_LABEL_B = Label(id="B", name="B")
_LABEL_IDS = {"A", "B"}

_N = 10  # samples per class — enough for 5-fold CV

_TEXT_A = [TextInput(text_value=f"excellent good wonderful great sample {i}") for i in range(_N)]
_TEXT_B = [TextInput(text_value=f"terrible bad awful horrible sample {i}") for i in range(_N)]
TEXT_INPUTS: list[TextInput] = _TEXT_A + _TEXT_B
TEXT_LABELS: list[Label] = [_LABEL_A] * _N + [_LABEL_B] * _N

_JSON_A = [JsonInput(json_value=json.dumps({"text": f"great product {i}", "quality": "high"})) for i in range(_N)]
_JSON_B = [JsonInput(json_value=json.dumps({"text": f"awful product {i}", "quality": "low"})) for i in range(_N)]
JSON_INPUTS: list[JsonInput] = _JSON_A + _JSON_B
JSON_LABELS: list[Label] = [_LABEL_A] * _N + [_LABEL_B] * _N

_FV_A = [FeatureVectorInput(vector_value=[1.0, 0.0, float(i)]) for i in range(_N)]
_FV_B = [FeatureVectorInput(vector_value=[0.0, 1.0, float(i)]) for i in range(_N)]
FV_INPUTS: list[FeatureVectorInput] = _FV_A + _FV_B
FV_LABELS: list[Label] = [_LABEL_A] * _N + [_LABEL_B] * _N
FV_TARGETS: list[float] = [float(i) for i in range(_N)] + [float(i) * 2 for i in range(_N)]

# Multi-label: single-label samples + some with both labels
_ML_ONLY_A = [[_LABEL_A]] * _N
_ML_ONLY_B = [[_LABEL_B]] * _N
_ML_BOTH   = [[_LABEL_A, _LABEL_B]] * 5

TEXT_ML_INPUTS: list[TextInput]  = TEXT_INPUTS + [TextInput(text_value=f"good and bad {i}") for i in range(5)]
TEXT_ML_LABELS  = _ML_ONLY_A + _ML_ONLY_B + _ML_BOTH
JSON_ML_INPUTS: list[JsonInput]  = JSON_INPUTS + [JsonInput(json_value=json.dumps({"text": f"mixed {i}"})) for i in range(5)]
JSON_ML_LABELS  = _ML_ONLY_A + _ML_ONLY_B + _ML_BOTH

_KEYWORD_RULES = {
    "A": ["excellent", "good", "wonderful", "great"],
    "B": ["terrible", "bad", "awful", "horrible"],
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _fast(clf: Any) -> Any:
    """Reduce a Smart classifier to 2-fold CV with a single param value each.

    This keeps the full code path (grid search, pipeline, CV) while being fast
    enough to run in the standard test suite without the `slow` mark.
    """
    clf.n_splits = 2
    clf.param_grid = {k: [v[0]] for k, v in clf.param_grid.items()}
    return clf

def _assert_single_label_preds(preds: list[ClassificationPrediction], inputs: list) -> None:
    assert len(preds) == len(inputs)
    for p in preds:
        assert isinstance(p, ClassificationPrediction)
        assert p.label_id is not None

def _assert_multi_label_preds(preds: list[list[ClassificationPrediction]], inputs: list) -> None:
    assert len(preds) == len(inputs)
    for sample_preds in preds:
        assert isinstance(sample_preds, list)
        for p in sample_preds:
            assert isinstance(p, ClassificationPrediction)
            assert p.label_id is not None

def _assert_scores_present(preds: list[list[ClassificationPrediction]]) -> None:
    """All predictions from threshold=0.0 must carry a score."""
    for sample_preds in preds:
        for p in sample_preds:
            assert p.score is not None, f"Missing score for label {p.label_id!r}"

# ─── Text single-label classifiers ───────────────────────────────────────────

_TEXT_CLASSIFIERS = [
    SVMTextClassifier(TfidfVectorizer()),
    LogisticRegressionTextClassifier(TfidfVectorizer()),
    RandomForestTextClassifier(TfidfVectorizer()),
    MLPTextClassifier(TfidfVectorizer()),
    GradientBoostingTextClassifier(TfidfVectorizer()),
    AdaBoostTextClassifier(TfidfVectorizer()),
]

_TEXT_CLASSIFIERS_SMART = [
    _fast(SmartSVMTextClassifier(TfidfVectorizer())),
    _fast(SmartLogisticRegressionTextClassifier(TfidfVectorizer())),
    _fast(SmartRandomForestTextClassifier(TfidfVectorizer())),
    _fast(SmartMLPTextClassifier(TfidfVectorizer())),
    _fast(SmartGradientBoostingTextClassifier(TfidfVectorizer())),
    _fast(SmartAdaBoostTextClassifier(TfidfVectorizer())),
]


@pytest.mark.parametrize("clf", _TEXT_CLASSIFIERS, ids=lambda c: type(c).__name__)
def test_text_classifier(clf: Any) -> None:
    clf.fit(TEXT_INPUTS, TEXT_LABELS)
    preds = clf.classify(TEXT_INPUTS)
    _assert_single_label_preds(preds, TEXT_INPUTS)


@pytest.mark.parametrize("clf", _TEXT_CLASSIFIERS_SMART, ids=lambda c: type(c).__name__)
def test_text_classifier_smart(clf: Any) -> None:
    clf.fit(TEXT_INPUTS, TEXT_LABELS)
    preds = clf.classify(TEXT_INPUTS)
    _assert_single_label_preds(preds, TEXT_INPUTS)


# ─── Text multi-label classifiers ────────────────────────────────────────────

_TEXT_ML_CLASSIFIERS = [
    SVMMultiLabelTextClassifier(TfidfVectorizer()),
    LogisticRegressionMultiLabelTextClassifier(TfidfVectorizer()),
    MLPMultiLabelTextClassifier(TfidfVectorizer()),
    RandomForestMultiLabelTextClassifier(TfidfVectorizer()),
]

_TEXT_ML_CLASSIFIERS_SMART = [
    _fast(SmartSVMMultiLabelTextClassifier(TfidfVectorizer())),
    _fast(SmartLogisticRegressionMultiLabelTextClassifier(TfidfVectorizer())),
    _fast(SmartMLPMultiLabelTextClassifier(TfidfVectorizer())),
    _fast(SmartRandomForestMultiLabelTextClassifier(TfidfVectorizer())),
    _fast(SmartGradientBoostingMultiLabelTextClassifier(TfidfVectorizer())),
]


@pytest.mark.parametrize("clf", _TEXT_ML_CLASSIFIERS, ids=lambda c: type(c).__name__)
def test_text_multilabel_classifier(clf: Any) -> None:
    clf.fit(TEXT_ML_INPUTS, TEXT_ML_LABELS)
    preds = clf.classify_multi_label(TEXT_ML_INPUTS)
    _assert_multi_label_preds(preds, TEXT_ML_INPUTS)
    preds_all = clf.classify_multi_label(TEXT_ML_INPUTS, threshold=0.0)
    _assert_multi_label_preds(preds_all, TEXT_ML_INPUTS)
    _assert_scores_present(preds_all)


@pytest.mark.parametrize("clf", _TEXT_ML_CLASSIFIERS_SMART, ids=lambda c: type(c).__name__)
def test_text_multilabel_classifier_smart(clf: Any) -> None:
    clf.fit(TEXT_ML_INPUTS, TEXT_ML_LABELS)
    preds = clf.classify_multi_label(TEXT_ML_INPUTS)
    _assert_multi_label_preds(preds, TEXT_ML_INPUTS)
    preds_all = clf.classify_multi_label(TEXT_ML_INPUTS, threshold=0.0)
    _assert_multi_label_preds(preds_all, TEXT_ML_INPUTS)
    _assert_scores_present(preds_all)


# ─── JSON single-label classifiers ───────────────────────────────────────────

_JSON_CLASSIFIERS = [
    SVMJsonClassifier(TfidfVectorizer()),
    LinearSVMJsonClassifier(TfidfVectorizer()),
    SGDJsonClassifier(TfidfVectorizer()),
    LogisticRegressionJsonClassifier(TfidfVectorizer()),
    RandomForestJsonClassifier(TfidfVectorizer()),
    MLPJsonClassifier(TfidfVectorizer()),
    GradientBoostingJsonClassifier(TfidfVectorizer()),
]

_JSON_CLASSIFIERS_SMART = [
    _fast(SmartSVMJsonClassifier(TfidfVectorizer())),
    _fast(SmartLogisticRegressionJsonClassifier(TfidfVectorizer())),
    _fast(SmartRandomForestJsonClassifier(TfidfVectorizer())),
    _fast(SmartMLPJsonClassifier(TfidfVectorizer())),
]


@pytest.mark.parametrize("clf", _JSON_CLASSIFIERS, ids=lambda c: type(c).__name__)
def test_json_classifier(clf: Any) -> None:
    clf.fit(JSON_INPUTS, JSON_LABELS)
    preds = clf.classify(JSON_INPUTS)
    _assert_single_label_preds(preds, JSON_INPUTS)


@pytest.mark.parametrize("clf", _JSON_CLASSIFIERS_SMART, ids=lambda c: type(c).__name__)
def test_json_classifier_smart(clf: Any) -> None:
    clf.fit(JSON_INPUTS, JSON_LABELS)
    preds = clf.classify(JSON_INPUTS)
    _assert_single_label_preds(preds, JSON_INPUTS)


# ─── JSON multi-label classifiers ────────────────────────────────────────────

_JSON_ML_CLASSIFIERS = [
    SVMMultiLabelJsonClassifier(TfidfVectorizer()),
    LogisticRegressionMultiLabelJsonClassifier(TfidfVectorizer()),
    MLPMultiLabelJsonClassifier(TfidfVectorizer()),
    RandomForestMultiLabelJsonClassifier(TfidfVectorizer()),
]

_JSON_ML_CLASSIFIERS_SMART = [
    _fast(SmartSVMMultiLabelJsonClassifier(TfidfVectorizer())),
    _fast(SmartLogisticRegressionMultiLabelJsonClassifier(TfidfVectorizer())),
    _fast(SmartMLPMultiLabelJsonClassifier(TfidfVectorizer())),
    _fast(SmartRandomForestMultiLabelJsonClassifier(TfidfVectorizer())),
]


@pytest.mark.parametrize("clf", _JSON_ML_CLASSIFIERS, ids=lambda c: type(c).__name__)
def test_json_multilabel_classifier(clf: Any) -> None:
    clf.fit(JSON_ML_INPUTS, JSON_ML_LABELS)
    preds = clf.classify_multi_label(JSON_ML_INPUTS)
    _assert_multi_label_preds(preds, JSON_ML_INPUTS)
    preds_all = clf.classify_multi_label(JSON_ML_INPUTS, threshold=0.0)
    _assert_multi_label_preds(preds_all, JSON_ML_INPUTS)
    _assert_scores_present(preds_all)


@pytest.mark.parametrize("clf", _JSON_ML_CLASSIFIERS_SMART, ids=lambda c: type(c).__name__)
def test_json_multilabel_classifier_smart(clf: Any) -> None:
    clf.fit(JSON_ML_INPUTS, JSON_ML_LABELS)
    preds = clf.classify_multi_label(JSON_ML_INPUTS)
    _assert_multi_label_preds(preds, JSON_ML_INPUTS)
    preds_all = clf.classify_multi_label(JSON_ML_INPUTS, threshold=0.0)
    _assert_multi_label_preds(preds_all, JSON_ML_INPUTS)
    _assert_scores_present(preds_all)


# ─── Feature-vector classifiers ──────────────────────────────────────────────

_FV_CLASSIFIERS = [
    SVMFeatureVectorClassifier(),
    LogisticRegressionFeatureVectorClassifier(),
    RandomForestFeatureVectorClassifier(),
    MLPFeatureVectorClassifier(),
]

_FV_CLASSIFIERS_SMART = [
    _fast(SmartSVMFeatureVectorClassifier()),
    _fast(SmartLogisticRegressionFeatureVectorClassifier()),
    _fast(SmartRandomForestFeatureVectorClassifier()),
    _fast(SmartMLPFeatureVectorClassifier()),
]


@pytest.mark.parametrize("clf", _FV_CLASSIFIERS, ids=lambda c: type(c).__name__)
def test_fv_classifier(clf: Any) -> None:
    clf.fit(FV_INPUTS, FV_LABELS)
    preds = clf.classify(FV_INPUTS)
    _assert_single_label_preds(preds, FV_INPUTS)


@pytest.mark.parametrize("clf", _FV_CLASSIFIERS_SMART, ids=lambda c: type(c).__name__)
def test_fv_classifier_smart(clf: Any) -> None:
    clf.fit(FV_INPUTS, FV_LABELS)
    preds = clf.classify(FV_INPUTS)
    _assert_single_label_preds(preds, FV_INPUTS)


# ─── Feature-vector regressors ────────────────────────────────────────────────

_FV_REGRESSORS = [
    LinearFeatureVectorRegressor(),
    RidgeFeatureVectorRegressor(),
    LassoFeatureVectorRegressor(),
    PolynomialFeatureVectorRegressor(),
    RandomForestFeatureVectorRegressor(),
    GradientBoostingFeatureVectorRegressor(),
    SVRFeatureVectorRegressor(),
]


@pytest.mark.parametrize("reg", _FV_REGRESSORS, ids=lambda r: type(r).__name__)
def test_fv_regressor(reg: Any) -> None:
    reg.fit(FV_INPUTS, FV_TARGETS)
    preds = reg.regress(FV_INPUTS)
    assert len(preds) == len(FV_INPUTS)
    for p in preds:
        assert isinstance(p, RegressionPrediction)
        assert isinstance(p.value, float)


# ─── Keyword classifiers ──────────────────────────────────────────────────────

_KW_TEXT_INPUTS = [
    TextInput(text_value="excellent product, very good quality"),
    TextInput(text_value="terrible service, absolutely awful"),
    TextInput(text_value="no signal here"),
]

_KW_JSON_INPUTS = [
    JsonInput(json_value=json.dumps({"text": "great and wonderful experience"})),
    JsonInput(json_value=json.dumps({"text": "horrible and bad outcome"})),
    JsonInput(json_value=json.dumps({"text": "neutral statement"})),
]


def test_keyword_text_classifier() -> None:
    clf = KeywordTextClassifier(rules=_KEYWORD_RULES)
    preds = clf.classify(_KW_TEXT_INPUTS)
    _assert_single_label_preds(preds, _KW_TEXT_INPUTS)
    assert preds[0].label_id == "A"
    assert preds[1].label_id == "B"


def test_keyword_json_classifier() -> None:
    clf = KeywordJsonClassifier(rules=_KEYWORD_RULES)
    preds = clf.classify(_KW_JSON_INPUTS)
    _assert_single_label_preds(preds, _KW_JSON_INPUTS)
    assert preds[0].label_id == "A"
    assert preds[1].label_id == "B"


def test_keyword_multilabel_text_classifier() -> None:
    clf = KeywordMultiLabelTextClassifier(rules=_KEYWORD_RULES)
    preds = clf.classify_multi_label(_KW_TEXT_INPUTS)
    _assert_multi_label_preds(preds, _KW_TEXT_INPUTS)
    assert any(p.label_id == "A" for p in preds[0])
    assert any(p.label_id == "B" for p in preds[1])


def test_keyword_multilabel_json_classifier() -> None:
    clf = KeywordMultiLabelJsonClassifier(rules=_KEYWORD_RULES)
    preds = clf.classify_multi_label(_KW_JSON_INPUTS)
    _assert_multi_label_preds(preds, _KW_JSON_INPUTS)
    assert any(p.label_id == "A" for p in preds[0])
    assert any(p.label_id == "B" for p in preds[1])


# ─── Linguistic keyword classifiers ──────────────────────────────────────────

def test_linguistic_keyword_text_classifier() -> None:
    clf = LinguisticKeywordTextClassifier(rules=_KEYWORD_RULES, language="english")
    preds = clf.classify(_KW_TEXT_INPUTS)
    _assert_single_label_preds(preds, _KW_TEXT_INPUTS)
    assert preds[0].label_id == "A"
    assert preds[1].label_id == "B"


def test_linguistic_keyword_json_classifier() -> None:
    clf = LinguisticKeywordJsonClassifier(rules=_KEYWORD_RULES, language="english")
    preds = clf.classify(_KW_JSON_INPUTS)
    _assert_single_label_preds(preds, _KW_JSON_INPUTS)
    assert preds[0].label_id == "A"
    assert preds[1].label_id == "B"


def test_linguistic_keyword_multilabel_text_classifier() -> None:
    clf = LinguisticKeywordMultiLabelTextClassifier(rules=_KEYWORD_RULES, language="english")
    preds = clf.classify_multi_label(_KW_TEXT_INPUTS)
    _assert_multi_label_preds(preds, _KW_TEXT_INPUTS)
    assert any(p.label_id == "A" for p in preds[0])
    assert any(p.label_id == "B" for p in preds[1])


def test_linguistic_keyword_multilabel_json_classifier() -> None:
    clf = LinguisticKeywordMultiLabelJsonClassifier(rules=_KEYWORD_RULES, language="english")
    preds = clf.classify_multi_label(_KW_JSON_INPUTS)
    _assert_multi_label_preds(preds, _KW_JSON_INPUTS)
    assert any(p.label_id == "A" for p in preds[0])
    assert any(p.label_id == "B" for p in preds[1])


# ─── Random classifier ────────────────────────────────────────────────────────

def test_random_classifier() -> None:
    clf = TextRandomClassifier(labels=list(_LABEL_IDS))
    preds = clf.classify(TEXT_INPUTS)
    _assert_single_label_preds(preds, TEXT_INPUTS)
    for p in preds:
        assert p.label_id in _LABEL_IDS


# ─── Score population ─────────────────────────────────────────────────────────
# Classifiers backed by predict_proba or decision_function must populate score
# on every prediction. GradientBoosting is excluded — it has neither.

def test_single_label_score_populated_text() -> None:
    for clf in [
        LogisticRegressionTextClassifier(TfidfVectorizer()),
        SVMTextClassifier(TfidfVectorizer()),
        RandomForestTextClassifier(TfidfVectorizer()),
        MLPTextClassifier(TfidfVectorizer()),
    ]:
        clf.fit(TEXT_INPUTS, TEXT_LABELS)
        for p in clf.classify(TEXT_INPUTS):
            assert p.score is not None, f"{type(clf).__name__} score is None"
            assert 0.0 <= p.score <= 1.0


def test_single_label_score_populated_json() -> None:
    for clf in [
        LinearSVMJsonClassifier(TfidfVectorizer()),
        LogisticRegressionJsonClassifier(TfidfVectorizer()),
        SVMJsonClassifier(TfidfVectorizer()),
        RandomForestJsonClassifier(TfidfVectorizer()),
    ]:
        clf.fit(JSON_INPUTS, JSON_LABELS)
        for p in clf.classify(JSON_INPUTS):
            assert p.score is not None, f"{type(clf).__name__} score is None"
            assert 0.0 <= p.score <= 1.0
