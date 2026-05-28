import re
import unicodedata
from functools import cache

_TOKENIZE = re.compile(r"[a-z0-9]+")


def normalize_text(text: str) -> str:
    """Lowercase and strip accents so downstream processing receives ASCII."""

    return (
        unicodedata.normalize("NFD", text.lower())
        .encode("ascii", "ignore")
        .decode("ascii")
    )


def extract_text_tokens(text: str) -> tuple[str, ...]:
    """Return normalized tokens for simple text preprocessing."""

    return tuple(_TOKENIZE.findall(normalize_text(text)))


@cache
def _get_stemmer(language: str):
    from nltk.stem import SnowballStemmer  # lazy optional dependency

    return SnowballStemmer(language)


def tokenize_and_stem_text(text: str, *, language: str = "french") -> tuple[str, ...]:
    """Normalize, tokenize, and stem text using Snowball."""

    stemmer = _get_stemmer(language)
    tokens = extract_text_tokens(text)
    return tuple(stemmer.stem(token) for token in tokens)
