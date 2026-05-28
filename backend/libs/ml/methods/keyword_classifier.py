import json
import re
import unicodedata
from collections.abc import Mapping, Sequence

from ..errors import EmptyRulesError
from ..models import (
    ClassificationPrediction,
    Classifier,
    JsonInput,
    MultiLabelClassifier,
    TextInput,
)


class KeywordBaseClassifier:
    """Marker base for all keyword-based classifiers.

    Subclasses expose a ``rules`` attribute mapping label names to keyword lists.
    Use ``isinstance(algo, KeywordBaseClassifier)`` to detect rule-based methods.
    """

_TOKENIZE = re.compile(r"[a-z0-9]+")


def _normalize(text: str) -> str:
    return (
        unicodedata.normalize("NFD", text.lower())
        .encode("ascii", "ignore")
        .decode("ascii")
    )


def _sanitize_keyword(keyword: str, ignored_keywords: set[str]) -> str:
    tokens = [
        token
        for token in _TOKENIZE.findall(_normalize(keyword))
        if token not in ignored_keywords
    ]
    return " ".join(tokens)


class KeywordTextClassifier(KeywordBaseClassifier, Classifier[TextInput]):
    """Rule-based classifier that picks the label with the most keyword hits."""

    def __init__(
        self,
        rules: Mapping[str, Sequence[str]],
        *,
        default_label: str = "__unknown__",
        ignored_keywords: Sequence[str] | None = None,
    ):
        if not rules:
            raise EmptyRulesError
        ignored = {
            token
            for keyword in (ignored_keywords or [])
            for token in _TOKENIZE.findall(_normalize(str(keyword)))
        }
        self.rules = {
            label: [
                sanitized
                for keyword in keywords
                if (sanitized := _sanitize_keyword(str(keyword), ignored))
            ]
            for label, keywords in rules.items()
        }
        self.default_label = default_label

    def _classify(self, inputs: list[TextInput]) -> list[ClassificationPrediction]:
        predictions: list[ClassificationPrediction] = []
        for sample in inputs:
            text = _normalize(sample.text_value)
            best_label = self.default_label
            best_hits = 0
            best_matches: list[str] = []

            for label, keywords in self.rules.items():
                matches = [kw for kw in keywords if kw in text]
                if len(matches) > best_hits:
                    best_label = label
                    best_hits = len(matches)
                    best_matches = matches

            score = (
                best_hits / max(len(self.rules[best_label]), 1)
                if best_label != self.default_label
                else None
            )
            predictions.append(
                ClassificationPrediction(
                    label_id=best_label,
                    score=score,
                    metadata={"matched_keywords": best_matches},
                )
            )
        return predictions


class KeywordJsonClassifier(KeywordBaseClassifier, Classifier[JsonInput]):
    """Keyword classifier for JSON inputs — serializes json_value to text before matching."""

    def __init__(
        self,
        rules: Mapping[str, Sequence[str]],
        *,
        default_label: str = "__unknown__",
        ignored_keywords: Sequence[str] | None = None,
    ):
        self._inner = KeywordTextClassifier(
            rules=rules, default_label=default_label, ignored_keywords=ignored_keywords
        )

    def _classify(self, inputs: list[JsonInput]) -> list[ClassificationPrediction]:
        text_inputs = [
            TextInput(text_value=json.dumps(v.json_value, ensure_ascii=False))
            for v in inputs
        ]
        return self._inner._classify(text_inputs)

    @property
    def rules(self) -> dict:
        return self._inner.rules


class KeywordMultiLabelTextClassifier(KeywordBaseClassifier, MultiLabelClassifier[TextInput]):
    """Keyword classifier for multi-label text — returns all labels with at least one keyword hit."""

    def __init__(
        self,
        rules: Mapping[str, Sequence[str]],
        *,
        default_label: str = "__unknown__",
        ignored_keywords: Sequence[str] | None = None,
        max_labels: int | None = None,
    ):
        self._inner = KeywordTextClassifier(
            rules=rules, default_label=default_label, ignored_keywords=ignored_keywords
        )
        self._max_labels = max_labels

    def _classify_multi_label(
        self, inputs: list[TextInput],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]:
        results = []
        for sample in inputs:
            sample_predictions = self._inner._classify([sample])
            if self._max_labels is not None:
                sample_predictions = sample_predictions[:self._max_labels]
            results.append(sample_predictions)

        return results

    @property
    def rules(self) -> dict:
        return self._inner.rules


class KeywordMultiLabelJsonClassifier(KeywordBaseClassifier, MultiLabelClassifier[JsonInput]):
    """Keyword classifier for multi-label JSON — serializes json_value to text before matching."""

    def __init__(
        self,
        rules: Mapping[str, Sequence[str]],
        *,
        ignored_keywords: Sequence[str] | None = None,
        max_labels: int | None = None,
    ):
        self._inner = KeywordMultiLabelTextClassifier(
            rules=rules, ignored_keywords=ignored_keywords, max_labels=max_labels
        )

    def _classify_multi_label(
        self, inputs: list[JsonInput],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]:
        text_inputs = [
            TextInput(text_value=json.dumps(v.json_value, ensure_ascii=False))
            for v in inputs
        ]
        return self._inner._classify_multi_label(text_inputs, threshold=threshold)

    @property
    def rules(self) -> dict:
        return self._inner.rules
