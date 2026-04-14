# import difflib
# import unicodedata
# import uuid
# from typing import Any

# import pandas as pd

# from libs.acl.methods import create_default_acls
# from libs.acl.models import Who
# from libs.files.models import File as FileModel
# from libs.files.storage.methods import get_file_storage
# from libs.logger import print_warning

# from .models import Contributor


# def _strip_parenthetical_suffix(text: str) -> str:
#     if not isinstance(text, str):
#         return ""
#     return __import__("re").sub(r"\s*\([^)]*\)\s*$", "", text).strip()


# def parse_name(full_name: str) -> tuple[str, str]:
#     if not isinstance(full_name, str):
#         return "", ""
#     s = " ".join(full_name.strip().split())
#     if not s:
#         return "", ""
#     if " - " in s:
#         left, right = s.split(" - ", 1)
#         right_parts = right.split()
#         first = right_parts[-1] if right_parts else ""
#         last = left
#         return first, last
#     parts = s.split()
#     if len(parts) == 1:
#         return "", parts[0]
#     if len(parts) == 2:
#         return parts[1], parts[0]
#     return parts[-1], " ".join(parts[:-1])


# def format_first_last_name(excel_nom_prenom: str) -> str:
#     if not isinstance(excel_nom_prenom, str) or not excel_nom_prenom.strip():
#         return ""
#     first, last = parse_name(excel_nom_prenom)
#     first_fmt = first.title().strip() if first else ""
#     last_fmt = last.upper().strip() if last else ""
#     name = (first_fmt + " " + last_fmt).strip()
#     return name or excel_nom_prenom.strip()


# def infer_category_from_nature_comptable(nature_comptable: str) -> str | None:
#     if nature_comptable is None:
#         return None
#     try:
#         nature_upper = str(nature_comptable).upper().strip()
#     except Exception:
#         return None

#     if nature_upper.startswith("MSTE"):
#         return "E"
#     if nature_upper.startswith("MSTD"):
#         return "D"
#     if nature_upper.startswith("MSTC"):
#         return "C"
#     if nature_upper.startswith("MSTB"):
#         return "B"
#     if nature_upper.startswith("MSTA"):
#         return "A"
#     return None


# def _infer_group_from_time_manager(val: str) -> str:
#     if not isinstance(val, str):
#         return "inconnu"
#     token = val.strip().split()[0].upper()
#     return token


# def _infer_department_from_value(val: str) -> str:
#     if not isinstance(val, str):
#         return "inconnu"
#     s = val.strip().lower()
#     return s


# def _read_excel_bytes_to_dfs(path: str) -> dict[str, pd.DataFrame]:
#     """Read available sheets into a dict of DataFrames"""
#     try:
#         xls = pd.ExcelFile(path)
#         dfs: dict[str, pd.DataFrame] = {}
#         for name in xls.sheet_names:
#             try:
#                 dfs[name] = pd.read_excel(xls, sheet_name=name)
#             except Exception:
#                 print_warning(f"Failed to read sheet {name}")
#         return dfs
#     except Exception as e:
#         print_warning(f"Failed to read excel file: {e}")
#         return {}


# def import_contributors_from_file(file_id: str, only_names: list[str] | None = None, created_by_user_id: str | None = None) -> dict[str, Any]:
#     """Deprecated wrapper. Use `methods.contributors.importer.import_contributors_from_file` instead."""
#     from .methods.contributors.importer import import_contributors_from_file as import_impl

#     return import_impl(file_id, only_names, created_by_user_id)



# def _strip_accents(text: str) -> str:
#     if not isinstance(text, str):
#         return ""
#     return "".join(
#         ch
#         for ch in unicodedata.normalize("NFD", text)
#         if unicodedata.category(ch) != "Mn"
#     )


# def normalize_name_for_match(name: str) -> str:
#     if not isinstance(name, str):
#         return ""
#     s = _strip_parenthetical_suffix(name)
#     s = " ".join(s.strip().split())
#     s = _strip_accents(s)
#     return s.lower()


# def _match_existing_contributor_by_name(excel_name: str) -> tuple[str | None, float]:
#     """Try to find an existing Contributor by name using simple fuzzy matching.
#     Returns (contrib_id, score) where score is 0-100.
#     """
#     candidates = Contributor.get_list()
#     target = normalize_name_for_match(excel_name)
#     best_id = None
#     best_score = 0.0

#     for c in candidates:
#         contrib_name = " ".join(filter(None, [c.first_name or "", c.last_name or ""]))
#         contrib_norm = normalize_name_for_match(contrib_name)
#         if not contrib_norm:
#             continue
#         if contrib_norm == target:
#             return str(c.id), 100.0
#         score = difflib.SequenceMatcher(None, target, contrib_norm).ratio() * 100
#         if score > best_score:
#             best_score = score
#             best_id = str(c.id)
#     return (best_id, best_score)


# def preview_contributors_from_file(file_id: str) -> list[dict]:
#     """Return a preview list for contributors extracted from the file.

#     Each entry contains:
#       - excel_name
#       - first, last
#       - inferred_category, inferred_group, inferred_department
#       - matched_contributor_id (optional)
#       - matched_score
#     """
#     try:
#         file_obj = FileModel.by_id(file_id)
#     except Exception:
#         raise

#     if file_obj is None:
#         raise Exception("file not found")

#     storage = get_file_storage(file_obj.storage_id)
#     local_path = storage.download(
#         storage_folder_path=file_obj.storage_folder_path, alternative="original"
#     )
#     if not local_path:
#         raise Exception("failed to download file")

#     dfs = _read_excel_bytes_to_dfs(local_path)

#     # Build users as in import, but do not insert
#     users: dict[str, dict] = {}

#     if "GTA_Transverse" in dfs:
#         df = dfs["GTA_Transverse"]
#         if "Matricule (Nom - Prénom)" in df.columns:

#             def mode_or_none(series: pd.Series):
#                 m = series.mode(dropna=True)
#                 return m.iloc[0] if not m.empty else None

#             agg = {}
#             if "Quantité - Réalisé" in df.columns:
#                 agg["Quantité - Réalisé"] = "sum"
#             if "Réalisé (€)" in df.columns:
#                 agg["Réalisé (€)"] = "sum"

#             user_stats = (
#                 df.groupby("Matricule (Nom - Prénom)").agg(agg).reset_index()
#                 if agg
#                 else df[["Matricule (Nom - Prénom)"]].drop_duplicates()
#             )

#             if "Nature comptable (Code - désignation)" in df.columns:
#                 nature_by_user = (
#                     df.groupby("Matricule (Nom - Prénom)")[
#                         "Nature comptable (Code - désignation)"
#                     ]
#                     .agg(lambda x: x.mode().iloc[0] if not x.mode().empty else None)
#                     .reset_index()
#                 )
#                 nature_by_user.columns = ["Matricule (Nom - Prénom)", "dominant_nature"]
#                 user_stats = user_stats.merge(
#                     nature_by_user, on="Matricule (Nom - Prénom)", how="left"
#                 )

#             for _, row in user_stats.iterrows():
#                 name = row["Matricule (Nom - Prénom)"]
#                 if pd.isna(name):
#                     continue
#                 users[name] = {
#                     "dominant_nature": (
#                         row.get("dominant_nature") if "dominant_nature" in row else None
#                     ),
#                     "dominant_time_manager": (
#                         row.get("Matricule (Gestionnaire de temps)")
#                         if "Matricule (Gestionnaire de temps)" in row
#                         else None
#                     ),
#                     "dominant_department": None,
#                 }

#     if "Base GTA" in dfs:
#         df = dfs["Base GTA"]
#         if "Nom-Prénom" in df.columns:
#             # prefer base meta for group/department if present
#             if "Groupe OG" in df.columns:
#                 base_groupe = (
#                     df.groupby("Nom-Prénom")["Groupe OG"]
#                     .agg(lambda x: x.mode().iloc[0] if not x.mode().empty else None)
#                     .reset_index()
#                 )
#                 base_groupe.columns = ["Nom-Prénom", "dominant_groupe_og"]
#             else:
#                 base_groupe = None

#             if "Département OG" in df.columns:
#                 base_dept = (
#                     df.groupby("Nom-Prénom")["Département OG"]
#                     .agg(lambda x: x.mode().iloc[0] if not x.mode().empty else None)
#                     .reset_index()
#                 )
#                 base_dept.columns = ["Nom-Prénom", "dominant_dept_og"]
#             else:
#                 base_dept = None

#             for _, row in df[[]].head(0).iterrows() if False else df.iterrows():
#                 # we only use aggregated values at preview so skip iterating full df here
#                 pass

#     # Build preview entries list
#     preview: list[dict] = []
#     for excel_name, data in users.items():
#         base_name = _strip_parenthetical_suffix(excel_name)
#         first, last = parse_name(base_name)
#         inferred_cat = None
#         if data.get("dominant_nature"):
#             inferred_cat = infer_category_from_nature_comptable(
#                 data.get("dominant_nature")
#             )
#         inferred_group = None
#         if data.get("dominant_time_manager"):
#             inferred_group = _infer_group_from_time_manager(
#                 data.get("dominant_time_manager")
#             )
#         inferred_dept = None
#         if data.get("dominant_department"):
#             inferred_dept = _infer_department_from_value(
#                 data.get("dominant_department")
#             )

#         matched_id, score = _match_existing_contributor_by_name(excel_name)

#         preview.append(
#             {
#                 "excel_name": excel_name,
#                 "first": first,
#                 "last": last,
#                 "inferred_category": inferred_cat,
#                 "inferred_group": inferred_group,
#                 "inferred_department": inferred_dept,
#                 "matched_contributor_id": matched_id,
#                 "matched_score": score,
#             }
#         )

#     return preview
