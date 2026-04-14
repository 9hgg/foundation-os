import uuid

from libs.acl.methods import create_default_acls
from libs.acl.models import Who

from ...models import Contributor
from .extractors import extract_candidates_from_file
from .matcher import match_candidates
from .models import ImportSummary


def _process_match(m, created_by_user_id: str | None, summary: ImportSummary) -> None:
    c = m.candidate
    if m.matched_contributor_id:
        existing = Contributor.by_id(m.matched_contributor_id)
        if not existing:
            payload = {
                "id": str(uuid.uuid4()),
                "first_name": c.first,
                "last_name": c.last,
                "email": None,
                "category": c.inferred_category,
                "unit": None,
                "department": c.inferred_department,
                "group": c.inferred_group,
                "NNI": c.nni,
            }
            new = Contributor.create(obj_dict=payload)
            if created_by_user_id:
                create_default_acls(resource=new, who=Who.user, who_id=uuid.UUID(created_by_user_id))
            summary.inserted += 1
            return

        update_dict = {}
        if c.inferred_category and not existing.category:
            update_dict["category"] = c.inferred_category
        if c.inferred_group and not existing.group:
            update_dict["group"] = c.inferred_group
        if c.inferred_department and not existing.department:
            update_dict["department"] = c.inferred_department
        existing_nni = getattr(existing, "NNI", None) or getattr(existing, "nni", None)
        if c.nni and not existing_nni:
            update_dict["NNI"] = c.nni

        if update_dict:
            Contributor.patch(obj_id=existing.id, update_dict=update_dict)
            summary.updated += 1
        else:
            summary.skipped += 1
    else:
        payload = {
            "id": str(uuid.uuid4()),
            "first_name": c.first,
            "last_name": c.last,
            "email": None,
            "category": c.inferred_category,
            "unit": None,
            "department": c.inferred_department,
            "group": c.inferred_group,
            "NNI": c.nni,
        }
        new = Contributor.create(obj_dict=payload)
        if created_by_user_id:
            create_default_acls(resource=new, who=Who.user, who_id=uuid.UUID(created_by_user_id))
        summary.inserted += 1


def import_contributors_from_file(file_id: str, only_names: list[str] | None = None, created_by_user_id: str | None = None) -> dict:
    """Orchestrate import from file: extract -> match -> insert/update.

    Returns simple dict summary {inserted, updated, skipped, errors}.
    """
    summary = ImportSummary()
    try:
        candidates = extract_candidates_from_file(file_id)
    except Exception as e:
        return {"error": str(e)}

    # filter selection if only_names provided
    if only_names:
        candidates = [c for c in candidates if c.excel_name in only_names]

    matches = match_candidates(candidates)

    for m in matches:
        c = m.candidate
        try:
            _process_match(m, created_by_user_id, summary)
        except Exception as e:
            summary.errors.append({"name": c.excel_name, "error": str(e)})

    return summary.model_dump()
