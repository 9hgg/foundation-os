"""
Simple MCP Client Demo

Connects to all MCP servers declared in the MCP_SERVER_LIST environment variable
and lists available tools.  Demonstrates the full auth-aware flow:

1. Call ``login(email, password)`` to obtain a JWT.
2. Call each discovered ``list_*`` CRUD tool (ACL-filtered, page 1).
3. Fall back to ``search_articles`` or the first available tool if no list tools exist.

Configuration
-------------
Set MCP_SERVER_LIST in your .env file (or environment) to a JSON array of server
definitions.  Each entry must contain at least a ``url`` key pointing to the SSE
endpoint of the MCP server.  Optionally supply ``email`` and ``password`` to
demonstrate authenticated tool calls.  Example::

    MCP_SERVER_LIST='[{"name": "Curiosity", "url": "http://localhost:8023/sse", "email": "me@example.com", "password": "secret"}]'

Usage
-----
    # from the backend/ directory:
    uv run python -m libs.mcp.demos.simple_mcp_client
"""

import asyncio
import json

from mcp import ClientSession
from mcp.client.sse import sse_client
from rich import print

from libs.mcp.config import MCP_SETTINGS


def _parse_result(result) -> list:
    return [c.model_dump() for c in result.content]


async def _connect_and_demo(server_config: dict) -> None:
    url: str | None = server_config.get("url")
    name: str = server_config.get("name", url or "unknown")
    demo_email: str | None = server_config.get("email")
    demo_password: str | None = server_config.get("password")

    if not url:
        print(f"⚠️  Skipping server '{name}': no 'url' key in config.")
        return

    print(f"\n🔌 Connecting to MCP server '{name}' at {url} …")

    async with sse_client(url) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools_result = await session.list_tools()
            tools = tools_result.tools
            print(f"📋 Available tools ({len(tools)}):")
            for tool in tools:
                print(f"   • {tool.name}: {(tool.description or '(no description)')[:80]}")

            if not tools:
                print("   (no tools registered on this server)")
                return

            tool_names = {t.name for t in tools}

            # --- Auth demo ---
            auth_token: str | None = None
            if demo_email and demo_password and "login" in tool_names:
                print(f"\n🔑 Logging in as {demo_email} …")
                login_result = await session.call_tool(
                    "login", {"email": demo_email, "password": demo_password}
                )
                login_data = json.loads(login_result.content[0].text)
                if "auth_token" in login_data:
                    auth_token = login_data["auth_token"]
                    print(f"   ✅ Logged in – user_id={login_data.get('user_id')}")

                    if "get_current_user" in tool_names:
                        me_result = await session.call_tool(
                            "get_current_user", {"auth_token": auth_token}
                        )
                        me_data = json.loads(me_result.content[0].text)
                        print(f"   👤 Current user: {me_data}")
                else:
                    print(f"   ⚠️  Login failed: {login_data}")

            # --- CRUD list tools demo ---
            # Discover all list_* tools registered via enlist_crud_operations_as_mcp_tools
            list_tool_names = sorted(n for n in tool_names if n.startswith("list_"))
            if list_tool_names:
                print(f"\n📦 Found {len(list_tool_names)} CRUD list tool(s): {list_tool_names}")
                for tool_name in list_tool_names:
                    args: dict = {"page": 1, "page_size": 5}
                    if auth_token:
                        args["auth_token"] = auth_token
                    print(f"\n🔧 Calling '{tool_name}' (page=1, page_size=5, auth={bool(auth_token)}) …")
                    try:
                        result = await session.call_tool(tool_name, args)
                        print("   ✅ Result:")
                        print(
                            json.dumps(_parse_result(result), indent=2, default=str)
                        )
                    except Exception as exc:
                        print(f"   ⚠️  Error: {exc}")
                return

            # --- Fallback: ACL-aware article search ---
            if "search_articles" in tool_names:
                args = {"query": ""}
                if auth_token:
                    args["auth_token"] = auth_token
                print(f"\n🔍 Calling 'search_articles' with auth={bool(auth_token)} …")
                result = await session.call_tool("search_articles", args)
                print("✅ Result:")
                print(json.dumps(_parse_result(result), indent=2, default=str))
                return

            # --- Last resort: first available tool ---
            first_tool = tools[0]
            demo_args: dict = {}
            if first_tool.inputSchema and "properties" in first_tool.inputSchema:
                for param_name in first_tool.inputSchema["properties"]:
                    demo_args[param_name] = "test"
                    break
            print(f"\n🔧 Calling '{first_tool.name}' with args {demo_args} …")
            result = await session.call_tool(first_tool.name, demo_args)
            print("✅ Result:")
            print(json.dumps(_parse_result(result), indent=2, default=str))


async def _run_all() -> None:
    servers = MCP_SETTINGS.MCP_SERVER_LIST
    if not servers:
        print(
            "⚠️  MCP_SERVER_LIST is empty.\n"
            "    Set it in your .env, e.g.:\n"
            '    MCP_SERVER_LIST=\'[{"name": "Curiosity", "url": "http://localhost:8023/sse"}]\'\n'
        )
        return

    for server_config in servers:
        await _connect_and_demo(server_config)


def main() -> None:
    asyncio.run(_run_all())


if __name__ == "__main__":
    main()
