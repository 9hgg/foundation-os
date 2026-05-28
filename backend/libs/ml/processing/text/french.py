from functools import cache
from warnings import warn

from .basic import extract_text_tokens, tokenize_and_stem_text

_FALLBACK_FRENCH_SEARCH_STOPWORDS = (
    "a",
    "au",
    "aux",
    "ce",
    "ces",
    "cette",
    "dans",
    "de",
    "des",
    "du",
    "en",
    "est",
    "et",
    "je",
    "la",
    "le",
    "les",
    "leur",
    "leurs",
    "ma",
    "mes",
    "mon",
    "ou",
    "par",
    "parle",
    "parlent",
    "pour",
    "qui",
    "recherche",
    "reference",
    "references",
    "repere",
    "reperes",
    "rf",
    "rfs",
    "sur",
    "un",
    "une",
    "veux",
    "veut",
    "voir",
)


def _load_nltk_french_stopwords() -> tuple[str, ...]:
    try:
        from nltk.corpus import stopwords
    except ImportError:
        return ()

    try:
        return tuple(stopwords.words("french"))
    except LookupError:
        warn("NLTK French stopwords corpus unavailable; using fallback RF search stopwords", stacklevel=2)
        return ()


@cache
def get_french_search_stopword_stems() -> frozenset[str]:
    raw_stopwords = _load_nltk_french_stopwords() or _FALLBACK_FRENCH_SEARCH_STOPWORDS
    normalized_stopwords = {
        token
        for word in raw_stopwords
        for token in extract_text_tokens(word)
    }
    return frozenset(
        stem
        for word in normalized_stopwords
        for stem in tokenize_and_stem_text(word, language="french")
    )
