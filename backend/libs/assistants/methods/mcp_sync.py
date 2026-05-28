"""Synchronous wrappers around the async MCP protocol for use with ralph tools."""

import asyncio
import json
import re
import traceback
from typing import Any

from mcp import ClientSession
from mcp.client.sse import sse_client

from libs.logger.customLogger import print, print_color
from libs.ralph.tools.registry import Tool

from ..constants import MAX_TOOL_CALLS


def _flatten_exception_messages(exc: BaseException) -> list[str]:
    """Return readable leaf error messages, including ExceptionGroup children."""

    children = getattr(exc, "exceptions", None)
    if not children:
        message = f"{type(exc).__name__}: {exc}"
        return [message]

    flattened: list[str] = []
    for child in children:
        if isinstance(child, BaseException):
            flattened.extend(_flatten_exception_messages(child))
    return flattened or [f"{type(exc).__name__}: {exc}"]


def _extract_json_payload(tool_result: Any) -> Any:
    """Extract a JSON-serialisable value from an MCP ``CallToolResult``."""

    structured = getattr(tool_result, "structuredContent", None)
    if structured is not None:
        return structured

    content_blocks = getattr(tool_result, "content", None)
    if not isinstance(content_blocks, list):
        return None

    for block in content_blocks:
        text = getattr(block, "text", None)
        if not isinstance(text, str):
            continue
        try:
            parsed = json.loads(text)
            if parsed is not None:
                return parsed
        except (json.JSONDecodeError, ValueError):
            continue

    return None


def _list_mcp_tools_sync(mcp_server_url: str) -> list[Any]:
    """Fetch the tool list from an MCP server synchronously via a fresh SSE connection."""

    async def _run() -> list[Any]:
        async with (
            sse_client(mcp_server_url) as (read, write),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            result = await session.list_tools()
            return result.tools

    return asyncio.run(_run())


def _call_mcp_tool_sync(
    mcp_server_url: str, tool_name: str, tool_args: dict[str, Any]
) -> Any:
    """Call one MCP tool synchronously, opening a fresh SSE connection per call."""

    async def _run() -> Any:
        async with (
            sse_client(mcp_server_url) as (read, write),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            result = await session.call_tool(tool_name, tool_args)
            return _extract_json_payload(result)

    return asyncio.run(_run())


def _schema_without_auth_token(schema: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of the input schema with the *auth_token* parameter removed."""

    result: dict[str, Any] = dict(schema)
    if "properties" in result:
        result["properties"] = {
            k: v for k, v in result["properties"].items() if k != "auth_token"
        }
    if "required" in result:
        result["required"] = [f for f in result["required"] if f != "auth_token"]
    return result


def _description_without_auth_token(description: str) -> str:
    """Strip auth-token usage notes from tool descriptions shown to the model."""

    description = re.sub(
        r"\n\s*auth_token:.*?(?=\n\s*\w[\w\s-]*:|\n\s*Returns:|\n\s*Example prompts:|\Z)",
        "",
        description,
        flags=re.IGNORECASE | re.DOTALL,
    )
    description = re.sub(r"\n{3,}", "\n\n", description)
    return description.strip()


def _short_description(description: str) -> str:
    """Return a compact single-line tool summary for planning."""

    compact = description.strip().split("\n\n", 1)[0].strip()
    compact = re.sub(r"\s+", " ", compact)
    return compact or "No description."


def create_mcp_ralph_tools(
    *,
    mcp_server_url: str,
    auth_token: str | None,
    max_tool_calls: int = MAX_TOOL_CALLS,
) -> list[Tool]:
    """Return a ``Tool`` list created from the MCP server's advertised tools.

    - Auth tools (``login``, ``get_current_user``) are skipped when *auth_token* is set.
    - The *auth_token* is injected automatically into each tool call when the tool
      schema advertises an ``auth_token`` parameter.
    - Results are wrapped so that call counts are enforced across the whole task run.
    """

    _AUTH_ONLY_TOOLS = frozenset({"login", "get_current_user"})
    # Single counter shared by all wrappers to enforce the global per-task limit.
    _total_calls: list[int] = [0]

    try:
        mcp_tools_info = _list_mcp_tools_sync(mcp_server_url)
    except Exception as exc:
        causes = _flatten_exception_messages(exc)
        print_color(
            "yellow",
            f"[assistant:mcp] could not list tools from {mcp_server_url}: {type(exc).__name__}",
        )
        for cause in causes[:5]:
            print_color("yellow", f"[assistant:mcp] cause: {cause}")
        traceback_summary = traceback.format_exc(limit=6)
        if traceback_summary.strip():
            print_color("yellow", f"[assistant:mcp] traceback:\n{traceback_summary}")
        return []

    ralph_tools: list[Tool] = []

    for mcp_tool in mcp_tools_info:
        tool_name = str(getattr(mcp_tool, "name", "unknown"))

        if auth_token and tool_name in _AUTH_ONLY_TOOLS:
            continue

        tool_description = _description_without_auth_token(str(getattr(mcp_tool, "description", "No description")))
        input_schema: dict[str, Any] = getattr(mcp_tool, "inputSchema", {}) or {}
        output_schema: dict[str, Any] | None = getattr(mcp_tool, "outputSchema", None) or None

        def _make_wrapper(tn: str, schema: dict[str, Any]) -> Any:
            def wrapper(**kwargs: Any) -> Any:
                _total_calls[0] += 1
                if _total_calls[0] > max_tool_calls:
                    return {
                        "error": (
                            f"Tool call limit exceeded ({max_tool_calls}). "
                            "Stop calling tools and synthesize an answer from what you already have."
                        )
                    }

                call_args = dict(kwargs)

                # Inject auth token automatically
                if auth_token and "auth_token" in schema.get("properties", {}):
                    call_args["auth_token"] = auth_token

                # Coerce string values to list for array-typed parameters
                for param, param_info in schema.get("properties", {}).items():
                    is_array = param_info.get("type") == "array" or any(
                        sub.get("type") == "array"
                        for sub in param_info.get("anyOf", [])
                    )
                    if not is_array:
                        continue
                    val = call_args.get(param)
                    if isinstance(val, str):
                        call_args[param] = [val]
                        print_color(
                            "yellow",
                            f"[assistant:mcp] {tn}: coerced '{param}' str→list",
                        )
                    elif isinstance(val, dict):
                        call_args[param] = [
                            {
                                "field": k,
                                **(v if isinstance(v, dict) else {"value": v}),
                            }
                            for k, v in val.items()
                        ]
                        print_color(
                            "yellow",
                            f"[assistant:mcp] {tn}: coerced '{param}' dict→list",
                        )

                try:
                    print(f"[assistant:mcp] → {tn}({call_args})")
                    return _call_mcp_tool_sync(mcp_server_url, tn, call_args)
                except Exception as exc:
                    return {"error": type(exc).__name__, "tool": tn}

            return wrapper

        ralph_tools.append(
            Tool(
                name=tool_name,
                description=tool_description,
                fn=_make_wrapper(tool_name, input_schema),
                short_description=_short_description(tool_description),
                schema=_schema_without_auth_token(input_schema),
                output_schema=output_schema,
            )
        )

    return ralph_tools
