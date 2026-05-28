import re
from dataclasses import dataclass
from typing import Any

from .profiles import get_resource_display_profile, kind_from_tool_name, pluralize_kind, singularize
from .routes import RouteIndex, infer_resource_href

COLLECTION_KEYS = ("data", "items", "results", "resources", "contents", "matching_samples", "candidates", "references")
_SINGLE_RESOURCE_WRAPPER_KEYS = (
    "data",
    "item",
    "resource",
    "folder",
    "team",
    "article",
    "dataset",
    "file",
    "perimeter",
    "code",
    "rf",
    "user",
)
_RESOURCE_ID_CANDIDATE_KEYS = (
    "id",
    "resource_id",
    "folder_id",
    "team_id",
    "article_id",
    "dataset_id",
    "file_id",
    "perimeter_id",
    "code_id",
    "rf_id",
    "user_id",
)


@dataclass
class NormalizedResource:
    id: str | None
    kind: str
    title: str
    subtitle: str | None
    href: str | None
    status: str | None
    updated_at: str | None
    metadata: dict[str, Any]
    raw: dict[str, Any]


@dataclass
class NormalizedCollection:
    title: str
    kind: str
    items: list[NormalizedResource]
    total_count: int | None
    page: int | None
    has_next: bool | None
    raw: Any


def unwrap_endpoint_payload(data: Any) -> Any:
    current = data
    seen_ids: set[int] = set()
    while isinstance(current, dict) and id(current) not in seen_ids:
        seen_ids.add(id(current))
        if current.get("error"):
            break
        if "result" in current:
            result = current.get("result")
            if result is None:
                break
            current = result
            continue

        unwrapped_resource = _unwrap_single_resource_envelope(current)
        if unwrapped_resource is current:
            break
        current = unwrapped_resource
    return current


def find_primary_list(data: Any) -> list[Any] | None:
    data = unwrap_endpoint_payload(data)
    if isinstance(data, list):
        return data
    if not isinstance(data, dict):
        return None
    for key in COLLECTION_KEYS:
        value = data.get(key)
        if isinstance(value, list):
            return value
    return None


def short_scalar(value: Any, limit: int = 160) -> str | int | float | bool | None:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        cleaned = re.sub(r"\s+", " ", value).strip()
        if len(cleaned) <= limit:
            return cleaned
        return cleaned[: limit - 3].rstrip() + "..."
    return None


def string_or_none(value: Any) -> str | None:
    scalar = short_scalar(value)
    if scalar in (None, ""):
        return None
    return str(scalar)


def _to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def _to_snake(value: str) -> str:
    value = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", value)
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value)
    return value.replace("-", "_").lower()


def field_value(data: dict[str, Any], field: str) -> Any:
    for candidate in (field, _to_camel(field), _to_snake(field)):
        if candidate in data:
            return data.get(candidate)
    return None


def first_present_string(data: dict[str, Any], fields: tuple[str, ...]) -> str | None:
    for field in fields:
        value = string_or_none(field_value(data, field))
        if value:
            return value
    return None


def _extract_int(data: dict[str, Any], fields: tuple[str, ...]) -> int | None:
    for field in fields:
        value = data.get(field)
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return None


def _extract_bool(data: dict[str, Any], fields: tuple[str, ...]) -> bool | None:
    for field in fields:
        value = data.get(field)
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.lower() in {"true", "false"}:
            return value.lower() == "true"
    return None


def _collection_title(kind: str, total_count: int | None = None) -> str:
    if total_count == 1:
        return singularize(kind).replace("_", " ").title()
    return pluralize_kind(kind).replace("-", " ").replace("_", " ").title()


def normalize_resource(
    item: Any,
    *,
    tool_name: str | None = None,
    route_index: RouteIndex | None = None,
) -> NormalizedResource:
    raw = unwrap_endpoint_payload(item)
    raw = raw if isinstance(raw, dict) else {"value": raw}
    fallback_kind = kind_from_tool_name(tool_name)
    profile = get_resource_display_profile(fallback_kind, raw)
    kind = profile.kind
    resource_id = _extract_resource_id(raw, kind)
    title = first_present_string(raw, profile.title_fields) or "Untitled resource"
    subtitle = first_present_string(raw, profile.subtitle_fields)
    status = first_present_string(raw, profile.status_fields)
    updated_at = first_present_string(raw, profile.date_fields)

    hidden_fields = set(profile.hidden_fields)
    metadata: dict[str, Any] = {}
    for field in profile.metadata_fields:
        if field in hidden_fields:
            continue
        value = short_scalar(field_value(raw, field))
        if value not in (None, ""):
            metadata[field] = value

    return NormalizedResource(
        id=resource_id,
        kind=kind,
        title=title,
        subtitle=subtitle,
        href=infer_resource_href(kind, resource_id, route_index),
        status=status,
        updated_at=updated_at,
        metadata=metadata,
        raw=raw,
    )


def normalize_collection(
    payload: Any,
    *,
    tool_name: str | None = None,
    route_index: RouteIndex | None = None,
) -> NormalizedCollection | None:
    unwrapped = unwrap_endpoint_payload(payload)
    primary_list = find_primary_list(unwrapped)
    if primary_list is None:
        return None

    source_dict = unwrapped if isinstance(unwrapped, dict) else {}
    items = [normalize_resource(item, tool_name=tool_name, route_index=route_index) for item in primary_list]
    kinds = {item.kind for item in items if item.kind}
    kind = next(iter(kinds)) if len(kinds) == 1 else kind_from_tool_name(tool_name)
    total_count = _extract_int(source_dict, ("totalCount", "total_count", "count", "total")) or len(items)
    title = first_present_string(source_dict, ("title", "name", "label")) or _collection_title(kind, total_count)
    return NormalizedCollection(
        title=title,
        kind=kind,
        items=items,
        total_count=total_count,
        page=_extract_int(source_dict, ("page", "currentPage", "current_page")),
        has_next=_extract_bool(source_dict, ("hasNext", "has_next", "hasMore", "has_more")),
        raw=payload,
    )


def compact_item(item: Any, *, tool_name: str | None = None) -> Any:
    if not isinstance(item, dict):
        return short_scalar(item)
    # Database resources have an `id` field — normalise them through the profile system.
    # Arbitrary tool payloads (e.g. validate_rf_reference, extract_rfs_from_prompt) do not;
    # for those, just return the scalar-valued fields directly without forcing a resource shape.
    if "id" in item:
        resource = normalize_resource(item, tool_name=tool_name)
        compact: dict[str, Any] = {"title": resource.title, "kind": resource.kind, "id": resource.id}
        if resource.status:
            compact["status"] = resource.status
        if resource.updated_at:
            compact["updated_at"] = resource.updated_at
        compact.update(resource.metadata)
        return compact
    return {k: short_scalar(v) for k, v in item.items() if short_scalar(v) is not None}


def looks_like_error(payload: Any) -> str | None:
    if isinstance(payload, dict) and payload.get("error"):
        error = payload["error"]
        if isinstance(error, dict):
            return str(error.get("description") or error.get("message") or error.get("title") or error)
        return str(error)
    return None


def looks_like_single_resource(payload: Any) -> bool:
    unwrapped = unwrap_endpoint_payload(payload)
    return isinstance(unwrapped, dict) and find_primary_list(unwrapped) is None and not looks_like_error(unwrapped)


def _unwrap_single_resource_envelope(data: dict[str, Any]) -> Any:
    """Unwrap common endpoint envelopes that wrap one resource under a nested key."""

    for key in _SINGLE_RESOURCE_WRAPPER_KEYS:
        value = data.get(key)
        if isinstance(value, dict):
            return value
    return data


def _extract_resource_id(raw: dict[str, Any], kind: str) -> str | None:
    """Extract the best resource identifier available from a normalized payload."""

    kind_specific_key = f"{_to_snake(kind)}_id" if kind else ""
    candidates = list(_RESOURCE_ID_CANDIDATE_KEYS)
    if kind_specific_key and kind_specific_key not in candidates:
        candidates.insert(1, kind_specific_key)
    return first_present_string(raw, tuple(candidates))
