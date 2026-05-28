from collections.abc import Callable
from typing import Any

from mcp.server.fastmcp import FastMCP

from libs.logger.customLogger import print_color


class _LoggedFastMCP(FastMCP):
    """FastMCP subclass that logs every tool registration success or failure."""

    def tool(self, *args: Any, **kwargs: Any) -> Callable:
        original_decorator = super().tool(*args, **kwargs)
        tool_name: str = kwargs.get("name", "")

        def _logging_decorator(fn: Callable) -> Callable:
            name = tool_name or getattr(fn, "__name__", "?")
            doc = getattr(fn, "__doc__", "") or ""
            first_line = next((l.strip() for l in doc.splitlines() if l.strip()), "")
            try:
                result = original_decorator(fn)
                print_color("cyan", f"[MCP] registered {name!r} — {first_line}")
                return result
            except Exception as exc:
                print_color("red", f"[MCP] FAILED to register {name!r}: {exc}")
                return fn

        return _logging_decorator


def create_mcp_router(name: str, description: str = "") -> FastMCP:
    """
    Create an MCP server instance.

    Analogous to create_crud_endpoints for FastAPI routers: this factory creates
    a FastMCP server that can be extended with domain-specific tools via the
    @mcp.tool() decorator.

    Args:
        name: Human-readable name for the MCP server.
        description: Optional description shown in MCP metadata.

    Returns:
        A FastMCP instance ready to have tools registered on it.
        Call .sse_app() on the returned instance to obtain an ASGI app suitable
        for uvicorn (HTTP/SSE transport).
    """
    return _LoggedFastMCP(name)
