"""Local utility tools exposed to the assistant during execution."""

from __future__ import annotations

from typing import Any, Literal

from ..errors import (
    ArtifactPropertyReadError,
    EmptyArtifactPathError,
    EvidenceTooLargeError,
)
from ..evidence.models import EvidenceReceipt
from ..state.artifacts import (
    ARTIFACT_CUTOFF_MARKER,
    DEFAULT_MAX_EVIDENCE_DUMP_SIZE,
    read_nested_property,
    render_prompt_safe_value,
    split_artifact_path,
    summarize_artifact_paths,
)
from ..state.run_context import AssistantRunContext
from .list_ops import apply_filter_conditions
from .models import ArtifactPropertyRead, ConstantValueReceipt, FilterCondition
from .registry import Tool, ToolRegistry


def _available_artifact_keys(ctx: AssistantRunContext) -> list[str]:
    return [artifact.key for artifact in ctx.artifacts.all()]


def _resolve_artifact_path(ctx: AssistantRunContext, path: str):
    """Return the artifact and relative path selected by one full artifact path."""

    normalized_path = path.strip()
    if not normalized_path:
        raise EmptyArtifactPathError()
    try:
        artifact_key, relative_path = split_artifact_path(normalized_path)
        artifact = ctx.artifacts.get_artifact(artifact_key)
    except KeyError as exc:
        raise ArtifactPropertyReadError(
            path=normalized_path,
            cause=exc,
            available_keys=_available_artifact_keys(ctx),
        ) from exc
    return artifact, relative_path, normalized_path


def build_harness_tools(ctx: AssistantRunContext) -> ToolRegistry:
    """Build the default in-process tool registry for a run context."""

    registry = ToolRegistry()
    _register_artifact_path_tools(registry, ctx)
    _register_evidence_tools(registry, ctx)
    _register_persistence_tools(registry, ctx)
    _register_list_tools(registry)
    _register_collection_tools(registry)
    _register_aggregation_tools(registry)
    return registry


def _register_artifact_path_tools(registry: ToolRegistry, ctx: AssistantRunContext) -> None:
    def read_artifact_property(path: str) -> ArtifactPropertyRead:
        """Read one nested property from an artifact using ``artifact.path[0]`` syntax."""

        artifact, relative_path, normalized_path = _resolve_artifact_path(ctx, path)
        try:
            value = artifact.load() if not relative_path else read_nested_property(artifact.load(), relative_path)
        except KeyError as exc:
            raise ArtifactPropertyReadError(
                path=normalized_path,
                cause=exc,
                available_keys=_available_artifact_keys(ctx),
            ) from exc
        preview = render_prompt_safe_value(value)
        return ArtifactPropertyRead(
            path=normalized_path,
            value=value,
            preview=preview,
            truncated=ARTIFACT_CUTOFF_MARKER in preview,
        )

    def get_artifact_structure(path: str, max_paths: int = 100) -> list[str]:
        """Return representative navigable paths for one artifact path."""

        artifact, relative_path, normalized_path = _resolve_artifact_path(ctx, path)
        root_value = artifact.load()
        if relative_path:
            try:
                root_value = read_nested_property(root_value, relative_path)
            except KeyError as exc:
                raise ArtifactPropertyReadError(
                    path=normalized_path,
                    cause=exc,
                    available_keys=_available_artifact_keys(ctx),
                ) from exc
        return summarize_artifact_paths(root_value, root=normalized_path, max_paths=max_paths)

    registry.register(Tool(
        "read_artifact_property",
        (
            "Read one nested property from an artifact without loading the whole value into the prompt. "
            "Use a full artifact path like `artifact.result.totalCount` or `artifact.result.data[0]` with concrete numeric indexes only. "
            "Prefer this when artifacts may be large. This tool creates an observation, not a new artifact."
        ),
        read_artifact_property,
        short_description="Read one nested artifact property by path.",
        persist_artifact=False,
        observation_mode="carry_inline_if_small",
        observation_renderer=lambda result: f"{result.path} = {result.preview}",
    ))
    registry.register(Tool(
        "get_artifact_structure",
        (
            "List representative property paths for an artifact or one nested property, without dumping "
            "the full content. Pass a full artifact path such as `artifact` or `artifact.items`. "
            "Arrays are summarized with a `[list_len=N]` size-hint segment, where `N` is the number of items, "
            "and only the first item is used as a schema example for deeper paths. The `[list_len=N]` notation is not valid path syntax: "
            "when you later call path-based tools, remove that marker and use a concrete numeric index like `[0]` or `[1]`. Use this when an artifact is too large or when "
            "you need help choosing a precise path for `create_evidence` or `read_artifact_property`. "
            "This tool creates an observation, not a new artifact."
        ),
        get_artifact_structure,
        short_description="List representative paths for an artifact.",
        persist_artifact=False,
        observation_mode="always_inline",
        output_schema={"type": "array", "items": {"type": "string"}, "python_type": "list"},
    ))


def _register_evidence_tools(registry: ToolRegistry, ctx: AssistantRunContext) -> None:
    def _get_artifact_structure_for_hint(path: str) -> list[str]:
        artifact, relative_path, normalized_path = _resolve_artifact_path(ctx, path)
        root_value = artifact.load()
        if relative_path:
            root_value = read_nested_property(root_value, relative_path)
        return summarize_artifact_paths(root_value, root=normalized_path, max_paths=100)

    def create_evidence(
        path: str,
        conditions: list[FilterCondition] | None = None,
        logic: Literal["and", "or"] = "and",
        evidence_key: str | None = None,
        evidence_name: str | None = None,
        evidence_description: str | None = None,
    ) -> EvidenceReceipt:
        """Create grounded evidence from one full artifact path."""

        artifact, relative_path, normalized_path = _resolve_artifact_path(ctx, path)
        kind: Literal["property", "filter"] = "filter" if conditions else "property"
        try:
            evidence = ctx.evidences.create(
                key=evidence_key or f"evidence_{len(ctx.evidences.all()) + 1}",
                artifact=artifact,
                kind=kind,
                name=evidence_name,
                description=evidence_description,
                path=relative_path or None,
                conditions=conditions,
                logic=logic,
                source_step_id=ctx.current_step_id,
            )
        except KeyError as exc:
            raise ArtifactPropertyReadError(
                path=normalized_path,
                cause=exc,
                available_keys=_available_artifact_keys(ctx),
            ) from exc
        display = evidence.display()
        if len(display) > DEFAULT_MAX_EVIDENCE_DUMP_SIZE:
            ctx.evidences.delete(evidence.key)
            possible_paths = _get_artifact_structure_for_hint(normalized_path)
            raise EvidenceTooLargeError(
                max_size=DEFAULT_MAX_EVIDENCE_DUMP_SIZE,
                actual_size=len(display),
                possible_paths=possible_paths,
            )
        return EvidenceReceipt(
            key=evidence.key,
            artifact_key=evidence.artifact_key,
            kind=evidence.kind,
            name=evidence.name,
            description=evidence.description,
            expression=evidence.expression,
            display=display,
        )

    def create_comparison_evidence(
        left_path: str,
        op: Literal["eq", "ne", "lt", "lte", "gt", "gte", "contains", "in", "not_in"],
        right_path: str,
        evidence_key: str | None = None,
        evidence_name: str | None = None,
        evidence_description: str | None = None,
    ) -> EvidenceReceipt:
        """Create evidence comparing values selected by two full artifact paths."""

        left_artifact, left_relative_path, normalized_left_path = _resolve_artifact_path(ctx, left_path)
        right_artifact, right_relative_path, normalized_right_path = _resolve_artifact_path(ctx, right_path)
        try:
            evidence = ctx.evidences.create_comparison(
                key=evidence_key or f"evidence_{len(ctx.evidences.all()) + 1}",
                left_artifact=left_artifact,
                left_path=left_relative_path or None,
                op=op,
                right_artifact=right_artifact,
                right_path=right_relative_path or None,
                name=evidence_name,
                description=evidence_description,
                source_step_id=ctx.current_step_id,
            )
        except KeyError as exc:
            raise ArtifactPropertyReadError(
                path=f"{normalized_left_path} {op} {normalized_right_path}",
                cause=exc,
                available_keys=_available_artifact_keys(ctx),
            ) from exc
        display = evidence.display()
        if len(display) > DEFAULT_MAX_EVIDENCE_DUMP_SIZE:
            ctx.evidences.delete(evidence.key)
            raise EvidenceTooLargeError(
                max_size=DEFAULT_MAX_EVIDENCE_DUMP_SIZE,
                actual_size=len(display),
                possible_paths=[
                    *_get_artifact_structure_for_hint(normalized_left_path),
                    *_get_artifact_structure_for_hint(normalized_right_path),
                ],
            )
        return EvidenceReceipt(
            key=evidence.key,
            artifact_key=evidence.artifact_key,
            kind=evidence.kind,
            name=evidence.name,
            description=evidence.description,
            expression=evidence.expression,
            display=display,
        )

    registry.register(Tool(
        "create_evidence",
        (
            "Create explicit evidence from an artifact so later judges can reason over grounded content. "
            "Provide one full artifact `path`; for list evidence, point `path` at the list and add item-relative "
            "`conditions`. For property evidence, point `path` at the exact property. "
            "You may also provide `evidence_name` and `evidence_description` to make the "
            "evidence easier for judges to understand. If the resulting evidence would be too large, the tool "
            "will fail and ask you to be more precise, often by using `get_artifact_structure` first. "
            "For `path`, use concrete numeric indexes only, such as `artifact.items[0].name`; do not copy the `[list_len=N]` size hint from structure observations literally. "
            "Prefer this before claiming specific facts from artifacts. This tool creates evidence and an inline observation, not a new artifact."
        ),
        create_evidence,
        short_description="Create grounded evidence from an artifact.",
        persist_artifact=False,
        observation_mode="always_inline",
        observation_renderer=lambda result: (
            f"[{result.key}] {result.name}: {result.description}\n{result.expression}.display() = {result.display}"
            if result.name and result.description
            else f"[{result.key}] {result.expression}.display() = {result.display}"
        ),
    ))
    registry.register(Tool(
        "create_comparison_evidence",
        (
            "Create explicit evidence by comparing one artifact value to another artifact value. "
            "Use this for grounded relationships such as `actual_city == requested_city`, "
            "`current_quantity < desired_quantity`, or `status != target_status`. "
            "Provide `left_path` and `right_path` as full artifact paths plus an operator. "
            "Supported ops are: eq, ne, lt, lte, gt, gte, contains, in, not_in. "
            "This tool creates comparison evidence and an inline observation, not a new artifact."
        ),
        create_comparison_evidence,
        short_description="Create evidence comparing two artifact values.",
        persist_artifact=False,
        observation_mode="always_inline",
        observation_renderer=lambda result: (
            f"[{result.key}] {result.name}: {result.description}\n{result.expression}.display() = {result.display}"
            if result.name and result.description
            else f"[{result.key}] {result.expression}.display() = {result.display}"
        ),
    ))


def _register_list_tools(registry: ToolRegistry) -> None:
    def filter_items(
        items: list[Any],
        conditions: list[FilterCondition],
        logic: Literal["and", "or"] = "and",
    ) -> list[Any]:
        """Filter list items using declarative conditions instead of executable code."""
        return apply_filter_conditions(items, conditions, logic=logic)

    def count_items(items: list[Any]) -> int:
        return len(items)

    def get_first(items: list[Any]) -> Any | None:
        return items[0] if items else None

    registry.register(Tool(
        "filter_items",
        (
            "Filter an already-loaded list using declarative conditions instead of executable predicates. "
            "Use this when you want items matching rules such as path=`status`, op=`eq`, value=`low`, "
            "or nested paths like `result.data[0].kind`. Supported ops are: eq, ne, lt, lte, gt, gte, "
            "contains, in, not_in, exists. This tool creates a new artifact."
        ),
        filter_items,
        short_description="Filter a list with declarative conditions.",
        persist_artifact=True,
        observation_mode="none",
        output_schema={"type": "array", "python_type": "list"},
    ))
    registry.register(Tool(
        "count_items",
        "Return the number of items in an already-loaded list. This tool creates a new artifact and a small observation.",
        count_items,
        short_description="Count the number of items in a list.",
        persist_artifact=True,
        observation_mode="always_inline",
        artifact_observation_mode="none",
    ))
    registry.register(Tool(
        "get_first",
        "Return the first item from a list, or None. This tool creates a new artifact.",
        get_first,
        short_description="Return the first list item.",
        output_schema={"type": "any", "python_type": "Any | None"},
    ))


def _register_collection_tools(registry: ToolRegistry) -> None:
    def sort_items(items: list[Any], path: str, reverse: bool = False) -> list[Any]:
        def key_fn(item: Any) -> Any:
            try:
                return read_nested_property(item, path)
            except Exception:
                return None
        return sorted(items, key=key_fn, reverse=reverse)

    def slice_items(items: list[Any], start: int = 0, end: int | None = None) -> list[Any]:
        return items[start:end]

    def distinct_values(items: list[Any], path: str) -> list[Any]:
        seen: set[str] = set()
        result: list[Any] = []
        for item in items:
            try:
                val = read_nested_property(item, path)
                key = repr(val)
                if key not in seen:
                    seen.add(key)
                    result.append(val)
            except Exception:
                pass
        return result

    registry.register(Tool(
        "sort_items",
        (
            "Sort an already-loaded list by a nested property path. "
            "Use `reverse=true` for descending order. This tool creates a new artifact."
        ),
        sort_items,
        short_description="Sort a list by a nested property.",
        output_schema={"type": "array", "python_type": "list"},
    ))
    registry.register(Tool(
        "slice_items",
        (
            "Return a contiguous slice of an already-loaded list using Python slice semantics "
            "(`start` inclusive, `end` exclusive). Useful to take the top-N items after sorting. "
            "This tool creates a new artifact."
        ),
        slice_items,
        short_description="Slice a list by start/end index.",
        output_schema={"type": "array", "python_type": "list"},
    ))
    registry.register(Tool(
        "distinct_values",
        (
            "Extract unique values of a nested property across all items in a list. "
            "Useful for enumerating all countries, categories, or statuses present. "
            "This tool creates a new artifact."
        ),
        distinct_values,
        short_description="Return unique values of a field across a list.",
        output_schema={"type": "array", "python_type": "list"},
    ))


def _safe_eval_expr(node: Any) -> float:
    """Recursively evaluate a pure-arithmetic AST node. Raises on anything unsafe."""

    import ast as _ast
    import math as _math

    if isinstance(node, _ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, _ast.BinOp):
        ops = {
            _ast.Add: lambda a, b: a + b,
            _ast.Sub: lambda a, b: a - b,
            _ast.Mult: lambda a, b: a * b,
            _ast.Div: lambda a, b: a / b,
            _ast.FloorDiv: lambda a, b: a // b,
            _ast.Mod: lambda a, b: a % b,
            _ast.Pow: lambda a, b: a ** b,
        }
        op_fn = ops.get(type(node.op))
        if op_fn is None:
            raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
        return op_fn(_safe_eval_expr(node.left), _safe_eval_expr(node.right))
    if isinstance(node, _ast.UnaryOp):
        if isinstance(node.op, _ast.USub):
            return -_safe_eval_expr(node.operand)
        if isinstance(node.op, _ast.UAdd):
            return +_safe_eval_expr(node.operand)
    if isinstance(node, _ast.Call):
        if not isinstance(node.func, _ast.Name):
            raise ValueError("Only simple function calls are allowed in compute expressions.")
        if node.keywords:
            raise ValueError("Keyword arguments are not supported in compute expressions.")
        allowed: dict[str, Any] = {
            "abs": abs,
            "round": round,
            "min": min,
            "max": max,
            "floor": _math.floor,
            "ceil": _math.ceil,
            "sqrt": _math.sqrt,
        }
        func_name = node.func.id
        if func_name not in allowed:
            raise ValueError(
                f"Function {func_name!r} is not allowed. "
                f"Allowed functions: {', '.join(sorted(allowed))}."
            )
        args = [_safe_eval_expr(arg) for arg in node.args]
        return float(allowed[func_name](*args))
    raise ValueError(f"Unsupported expression node: {type(node).__name__}")


def _register_aggregation_tools(registry: ToolRegistry) -> None:
    def _extract_values(items: list[Any], path: str) -> list[Any]:
        result: list[Any] = []
        for item in items:
            try:
                result.append(read_nested_property(item, path))
            except Exception:
                pass
        return result

    def sum_items(items: list[Any], path: str) -> float:
        return float(sum(_extract_values(items, path)))

    def average_items(items: list[Any], path: str) -> float:
        vals = _extract_values(items, path)
        if not vals:
            raise ValueError(f"No values found at path {path!r}.")
        return sum(vals) / len(vals)

    def min_item(items: list[Any], path: str) -> Any:
        vals = _extract_values(items, path)
        if not vals:
            raise ValueError(f"No values found at path {path!r}.")
        return min(vals)

    def max_item(items: list[Any], path: str) -> Any:
        vals = _extract_values(items, path)
        if not vals:
            raise ValueError(f"No values found at path {path!r}.")
        return max(vals)

    registry.register(Tool(
        "sum_items",
        (
            "Sum numeric values at a nested property path across all items in a list. "
            "Items where the path is missing or non-numeric are silently skipped. "
            "This tool creates a new artifact and an inline observation."
        ),
        sum_items,
        short_description="Sum a numeric field across a list.",
        observation_mode="always_inline",
    ))
    registry.register(Tool(
        "average_items",
        (
            "Compute the average of numeric values at a nested property path across all items in a list. "
            "Items where the path is missing are silently skipped. "
            "This tool creates a new artifact and an inline observation."
        ),
        average_items,
        short_description="Average a numeric field across a list.",
        observation_mode="always_inline",
    ))
    registry.register(Tool(
        "min_item",
        (
            "Return the minimum value of a nested property across all items in a list. "
            "This tool creates a new artifact and an inline observation."
        ),
        min_item,
        short_description="Find the minimum value of a field across a list.",
        observation_mode="always_inline",
    ))
    registry.register(Tool(
        "max_item",
        (
            "Return the maximum value of a nested property across all items in a list. "
            "This tool creates a new artifact and an inline observation."
        ),
        max_item,
        short_description="Find the maximum value of a field across a list.",
        observation_mode="always_inline",
    ))

    def compute(expression: str) -> float:
        """Evaluate a safe arithmetic expression and return the numeric result."""
        import ast as _ast
        try:
            tree = _ast.parse(expression.strip(), mode="eval")
        except SyntaxError as exc:
            raise ValueError(f"Could not parse expression {expression!r}: {exc}") from exc
        return _safe_eval_expr(tree.body)

    def round_value(value: float, decimals: int = 0) -> float:
        """Round a numeric value to the given number of decimal places."""
        return round(value, decimals)

    registry.register(Tool(
        "compute",
        (
            "Evaluate a pure arithmetic expression and return the result as a float. "
            "Supports +, -, *, /, //, %, ** and parentheses. "
            "Also supports: abs(x), round(x, n), min(a, b), max(a, b), floor(x), ceil(x), sqrt(x). "
            "No variables — only numeric literals and the functions listed above. "
            "Use this to compute derived values such as differences, ratios, or totals "
            "from numbers you already know (e.g. from artifact observations). "
            'Examples: compute("6 - 4") → 2.0, compute("sqrt(144)") → 12.0, compute("ceil(3.2)") → 4.0. '
            "This tool creates a new artifact and an inline observation."
        ),
        compute,
        short_description="Evaluate an arithmetic expression (e.g. '6 - 4', 'sqrt(144)').",
        observation_mode="always_inline",
        observation_renderer=lambda result: f"compute result = {result}",
    ))
    registry.register(Tool(
        "round_value",
        (
            "Round a numeric value to the given number of decimal places (default 0). "
            "Useful after average_items or compute to produce a clean integer result. "
            "This tool creates a new artifact and an inline observation."
        ),
        round_value,
        short_description="Round a number to N decimal places.",
        observation_mode="always_inline",
        observation_renderer=lambda result: f"rounded = {result}",
    ))


def _register_persistence_tools(registry: ToolRegistry, ctx: AssistantRunContext) -> None:
    def create_constant_value(key: str, value: Any, description: str | None = None) -> ConstantValueReceipt:
        """Persist a prompt-derived constant as a named artifact."""

        artifact = ctx.artifacts.save(
            key,
            value,
            source_step_id=ctx.current_step_id,
            provenance="constant",
            metadata={
                "description": description or "Constant value extracted from the prompt.",
                "tool_name": "create_constant_value",
            },
        )
        preview = render_prompt_safe_value(artifact.load())
        return ConstantValueReceipt(
            key=artifact.key,
            value=artifact.load(),
            preview=preview,
            description=description,
        )

    def save_artifact(key: str, value: Any) -> dict[str, str | None]:
        artifact = ctx.artifacts.save(
            key,
            value,
            source_step_id=ctx.current_step_id,
            provenance="tool_call",
        )
        return {"key": artifact.key, "source_step_id": artifact.source_step_id}

    registry.register(Tool(
        "create_constant_value",
        (
            "Save a constant value extracted from the conversation as a named artifact. "
            "Use this for request values like requested quantities, target cities, thresholds, or user-stated labels "
            "so later steps can compare or compute against a durable artifact. "
            "Example: create_constant_value(key='requested_onion_count', value=6, description='User wants 6 onions')."
        ),
        create_constant_value,
        short_description="Persist a prompt-derived constant as an artifact.",
        persist_artifact=False,
        observation_mode="always_inline",
        observation_renderer=lambda result: (
            f"{result.key} = {result.preview}"
            + (f"\n{result.description}" if result.description else "")
        ),
        output_schema={
            "type": "object",
            "properties": {
                "key": {"type": "string"},
                "value": {},
                "preview": {"type": "string"},
                "description": {"anyOf": [{"type": "string"}, {"type": "null"}]},
            },
            "required": ["key", "value", "preview"],
            "additionalProperties": False,
        },
    ))
    registry.register(Tool(
        "save_artifact",
        (
            "Save a computed value as a named artifact so it can be referenced by key in later steps "
            "or passed as an `artifact_ref` to other tool calls. "
            "Use this when you want to persist an intermediate result for reuse."
        ),
        save_artifact,
        short_description="Persist a value as a named artifact.",
        persist_artifact=False,
        observation_mode="none",
        output_schema={
            "type": "object",
            "properties": {"key": {"type": "string"}, "source_step_id": {"type": "string"}},
            "required": ["key"],
            "additionalProperties": False,
        },
    ))
