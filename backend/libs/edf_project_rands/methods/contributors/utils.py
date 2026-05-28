import unicodedata


def strip_parenthetical_suffix(text: str) -> str:
    """Remove trailing parenthetical suffix from a name (e.g. "Foo (temp)" -> "Foo")."""
    if not text:
        return ""
    import re

    return re.sub(r"\s*\([^)]*\)\s*$", "", text).strip()


def strip_accents(text: str) -> str:
    if not text:
        return ""
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn"
    )


def parse_name(full_name: str) -> tuple[str, str]:
    """Return (first, last) from a full name string.

    Uses the same lightweight heuristics we had previously but kept small and deterministic.
    """
    if not full_name:
        return "", ""
    s = " ".join(full_name.strip().split())
    if not s:
        return "", ""
    # specific pattern seen in files: "Last - First"
    if " - " in s:
        left, right = s.split(" - ", 1)
        right_parts = right.split()
        first = right_parts[-1] if right_parts else ""
        last = left
        return first, last
    parts = s.split()
    if len(parts) == 1:
        return "", parts[0]
    if len(parts) == 2:
        return parts[1], parts[0]
    return parts[-1], " ".join(parts[:-1])


def read_excel_bytes_to_dfs(path: str) -> dict:
    """Read available sheets into a dict of DataFrames.

    Fails fast on file-level errors (file missing, not an Excel file, corrupt,
    encrypted, no openpyxl) so callers see the real cause instead of a silent
    empty dict. Per-sheet read failures are logged and skipped so a single bad
    sheet doesn't blank the whole file.
    """
    import logging
    import os

    import pandas as pd

    logger = logging.getLogger(__name__)

    if not path:
        raise ValueError("read_excel_bytes_to_dfs: empty path")  # noqa: TRY003
    if not os.path.exists(path):
        raise FileNotFoundError(  # noqa: TRY003
            f"read_excel_bytes_to_dfs: file does not exist at {path!r}"
        )

    try:
        xls = pd.ExcelFile(path)
    except Exception as error:
        size = os.path.getsize(path) if os.path.exists(path) else None
        raise RuntimeError(  # noqa: TRY003
            f"read_excel_bytes_to_dfs: pandas could not open {path!r} "
            f"(size={size} bytes): {type(error).__name__}: {error}"
        ) from error

    dfs: dict[str, "pd.DataFrame"] = {}
    for name in xls.sheet_names:
        try:
            dfs[name] = pd.read_excel(xls, sheet_name=name)
        except Exception as error:
            logger.warning(
                "read_excel_bytes_to_dfs: failed to read sheet %r from %r: %s: %s",
                name,
                path,
                type(error).__name__,
                error,
            )
            continue
    return dfs
