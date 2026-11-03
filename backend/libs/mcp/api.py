from collections.abc import Callable
from typing import Any

import structlog
from mcp.server.fastmcp import FastMCP

_logger = structlog.get_logger(__name__)


class _LoggedFastMCP(FastMCP):
    """FastMCP subclass that logs every tool registration success or failure."""

    def tool(self, *args: Any, **kwargs: Any) -> Callable:
        original_decorator = super().tool(*args, **kwargs)
        tool_name: str = kwargs.get("name", "")

        def _logging_decorator(fn: Callable) -> Callable:
            name = tool_name or getattr(fn, "__name__", "?")
            doc = getattr(fn, "__doc__", "") or ""
            first_line = next((line.strip() for line in doc.splitlines() if line.strip()), "")
            try:
                result = original_decorator(fn)
            except Exception:
                _logger.exception("mcp_tool_registration_failed", tool_name=name)
                return fn
            else:
                _logger.info("mcp_tool_registered", tool_name=name, description=first_line)
                return result

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
