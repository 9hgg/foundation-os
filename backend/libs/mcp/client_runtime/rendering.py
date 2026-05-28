import html
import re
from datetime import datetime
from typing import Any

from .normalization import NormalizedCollection, NormalizedResource


def html_escape(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value), quote=True)


def truncate(value: Any, limit: int = 120) -> str:
    text = re.sub(r"\s+", " ", str(value)).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def format_size(value: Any) -> str:
    if isinstance(value, str) and not value.isdigit():
        return value
    try:
        size = float(value)
    except (TypeError, ValueError):
        return str(value)
    units = ("B", "KB", "MB", "GB", "TB")
    unit_index = 0
    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1
    return f"{int(size)} {units[unit_index]}" if unit_index == 0 else f"{size:.1f} {units[unit_index]}"


def format_datetime_short(value: Any) -> str:
    if value in (None, ""):
        return ""
    text = str(value)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return truncate(text, 32)
    return parsed.strftime("%Y-%m-%d %H:%M")


def _badge_html(value: Any, *, extra_class: str = "") -> str:
    if value in (None, ""):
        return ""
    class_name = f"badge badge-xs badge-soft {extra_class}".strip()
    return f'<span class="{html_escape(class_name)}">{html_escape(value)}</span>'


def _resource_title_html(resource: NormalizedResource) -> str:
    title = html_escape(resource.title)
    if resource.href:
        return f'<a class="link link-primary font-medium" href="{html_escape(resource.href)}">{title}</a>'
    return f'<span class="font-medium">{title}</span>'


def _format_metadata_value(key: str, value: Any) -> str:
    if key in {"size", "size_client", "sizeClient"}:
        return format_size(value)
    return truncate(value, 80)


def _resource_metadata_summary(resource: NormalizedResource, *, max_items: int = 3) -> str:
    parts: list[str] = []
    if resource.subtitle:
        parts.append(truncate(resource.subtitle, 90))
    if resource.updated_at:
        parts.append(f"Updated {format_datetime_short(resource.updated_at)}")
    for key, value in resource.metadata.items():
        if len(parts) >= max_items:
            break
        parts.append(f"{key.replace('_', ' ')}: {_format_metadata_value(key, value)}")
    return " · ".join(part for part in parts if part)


def render_empty_html(title: str) -> str:
    return (
        '<div role="alert" class="alert alert-info alert-soft">'
        f"<span>No matching {html_escape(title.lower())} found.</span>"
        "</div>"
    )


def render_error_html(message: str) -> str:
    return (
        '<div role="alert" class="alert alert-warning alert-soft">'
        f"<span>{html_escape(message)}</span>"
        "</div>"
    )


def render_resource_table_html(collection: NormalizedCollection) -> str:
    rows: list[str] = []
    for resource in collection.items:
        metadata = _resource_metadata_summary(resource)
        rows.append(
            "<tr>"
            f"<td>{_resource_title_html(resource)}</td>"
            f"<td>{_badge_html(resource.kind)}</td>"
            f"<td>{_badge_html(resource.status, extra_class='badge-success') if resource.status else ''}</td>"
            f'<td class="text-base-content/70">{html_escape(metadata)}</td>'
            "</tr>"
        )
    return (
        '<div class="overflow-x-auto">'
        '<table class="table table-xs table-zebra">'
        "<thead><tr><th>Name</th><th>Kind</th><th>Status</th><th>Details</th></tr></thead>"
        f"<tbody>{''.join(rows)}</tbody>"
        "</table>"
        "</div>"
    )


def render_resource_list_html(collection: NormalizedCollection) -> str:
    rows: list[str] = []
    for resource in collection.items:
        metadata = _resource_metadata_summary(resource)
        status = f" {_badge_html(resource.status, extra_class='badge-success')}" if resource.status else ""
        rows.append(
            '<li class="list-row px-0 py-1">'
            '<div class="list-col-grow min-w-0">'
            f"{_resource_title_html(resource)} {_badge_html(resource.kind)}{status}"
            f'<div class="text-xs opacity-70 truncate">{html_escape(metadata)}</div>'
            "</div>"
            "</li>"
        )
    return f'<ul class="list py-0">{"".join(rows)}</ul>'


def render_collection_html(collection: NormalizedCollection) -> str:
    if not collection.items:
        return render_empty_html(collection.title)
    count = collection.total_count if collection.total_count is not None else len(collection.items)
    body = render_resource_table_html(collection) if len(collection.items) > 3 else render_resource_list_html(collection)
    return (
        '<div class="rounded-box border border-base-300 bg-base-100 p-3">'
        '<div class="mb-2 flex items-center justify-between gap-2">'
        f'<h2 class="text-sm font-semibold">{html_escape(collection.title)}</h2>'
        f'<span class="badge badge-sm badge-soft">{html_escape(count)} items</span>'
        "</div>"
        f"{body}"
        "</div>"
    )


def render_summary_card_html(resource: NormalizedResource) -> str:
    metadata_rows = "".join(
        '<div class="flex justify-between gap-3 border-t border-base-200 py-1">'
        f'<span class="text-base-content/60">{html_escape(key.replace("_", " "))}</span>'
        f'<span class="text-right">{html_escape(_format_metadata_value(key, value))}</span>'
        "</div>"
        for key, value in resource.metadata.items()
    )
    subtitle = f'<p class="mt-1 text-sm text-base-content/70">{html_escape(resource.subtitle)}</p>' if resource.subtitle else ""
    status = _badge_html(resource.status, extra_class="badge-success") if resource.status else ""
    return (
        '<div class="rounded-box border border-base-300 bg-base-100 p-3">'
        '<div class="flex items-start justify-between gap-3">'
        f'<div><h2 class="text-sm font-semibold">{_resource_title_html(resource)}</h2>{subtitle}</div>'
        f'<div class="flex shrink-0 gap-1">{_badge_html(resource.kind)}{status}</div>'
        "</div>"
        f'<div class="mt-2 text-xs">{html_escape(_resource_metadata_summary(resource, max_items=4))}</div>'
        f'<div class="mt-2 text-xs">{metadata_rows}</div>'
        "</div>"
    )
