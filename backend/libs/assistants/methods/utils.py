from typing import Any

import structlog

logger = structlog.get_logger(__name__)


def _log_response(msg: Any) -> None:
    content = getattr(msg, "content", "")
    tool_calls = getattr(msg, "tool_calls", [])
    if tool_calls:
        for tc in tool_calls:
            logger.debug("assistant_tool_call", tool_name=tc.get("name"), tool_args=tc.get("args"))
        if isinstance(content, str) and content.strip():
            logger.debug("assistant_reasoning", reasoning=content[:200])
    elif isinstance(content, str) and content.strip():
        logger.debug("assistant_response", response=content[:300])
