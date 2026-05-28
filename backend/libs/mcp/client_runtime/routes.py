import re
from dataclasses import dataclass
from urllib.parse import quote

from .profiles import pluralize_kind, singularize


@dataclass
class RouteIndex:
    routes: list[str]
    list_routes: dict[str, str]
    item_routes: dict[str, str]


def _route_score(path: str) -> tuple[int, int]:
    suffix_penalty = 1 if re.search(r"/(builder|detail|details|edit)$", path) else 0
    return (suffix_penalty, path.count("/"))


def parse_route_summary(route_summary: str) -> RouteIndex:
    routes: list[str] = []
    list_routes: dict[str, str] = {}
    item_routes: dict[str, str] = {}

    for raw_line in route_summary.splitlines():
        match = re.search(r"^\s*-?\s*(/[^\s]+)\s*(?::|$)", raw_line)
        if not match:
            continue
        path = match.group(1).strip()
        if not path.startswith("/") or "**" in path:
            continue
        routes.append(path)
        segments = [segment for segment in path.split("/") if segment]
        dynamic_index = next((index for index, segment in enumerate(segments) if segment.startswith(":")), None)
        if dynamic_index is None:
            if segments:
                list_routes.setdefault(singularize(segments[-1]), path)
            continue
        if dynamic_index > 0:
            kind = singularize(segments[dynamic_index - 1])
            current = item_routes.get(kind)
            if current is None or _route_score(path) < _route_score(current):
                item_routes[kind] = path

    return RouteIndex(routes=routes, list_routes=list_routes, item_routes=item_routes)


def infer_resource_href(kind: str, resource_id: str | None, route_index: RouteIndex | None) -> str | None:
    if route_index is None:
        return None
    normalized_kind = singularize(kind)
    candidates = {normalized_kind, singularize(pluralize_kind(normalized_kind))}

    if resource_id:
        for candidate in candidates:
            detail_route = route_index.item_routes.get(candidate)
            if detail_route:
                return re.sub(r":[A-Za-z_][A-Za-z0-9_]*", quote(resource_id, safe=""), detail_route, count=1)

    for candidate in candidates:
        list_route = route_index.list_routes.get(candidate)
        if list_route:
            return list_route
    return None
