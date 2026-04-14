import pandas as pd

from libs.files.models import File as FileModel
from libs.files.storage.methods import get_file_storage

from .errors import FileDownloadError, FileLookupError, StorageLookupError
from .matcher import match_candidates
from .models import Candidate
from .utils import parse_name, read_excel_bytes_to_dfs, strip_parenthetical_suffix


def _make_candidate(
    name: str,
    source: str,
    inferred_category: str | None = None,
    inferred_group: str | None = None,
    nni: str | None = None,
) -> Candidate:
    """Create a Candidate from normalized values.

    Note: We expect callers to provide already-normalized values (category, group, nni).
    """
    base_name = strip_parenthetical_suffix(name)
    first, last = parse_name(base_name)
    nni_val = str(nni).strip() if nni else None
    inferred_group_val = (
        str(inferred_group).strip().split()[0].upper() if inferred_group else None
    )
    return Candidate(
        excel_name=name,
        first=first or None,
        last=last or None,
        nni=nni_val,
        inferred_category=inferred_category,
        inferred_group=inferred_group_val,
        source=source,
    )


# --- Per-column extractors (small, single responsibility, prefixed with _) ---


def _extract_name_from_row(row: pd.Series) -> tuple[str | None, str | None, str | None]:
    """Extract the name and parsed first/last from a row using common keys."""
    for key in ("Matricule (Nom - Prénom)", "Nom-Prénom", "Name"):
        if key in row and pd.notna(row[key]) and str(row[key]).strip():
            name = str(row[key])
            base = strip_parenthetical_suffix(name)
            first, last = parse_name(base)
            return name, first or None, last or None
    return None, None, None


def _extract_nni_from_row(row: pd.Series) -> str | None:
    """Extract per-row NNI using common column names."""
    for key in (
        "NNI + Contrat",
        "Matricule (Communication - Identifiant NNI)",
    ):
        if key in row and pd.notna(row[key]) and str(row[key]).strip():
            return str(row[key]).strip()
    return None


def _extract_group_from_row(row: pd.Series) -> str | None:
    for key in ("Clé équipe", "Matricule (Gestionnaire de temps)"):
        if key in row and pd.notna(row[key]) and str(row[key]).strip():
            return str(row[key]).strip()
    return None


def _extract_category_from_row(row: pd.Series) -> str | None:
    for key in ("Nature comptable (Code - désignation)", "Categ MO"):
        if key in row and pd.notna(row[key]) and str(row[key]).strip():
            value = str(row[key])
            try:
                s = str(value).upper().strip()
            except Exception:
                return None
            if s.startswith("MSTE"):
                return "E"
            if s.startswith("MSTD"):
                return "D"
            if s.startswith("MSTC"):
                return "C"
            if s.startswith("MSTB"):
                return "B"
            if s.startswith("MSTA"):
                return "A"
            return None

    return None


def _rows_from_sheet(sheet_name: str, df: pd.DataFrame) -> list[dict]:
    """Convert a sheet's rows to canonical row dicts.

    Each dict contains: excel_name, first, last, nni, inferred_group, inferred_category, source
    """
    rows: list[dict] = []
    for _, r in df.iterrows():
        name, first, last = _extract_name_from_row(r)
        if not name:
            continue
        rows.append(
            {
                "excel_name": name,
                "first": first,
                "last": last,
                "nni": _extract_nni_from_row(r),
                "inferred_group": _extract_group_from_row(r),
                "inferred_category": _extract_category_from_row(r),
                "source": sheet_name,
            }
        )
    return rows


def _collect_candidates_from_dfs(dfs: dict) -> dict[str, Candidate]:
    """Build candidates by normalizing rows from known sheets and grouping by excel name.

    Strategy:
    - Convert each relevant sheet to a list of canonical row dicts (using _rows_from_sheet)
    - Concatenate rows and group by excel_name, keeping the first non-null value per column
    - Build Candidate objects from grouped rows

    NOTE: we keep _extract_nni_from_df for compatibility but we expect per-row NNI to exist.
    """
    sheet_names = ["GTA_Transverse", "Base GTA"]
    rows: list[dict] = []
    for sheet in sheet_names:
        if sheet in dfs:
            rows.extend(_rows_from_sheet(sheet, dfs[sheet]))

    if not rows:
        return {}

    df_rows = pd.DataFrame(rows)

    # helper to pick first non-null
    def _first_non_null(s: pd.Series):
        s2 = s.dropna()
        return s2.iloc[0] if not s2.empty else None

    grouped = df_rows.groupby("excel_name", as_index=False).agg(
        {
            "first": _first_non_null,
            "last": _first_non_null,
            "nni": _first_non_null,
            "inferred_group": _first_non_null,
            "inferred_category": _first_non_null,
            "source": _first_non_null,
        }
    )

    candidates: dict[str, Candidate] = {}
    for _, row in grouped.iterrows():
        excel_name = row["excel_name"]
        candidates[excel_name] = _make_candidate(
            excel_name,
            row.get("source") or "unknown",
            inferred_category=(
                row.get("inferred_category") if "inferred_category" in row else None
            ),
            inferred_group=(
                row.get("inferred_group") if "inferred_group" in row else None
            ),
            nni=row.get("nni") if "nni" in row else None,
        )

    return candidates


def _load_dfs_from_file(file_id: str) -> dict:
    try:
        file_obj = FileModel.by_id(file_id)
    except Exception as exc:
        # Propagate a clear, typed error for callers to handle
        raise FileLookupError(file_id) from exc

    if file_obj is None:
        raise FileLookupError(file_id)

    try:
        storage = get_file_storage(file_obj.storage_id)
    except Exception as exc:
        raise StorageLookupError(str(file_obj.storage_id)) from exc

    local_path = storage.download(
        storage_folder_path=file_obj.storage_folder_path, alternative="original"
    )
    if not local_path:
        # Clear, typed error instead of a generic Exception
        raise FileDownloadError(str(file_id))

    return read_excel_bytes_to_dfs(local_path)


def extract_candidates_from_file(file_id: str) -> list[Candidate]:
    """Extract a list of Candidate objects from the provided File resource.

    This focuses only on contributor-related information (name, group, NNI, category, totals).
    """
    dfs = _load_dfs_from_file(file_id)
    candidates = _collect_candidates_from_dfs(dfs)
    return list(candidates.values())


def preview_contributors_from_file(file_id: str) -> list[dict]:
    candidates = extract_candidates_from_file(file_id)
    # matching will be performed by the matcher; keep preview simple and lightweight

    matches = match_candidates(candidates)
    # build preview dicts including NNI and totals and a simple state
    preview = []
    for m in matches:
        state = "matched" if m.matched_contributor_id else "new"
        preview.append(
            {
                "excel_name": m.candidate.excel_name,
                "first": m.candidate.first,
                "last": m.candidate.last,
                "nni": m.candidate.nni,
                "inferred_category": m.candidate.inferred_category,
                "inferred_group": m.candidate.inferred_group,
                "matched_contributor_id": m.matched_contributor_id,
                "state": state,
            }
        )
    return preview
