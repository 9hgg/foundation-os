"""Extract full Angular frontend routes from a TypeScript route config file."""

from __future__ import annotations

import hashlib
import re
import tempfile
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from textwrap import dedent

from libs.logger.customLogger import print_color
from libs.mcp.client_runtime.routes import RouteIndex
from libs.ml.llm import LLMClient, LLMEmptyResponseError, LLMMessage

_ROUTE_CACHE_VERSION = "v4"
_LLM_ROUTE_CACHE_VERSION = "v1"


@dataclass(frozen=True)
class AngularMcpRouteDetails:
    """Frontend-declared assistant routing metadata extracted from Angular routes."""

    resource_kind: str
    resource_id_param: str | None
    full_route: str
    description: str | None = None


class _RouteConfigParser:
    """Minimal parser for the subset of TypeScript used in Angular route configs."""

    def __init__(self, source: str) -> None:
        self.source = source
        self.length = len(source)
        self.index = 0

    def parse(self) -> list[object]:
        """Return the top-level ``Route[]`` array as Python structures."""

        anchor = self.source.find("appRoutes")
        if anchor == -1:
            return []

        assignment = self.source.find("=", anchor)
        if assignment == -1:
            return []

        start = self.source.find("[", assignment)
        if start == -1:
            return []
        self.index = start
        value = self._parse_value()
        return value if isinstance(value, list) else []

    def _parse_value(self) -> object:
        self._skip_ignored()
        if self.index >= self.length:
            return ""

        current = self.source[self.index]
        if current == "{":
            return self._parse_object()
        if current == "[":
            return self._parse_array()
        if current in {'"', "'"}:
            return self._parse_string()
        return self._parse_expression()

    def _parse_object(self) -> dict[str, object]:
        result: dict[str, object] = {}
        self.index += 1
        while self.index < self.length:
            self._skip_ignored()
            if self.index < self.length and self.source[self.index] == "}":
                self.index += 1
                break

            key = self._parse_key()
            self._skip_ignored()
            if self.index >= self.length or self.source[self.index] != ":":
                break
            self.index += 1
            result[key] = self._parse_value()

            self._skip_ignored()
            if self.index < self.length and self.source[self.index] == ",":
                self.index += 1
        return result

    def _parse_array(self) -> list[object]:
        result: list[object] = []
        self.index += 1
        while self.index < self.length:
            self._skip_ignored()
            if self.index < self.length and self.source[self.index] == "]":
                self.index += 1
                break

            result.append(self._parse_value())
            self._skip_ignored()
            if self.index < self.length and self.source[self.index] == ",":
                self.index += 1
        return result

    def _parse_key(self) -> str:
        self._skip_ignored()
        if self.index < self.length and self.source[self.index] in {'"', "'"}:
            parsed = self._parse_string()
            return parsed if isinstance(parsed, str) else ""

        start = self.index
        while self.index < self.length and (
            self.source[self.index].isalnum() or self.source[self.index] in {"_", "$"}
        ):
            self.index += 1
        return self.source[start:self.index].strip()

    def _parse_string(self) -> str:
        quote = self.source[self.index]
        self.index += 1
        chars: list[str] = []
        escaped = False
        while self.index < self.length:
            char = self.source[self.index]
            self.index += 1
            if escaped:
                chars.append(char)
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == quote:
                break
            chars.append(char)
        return "".join(chars)

    def _parse_expression(self) -> str:  # noqa: C901
        start = self.index
        paren_depth = 0
        brace_depth = 0
        bracket_depth = 0

        while self.index < self.length:
            if self._skip_comment():
                continue

            char = self.source[self.index]
            if char in {'"', "'"}:
                self._parse_string()
                continue

            if char == "(":
                paren_depth += 1
            elif char == ")":
                paren_depth = max(0, paren_depth - 1)
            elif char == "{":
                brace_depth += 1
            elif char == "}":
                if paren_depth == 0 and brace_depth == 0 and bracket_depth == 0:
                    break
                brace_depth = max(0, brace_depth - 1)
            elif char == "[":
                bracket_depth += 1
            elif char == "]":
                if paren_depth == 0 and brace_depth == 0 and bracket_depth == 0:
                    break
                bracket_depth = max(0, bracket_depth - 1)
            elif char == "," and paren_depth == 0 and brace_depth == 0 and bracket_depth == 0:
                break

            self.index += 1

        return self.source[start:self.index].strip()

    def _skip_ignored(self) -> None:
        while self.index < self.length:
            if self.source[self.index].isspace():
                self.index += 1
                continue
            if self._skip_comment():
                continue
            break

    def _skip_comment(self) -> bool:
        if self.source.startswith("//", self.index):
            newline = self.source.find("\n", self.index)
            self.index = self.length if newline == -1 else newline + 1
            return True
        if self.source.startswith("/*", self.index):
            end = self.source.find("*/", self.index + 2)
            self.index = self.length if end == -1 else end + 2
            return True
        return False


def extract_frontend_routes(route_config_path_str: str) -> list[str]:
    """Return full navigable route paths parsed from an Angular route config file."""

    path_str = (route_config_path_str or "").strip()
    if not path_str:
        return []

    route_config_path = Path(path_str)

    try:
        source = route_config_path.read_text(encoding="utf-8")
    except OSError as exc:
        print_color("yellow", f"[assistant] route config unreadable: {exc}")
        return []

    file_hash = hashlib.sha256(source.encode()).hexdigest()[:16]
    cache_path = Path(tempfile.gettempdir()) / f"assistant-routes-{_ROUTE_CACHE_VERSION}-{file_hash}.txt"

    if cache_path.exists():
        with suppress(OSError):
            cached = cache_path.read_text(encoding="utf-8").splitlines()
            return [route.strip() for route in cached if route.strip()]

    string_constants = _extract_string_constants(source)
    parsed_routes = _RouteConfigParser(source).parse()
    routes = _flatten_route_paths(parsed_routes, string_constants=string_constants)

    with suppress(OSError):
        cache_path.write_text("\n".join(routes), encoding="utf-8")

    return routes


def extract_angular_mcp_route_details(route_config_path_str: str) -> list[AngularMcpRouteDetails]:
    """Extract explicit ``mcpRouteDetails`` declarations from an Angular route config."""

    path_str = (route_config_path_str or "").strip()
    if not path_str:
        return []

    route_config_path = Path(path_str)
    try:
        source = route_config_path.read_text(encoding="utf-8")
    except OSError as exc:
        print_color("yellow", f"[assistant] route config unreadable: {exc}")
        return []

    string_constants = _extract_string_constants(source)
    parsed_routes = _RouteConfigParser(source).parse()
    return _collect_mcp_route_details(parsed_routes, string_constants=string_constants)


def build_route_index_from_mcp_route_details(route_details: list[AngularMcpRouteDetails]) -> RouteIndex:
    """Build an explicit resource-kind keyed route index from frontend-declared route details."""

    routes: list[str] = []
    list_routes: dict[str, str] = {}
    item_routes: dict[str, str] = {}

    for detail in route_details:
        route = _normalize_summary_route(detail.full_route)
        if route not in routes:
            routes.append(route)

        target = item_routes if _route_has_dynamic_segment(route) else list_routes
        current = target.get(detail.resource_kind)
        if current is None or _route_specificity_score(route) < _route_specificity_score(current):
            target[detail.resource_kind] = route

    return RouteIndex(routes=routes, list_routes=list_routes, item_routes=item_routes)


def extract_frontend_routes_with_llm(
    route_config_path_str: str,
    *,
    client: LLMClient,
    model: str,
    app_name: str,
) -> list[str]:
    """Return frontend routes by asking the LLM for a plain-text Angular route summary."""

    path_str = (route_config_path_str or "").strip()
    if not path_str:
        return []

    route_config_path = Path(path_str)
    try:
        source = route_config_path.read_text(encoding="utf-8")
    except OSError as exc:
        print_color("yellow", f"[assistant] route config unreadable: {exc}")
        return []

    file_hash = hashlib.sha256(source.encode()).hexdigest()[:16]
    cache_slug = _slugify_cache_part(app_name)
    cache_path = Path(tempfile.gettempdir()) / (
        f"{cache_slug}-assistant-route-summary-{_LLM_ROUTE_CACHE_VERSION}-{file_hash}.md"
    )

    summary = ""
    if cache_path.exists():
        with suppress(OSError):
            summary = cache_path.read_text(encoding="utf-8").strip()

    if not summary:
        prompt = _build_route_summary_prompt(source)
        try:
            response = client.complete(
                [LLMMessage(role="user", content=prompt)],
                model=model,
                temperature=0.0,
            )
            summary = response.text.strip()
        except LLMEmptyResponseError as exc:
            print_color("yellow", f"[assistant] LLM route summary failed: {exc}")
            return []

        with suppress(OSError):
            cache_path.write_text(summary, encoding="utf-8")

    return _extract_routes_from_summary(summary)


def _extract_string_constants(source: str) -> dict[str, str]:
    """Extract simple top-level string constants used in route path declarations."""

    constants: dict[str, str] = {}
    pattern = re.compile(r"\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(['\"])(.*?)\2", re.DOTALL)
    for match in pattern.finditer(source):
        constants[match.group(1)] = match.group(3)
    return constants


def _slugify_cache_part(value: str) -> str:
    """Create a filesystem-safe cache slug."""

    cleaned = value.strip().lower()
    cleaned = re.sub(r"[^a-z0-9_-]+", "-", cleaned)
    return cleaned.strip("-") or "app"


def _build_route_summary_prompt(route_config_source: str) -> str:
    """Build the same route-summary prompt shape used by the legacy /ask flow."""

    return dedent(
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
    ).strip()


def _extract_routes_from_summary(route_summary: str) -> list[str]:
    """Parse route paths out of a plain-text Angular route summary."""

    routes: list[str] = []
    for raw_line in route_summary.splitlines():
        match = re.search(r"^\s*-\s*(.+?)(?:\s+:\s+.+)?\s*$", raw_line)
        if not match:
            continue
        path = _normalize_summary_route(match.group(1).strip())
        if not path or "**" in path:
            continue
        routes.append(path)
    return routes


def _normalize_summary_route(path: str) -> str:
    """Normalize one route path extracted from the LLM summary."""

    cleaned = path.strip()
    if cleaned in {"", "/"}:
        return "/"
    cleaned = cleaned.lstrip("/")
    return f"/{cleaned}" if cleaned else "/"


def _flatten_route_paths(
    nodes: list[object],
    parent_path: str = "",
    *,
    string_constants: dict[str, str] | None = None,
) -> list[str]:
    """Flatten nested Angular route objects into full URL paths."""

    seen: set[str] = set()
    flattened: list[str] = []
    string_constants = string_constants or {}

    for node in nodes:
        if not isinstance(node, dict):
            continue

        raw_path = node.get("path")
        current_path = parent_path

        if isinstance(raw_path, str):
            route_path = _resolve_route_path(raw_path, string_constants).strip()
            if route_path == "**":
                continue
            if route_path:
                current_path = _join_route_path(parent_path, route_path)
                if "redirectTo" not in node and current_path not in seen:
                    seen.add(current_path)
                    flattened.append(current_path)

        children = node.get("children")
        if isinstance(children, list):
            for child_path in _flatten_route_paths(
                children,
                current_path,
                string_constants=string_constants,
            ):
                if child_path not in seen:
                    seen.add(child_path)
                    flattened.append(child_path)

    return flattened


def _join_route_path(parent_path: str, child_segment: str) -> str:
    """Join two route path fragments into one normalized absolute path."""

    parent_segments = [segment for segment in parent_path.split("/") if segment]
    child_segments = [segment for segment in child_segment.split("/") if segment]
    return "/" + "/".join([*parent_segments, *child_segments])


def _resolve_route_path(raw_path: str, string_constants: dict[str, str]) -> str:
    """Resolve a route path that may reference a simple string constant."""

    cleaned = raw_path.strip()
    if not cleaned:
        return ""
    return string_constants.get(cleaned, cleaned)


def _collect_mcp_route_details(
    nodes: list[object],
    parent_path: str = "",
    *,
    string_constants: dict[str, str] | None = None,
) -> list[AngularMcpRouteDetails]:
    """Traverse parsed Angular routes and collect explicit assistant route declarations."""

    details: list[AngularMcpRouteDetails] = []
    string_constants = string_constants or {}

    for node in nodes:
        if not isinstance(node, dict):
            continue

        raw_path = node.get("path")
        current_path = parent_path
        if isinstance(raw_path, str):
            route_path = _resolve_route_path(raw_path, string_constants).strip()
            if route_path and route_path != "**":
                current_path = _join_route_path(parent_path, route_path)

        data = node.get("data")
        if isinstance(data, dict):
            route_details = _parse_mcp_route_details(data.get("mcpRouteDetails"), current_path)
            if route_details is not None:
                details.append(route_details)

        children = node.get("children")
        if isinstance(children, list):
            details.extend(
                _collect_mcp_route_details(
                    children,
                    current_path,
                    string_constants=string_constants,
                )
            )

    return details


def _parse_mcp_route_details(raw_details: object, current_path: str) -> AngularMcpRouteDetails | None:
    """Parse one raw ``mcpRouteDetails`` object into a typed dataclass."""

    if not isinstance(raw_details, dict):
        return None

    resource_kind = _coerce_optional_string(raw_details.get("resourceKind"))
    full_route = _coerce_optional_string(raw_details.get("fullRoute")) or current_path
    if not resource_kind or not full_route:
        return None

    return AngularMcpRouteDetails(
        resource_kind=resource_kind,
        resource_id_param=_coerce_optional_string(raw_details.get("resourceIdParam")),
        full_route=_normalize_summary_route(full_route),
        description=_coerce_optional_string(raw_details.get("description")),
    )


def _coerce_optional_string(value: object) -> str | None:
    """Return a stripped string when the raw parsed value is a non-empty string."""

    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def _route_has_dynamic_segment(route: str) -> bool:
    """Return whether the route contains a dynamic ``:param`` segment."""

    return re.search(r":[A-Za-z_][A-Za-z0-9_]*", route) is not None


def _route_specificity_score(route: str) -> tuple[int, int]:
    """Prefer non-builder detail routes over builder-style routes when several exist."""

    suffix_penalty = 1 if re.search(r"/(builder|detail|details|edit)$", route) else 0
    return (suffix_penalty, route.count("/"))
