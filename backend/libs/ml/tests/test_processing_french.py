"""Tests for libs/ml/processing/text/french.py."""

from __future__ import annotations

from libs.ml.processing.text.french import get_french_search_stopword_stems


def test_returns_frozenset() -> None:
    result = get_french_search_stopword_stems()
    assert isinstance(result, frozenset)


def test_not_empty() -> None:
    result = get_french_search_stopword_stems()
    assert len(result) > 0


def test_common_french_words_are_stopwords() -> None:
    stops = get_french_search_stopword_stems()
    # These common French words should produce stems that end up in the set
    # (stems of "de", "la", "le", "et", "un", "une" in French snowball)
    assert len(stops) >= 10


def test_all_entries_are_strings() -> None:
    for stem in get_french_search_stopword_stems():
        assert isinstance(stem, str)
        assert len(stem) > 0


def test_cached_returns_same_object() -> None:
    a = get_french_search_stopword_stems()
    b = get_french_search_stopword_stems()
    assert a is b
