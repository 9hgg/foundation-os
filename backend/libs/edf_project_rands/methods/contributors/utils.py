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
    """Read available sheets into a dict of DataFrames. Returns empty dict on failure."""
    try:
        import pandas as pd

        xls = pd.ExcelFile(path)
        dfs: dict[str, "pd.DataFrame"] = {}
        for name in xls.sheet_names:
            try:
                dfs[name] = pd.read_excel(xls, sheet_name=name)
            except Exception:
                # keep going on per-sheet failure
                continue
        return dfs
    except Exception:
        return {}
