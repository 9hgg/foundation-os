
_THINKING_KIND = "assistant-thinking"
_AI_RESPONSE_KIND = "assistant-response"
_CONVERSATION_FOLLOWUP_PROMPT_QUERY = (
    "Based on the conversation above, generate your next reply as the assistant. "
    "Use tools if needed to retrieve or act on information. "
    "Address the most recent messages from the participants. "
    "Respond in the same language as the user."
)

MAX_TOOL_CALLS = 25
_AUTH_TOKEN_CONTEXT_KEY = "auth"  # noqa: S105
_STORE_CHAR_THRESHOLD = 6_000
_STORE_LIST_THRESHOLD = 12
_STORE_PREVIEW_LIMIT = 8
_COLLECTION_KEYS = (
    "data",
    "items",
    "results",
    "resources",
    "contents",
    "matching_samples",
)
_LOCAL_RESULT_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "read_tool_result",
        "get_tool_result_item",
        "search_tool_result",
        "count_tool_result_items",
    }
)
