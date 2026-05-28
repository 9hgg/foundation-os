"""
MCP tools specific to the assistant domain.

Call ``register_assistant_mcp_tools`` to expose these capabilities on an
MCP server so the assistant task can call them during agentic loops.
"""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP


def register_assistant_mcp_tools(mcp: FastMCP) -> None:
    """
    Register assistant-specific MCP tools on *mcp*.

    Currently exposes:
      - ``navigate_to_route``: resolve a frontend application route with
        optional path/query parameters and return the full URL string.

    Args:
        mcp: The FastMCP server instance to register tools on.
    """

    @mcp.tool()
    def navigate_to_route(
        route: str,
        path_params: dict[str, str] | None = None,
        query_params: dict[str, str] | None = None,
    ) -> dict[str, str]:
        """
        Build and return a navigation URL for the frontend application.

        Use this tool when the user should be directed to a specific page or
        resource inside the application, for example after creating a resource
        or to point the user to an existing item.

        The tool resolves *path_params* inside the route template (e.g.
        ``:id`` or ``:articleId``) and appends *query_params* as a query
        string.  It returns a plain dict so the LLM can embed the URL in its
        markdown reply as a clickable link.

        Args:
            route: Application route path.  Must start with ``/``.  May
                contain colon-prefixed dynamic segments such as
                ``/articles/:articleId`` or ``/host/dashboard/files/:fileId``.
            path_params: Optional mapping of dynamic segment names (without
                the leading colon) to their values, e.g.
                ``{"articleId": "abc-123"}``.
            query_params: Optional mapping of query-string keys to values,
                e.g. ``{"tab": "editor", "highlight": "true"}``.

        Returns:
            A dict with:
            - ``url``: The fully-resolved URL string (path + query string).
            - ``route``: The resolved path (dynamic segments substituted).
            - ``query_string``: The raw query string (empty if no query params).

        Examples:
            navigate_to_route("/articles/:articleId", {"articleId": "abc-123"})
            → {"url": "/articles/abc-123", "route": "/articles/abc-123", "query_string": ""}

            navigate_to_route("/host/dashboard", query_params={"tab": "files"})
            → {"url": "/host/dashboard?tab=files", "route": "/host/dashboard", "query_string": "tab=files"}
        """
        # Ensure leading slash
        if not route.startswith("/"):
            route = "/" + route

        # Substitute path parameters (e.g. :articleId → actual value)
        resolved_route = route
        for key, value in (path_params or {}).items():
            resolved_route = resolved_route.replace(f":{key}", value)

        # Build query string
        query_string = ""
        if query_params:
            query_string = "&".join(f"{k}={v}" for k, v in query_params.items())

        url = f"{resolved_route}?{query_string}" if query_string else resolved_route

        return {
            "url": url,
            "route": resolved_route,
            "query_string": query_string,
        }
