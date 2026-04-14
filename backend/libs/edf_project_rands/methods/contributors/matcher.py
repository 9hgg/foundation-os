from ...models import Contributor
from .models import Candidate, Match


def match_candidates(
    candidates: list[Candidate], existing_contributors: list[Contributor] | None = None
) -> list[Match]:
    """Match candidates to existing contributors using NNI + category + group rule.

    Matching strategy:
    1. Full match on (NNI, category, group)
    2. Fallback to unique NNI-only match when full match unavailable

    Returns a list of Match objects corresponding to each candidate in input order.
    """
    if existing_contributors is None:
        existing_contributors = Contributor.get_list()

    nni_map: dict[str, list[Contributor]] = {}
    for existing_contributor in existing_contributors:
        if not existing_contributor.NNI:
            continue
        nni_map.setdefault(existing_contributor.NNI, []).append(existing_contributor)

    matches: list[Match] = []
    for candidate in candidates:
        if not candidate.nni:
            # Cannot match without NNI
            matches.append(
                Match(
                    excel_name=candidate.excel_name,
                    candidate=candidate,
                    matched_contributor_id=None,
                    matched_by=None,
                )
            )
            continue
        possible_matches = nni_map.get(candidate.nni, [])
        if not possible_matches:
            # No matches found
            matches.append(
                Match(
                    excel_name=candidate.excel_name,
                    candidate=candidate,
                    matched_contributor_id=None,
                    matched_by=None,
                )
            )
            continue
        # we have possible matches by NNI
        # Try full match on (NNI, category, group)
        nni_category_group_matches = [
            c
            for c in possible_matches
            if c.category == candidate.inferred_category
            and c.group == candidate.inferred_group
        ]
        if len(nni_category_group_matches) >= 1:
            matches.append(
                Match(
                    excel_name=candidate.excel_name,
                    candidate=candidate,
                    matched_contributor_id=str(nni_category_group_matches[0].id),
                    matched_by="full",
                )
            )
            continue
        # Fallback to NNI and category
        nni_category_matches = [
            c for c in possible_matches if c.category == candidate.inferred_category
        ]
        if len(nni_category_matches) >= 1:
            matches.append(
                Match(
                    excel_name=candidate.excel_name,
                    candidate=candidate,
                    matched_contributor_id=str(nni_category_matches[0].id),
                    matched_by="nni_category",
                )
            )
            continue
        # Fallback to NNI-only match (we already confirmed list is non-empty)
        matches.append(
            Match(
                excel_name=candidate.excel_name,
                candidate=candidate,
                matched_contributor_id=str(possible_matches[0].id),
                matched_by="nni",
            )
        )
    return matches