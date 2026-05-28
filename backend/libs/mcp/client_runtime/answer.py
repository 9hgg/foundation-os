import json
from typing import Any

from .normalization import (
    compact_item,
    looks_like_error,
    looks_like_single_resource,
    normalize_collection,
    normalize_resource,
    unwrap_endpoint_payload,
)
from .rendering import render_collection_html, render_error_html, render_summary_card_html
from .routes import RouteIndex
from .store import STORE_RESULT_PREVIEW_LIMIT, ToolResultStore


def _payload_from_tool_run(tool_run: dict[str, Any], result_store: ToolResultStore) -> Any:
    result = tool_run.get("result")
    if isinstance(result, dict) and result.get("stored_tool_result"):
        result_ref = result.get("result_ref")
        if isinstance(result_ref, str):
            payload = result_store.get_payload(result_ref)
            if payload is not None:
                return payload
    return result


def _domain_tool_runs(tool_runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    domain_runs = [
        run
        for run in tool_runs
        if not run.get("is_local_result_tool") and run.get("status") == "ok"
    ]
    if domain_runs:
        return domain_runs
    return [run for run in tool_runs if run.get("status") == "ok"]


def _group_collection_html(collection, *, route_index: RouteIndex) -> list[str]:
    del route_index
    grouped: dict[str, list] = {}
    for item in collection.items:
        grouped.setdefault(item.kind, []).append(item)
    if len(grouped) <= 1:
        return [render_collection_html(collection)]

    from .normalization import NormalizedCollection
    from .profiles import pluralize_kind

    return [
        render_collection_html(
            NormalizedCollection(
                title=pluralize_kind(kind).replace("-", " ").replace("_", " ").title(),
                kind=kind,
                items=items,
                total_count=len(items),
                page=None,
                has_next=None,
                raw=collection.raw,
            )
        )
        for kind, items in grouped.items()
    ]


def build_answer_from_tool_runs(
    *,
    query: str,
    tool_runs: list[dict[str, Any]],
    result_store: ToolResultStore,
    route_index: RouteIndex,
) -> str | None:
    del query
    useful_runs = _domain_tool_runs(tool_runs)
    if not useful_runs:
        error_runs = [run for run in tool_runs if run.get("status") == "error"]
        if error_runs:
            payload = error_runs[-1].get("result")
            return render_error_html(looks_like_error(payload) or str(payload))
        return None

    collection_runs = [
        run
        for run in useful_runs
        if normalize_collection(
            _payload_from_tool_run(run, result_store),
            tool_name=str(run.get("tool_name", "")),
            route_index=route_index,
        )
        is not None
    ]
    runs_to_render = collection_runs or [useful_runs[-1]]
    rendered_blocks: list[str] = []

    for run in runs_to_render:
        payload = _payload_from_tool_run(run, result_store)
        error_message = looks_like_error(payload)
        if error_message:
            rendered_blocks.append(render_error_html(error_message))
            continue

        collection = normalize_collection(payload, tool_name=str(run.get("tool_name", "")), route_index=route_index)
        if collection is not None:
            rendered_blocks.extend(_group_collection_html(collection, route_index=route_index))
            continue

        if looks_like_single_resource(payload):
            resource = normalize_resource(
                unwrap_endpoint_payload(payload),
                tool_name=str(run.get("tool_name", "")),
                route_index=route_index,
            )
            rendered_blocks.append(render_summary_card_html(resource))

    if not rendered_blocks:
        return None
    return '<div class="space-y-3">' + "".join(rendered_blocks) + "</div>"


def compact_summary_for_tool_run(
    tool_run: dict[str, Any],
    result_store: ToolResultStore,
    route_index: RouteIndex,
) -> dict[str, Any]:
    payload = _payload_from_tool_run(tool_run, result_store)
    collection = normalize_collection(payload, tool_name=str(tool_run.get("tool_name", "")), route_index=route_index)
    if collection is not None:
        return {
            "type": "collection",
            "title": collection.title,
            "kind": collection.kind,
            "count": collection.total_count,
            "items": [
                {
                    "title": item.title,
                    "kind": item.kind,
                    "status": item.status,
                    "updated_at": item.updated_at,
                    "metadata": item.metadata,
                    "href": item.href,
                }
                for item in collection.items[:STORE_RESULT_PREVIEW_LIMIT]
            ],
        }
    if looks_like_single_resource(payload):
        resource = normalize_resource(unwrap_endpoint_payload(payload), tool_name=str(tool_run.get("tool_name", "")), route_index=route_index)
        return {
            "type": "resource",
            "title": resource.title,
            "kind": resource.kind,
            "status": resource.status,
            "updated_at": resource.updated_at,
            "metadata": resource.metadata,
            "href": resource.href,
        }
    error_message = looks_like_error(payload)
    if error_message:
        return {"type": "error", "message": error_message}
    return {"type": "unknown", "preview": compact_item(payload, tool_name=str(tool_run.get("tool_name", "")))}


def compact_synthesis_payload(
    *,
    query: str,
    tool_runs: list[dict[str, Any]],
    result_store: ToolResultStore,
    route_index: RouteIndex,
) -> str:
    return json.dumps(
        {
            "query": query,
            "tool_results": [
                {
                    "tool_name": run.get("tool_name"),
                    "args": run.get("args", {}),
                    "status": run.get("status"),
                    "summary": compact_summary_for_tool_run(run, result_store, route_index),
                }
                for run in tool_runs
            ],
        },
        ensure_ascii=False,
        default=str,
    )
