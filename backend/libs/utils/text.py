import re
import unicodedata


def slugify(value, lower=True):
    """
    Normalizes string, converts to lowercase, removes non-alpha characters,
    and converts spaces to hyphens.
    """
    value = unicodedata.normalize("NFKD", value).encode("utf-8", "ignore")
    value = str(re.sub(r"[^\w\s-]", "", value.decode("utf-8")).strip())
    if lower:
        value = value.lower()
    value = str(re.sub(r"[-\s]+", "-", value))
    return value
