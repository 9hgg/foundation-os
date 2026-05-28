import re
from typing import Any

from libs.mcp.display import ResourceDisplayProfile


def singularize(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
    if normalized.endswith("ies") and len(normalized) > 3:
        return normalized[:-3] + "y"
    if normalized.endswith("ses") and len(normalized) > 3:
        return normalized[:-2]
    if normalized.endswith("s") and not normalized.endswith("ss") and len(normalized) > 1:
        return normalized[:-1]
    return normalized or "resource"


def pluralize_kind(kind: str) -> str:
    kind = singularize(kind)
    aliases = {
        "rf": "rfs",
        "rfs": "rfs",
        "design_system": "design-systems",
        "billing_event": "billing-events",
        "mail_template": "mail-templates",
        "mail_settings": "mail-settings",
        "mail_attempt": "mail-attempts",
    }
    if kind in aliases:
        return aliases[kind]
    if kind.endswith("y"):
        return kind[:-1] + "ies"
    if kind.endswith("s"):
        return kind + "es"
    return kind + "s"


def kind_from_tool_name(tool_name: str | None) -> str:
    if not tool_name:
        return "resource"
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", tool_name).strip("_").lower()
    for prefix in ("list_", "get_", "create_", "update_", "delete_", "patch_", "search_", "add_", "read_"):
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix) :]
            break
    return singularize(normalized)


def get_resource_display_profile(kind: str | None, raw: dict[str, Any] | None = None) -> ResourceDisplayProfile:
    try:
        from libs.resource import ResourceManager
    except Exception:
        ResourceManager = None  # type: ignore[assignment]

    detected_kind = singularize(kind or "")
    if detected_kind and ResourceManager is not None and ResourceManager.is_resource_registered(detected_kind):
        resource_cls = ResourceManager.get_resource_by_kind(detected_kind)
        profile = getattr(resource_cls, "__mcp_display__", None)
        if isinstance(profile, ResourceDisplayProfile):
            return profile
        return ResourceDisplayProfile(
            kind=detected_kind,
            title_fields=("title", "name", "label", "subject", "email", "id"),
            subtitle_fields=("description", "summary"),
            status_fields=("status", "state"),
            date_fields=("time_updated", "updated_at", "time_created", "created_at"),
            metadata_fields=("kind",),
        )

    if raw:
        for key in ("resourceKind", "resource_kind", "type", "model", "entity_type", "kind"):
            value = raw.get(key)
            if isinstance(value, str) and value.strip():
                detected_kind = singularize(value)
                break
        if detected_kind and ResourceManager is not None and ResourceManager.is_resource_registered(detected_kind):
            resource_cls = ResourceManager.get_resource_by_kind(detected_kind)
            profile = getattr(resource_cls, "__mcp_display__", None)
            if isinstance(profile, ResourceDisplayProfile):
                return profile

    return ResourceDisplayProfile(
        kind=detected_kind or "resource",
        title_fields=("title", "name", "canonical", "label", "subject", "email", "username", "key", "id"),
        subtitle_fields=("description", "summary", "system_label"),
        status_fields=("status", "state"),
        date_fields=("time_updated", "updated_at", "time_created", "created_at"),
        metadata_fields=("kind", "role", "email"),
    )
