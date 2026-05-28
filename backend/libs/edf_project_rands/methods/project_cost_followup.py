import logging
from collections import defaultdict

import pandas as pd

from libs.files.models import File as FileModel
from libs.files.storage.methods import get_file_storage

from ..models import (
    Contributor,
    ProjectCostTrackingContributorSeries,
    ProjectCostTrackingData,
)
from .contributors.utils import read_excel_bytes_to_dfs

logger = logging.getLogger(__name__)


def _normalize_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    return str(value).strip()


def _normalize_project_code(value: object) -> str:
    return _normalize_str(value).upper()


def _normalize_nni(value: object) -> str | None:
    normalized = _normalize_str(value).upper()
    return normalized or None


def _normalize_hours(value: object) -> float:
    if value is None:
        return 0.0
    try:
        if pd.isna(value):
            return 0.0
    except Exception:
        pass
    try:
        return round(float(value), 2)
    except Exception:
        return 0.0


def _normalize_contributor_name(value: object) -> str | None:
    normalized = _normalize_str(value)
    if not normalized or normalized.lower().startswith("pas de mouvements"):
        return None
    return normalized


def _build_month_label(year: object, month: object) -> str | None:
    try:
        year_int = int(year)
        month_int = int(month)
    except Exception:
        return None
    if month_int < 1 or month_int > 12:
        return None
    return f"{year_int:04d}-{month_int:02d}"


def _load_dataframes_from_file(file_id: str) -> dict[str, pd.DataFrame]:
    file_obj = FileModel.by_id(file_id)
    if file_obj is None:
        raise ValueError(f"File not found: {file_id}")

    storage = get_file_storage(file_obj.storage_id)
    local_path = storage.download(
        storage_folder_path=file_obj.storage_folder_path, alternative="original"
    )
    if not local_path:
        raise ValueError(f"Could not download file: {file_id}")

    return read_excel_bytes_to_dfs(local_path)


def _accumulate_sheet_rows(
    *,
    df: pd.DataFrame | None,
    normalized_project_code: str,
    project_code_column: str,
    contributor_name_column: str,
    year_column: str,
    month_column: str,
    hours_column: str,
    nni_column: str | None,
    contributors_by_nni: dict[str, Contributor],
    hours_by_contributor: dict[str, dict[str, float]],
    contributor_meta: dict[str, dict[str, str | None]],
    total_hours_by_month: dict[str, float],
) -> None:
    if df is None or df.empty:
        return

    sheet_label = f"sheet({project_code_column!r})"
    required_columns = [
        project_code_column,
        contributor_name_column,
        year_column,
        month_column,
        hours_column,
    ]
    missing_columns = [column for column in required_columns if column not in df.columns]
    if missing_columns:
        logger.warning(
            "[cost-followup] %s missing required columns %s; sheet actually has: %s",
            sheet_label,
            missing_columns,
            list(df.columns),
        )
        return

    seen_project_codes: set[str] = set()
    rows_scanned = 0
    rows_matched = 0
    rows_dropped_no_name = 0
    rows_dropped_no_hours = 0
    rows_dropped_no_month = 0

    for _, row in df.iterrows():
        rows_scanned += 1
        row_project_code = _normalize_project_code(row.get(project_code_column))
        seen_project_codes.add(row_project_code)
        if row_project_code != normalized_project_code:
            continue
        rows_matched += 1

        contributor_name = _normalize_contributor_name(row.get(contributor_name_column))
        if not contributor_name:
            rows_dropped_no_name += 1
            continue

        hours = _normalize_hours(row.get(hours_column))
        if hours <= 0:
            rows_dropped_no_hours += 1
            continue

        month_label = _build_month_label(row.get(year_column), row.get(month_column))
        if not month_label:
            rows_dropped_no_month += 1
            continue

        nni = _normalize_nni(row.get(nni_column)) if nni_column and nni_column in df.columns else None
        matched_contributor = contributors_by_nni.get(nni) if nni else None
        contributor_key = nni or contributor_name.upper()
        canonical_name = matched_contributor.display_name if matched_contributor else contributor_name

        hours_by_contributor[contributor_key][month_label] += hours
        total_hours_by_month[month_label] += hours
        contributor_meta[contributor_key] = {
            "contributor_name": canonical_name,
            "nni": nni,
            "contributor_id": str(matched_contributor.id) if matched_contributor else None,
        }

    logger.info(
        "[cost-followup] %s scanned=%d matched=%d "
        "dropped(no_name=%d, no_hours=%d, no_month=%d). "
        "Looking for project_code=%r. Codes seen in column %r: %s",
        sheet_label,
        rows_scanned,
        rows_matched,
        rows_dropped_no_name,
        rows_dropped_no_hours,
        rows_dropped_no_month,
        normalized_project_code,
        project_code_column,
        sorted(code for code in seen_project_codes if code)[:20],
    )


def get_project_cost_followup_from_file(file_id: str, project_code: str) -> ProjectCostTrackingData:
    normalized_project_code = _normalize_project_code(project_code)
    if not normalized_project_code:
        raise ValueError("project_code is required")

    dfs = _load_dataframes_from_file(file_id)
    logger.info(
        "[cost-followup] file_id=%s sheets=%s project_code=%r",
        file_id,
        list(dfs.keys()),
        normalized_project_code,
    )
    base_gta = dfs.get("Base GTA")
    gta_transverse = dfs.get("GTA_Transverse")
    if (base_gta is None or base_gta.empty) and (gta_transverse is None or gta_transverse.empty):
        logger.warning(
            "[cost-followup] neither 'Base GTA' nor 'GTA_Transverse' usable in file_id=%s; "
            "available sheets: %s",
            file_id,
            list(dfs.keys()),
        )
        return ProjectCostTrackingData(
            file_id=file_id,
            project_code=normalized_project_code,
        )

    contributors_by_nni = {
        _normalize_nni(contributor.NNI): contributor
        for contributor in Contributor.get_list()
        if _normalize_nni(contributor.NNI)
    }

    hours_by_contributor: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    contributor_meta: dict[str, dict[str, str | None]] = {}
    total_hours_by_month: dict[str, float] = defaultdict(float)

    _accumulate_sheet_rows(
        df=base_gta,
        normalized_project_code=normalized_project_code,
        project_code_column="Code Activité Paréo",
        contributor_name_column="Nom-Prénom",
        year_column="Année",
        month_column="Mois",
        hours_column="Nb heures",
        nni_column="NNI + Contrat",
        contributors_by_nni=contributors_by_nni,
        hours_by_contributor=hours_by_contributor,
        contributor_meta=contributor_meta,
        total_hours_by_month=total_hours_by_month,
    )

    _accumulate_sheet_rows(
        df=gta_transverse,
        normalized_project_code=normalized_project_code,
        project_code_column="OGM (Code)",
        contributor_name_column="Matricule (Nom - Prénom)",
        year_column="ANNEE (AAAA)",
        month_column="Mois (MM)",
        hours_column="Quantité - Réalisé",
        nni_column="Matricule (Communication - Identifiant NNI)",
        contributors_by_nni=contributors_by_nni,
        hours_by_contributor=hours_by_contributor,
        contributor_meta=contributor_meta,
        total_hours_by_month=total_hours_by_month,
    )

    months = sorted(total_hours_by_month.keys())

    contributors: list[ProjectCostTrackingContributorSeries] = []
    for contributor_key, monthly_hours in hours_by_contributor.items():
        meta = contributor_meta.get(contributor_key, {})
        rounded_monthly_hours = {
            month: round(monthly_hours.get(month, 0.0), 2) for month in months
        }
        total_hours = round(sum(rounded_monthly_hours.values()), 2)
        contributors.append(
            ProjectCostTrackingContributorSeries(
                contributor_key=contributor_key,
                contributor_name=meta.get("contributor_name") or contributor_key,
                contributor_id=meta.get("contributor_id"),
                nni=meta.get("nni"),
                monthly_hours=rounded_monthly_hours,
                total_hours=total_hours,
            )
        )

    contributors.sort(
        key=lambda contributor: (
            -float(contributor.total_hours),
            str(contributor.contributor_name).lower(),
        )
    )

    return ProjectCostTrackingData(
        file_id=file_id,
        project_code=normalized_project_code,
        months=months,
        contributors=contributors,
        total_hours_by_month={
            month: round(total_hours_by_month.get(month, 0.0), 2) for month in months
        },
        total_hours=round(sum(total_hours_by_month.values()), 2),
    )
