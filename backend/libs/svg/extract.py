import re
import xml.etree.ElementTree as ET

# SVG namespace map — the SVG spec uses this URI as default namespace
_SVG_NS = "http://www.w3.org/2000/svg"
_TEXT_LOCAL_TAGS = frozenset(("text", "tspan"))


def extract_text_from_svg(svg_content: str) -> list[str]:
    """
    Extract all visible text strings from an SVG document.

    The function walks the entire XML tree and collects the text content of
    every ``<text>`` and ``<tspan>`` element.  Surrounding whitespace (including
    newlines introduced by the SVG formatter) is stripped.  Empty strings and
    duplicates are removed while **preserving the document order** of the first
    occurrence of each unique string.

    Args:
        svg_content: Raw SVG source as a string.

    Returns:
        A deduplicated, order-preserving list of non-empty text strings found
        in the SVG.
    """
    # ElementTree cannot handle the XML declaration with a BOM; strip it.
    cleaned = svg_content.strip()
    if cleaned.startswith("\ufeff"):
        cleaned = cleaned[1:]

    try:
        root = ET.fromstring(cleaned)  # noqa: S314
    except ET.ParseError:
        # Fallback: strip XML processing instructions and try again
        cleaned = re.sub(r"<\?xml[^?]*\?>", "", cleaned).strip()
        root = ET.fromstring(cleaned)  # noqa: S314

    seen: set[str] = set()
    texts: list[str] = []

    for element in root.iter():
        local_tag = element.tag.split("}")[-1] if "}" in element.tag else element.tag
        if local_tag not in _TEXT_LOCAL_TAGS:
            continue

        # Collect text from the element itself and its tail
        for fragment in (element.text, element.tail):
            if not fragment:
                continue
            value = fragment.strip()
            if value and value not in seen:
                seen.add(value)
                texts.append(value)

    return texts
