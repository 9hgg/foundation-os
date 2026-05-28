import json as _json
from collections.abc import Mapping, Sequence

from libs.ml.processing.text.basic import tokenize_and_stem_text

from ..errors import EmptyRulesError
from ..models import (
    ClassificationPrediction,
    Classifier,
    JsonInput,
    MultiLabelClassifier,
    TextInput,
)
from .keyword_classifier import KeywordBaseClassifier


class LinguisticKeywordTextClassifier(KeywordBaseClassifier, Classifier[TextInput]):
    """Keyword classifier with stemming-based matching.

    Unlike :class:`KeywordClassifier` (exact substring match), this class
    stems both the rule keywords and the input text before comparing, so
    morphological variants are matched transparently:

    - ``"pompes"`` matches the keyword ``"pompe"``
    - ``"roulements"`` matches ``"roulement"``
    - ``"vibrations excessives"`` matches ``"vibration"`` and ``"excessif"``

    Two improvements over naive substring matching:

    - **Token-level matching** — keywords are checked against the set of
      stemmed input tokens (not as substrings of a joined string), so short
      stems never falsely match inside unrelated words.
    - **Unicode normalisation** — accents are stripped before stemming so that
      ``"présence"`` and ``"presence"`` produce the same stem regardless of
      casing or encoding in the source text.

    Multi-word keywords (auto-generated ancestor compounds such as
    ``"corrosion oxydation presence"``) are checked as ordered n-gram
    sequences in the token list.

    Stemming is performed by NLTK's Snowball algorithm, which is pure Python
    and requires no pre-downloaded model.  The ``language`` parameter accepts
    any language supported by NLTK Snowball (``"french"``, ``"english"``,
    ``"german"``, ``"spanish"``, …).
    """

    def __init__(
        self,
        rules: Mapping[str, Sequence[str]],
        *,
        language: str = "french",
        default_label: str = "__unknown__",
        ignored_keywords: Sequence[str] | None = None,
    ):
        if not rules:
            raise EmptyRulesError

        self._language = language
        self.default_label = default_label
        self._ignored_stems = {
            stem
            for keyword in (ignored_keywords or [])
            for stem in tokenize_and_stem_text(str(keyword), language=language)
        }

        # Pre-stem every keyword at construction time so inference is fast.
        # Keywords are stored as tuples of stems so multi-word phrases are
        # handled as ordered sequences rather than raw strings.
        self._stemmed_rules: dict[str, list[tuple[str, ...]]] = {
            label: [
                filtered_stems
                for keyword in keywords
                if (
                    filtered_stems := tuple(
                        stem
                        for stem in tokenize_and_stem_text(
                            str(keyword), language=language
                        )
                        if stem not in self._ignored_stems
                    )
                )
            ]
            for label, keywords in rules.items()
        }

    def _match_all(self, sample: TextInput) -> dict[str, list[str]]:
        """Return matched keywords per label (empty list = no match)."""
        input_stems = tuple(
            stem
            for stem in tokenize_and_stem_text(sample.text_value, language=self._language)
            if stem not in self._ignored_stems
        )
        input_set = set(input_stems)
        all_matches: dict[str, list[str]] = {}
        for label, keyword_tuples in self._stemmed_rules.items():
            matches: list[str] = []
            for kw_stems in keyword_tuples:
                if not kw_stems:
                    continue
                if len(kw_stems) == 1:
                    if kw_stems[0] in input_set:
                        matches.append(kw_stems[0])
                else:
                    n = len(kw_stems)
                    if any(input_stems[i: i + n] == kw_stems for i in range(len(input_stems) - n + 1)):
                        matches.append(" ".join(kw_stems))
            all_matches[label] = matches
        return all_matches

    def _classify(self, inputs: list[TextInput]) -> list[ClassificationPrediction]:
        predictions: list[ClassificationPrediction] = []
        for sample in inputs:
            all_matches = self._match_all(sample)

            best_label = self.default_label
            best_hits = 0
            best_matches: list[str] = []

            for label, matches in all_matches.items():
                if len(matches) > best_hits:
                    best_label = label
                    best_hits = len(matches)
                    best_matches = matches
                # print_color(
                #     "yellow", f"Label '{label}': matches={matches}, hits={len(matches)}"
                # )

            score = (
                best_hits / max(len(self._stemmed_rules[best_label]), 1)
                if best_label != self.default_label
                else None
            )
            # print_color(
            #     "green",
            #     f"Predicted label: {best_label} (score={score}, matches={best_matches})",
            # )
            predictions.append(
                ClassificationPrediction(
                    label_id=best_label,
                    score=score,
                    metadata={"matched_keywords": best_matches},
                )
            )
        return predictions


class LinguisticKeywordJsonClassifier(KeywordBaseClassifier, Classifier[JsonInput]):
    """Linguistic keyword classifier for JSON inputs — serializes json_value to text before matching."""

    def __init__(
        self,
        rules: Mapping[str, Sequence[str]],
        *,
        language: str = "french",
        default_label: str = "__unknown__",
        ignored_keywords: Sequence[str] | None = None,
    ):
        self._inner = LinguisticKeywordTextClassifier(
            rules=rules,
            language=language,
            default_label=default_label,
            ignored_keywords=ignored_keywords,
        )

    def _classify(self, inputs: list[JsonInput]) -> list[ClassificationPrediction]:
        import json

        text_inputs = [
            TextInput(text_value=json.dumps(v.json_value, ensure_ascii=False))
            for v in inputs
        ]
        return self._inner._classify(text_inputs)

    @property
    def rules(self) -> dict:
        return self._inner.rules


class LinguisticKeywordMultiLabelTextClassifier(KeywordBaseClassifier, MultiLabelClassifier[TextInput]):
    """Linguistic keyword classifier for multi-label text — returns all labels with at least one stemmed keyword hit.

    Reuses the pre-stemmed rules and matching logic from LinguisticKeywordTextClassifier but
    collects ALL labels with at least one hit instead of picking the single best one.
    """

    def __init__(
        self,
        rules: Mapping[str, Sequence[str]],
        *,
        language: str = "french",
        ignored_keywords: Sequence[str] | None = None,
        max_labels: int | None = None,
    ):
        if not rules:
            raise EmptyRulesError
        # Delegate to the single-label classifier for pre-stemming and matching logic.
        # We give it a dummy default_label so it never suppresses results.
        self._inner = LinguisticKeywordTextClassifier(
            rules=rules,
            language=language,
            default_label="__no_match__",
            ignored_keywords=ignored_keywords,
        )
        self._max_labels = max_labels

    @property
    def rules(self) -> dict:
        return {label: list(kw_tuples) for label, kw_tuples in self._inner._stemmed_rules.items()}

    def _classify_multi_label(
        self, inputs: list[TextInput],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]:
        results = []
        for sample in inputs:
            predictions = [
                ClassificationPrediction(label_id=label, metadata={"matched_keywords": hits})
                for label, hits in self._inner._match_all(sample).items()
                if hits
            ]
            if self._max_labels is not None:
                predictions = sorted(
                    predictions,
                    key=lambda p: len((p.metadata or {}).get("matched_keywords", [])),
                    reverse=True,
                )[:self._max_labels]
            results.append(predictions)
        return results


class LinguisticKeywordMultiLabelJsonClassifier(KeywordBaseClassifier, MultiLabelClassifier[JsonInput]):
    """Linguistic keyword classifier for multi-label JSON — serializes json_value to text before matching."""

    def __init__(
        self,
        rules: Mapping[str, Sequence[str]],
        *,
        language: str = "french",
        ignored_keywords: Sequence[str] | None = None,
        max_labels: int | None = None,
    ):
        self._inner = LinguisticKeywordMultiLabelTextClassifier(
            rules=rules, language=language, ignored_keywords=ignored_keywords, max_labels=max_labels
        )

    def _classify_multi_label(
        self, inputs: list[JsonInput],
        *,
        threshold: float = 0.5,
    ) -> list[list[ClassificationPrediction]]:
        text_inputs = [
            TextInput(text_value=_json.dumps(v.json_value, ensure_ascii=False))
            for v in inputs
        ]
        return self._inner._classify_multi_label(text_inputs, threshold=threshold)

    @property
    def rules(self) -> dict:
        return self._inner.rules
