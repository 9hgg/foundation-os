import hashlib
import json
import operator
import re
from pathlib import Path
from textwrap import dedent
from typing import Annotated, Any, TypedDict

from fastapi import APIRouter, Depends
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import StructuredTool
from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from mcp import ClientSession
from mcp.client.sse import sse_client
from pydantic import BaseModel

from libs.logger.customLogger import print, print_color
from libs.mcp.config import MCP_SETTINGS
from libs.users.methods import get_current_user_optional
from libs.users.models import User
from libs.utils import tokens
from libs.utils.types import EndpointError, EndpointOutput

from .answer import build_answer_from_tool_runs, compact_synthesis_payload
from .extraction import extract_tool_runs_and_final_message
from .rendering import render_error_html
from .routes import parse_route_summary
from .store import ToolResultStore

AUTH_TOKEN_CONTEXT_KEY = "auth"  # noqa: S105 - token context label, not a secret
MAX_TOOL_CALLS = 25


def _estimate_token_count(llm: BaseChatModel, text: str) -> int:
    try:
        return int(llm.get_num_tokens(text))
    except Exception:
        return max(1, len(text) // 4)


def _slugify_cache_part(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9_-]+", "-", value)
    return value.strip("-") or "app"


async def get_frontend_route_summary(*, llm: BaseChatModel, app_name: str, frontend_route_config_path: Path) -> str:
    try:
        route_config_source = frontend_route_config_path.read_text(encoding="utf-8")
    except OSError as exc:
        return f"Unable to load route config from {frontend_route_config_path}: {exc}"

    route_config_hash = hashlib.sha256(route_config_source.encode("utf-8")).hexdigest()[:16]
    cache_path = Path("/tmp") / f"{_slugify_cache_part(app_name)}-angular-route-{route_config_hash}-v4.md"  # noqa: S108
    if cache_path.exists():
        try:
            return cache_path.read_text(encoding="utf-8")
        except OSError:
            pass

    summary_prompt = dedent(
        f"""
        Extract all navigable URL patterns from the Angular Route[] config below.
        Output ONLY a plain-text list, one route per line, in the exact format:
        - <path> : <short purpose>

        Rules:
        - Include dynamic segments such as :teamId, :articleId, :datasetId.
        - Omit redirect-only and wildcard (**) routes.
        - Do not invent routes not present in the source.

        Angular route config:
        {route_config_source}
        """
    )
    print_color("red", f"Angular route summary prompt size: {_estimate_token_count(llm, summary_prompt)} tokens")
    response = await llm.ainvoke(summary_prompt)
    summary = getattr(response, "content", str(response))
    if not isinstance(summary, str):
        summary = str(summary)
    summary = summary.strip()
    try:
        cache_path.write_text(summary, encoding="utf-8")
        print(f"Cached Angular route summary at {cache_path}")
    except OSError as exc:
        print_color("red", f"Unable to cache Angular route summary at {cache_path}: {exc}")
    return summary


def get_primary_mcp_server_url() -> str | None:
    for server in MCP_SETTINGS.MCP_SERVER_LIST:
        server_url = server.get("url")
        if isinstance(server_url, str) and server_url.strip():
            return server_url
    return None


def extract_json_payload(tool_result: Any) -> Any:
    structured_content = getattr(tool_result, "structuredContent", None)
    if structured_content is not None:
        return structured_content

    content_blocks = getattr(tool_result, "content", None)
    if not isinstance(content_blocks, list):
        return None
    parsed_null = False
    for content_block in content_blocks:
        text_payload = getattr(content_block, "text", None)
        if not isinstance(text_payload, str):
            continue
        try:
            parsed = json.loads(text_payload)
            if parsed is None:
                parsed_null = True
                continue
            return parsed
        except json.JSONDecodeError:
            continue
    if parsed_null:
        return None
    return None


def schema_without_auth(schema: dict[str, Any]) -> dict[str, Any]:
    result = dict(schema)
    if "properties" in result:
        result["properties"] = {k: v for k, v in result["properties"].items() if k != "auth_token"}
    if "required" in result:
        result["required"] = [f for f in result["required"] if f != "auth_token"]
    return result


def create_result_store_tools(result_store: ToolResultStore) -> list[StructuredTool]:
    def read_tool_result(result_ref: str, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        """Read one page from a previously stored large tool result."""
        return result_store.read(result_ref=result_ref, page=page, page_size=page_size)

    def get_tool_result_item(result_ref: str, item_id: str) -> dict[str, Any]:
        """Read one item by id from a previously stored large list result."""
        return result_store.get_item(result_ref=result_ref, item_id=item_id)

    def search_tool_result(result_ref: str, query: str, limit: int = 20) -> dict[str, Any]:
        """Search inside a previously stored large tool result."""
        return result_store.search(result_ref=result_ref, query=query, limit=limit)

    def count_tool_result_items(result_ref: str) -> dict[str, Any]:
        """Count items in a previously stored large list result."""
        return result_store.count_items(result_ref=result_ref)

    return [
        StructuredTool.from_function(read_tool_result),
        StructuredTool.from_function(get_tool_result_item),
        StructuredTool.from_function(search_tool_result),
        StructuredTool.from_function(count_tool_result_items),
    ]


async def create_langchain_tools_from_mcp(
    *,
    mcp_session: ClientSession,
    auth_token: str | None,
    input_schemas: dict[str, Any],
    result_store: ToolResultStore,
    tool_call_counter: dict[str, int],
) -> list[StructuredTool]:
    tools_result = await mcp_session.list_tools()
    auth_tool_names = {"login", "get_current_user"}
    langchain_tools: list[StructuredTool] = []

    for mcp_tool in tools_result.tools:
        tool_name = str(getattr(mcp_tool, "name", "unknown"))
        if auth_token and tool_name in auth_tool_names:
            continue
        tool_description = str(getattr(mcp_tool, "description", "No description"))
        input_schema = getattr(mcp_tool, "inputSchema", {})
        input_schemas[tool_name] = input_schema

        def _make_tool_executor(tn: str, schema: dict[str, Any]) -> Any:
            async def _tool_executor(**kwargs: Any) -> Any:
                tool_call_counter["count"] = tool_call_counter.get("count", 0) + 1
                if tool_call_counter["count"] > MAX_TOOL_CALLS:
                    return {"error": f"Tool call limit exceeded ({MAX_TOOL_CALLS}).", "tool": tn}
                tool_args = dict(kwargs)
                if auth_token and "auth_token" in schema.get("properties", {}):
                    tool_args["auth_token"] = auth_token
                # Normalise array-typed args that the LLM occasionally misformats.
                # list[X] | None is serialised as anyOf:[{type:array}, {type:null}]
                # so we must check both the top-level type and anyOf branches.
                for param, info in schema.get("properties", {}).items():
                    is_array = info.get("type") == "array" or any(
                        sub.get("type") == "array" for sub in info.get("anyOf", [])
                    )
                    if not is_array:
                        continue
                    val = tool_args.get(param)
                    if isinstance(val, str):
                        # "name:horloge:partial" → ["name:horloge:partial"]
                        tool_args[param] = [val]
                        print_color("yellow", f"[MCP] {tn}: coerced '{param}' str→list")
                    elif isinstance(val, dict):
                        # {"public_filename": {"match_type": "partial", "value": "horloge"}}
                        # → [{"field": "public_filename", "match_type": "partial", "value": "horloge"}]
                        tool_args[param] = [
                            {"field": k, **(v if isinstance(v, dict) else {"value": v})}
                            for k, v in val.items()
                        ]
                        print_color("yellow", f"[MCP] {tn}: coerced '{param}' dict→list")
                try:
                    result = await mcp_session.call_tool(tn, tool_args)
                    payload = extract_json_payload(result)
                    return result_store.maybe_store(tn, tool_args, payload)
                except Exception as exc:
                    return {"error": str(exc), "tool": tn}

            return _tool_executor

        langchain_tools.append(
            StructuredTool.from_function(
                coroutine=_make_tool_executor(tool_name, input_schema),
                name=tool_name,
                description=tool_description,
                args_schema=schema_without_auth(input_schema),  # type: ignore[arg-type]
            )
        )

    return langchain_tools


async def synthesize_compact_answer(
    *,
    llm: BaseChatModel,
    query: str,
    tool_runs: list[dict[str, Any]],
    result_store: ToolResultStore,
    route_index: Any,
) -> str:
    synthesis_prompt = dedent(
        f"""
        Answer the user using only this compact tool-result summary.
        Respond in the same language as the user.
        Use compact daisyUI/Tailwind HTML.
        Do not mention auth_token.
        Do not expose raw IDs unless the user explicitly asked for IDs.
        If data is insufficient, say exactly what is missing.

        Compact summary JSON:
        {compact_synthesis_payload(query=query, tool_runs=tool_runs, result_store=result_store, route_index=route_index)}
        """
    )
    response = await llm.ainvoke(synthesis_prompt)
    content = getattr(response, "content", str(response))
    return content.strip() if isinstance(content, str) and content.strip() else render_error_html("I could not produce an answer from the available tool results.")


class _ConclusionVerdict(BaseModel):
    is_failure: bool
    reason: str


async def _is_failure_conclusion(llm: BaseChatModel, query: str, conclusion: str) -> bool:
    """Ask the LLM whether *conclusion* is a genuine answer or a failure/refusal.

    Uses LangChain's native ``with_structured_output`` — the same ``llm`` object
    the router already uses, no extra clients or imports needed.

    Returns True when the conclusion is a failure so the Ralph loop can retry.
    Falls back to False (treat as success) if the structured call itself fails.
    """
    try:
        structured = llm.with_structured_output(_ConclusionVerdict)
        verdict: _ConclusionVerdict = await structured.ainvoke(
            f"User query: {query}\n\n"
            f"Agent conclusion: {conclusion}\n\n"
            "Set is_failure=true if the agent failed, gave up, or said it could not find anything. "
            "Set is_failure=false if the agent genuinely answered the query. "
            "Include a one-sentence reason."
        )
        print_color("cyan", f"[Ralph] conclusion check → is_failure={verdict.is_failure} ({verdict.reason})")
        return verdict.is_failure
    except Exception as exc:
        print_color("yellow", f"[Ralph] conclusion check failed ({exc}), assuming success")
        return False


def _build_progress_summary(iteration: int, tool_runs: list[dict[str, Any]], final_msg: str | None) -> str:
    lines = [f"Iteration {iteration} tool calls:"]
    for tr in tool_runs:
        hint = str(tr.get("result", ""))[:120] if isinstance(tr.get("result"), dict) else ""
        lines.append(f"  - {tr['tool_name']}({tr.get('args', {})}) → {hint}")
    if final_msg:
        lines.append(f"Partial conclusion: {final_msg[:300]}")
    return "\n".join(lines)


async def _run_ralph_loop(
    *,
    query: str,
    llm: BaseChatModel,
    agent_executor: Any,
    max_iterations: int,
) -> tuple[list[dict[str, Any]], str | None]:
    """
    Ralph-mode outer loop: run the agent graph up to *max_iterations* times.

    Each iteration gets fresh LLM context but receives a concise summary of
    what the previous iterations accomplished, so it can pick up where they
    left off rather than repeating completed steps.

    Returns ``(all_tool_runs, final_model_message)``.
    """
    all_tool_runs: list[dict[str, Any]] = []
    model_final_message: str | None = None
    progress_summary = ""

    for iteration in range(1, max_iterations + 1):
        user_msg = (
            query
            if iteration == 1
            else (
                f"Original task: {query}\n\n"
                f"Work completed so far:\n{progress_summary}\n\n"
                "Continue from where you left off. "
                "Do not repeat steps already done. "
                "Complete any remaining steps."
            )
        )

        print_color("cyan", f"[Ralph] iteration {iteration}/{max_iterations}")
        result = await agent_executor.ainvoke(
            {"messages": [HumanMessage(content=user_msg)]},
            config={"recursion_limit": 30},
        )
        messages = result.get("messages", [])
        _log_agent_messages(messages)

        iter_runs, iter_final = extract_tool_runs_and_final_message(messages)
        all_tool_runs.extend(iter_runs)
        if iter_final:
            model_final_message = iter_final

        progress_summary = (
            progress_summary + "\n" + _build_progress_summary(iteration, iter_runs, iter_final)
        ).strip()

        made_tool_calls = bool(iter_runs)

        if iter_final and made_tool_calls:
            is_failure = await _is_failure_conclusion(llm, query, iter_final)
            if not is_failure:
                print_color("cyan", f"[Ralph] concluded after {iteration} iteration(s)")
                break
            if iteration < max_iterations:
                print_color("yellow", f"[Ralph] iteration {iteration} ended in failure — retrying with context")
        elif not made_tool_calls and iteration > 1:
            print_color("yellow", f"[Ralph] no tool calls in iteration {iteration}, stopping")
            break

    return all_tool_runs, model_final_message


def _log_agent_messages(messages: list) -> None:
    """Log each message in the agent chain for debugging the thinking process."""
    print_color("cyan", f"[MCP agent] {len(messages)} messages in chain:")
    for i, msg in enumerate(messages):
        role = type(msg).__name__.replace("Message", "").upper()
        content = getattr(msg, "content", "")
        tool_calls = getattr(msg, "tool_calls", [])
        tool_call_id = getattr(msg, "tool_call_id", None)

        if tool_calls:
            for tc in tool_calls:
                print_color("cyan", f"  [{i}] {role} → tool_call: {tc.get('name')}({tc.get('args')})")
            if isinstance(content, str) and content.strip():
                print_color("cyan", f"  [{i}] {role} reasoning: {content[:200]}")
        elif tool_call_id:
            preview = str(content)[:120].replace("\n", " ")
            print_color("cyan", f"  [{i}] TOOL result (id={tool_call_id[:8]}…): {preview}")
        elif isinstance(content, str) and content.strip():
            print_color("cyan", f"  [{i}] {role}: {content[:300]}")


def create_mcp_client_router(
    *,
    llm: BaseChatModel,
    app_name: str,
    frontend_route_config_path: Path,
    prefix: str = "/api/mcp",
) -> APIRouter:
    router = APIRouter(prefix=prefix, tags=["mcp"])

    @router.get("/available")
    async def mcp_available() -> EndpointOutput[dict]:
        mcp_server_url = get_primary_mcp_server_url()
        return EndpointOutput(
            result={
                "available": bool(mcp_server_url),
                "reason": None if mcp_server_url else "No MCP server URL found in MCP_SERVER_LIST.",
            }
        )

    @router.post("/ask")
    async def mcp_ask(query: str, max_iterations: int = 3, current_user: User | None = Depends(get_current_user_optional)) -> EndpointOutput[dict]:
        mcp_server_url = get_primary_mcp_server_url()
        if not mcp_server_url:
            return EndpointOutput(
                error=EndpointError(
                    title="MCP server not configured",
                    description="No MCP server URL found in MCP_SERVER_LIST.",
                    code="mcp_not_configured",
                )
            )

        auth_token = (
            tokens.create_jwt_token(token_context_key=AUTH_TOKEN_CONTEXT_KEY, subject=current_user.id)
            if current_user
            else None
        )
        print(f"Received MCP ask request. User: {current_user.id if current_user else 'anonymous'}, Query: {query}")

        try:
            async with (
                sse_client(mcp_server_url) as (read, write),
                ClientSession(read, write) as mcp_session,
            ):
                await mcp_session.initialize()
                input_schemas: dict[str, Any] = {}
                result_store = ToolResultStore()
                tool_call_counter = {"count": 0}
                mcp_lc_tools = await create_langchain_tools_from_mcp(
                    mcp_session=mcp_session,
                    auth_token=auth_token,
                    input_schemas=input_schemas,
                    result_store=result_store,
                    tool_call_counter=tool_call_counter,
                )
                if not mcp_lc_tools:
                    return EndpointOutput(result={"query": query, "answer": render_error_html("No MCP tools are available."), "tool_runs": []})

                lc_tools = mcp_lc_tools + create_result_store_tools(result_store)
                print(
                    f"Converted {len(mcp_lc_tools)} MCP tools to LangChain tools "
                    f"and added {len(lc_tools) - len(mcp_lc_tools)} local result tools. "
                    f"Tool names: {[tool.name for tool in lc_tools]}"
                )

                frontend_route_summary = await get_frontend_route_summary(
                    llm=llm,
                    app_name=app_name,
                    frontend_route_config_path=frontend_route_config_path,
                )
                route_index = parse_route_summary(frontend_route_summary)
                system_prompt = (
                    dedent(
                        """
                        You are an MCP tool-routing assistant for a web application.
                        Use tools to retrieve the data needed to answer the user.
                        Authentication is automatic: never ask for, mention, or pass auth_token.
                        Prefer list_* tools. Do not call get_* for objects already returned by list_* previews.
                        Large results may be stored outside context and returned as receipts.
                        If a receipt preview is enough, answer from it.
                        Use read_tool_result/search_tool_result only when needed.
                        Do not expose raw IDs unless explicitly asked.
                        Build filters from the selected list tool's documented resource fields.
                        Filters within one list_* call use AND logic. For OR across fields, call the same list_* tool once per candidate field and merge the results, keeping unique items by id.
                        You can perform multi-step operations by chaining tool calls: for example, to organise resources into a folder, use list_* to find matching resources, then create_folder to create the folder, then add_resource_to_folder for each resource found. Never refuse a task just because it involves multiple steps — chain the tools.
                        Error recovery strategy — when a tool returns an error or an empty result:
                        1. Read the error to understand why it failed (invalid ID, not found, wrong parameters, …).
                        2. If the error suggests the input was used as a wrong type (e.g. a name or reference string passed where a UUID is expected), switch to the appropriate search or lookup tool instead (e.g. search_rfs_by_reference, list_* with filters, extract_rfs_from_prompt).
                        3. If the result is empty, consider broadening the search: try alternative fields, looser match_type, or a different tool that covers the same domain.
                        4. Try at least two alternative approaches before concluding the task cannot be completed.
                        5. Only report failure after genuinely exhausting all reasonable alternatives, and explain clearly which tools were tried and why they failed.
                        Respond in the user's language.
                        Frontend route summary is provided only for link inference; do not list routes unless asked.
                        """
                    )
                    + "\n\nCurrent Angular route config summary:\n"
                    + frontend_route_summary
                )
                print("The prompt:")
                print(system_prompt)
                print(f"Constructed system prompt of length {len(system_prompt)} characters.")
                prompt_token_count = _estimate_token_count(llm, system_prompt)
                print_color("red", f"Initial MCP system prompt size: {prompt_token_count} tokens")

                class _AgentState(TypedDict):
                    messages: Annotated[list[BaseMessage], operator.add]

                bound_model = llm.bind_tools(lc_tools)
                system_msg = SystemMessage(content=system_prompt)

                async def _agent_node(state: _AgentState) -> dict:
                    return {"messages": [await bound_model.ainvoke([system_msg] + state["messages"])]}

                graph = StateGraph(_AgentState)
                graph.add_node("agent", _agent_node)
                graph.add_node("tools", ToolNode(lc_tools))
                graph.set_entry_point("agent")
                graph.add_conditional_edges("agent", tools_condition)
                graph.add_edge("tools", "agent")
                agent_executor = graph.compile()

                tool_runs, model_final_message = await _run_ralph_loop(
                    query=query,
                    llm=llm,
                    agent_executor=agent_executor,
                    max_iterations=max_iterations,
                )

                answer_html = build_answer_from_tool_runs(
                    query=query,
                    tool_runs=tool_runs,
                    result_store=result_store,
                    route_index=route_index,
                )
                if answer_html is None:
                    answer_html = await synthesize_compact_answer(
                        llm=llm,
                        query=query,
                        tool_runs=tool_runs,
                        result_store=result_store,
                        route_index=route_index,
                    )

        except Exception as exc:
            import sys
            import traceback

            traceback.print_exc(file=sys.stdout)
            return EndpointOutput(
                error=EndpointError(
                    title="MCP Agent request failed",
                    description="Unable to run LangGraph MCP agent.",
                    code="mcp_agent_failed",
                    details={"error": str(exc), "traceback": traceback.format_exc()},
                )
            )

        return EndpointOutput(
            result={
                "query": query,
                "answer": answer_html,
                "tool_runs": tool_runs,
                "model_final_message": model_final_message,
                "debug": {"tool_call_count": tool_call_counter.get("count", 0)},
            }
        )

    return router
