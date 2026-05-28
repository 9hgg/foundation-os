import json
import uuid
from typing import Any

from libs.logger.customLogger import print

from .normalization import compact_item, find_primary_list, normalize_collection

STORE_RESULT_CHAR_THRESHOLD = 6_000
STORE_RESULT_LIST_THRESHOLD = 12
STORE_RESULT_PREVIEW_LIMIT = 8


def json_size(data: Any) -> int:
    try:
        return len(json.dumps(data, ensure_ascii=False, default=str))
    except (TypeError, ValueError):
        return len(str(data))


def contains_text(data: Any, query: str) -> bool:
    normalized_query = query.casefold()
    if not normalized_query:
        return True
    if isinstance(data, dict):
        return any(contains_text(key, normalized_query) or contains_text(value, normalized_query) for key, value in data.items())
    if isinstance(data, list):
        return any(contains_text(item, normalized_query) for item in data)
    if data is None:
        return False
    return normalized_query in str(data).casefold()


class ToolResultStore:
    """Per-request storage for large tool results kept outside model context."""

    def __init__(self) -> None:
        self._results: dict[str, dict[str, Any]] = {}

    def maybe_store(self, tool_name: str, args: dict[str, Any], payload: Any) -> Any:
        collection = normalize_collection(payload, tool_name=tool_name)
        primary_list = find_primary_list(payload)
        payload_size = json_size(payload)
        list_size = len(primary_list) if primary_list is not None else None
        should_store = payload_size > STORE_RESULT_CHAR_THRESHOLD or (
            list_size is not None and list_size > STORE_RESULT_LIST_THRESHOLD
        )
        if not should_store:
            return payload

        result_ref = f"toolres_{uuid.uuid4().hex[:12]}"
        self._results[result_ref] = {"tool": tool_name, "args": args, "payload": payload}
        preview_source = primary_list if primary_list is not None else [payload]
        preview = [compact_item(item, tool_name=tool_name) for item in preview_source[:STORE_RESULT_PREVIEW_LIMIT]]
        print(
            f"Stored large tool result {result_ref} from {tool_name}: "
            f"{payload_size} chars, {list_size if list_size is not None else 'unknown'} items"
        )
        return {
            "stored_tool_result": True,
            "result_ref": result_ref,
            "tool": tool_name,
            "count": list_size,
            "normalized_count": len(collection.items) if collection else None,
            "detected_collection_kind": collection.kind if collection else None,
            "detected_title": collection.title if collection else None,
            "payload_size_chars": payload_size,
            "preview_count": len(preview),
            "preview": preview,
            "message": (
                "Full tool result was stored outside the reasoning context. "
                "Use read_tool_result, get_tool_result_item, or search_tool_result if more detail is needed."
            ),
        }

    def get_payload(self, result_ref: str) -> Any | None:
        stored = self._results.get(result_ref)
        return None if stored is None else stored["payload"]

    def read(self, result_ref: str, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        stored = self._results.get(result_ref)
        if stored is None:
            return {"error": "Unknown result_ref", "result_ref": result_ref}
        payload = stored["payload"]
        primary_list = find_primary_list(payload)
        if primary_list is None:
            return {"result_ref": result_ref, "tool": stored["tool"], "args": stored["args"], "payload": payload}
        page = max(1, int(page))
        page_size = min(100, max(1, int(page_size)))
        start = (page - 1) * page_size
        return {
            "result_ref": result_ref,
            "tool": stored["tool"],
            "args": stored["args"],
            "page": page,
            "page_size": page_size,
            "count": len(primary_list),
            "items": primary_list[start : start + page_size],
        }

    def get_item(self, result_ref: str, item_id: str) -> dict[str, Any]:
        stored = self._results.get(result_ref)
        if stored is None:
            return {"error": "Unknown result_ref", "result_ref": result_ref}
        primary_list = find_primary_list(stored["payload"])
        if primary_list is None:
            return {"error": "Stored result is not a list", "result_ref": result_ref}
        for item in primary_list:
            if isinstance(item, dict) and str(item.get("id")) == str(item_id):
                return {"result_ref": result_ref, "item": item}
        return {"error": "Item not found", "result_ref": result_ref, "item_id": item_id}

    def search(self, result_ref: str, query: str, limit: int = 20) -> dict[str, Any]:
        stored = self._results.get(result_ref)
        if stored is None:
            return {"error": "Unknown result_ref", "result_ref": result_ref}
        primary_list = find_primary_list(stored["payload"])
        matches = (
            [stored["payload"]] if primary_list is None and contains_text(stored["payload"], query) else []
        )
        if primary_list is not None:
            matches = [item for item in primary_list if contains_text(item, query)]
        limit = min(100, max(1, int(limit)))
        return {
            "result_ref": result_ref,
            "tool": stored["tool"],
            "query": query,
            "count": len(matches),
            "items": matches[:limit],
        }
