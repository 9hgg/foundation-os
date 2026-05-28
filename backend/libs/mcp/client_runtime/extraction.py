from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
import json
from typing import Any

LOCAL_RESULT_TOOL_NAMES: frozenset[str] = frozenset(
    {"read_tool_result", "get_tool_result_item", "search_tool_result"}
)


def extract_tool_runs_and_final_message(messages: list[BaseMessage]) -> tuple[list[dict[str, Any]], str | None]:
    tool_results: dict[str, Any] = {}
    for msg in messages:
        call_id = getattr(msg, "tool_call_id", None)
        if not call_id:
            continue
        raw = getattr(msg, "content", "")
        try:
            tool_results[call_id] = json.loads(raw) if isinstance(raw, str) else raw
        except (json.JSONDecodeError, TypeError):
            tool_results[call_id] = raw

    tool_runs: list[dict[str, Any]] = []
    for msg in messages:
        for tc in getattr(msg, "tool_calls", []):
            result = tool_results.get(tc.get("id", ""), "(no result captured)")
            status = "error" if isinstance(result, dict) and bool(result.get("error")) else "ok"
            tool_name = tc.get("name", "unknown")
            tool_runs.append(
                {
                    "tool_name": tool_name,
                    "is_local_result_tool": tool_name in LOCAL_RESULT_TOOL_NAMES,
                    "status": status,
                    "args": tc.get("args", {}),
                    "result": result,
                }
            )

    model_final_message: str | None = None
    for msg in reversed(messages):
        if getattr(msg, "tool_call_id", None):
            continue
        content = getattr(msg, "content", "")
        if isinstance(content, str) and content.strip() and not getattr(msg, "tool_calls", None):
            model_final_message = content
            break

    return tool_runs, model_final_message
