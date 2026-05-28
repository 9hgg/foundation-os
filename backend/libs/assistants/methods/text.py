from typing import Any

def _contains_text(data: Any, query: str) -> bool:
    query = query.casefold()
    if not query:
        return True
    if isinstance(data, dict):
        return any(
            _contains_text(k, query) or _contains_text(v, query)
            for k, v in data.items()
        )
    if isinstance(data, list):
        return any(_contains_text(item, query) for item in data)
    if data is None:
        return False
    return query in str(data).casefold()
