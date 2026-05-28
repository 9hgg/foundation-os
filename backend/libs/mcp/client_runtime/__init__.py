"""Public exports for MCP client-runtime helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .answer import build_answer_from_tool_runs
    from .extraction import extract_tool_runs_and_final_message
    from .normalization import (
        NormalizedCollection,
        NormalizedResource,
        find_primary_list,
        normalize_collection,
        normalize_resource,
        unwrap_endpoint_payload,
    )
    from .rendering import render_collection_html
    from .router import create_mcp_client_router
    from .routes import infer_resource_href, parse_route_summary
    from .store import ToolResultStore

__all__ = [
    "NormalizedCollection",
    "NormalizedResource",
    "ToolResultStore",
    "build_answer_from_tool_runs",
    "create_mcp_client_router",
    "extract_tool_runs_and_final_message",
    "find_primary_list",
    "infer_resource_href",
    "normalize_collection",
    "normalize_resource",
    "parse_route_summary",
    "render_collection_html",
    "unwrap_endpoint_payload",
]


def __getattr__(name: str):
    """Lazily import MCP client-runtime helpers to avoid heavy side effects."""

    if name == "build_answer_from_tool_runs":
        from .answer import build_answer_from_tool_runs

        return build_answer_from_tool_runs
    if name == "create_mcp_client_router":
        from .router import create_mcp_client_router

        return create_mcp_client_router
    if name == "extract_tool_runs_and_final_message":
        from .extraction import extract_tool_runs_and_final_message

        return extract_tool_runs_and_final_message
    if name in {
        "NormalizedCollection",
        "NormalizedResource",
        "find_primary_list",
        "normalize_collection",
        "normalize_resource",
        "unwrap_endpoint_payload",
    }:
        from . import normalization as normalization_module

        return getattr(normalization_module, name)
    if name == "render_collection_html":
        from .rendering import render_collection_html

        return render_collection_html
    if name in {"infer_resource_href", "parse_route_summary"}:
        from . import routes as routes_module

        return getattr(routes_module, name)
    if name == "ToolResultStore":
        from .store import ToolResultStore

        return ToolResultStore
    raise AttributeError(name)
